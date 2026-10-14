// One-time local QA: a clearly fictional external receipt for a test-only shipment.
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { config } from "dotenv";
import { SignJWT } from "jose";
import { PDFDocument, StandardFonts } from "pdf-lib";
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
  const { rows: headers } = await pool.query(
    "select s.status,s.bast_document_id,t.data_class from shipments s join business_transactions t on t.id=s.transaction_id where s.id=$1 and t.id=$2",
    [shipmentId, transactionId],
  );
  assert(
    headers[0]?.data_class === "test" && headers[0]?.status === "shipped" && !headers[0]?.bast_document_id,
    "Fixture changed; refusing to attach another proof",
  );
  const { rows: lines } = await pool.query(
    "select transaction_line_id,quantity from shipment_lines where shipment_id=$1",
    [shipmentId],
  );
  assert.equal(lines.length, 1);
  assert.equal(Number(lines[0].quantity), 40);
  const { rows: users } = await pool.query(
    "select id,email,name from users where role='admin' and is_active=true order by created_at limit 1",
  );
  const admin = users[0];
  assert(admin);
  const session = await pool.query(
    "insert into sessions (user_id,expires_at,absolute_expires_at) values ($1,now() + interval '10 minutes',now() + interval '10 minutes') returning id",
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
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("DRAF UJI - BUKAN BUKTI PELANGGAN", { x: 55, y: 770, size: 20, font });
  page.drawText("TANDA TANGAN CONTOH (FIKTIF)", { x: 55, y: 720, size: 16, font });
  page.drawText("Pengiriman uji: 40 unit; diterima contoh: 20 unit; selisih: 20 unit.", { x: 55, y: 685, size: 11 });
  const form = new FormData();
  form.set("type", "bast_signed");
  form.set("shipmentId", shipmentId);
  form.set("receiptSource", "external");
  form.set("documentNo", "STB-EKSTERNAL-UJI-001");
  form.set(
    "receipt",
    JSON.stringify({
      recipient: "[UJI] Penerima fiktif",
      location: "Alamat fiktif untuk pengujian lokal",
      condition: "partial",
      note: "Selisih 20 unit; tanda tangan pada berkas hanya contoh fiktif.",
      senderName: "",
      driverName: "",
      receiverName: "",
      items: [{ lineId: lines[0].transaction_line_id, accepted: "20" }],
    }),
  );
  form.set("file", new File([await pdf.save()], "stb-tanda-tangan-contoh.pdf", { type: "application/pdf" }));
  const response = await fetch(`http://127.0.0.1:3100/api/admin/transactions/${transactionId}/documents`, {
    method: "POST",
    headers: { cookie: `anugrahplastik_session=${token}` },
    body: form,
  });
  const body = await response.json();
  assert.equal(response.status, 200, body.error ?? "Upload failed");
  const { rows: saved } = await pool.query(
    "select s.status,s.bast_document_id,sl.accepted_quantity from shipments s join shipment_lines sl on sl.shipment_id=s.id where s.id=$1",
    [shipmentId],
  );
  assert.equal(saved[0].status, "received_partial");
  assert.equal(saved[0].bast_document_id, body.id);
  assert.equal(Number(saved[0].accepted_quantity), 20);
  console.log(`STB contoh diterima sebagian: 20/40 unit; bukti privat ${body.id}.`);
} finally {
  if (sessionId) await pool.query("update sessions set revoked_at=now() where id=$1", [sessionId]);
  await pool.end();
}
