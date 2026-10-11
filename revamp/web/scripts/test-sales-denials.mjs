// Local-only integration check for server actions that must reject sales.
// It invokes only actions with a sales session and revokes its temporary sessions.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { SignJWT } from "jose";
import { JSDOM } from "jsdom";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const origin = "http://127.0.0.1:3100";
const transactionId = "0a4ef36d-f833-438a-b811-ec0b0b86a6be";
const databaseUrl = process.env.DATABASE_URL;
assert(
  databaseUrl && /^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):5432\//.test(databaseUrl),
  "Local database required",
);
assert(process.env.AUTH_SECRET, "AUTH_SECRET required");

const pool = new pg.Pool({ connectionString: databaseUrl });
const temporarySessions = [];
let releaseStatusChanged = false;
let createdSalesId;

async function cookieFor(role) {
  const { rows } = await pool.query(
    "select id, email, name, role from users where role=$1 and is_active=true and ($2 <> 'sales' or id=$3) order by created_at limit 1",
    [role, role, createdSalesId ?? "00000000-0000-0000-0000-000000000000"],
  );
  assert(rows[0], `Active ${role} required`);
  const user = rows[0];
  const session = await pool.query(
    "insert into sessions (user_id, expires_at) values ($1, now() + interval '10 minutes') returning id",
    [user.id],
  );
  temporarySessions.push(session.rows[0].id);
  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(session.rows[0].id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return `anugrahplastik_session=${token}`;
}

async function actionForm(step, label, cookie) {
  const url = `${origin}/admin/transactions/${transactionId}?step=${step}`;
  const response = await fetch(url, { headers: { cookie } });
  assert.equal(response.status, 200, `Admin ${step} page must load`);
  const document = new JSDOM(await response.text()).window.document;
  const form = [...document.querySelectorAll("form")].find((node) => node.textContent.includes(label));
  assert(form, `Admin form missing: ${label}`);
  const action = [...form.querySelectorAll("input")].find((node) => node.name.startsWith("$ACTION_ID_"));
  assert(action, `Server action missing: ${label}`);
  const body = new FormData();
  body.set(action.name, action.value);
  for (const input of form.querySelectorAll("input[name], textarea[name]")) {
    if (input === action || input.name.startsWith("$ACTION_")) continue;
    body.set(input.name, input.value);
  }
  return { url, body };
}

async function denied(label, action, salesCookie) {
  const response = await fetch(action.url, {
    method: "POST",
    headers: { cookie: salesCookie, origin },
    body: action.body,
    redirect: "manual",
  });
  const result = await response.text();
  assert(
    result.includes("Tindakan ini memerlukan administrator") || response.status >= 400,
    `${label} was not visibly denied (${response.status})`,
  );
  console.log(`${label}: ditolak (${response.status})`);
}

try {
  const salesEmail = `qa-sales-stb-${randomUUID()}@local.invalid`;
  const salesFixture = await pool.query(
    "insert into users (email,name,password_hash,role,is_active) values ($1,'QA Sales (temporary)','!no-login','sales',true) returning id",
    [salesEmail],
  );
  createdSalesId = salesFixture.rows[0]?.id;
  const { rows } = await pool.query("select data_class, fulfilment_status from business_transactions where id=$1", [
    transactionId,
  ]);
  assert.equal(rows[0]?.data_class, "test", "Only test transaction allowed");
  assert.equal(rows[0]?.fulfilment_status, "released", "Fixture state changed unexpectedly");
  const adminCookie = await cookieFor("admin");
  const salesCookie = await cookieFor("sales");
  const before = await pool.query("select count(*)::int as n from audit_logs where entity_id=$1", [transactionId]);

  const verifyForm = await actionForm("payment", "Verifikasi pembayaran", adminCookie);
  const invalidBody = new FormData();
  for (const [name, value] of verifyForm.body) invalidBody.set(name, value);
  invalidBody.set("entryId", "not-a-uuid");
  const diagnostic = await fetch(verifyForm.url, {
    method: "POST",
    headers: { cookie: adminCookie, origin },
    body: invalidBody,
    redirect: "manual",
  });
  assert.equal(diagnostic.status, 500, "Invalid admin input should reach the action validator");
  await denied("Verifikasi pembayaran", verifyForm, salesCookie);
  await denied("Tutup transaksi", await actionForm("handover", "Tutup transaksi", adminCookie), salesCookie);

  await pool.query(
    "update business_transactions set fulfilment_status='not_released' where id=$1 and data_class='test'",
    [transactionId],
  );
  releaseStatusChanged = true;
  await denied("Lepas produksi", await actionForm("production", "Lepaskan ke produksi", adminCookie), salesCookie);

  const after = await pool.query("select count(*)::int as n from audit_logs where entity_id=$1", [transactionId]);
  assert.equal(after.rows[0].n, before.rows[0].n, "Denied actions must not write audit/state");
  console.log("Tidak ada aksi terlarang yang mengubah transaksi.");
} finally {
  if (releaseStatusChanged) {
    await pool.query(
      "update business_transactions set fulfilment_status='released' where id=$1 and data_class='test' and fulfilment_status='not_released'",
      [transactionId],
    );
  }
  for (const id of temporarySessions) {
    await pool.query("update sessions set revoked_at=now() where id=$1", [id]);
  }
  if (createdSalesId) {
    await pool.query("delete from users where id=$1 and email like 'qa-sales-stb-%@local.invalid'", [createdSalesId]);
  }
  await pool.end();
}
