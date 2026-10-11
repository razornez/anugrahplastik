// Local-only end-to-end regression for the Finance workspace.
// It uses real server actions over HTTP, creates only tagged QA records, and
// removes them in finally regardless of the assertion outcome.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { JSDOM } from "jsdom";
import { SignJWT } from "jose";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const origin = "http://127.0.0.1:3100";
const databaseUrl = process.env.DATABASE_URL;
assert(databaseUrl, "DATABASE_URL lokal diperlukan.");
const databaseHost = new URL(databaseUrl).hostname;
assert(["localhost", "127.0.0.1", "::1"].includes(databaseHost), "finance:e2e hanya boleh memakai database lokal.");
assert(process.env.AUTH_SECRET, "AUTH_SECRET diperlukan untuk sesi QA.");

const pool = new pg.Pool({ connectionString: databaseUrl });
const qaLabel = `QA-FINANCE-${randomUUID()}`;
const temporaryUserIds = [];
const temporarySessionIds = [];
let qaRunId = null;

async function createUser(role) {
  const email = `${qaLabel.toLowerCase()}-${role}@local.invalid`;
  const { rows } = await pool.query(
    "insert into users (email,name,password_hash,role,is_active) values ($1,$2,'!finance-e2e-no-login',$3,true) returning id,email,name,role",
    [email, `[UJI Keuangan] ${role}`, role],
  );
  const user = rows[0];
  temporaryUserIds.push(user.id);
  return user;
}

async function sessionCookie(user) {
  const { rows } = await pool.query(
    "insert into sessions (user_id,expires_at) values ($1,now() + interval '10 minutes') returning id",
    [user.id],
  );
  const sessionId = rows[0].id;
  temporarySessionIds.push(sessionId);
  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return `anugrahplastik_session=${token}`;
}

async function page(path, cookie) {
  const response = await fetch(`${origin}${path}`, {
    headers: { ...(cookie ? { cookie } : {}), "x-finance-e2e": "1" },
    redirect: "manual",
  });
  assert.equal(response.status, 200, `${path} harus dapat dibuka`);
  return response.text();
}

function formFor(html, label, predicate = () => true) {
  const document = new JSDOM(html).window.document;
  const forms = [
    ...document.querySelectorAll("form"),
    ...[...document.querySelectorAll("template")].flatMap((template) => [...template.content.querySelectorAll("form")]),
  ];
  const form = forms.find((candidate) => candidate.textContent.includes(label) && predicate(candidate));
  assert(form, `Form '${label}' tidak ditemukan.`);
  const action = [...form.querySelectorAll("input")].find((input) => input.name.startsWith("$ACTION_ID_"));
  assert(action, `Server action '${label}' tidak ditemukan.`);
  const body = new FormData();
  for (const field of form.querySelectorAll("input[name], textarea[name], select[name]")) {
    if (field === action || field.name.startsWith("$ACTION_")) continue;
    body.set(field.name, field.value);
  }
  body.set(action.name, action.value);
  return body;
}

async function submit(path, cookie, label, values, predicate) {
  const body = formFor(await page(path, cookie), label, predicate);
  for (const [key, value] of Object.entries(values)) body.set(key, String(value));
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { cookie, origin },
    body,
    redirect: "manual",
  });
  const output = await response.text();
  assert(response.status < 400, `${label} gagal: ${response.status} ${output.slice(0, 200)}`);
  return output;
}

async function tag(table, id) {
  await pool.query(`update ${table} set qa_run_id=$1 where id=$2`, [qaRunId, id]);
}

async function financeEntryByReference(reference) {
  const { rows } = await pool.query(
    "select id,status,direction,amount,reconciled_at from finance_entries where reference=$1",
    [reference],
  );
  assert.equal(rows.length, 1, `Ledger ${reference} harus unik.`);
  await tag("finance_entries", rows[0].id);
  return rows[0];
}

async function verify(cookie, entryId, expectedLabel = "Verifikasi") {
  await submit(
    "/admin/finance",
    cookie,
    expectedLabel,
    { entryId },
    (form) => form.querySelector("input[name='entryId']")?.value === entryId,
  );
}

async function cleanup() {
  if (!qaRunId) return;
  const ids = await pool.query(
    "select id from finance_accounts where qa_run_id=$1 union all select id from finance_entries where qa_run_id=$1 union all select id from finance_payroll_runs where qa_run_id=$1",
    [qaRunId],
  );
  const entityIds = ids.rows.map((row) => row.id);
  await pool.query("delete from audit_logs where entity_id = any($1::text[]) or actor_id = any($2::uuid[])", [
    entityIds,
    temporaryUserIds,
  ]);
  await pool.query(
    "delete from finance_entry_documents where entry_id in (select id from finance_entries where qa_run_id=$1)",
    [qaRunId],
  );
  await pool.query(
    "delete from finance_payroll_items where payroll_run_id in (select id from finance_payroll_runs where qa_run_id=$1) or employee_id in (select id from finance_employees where qa_run_id=$1)",
    [qaRunId],
  );
  await pool.query("delete from finance_payroll_runs where qa_run_id=$1", [qaRunId]);
  await pool.query("delete from finance_entries where qa_run_id=$1", [qaRunId]);
  await pool.query("delete from finance_employees where qa_run_id=$1", [qaRunId]);
  await pool.query("delete from finance_accounts where qa_run_id=$1", [qaRunId]);
  await pool.query("delete from finance_qa_runs where id=$1", [qaRunId]);
  const { rows } = await pool.query(
    "select (select count(*) from finance_accounts where qa_run_id=$1) + (select count(*) from finance_entries where qa_run_id=$1) + (select count(*) from finance_employees where qa_run_id=$1) + (select count(*) from finance_payroll_runs where qa_run_id=$1) as total",
    [qaRunId],
  );
  assert.equal(Number(rows[0].total), 0, `Cleanup run ${qaLabel} belum tuntas.`);
}

