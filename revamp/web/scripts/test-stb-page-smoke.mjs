// Read-only authenticated smoke for the local test transaction after partial receipt.
import assert from "node:assert/strict";
import { config } from "dotenv";
import { SignJWT } from "jose";
import { JSDOM } from "jsdom";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL;
assert(databaseUrl && /^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):5432\//.test(databaseUrl));
assert(process.env.AUTH_SECRET);
const pool = new pg.Pool({ connectionString: databaseUrl });
let sessionId;
try {
  const { rows } = await pool.query(
    "select id,email,name from users where role='admin' and is_active=true order by created_at limit 1",
  );
  const admin = rows[0];
  assert(admin);
  const session = await pool.query(
    "insert into sessions (user_id,expires_at) values ($1,now() + interval '10 minutes') returning id",
    [admin.id],
  );
  sessionId = session.rows[0].id;
  const token = await new SignJWT({ email: admin.email, name: admin.name, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const cookie = `anugrahplastik_session=${token}`;
  const origin = "http://127.0.0.1:3100";
  const base = `${origin}/admin/transactions/0a4ef36d-f833-438a-b811-ec0b0b86a6be`;
  for (const [step, texts] of [
    ["handover", ["Diterima sebagian", "STB bertanda tangan", "dokumen eksternal"]],
    ["delivery", ["tersedia 60", "Diterima sebagian"]],
  ]) {
    const response = await fetch(`${base}?step=${step}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const page = new JSDOM(await response.text()).window.document.body.textContent;
    for (const text of texts) assert(page.includes(text), `${step}: missing ${text}`);
  }
  console.log("Halaman serah terima dan pengiriman menunjukkan bukti sebagian serta sisa 60 unit.");
} finally {
  if (sessionId) await pool.query("update sessions set revoked_at=now() where id=$1", [sessionId]);
  await pool.end();
}
