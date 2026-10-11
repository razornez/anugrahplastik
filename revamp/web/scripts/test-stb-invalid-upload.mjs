// Local-only negative test: malformed PDF must not create a receipt or document.
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { config } from "dotenv";
import { SignJWT } from "jose";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL;
assert(databaseUrl && /^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):5432\//.test(databaseUrl));
assert(process.env.AUTH_SECRET);
const transactionId = "0a4ef36d-f833-438a-b811-ec0b0b86a6be";
const shipmentId = "1525493d-332d-4839-8285-f7ad86fb5a80";
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
  const before = await pool.query(
    "select count(*)::int as n from transaction_documents where transaction_id=$1 and type='bast_signed'",
    [transactionId],
  );
  const { rows: lines } = await pool.query(
    "select transaction_line_id,quantity from shipment_lines where shipment_id=$1",
    [shipmentId],
  );
  assert(lines.length);
  const form = new FormData();
  form.set("type", "bast_signed");
  form.set("shipmentId", shipmentId);
  form.set("receiptSource", "external");
  form.set(
    "receipt",
    JSON.stringify({
      recipient: "Penerima Contoh",
      location: "Gudang fiktif Bandung",
      condition: "good",
      note: "",
      senderName: "",
      driverName: "",
      receiverName: "",
      items: lines.map((line) => ({ lineId: line.transaction_line_id, accepted: line.quantity })),
    }),
  );
  form.set("file", new File(["this is not a PDF"], "bukti-rusak.pdf", { type: "application/pdf" }));
  const response = await fetch(`http://127.0.0.1:3100/api/admin/transactions/${transactionId}/documents`, {
    method: "POST",
    headers: { cookie: `anugrahplastik_session=${token}` },
    body: form,
  });
  assert.equal(response.status, 400);
  const after = await pool.query(
    "select count(*)::int as n from transaction_documents where transaction_id=$1 and type='bast_signed'",
    [transactionId],
  );
  assert.equal(after.rows[0].n, before.rows[0].n);
  console.log("Berkas STB rusak ditolak; tidak ada bukti penerimaan atau dokumen baru.");
} finally {
  if (sessionId) await pool.query("update sessions set revoked_at=now() where id=$1", [sessionId]);
  await pool.end();
}
