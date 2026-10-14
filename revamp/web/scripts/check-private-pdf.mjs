// Read-only local download check; creates and then revokes one short-lived admin session.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { SignJWT } from "jose";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
assert(databaseUrl && /^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):5432\//.test(databaseUrl));
assert(process.env.AUTH_SECRET);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const transactionId = process.argv[2] ?? "bd82f7af-4e8e-4a1f-bc9c-70298ce16b57";
const documentId = process.argv[3] ?? "e0333ddb-76a3-46f2-800d-570af56faa29";
assert(uuid.test(transactionId) && uuid.test(documentId));
const url = `http://127.0.0.1:3100/api/admin/transactions/${transactionId}/documents/${documentId}`;
const pool = new pg.Pool({ connectionString: databaseUrl });
let sessionId;

try {
  const withoutSession = await fetch(url);
  assert.equal(withoutSession.status, 403);

  const { rows } = await pool.query(
    `select d.checksum, d.original_name, u.id as user_id, u.email, u.name
     from transaction_documents d cross join lateral
     (select id,email,name from users where role='admin' and is_active=true order by created_at limit 1) u
     where d.id=$1 and d.transaction_id=$2`,
    [documentId, transactionId],
  );
  const document = rows[0];
  assert(document?.checksum && document?.user_id);
  const session = await pool.query(
    "insert into sessions (user_id,expires_at,absolute_expires_at) values ($1,now() + interval '10 minutes',now() + interval '10 minutes') returning id",
    [document.user_id],
  );
  sessionId = session.rows[0].id;
  const token = await new SignJWT({ email: document.email, name: document.name, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(document.user_id)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const response = await fetch(url, { headers: { cookie: `anugrahplastik_session=${token}` } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition") ?? "", /inline; filename=".+\.pdf"/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), document.checksum);
  console.log(`PDF privat lolos: ${document.original_name}, ${bytes.length} byte, checksum cocok; tanpa sesi ditolak.`);
} finally {
  if (sessionId) await pool.query("update sessions set revoked_at=now() where id=$1", [sessionId]);
  await pool.end();
}
