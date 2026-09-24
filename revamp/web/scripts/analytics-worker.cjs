/*
 * One process only. It claims batches with SKIP LOCKED so an accidental second
 * process waits its turn instead of processing the same visitor events twice.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- This standalone Node process is supervised as CommonJS on the VPS.
require("dotenv").config({ path: ".env.local" });

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep the worker independent from the Next.js module graph.
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL belum diatur.");

const pool = new Pool({ connectionString, max: Number(process.env.ANALYTICS_WORKER_POOL_MAX ?? 2) });
const workerName = "analytics-ingest";
const pollMilliseconds = Number(process.env.ANALYTICS_WORKER_POLL_MS ?? 1000);
let stopping = false;

function asDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function trafficSource(referrer) {
  if (!referrer) return "Langsung";
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host.includes("google")) return "Google";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("facebook")) return "Facebook";
    return host.replace(/^www\./, "");
  } catch {
    return "Langsung";
  }
}

function outcomeFor(events) {
  const names = new Set(events.map((event) => event.name));
  if (names.has("form_submit")) return "Form terkirim";
  if (names.has("whatsapp_click")) return "Klik WhatsApp";
  if (names.has("form_start")) return "Form mulai diisi";
  if (names.has("cta_click")) return "Tombol minat diklik";
  return "Melihat halaman";
}

async function heartbeat(client, additions = {}) {
  await client.query(
    `INSERT INTO analytics_worker_state (name, heartbeat_at, processed_batches, processed_events, failed_batches, updated_at)
     VALUES ($1, now(), $2, $3, $4, now())
     ON CONFLICT (name) DO UPDATE SET
       heartbeat_at = now(),
       processed_batches = analytics_worker_state.processed_batches + EXCLUDED.processed_batches,
       processed_events = analytics_worker_state.processed_events + EXCLUDED.processed_events,
       failed_batches = analytics_worker_state.failed_batches + EXCLUDED.failed_batches,
       updated_at = now()`,
    [workerName, additions.batches ?? 0, additions.events ?? 0, additions.failures ?? 0],
  );
}

async function claimBatch(client) {
  const result = await client.query(
    `WITH candidate AS (
       SELECT id FROM analytics_ingest_batches
       WHERE status = 'pending'
       ORDER BY priority DESC, received_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE analytics_ingest_batches queue
     SET status = 'processing', attempts = attempts + 1
     FROM candidate
     WHERE queue.id = candidate.id
     RETURNING queue.id, queue.anonymous_id, queue.payload`,
  );
  return result.rows[0] ?? null;
}

async function processBatch(client, batch) {
  const payload = batch.payload;
  if (!payload || !Array.isArray(payload.events) || payload.events.length === 0 || payload.events.length > 25) {
    throw new Error("Payload batch tidak valid.");
  }

  const first = payload.events[0];
  const request = payload.request ?? {};
  const context = request.device ?? {};
  const location = request.location ?? {};
  const eventAt = asDate(first.occurredAt);
  const sessionKey = payload.sessionKey ?? batch.anonymous_id;
  const sessionResult = await client.query(
    `INSERT INTO analytics_sessions (
       anonymous_id, session_key, traffic_class, landing_path, referrer, source_name, outcome, device_category, browser_name, operating_system,
       country_name, region_name, city_name, consent_version, consented_at, last_seen_at, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'Melihat halaman', $7, $8, $9, $10, $11, $12, 'v1', $13, $13, $13)
     ON CONFLICT (session_key) DO UPDATE SET last_seen_at = GREATEST(analytics_sessions.last_seen_at, EXCLUDED.last_seen_at)
     RETURNING id, created_at, event_sequence, duration_seconds`,
    [
      batch.anonymous_id,
      sessionKey,
      request.trafficClass === "internal" ? "internal" : "public",
      request.landingPath ?? first.path,
      request.referrer ?? null,
      trafficSource(request.referrer ?? null),
      context.deviceCategory ?? "unknown",
      context.browserName ?? null,
      context.operatingSystem ?? null,
      location.countryName ?? null,
      location.regionName ?? null,
      location.cityName ?? null,
      eventAt,
    ],
  );
  const session = sessionResult.rows[0];
  let sequence = Number(session.event_sequence ?? 0);
  let finalEvent = null;

  for (const event of payload.events) {
    sequence += 1;
    const occurredAt = asDate(event.occurredAt);
    await client.query(
      `INSERT INTO analytics_events (session_id, name, path, section_key, element_key, metadata, conversion_id, sequence, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [
        session.id,
        event.name,
        event.path,
        event.sectionKey ?? null,
        event.elementKey ?? null,
        event.metadata ?? null,
        event.conversionId ?? null,
        sequence,
        occurredAt,
      ],
    );
    finalEvent = { ...event, occurredAt };
  }

  const endedAt = finalEvent?.name === "page_leave" ? finalEvent.occurredAt : null;
  const activeSeconds = Number(finalEvent?.metadata?.active_seconds ?? 0);
  const durationSeconds = endedAt
    ? Math.min(1_800, Number(session.duration_seconds ?? 0) + Math.max(0, activeSeconds))
    : null;
  await client.query(
    `UPDATE analytics_sessions
     SET event_sequence = $2,
         last_seen_at = $3,
         last_event_at = $3,
         last_section_key = COALESCE($4, last_section_key),
         ended_at = COALESCE($5, ended_at),
         duration_seconds = COALESCE($6, duration_seconds),
         outcome = CASE
           WHEN $7 = 'Form terkirim' OR outcome = 'Form terkirim' THEN 'Form terkirim'
           WHEN $7 = 'Klik WhatsApp' OR outcome = 'Klik WhatsApp' THEN 'Klik WhatsApp'
           WHEN $7 = 'Form mulai diisi' OR outcome = 'Form mulai diisi' THEN 'Form mulai diisi'
           WHEN $7 = 'Tombol minat diklik' OR outcome = 'Tombol minat diklik' THEN 'Tombol minat diklik'
           ELSE 'Melihat halaman'
         END
     WHERE id = $1`,
    [
      session.id,
      sequence,
      finalEvent.occurredAt,
      finalEvent.sectionKey ?? null,
      endedAt,
      durationSeconds,
      outcomeFor(payload.events),
    ],
  );
}

async function runOnce() {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE analytics_ingest_batches
       SET status = 'pending', last_error = 'Diproses ulang setelah worker berhenti.'
       WHERE status = 'processing' AND received_at < now() - interval '10 minutes'`,
    );
    await heartbeat(client);
    await client.query("BEGIN");
    const batch = await claimBatch(client);
    if (!batch) {
      await client.query("COMMIT");
      return false;
    }
    try {
      await processBatch(client, batch);
      await client.query(
        "UPDATE analytics_ingest_batches SET status = 'processed', processed_at = now(), last_error = NULL WHERE id = $1",
        [batch.id],
      );
      await heartbeat(client, { batches: 1, events: batch.payload.events.length });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      const message = error instanceof Error ? error.message.slice(0, 600) : "Kesalahan tidak diketahui.";
      await client.query(
        `UPDATE analytics_ingest_batches
         SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END, last_error = $2
         WHERE id = $1`,
        [batch.id, message],
      );
      await heartbeat(client, { failures: 1 });
    }
    return true;
  } finally {
    client.release();
  }
}

async function loop() {
  while (!stopping) {
    try {
      const handled = await runOnce();
      if (!handled) await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
    } catch (error) {
      console.error("Analytics worker error", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  await pool.end();
}

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

void loop();