try {
  await fetch(origin).then((response) => assert(response.ok, "Server lokal port 3100 belum siap."));
  const { rows: runs } = await pool.query("insert into finance_qa_runs(label) values($1) returning id", [qaLabel]);
  qaRunId = runs[0].id;
  const [admin, sales, content] = await Promise.all([createUser("admin"), createUser("sales"), createUser("content")]);
  const [adminCookie, salesCookie, contentCookie] = await Promise.all([
    sessionCookie(admin),
    sessionCookie(sales),
    sessionCookie(content),
  ]);

  await submit("/admin/finance", adminCookie, "Simpan rekening", {
    name: `${qaLabel} Operasional`,
    bankName: "Bank QA Lokal",
    accountNoMasked: "•••• 9090",
  });
  const { rows: accounts } = await pool.query("select id from finance_accounts where name=$1", [
    `${qaLabel} Operasional`,
  ]);
  assert.equal(accounts.length, 1, "Rekening QA belum dibuat.");
  const accountId = accounts[0].id;
  await tag("finance_accounts", accountId);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const createEntry = async (reference, categoryCode, kind, amount) => {
    await submit("/admin/finance", adminCookie, "Simpan untuk verifikasi", {
      accountId,
      categoryCode,
      kind,
      amount,
      occurredAt: today,
      reference,
      counterpartyName: qaLabel,
      notes: "Fixture lokal otomatis; tidak ada transfer nyata.",
    });
    return financeEntryByReference(reference);
  };

  const opening = await createEntry(`${qaLabel}-OPEN`, "other_income", "opening_balance", "10000000");
  const income = await createEntry(`${qaLabel}-IN`, "other_income", "bank_movement", "1500000");
  const materials = await createEntry(`${qaLabel}-MAT`, "material_purchase", "vendor_bill", "2000000");
  const ownerDraw = await createEntry(`${qaLabel}-PRIVE`, "owner_draw", "owner_draw", "750000");
  const salary = await createEntry(`${qaLabel}-PAYROLL`, "payroll", "payroll", "3250000");
  const rejected = await createEntry(`${qaLabel}-REJECT`, "other_expense", "bank_movement", "250000");
  await createEntry(`${qaLabel}-PENDING`, "other_expense", "bank_movement", "125000");

  await verify(adminCookie, opening.id);
  await verify(salesCookie, income.id);
  await verify(adminCookie, materials.id);
  await verify(salesCookie, ownerDraw.id);
  await verify(adminCookie, salary.id);
  await verify(adminCookie, rejected.id, "Tolak");
  await verify(salesCookie, income.id, "Rekonsiliasi");

  const { rows: totals } = await pool.query(
    "select coalesce(sum(case when direction='in' then amount else -amount end) filter (where status='verified'),0) as balance, count(*) filter (where status='pending') as pending, count(*) filter (where status='rejected') as rejected from finance_entries where qa_run_id=$1",
    [qaRunId],
  );
  assert.equal(Number(totals[0].balance), 5500000, "Saldo buku QA hanya boleh menghitung catatan terverifikasi.");
  assert.equal(Number(totals[0].pending), 1, "Catatan pending harus tetap menunggu.");
  assert.equal(Number(totals[0].rejected), 1, "Catatan ditolak harus tetap tersimpan sebagai audit.");
  const { rows: privateRows } = await pool.query(
    "select count(*)::int as total from finance_entries f join finance_categories c on c.id=f.category_id where f.qa_run_id=$1 and c.code='owner_draw' and f.direction='out'",
    [qaRunId],
  );
  assert.equal(privateRows[0].total, 1, "Prive owner harus memakai kategori terpisah.");

  const pendingHtml = await page("/admin/finance?status=pending", adminCookie);
  assert(pendingHtml.includes(qaLabel), "Filter pending tidak menampilkan fixture pending.");
  const financeHtml = await page("/admin/finance", adminCookie);
  assert(!financeHtml.includes("[UJI]"), "Piutang Keuangan tidak boleh membocorkan transaksi test.");
  const contentForm = formFor(await page("/admin/finance", adminCookie), "Simpan rekening");
  const denied = await fetch(`${origin}/admin/finance`, {
    method: "POST",
    headers: { cookie: contentCookie, origin },
    body: contentForm,
    redirect: "manual",
  });
  assert(denied.status >= 400, "Role content tidak boleh menyimpan rekening Keuangan.");
  const anonymous = await fetch(`${origin}/admin/finance`, {
    method: "POST",
    headers: { origin },
    body: contentForm,
    redirect: "manual",
  });
  assert(anonymous.status >= 300, "Pengguna anonim tidak boleh menyimpan rekening Keuangan.");
  console.log(`Finance E2E lulus: ${qaLabel}`);
} finally {
  try {
    await cleanup();
    console.log(`Cleanup Finance QA selesai: ${qaLabel}`);
  } catch (error) {
    console.error(
      `Cleanup Finance QA GAGAL untuk run ${qaRunId ?? qaLabel}. Jangan hapus data lain; gunakan run ID ini untuk pembersihan terarah.`,
      error,
    );
    process.exitCode = 1;
  }
  if (temporarySessionIds.length)
    await pool.query("delete from sessions where id = any($1::uuid[])", [temporarySessionIds]);
  if (temporaryUserIds.length) await pool.query("delete from users where id = any($1::uuid[])", [temporaryUserIds]);
  await pool.end();
}
