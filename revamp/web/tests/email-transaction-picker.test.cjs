/* eslint-disable @typescript-eslint/no-require-imports -- Test TypeScript modules without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { resolve } = require("node:path");
const test = require("node:test");
const ts = require("typescript");
function load(file, mocks = {}) {
  const filename = resolve(__dirname, "..", file);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (name) =>
    name in mocks ? mocks[name] : name.startsWith("@/") || name.startsWith("./") ? {} : require(name);
  loaded._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const model = load("src/features/integrations/transaction-picker-model.ts");
const schema = Object.fromEntries(
  ["businessTransactions", "customers", "users", "transactionDocuments", "csEmails", "auditLogs"].map((name) => [
    name,
    new Proxy({}, { get: (_, key) => `${name}.${String(key)}` }),
  ]),
);
const operators = Object.fromEntries(
  ["and", "eq", "isNull", "lt", "desc", "ilike", "inArray", "or", "sql"].map((name) => [
    name,
    (...args) => ({ name, args }),
  ]),
);
function databaseFixture(batches) {
  const calls = [];
  let index = 0;
  const database = {
    select() {
      const rows = batches[index++] ?? [];
      const chain = {};
      for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "for"])
        chain[method] = (...args) => {
          calls.push({ method, args });
          return chain;
        };
      chain.then = (yes, no) => Promise.resolve(rows).then(yes, no);
      return chain;
    },
    update() {
      calls.push({ method: "update" });
      return { set: () => ({ where: async () => {} }) };
    },
    insert() {
      return {
        values: async (value) => {
          calls.push({ method: "audit", value });
        },
      };
    },
    transaction: async (callback) => callback(database),
  };
  return { database, calls };
}
function mocks(fixture, role = "admin") {
  return {
    "drizzle-orm": operators,
    "@/lib/auth/session": { getSession: async () => (role ? { id: "user", role } : null) },
    "@/lib/database/client": { getDatabase: () => fixture.database },
    "@/lib/database/schema": schema,
    "@/features/integrations/transaction-picker-model": model,
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": {
      redirect: (value) => {
        throw new Error(`REDIRECT:${value}`);
      },
    },
  };
}
test("Search escapes literal wildcard characters and always selects operational data", () => {
  assert.equal(model.transactionSearchPattern("  A%_\\B  "), "%A\\%\\_\\\\B%");
  assert.equal(model.transactionPickerDataClass(), "production");
});
test("Search rejects unauthorized users before any database query", async () => {
  for (const role of [null, "content_editor"]) {
    const fixture = databaseFixture([]);
    const { GET } = load("src/app/api/admin/transactions/search/route.ts", mocks(fixture, role));
    assert.equal((await GET(new Request("http://localhost/api?q=spacer"))).status, 403);
    assert.equal(fixture.calls.length, 0);
  }
});
test("Search returns identifiable limited results and real private photo IDs without paths", async () => {
  const row = {
    id: "trx",
    referenceNo: "TRX-2026-00001",
    title: "Spacer",
    customerName: "PT Uji",
    ownerName: null,
    dataClass: "production",
    updatedAt: new Date("2026-10-04T00:00:00Z"),
  };
  const fixture = databaseFixture([[row], [{ id: "photo", transactionId: "trx" }]]);
  const { GET } = load("src/app/api/admin/transactions/search/route.ts", mocks(fixture, "sales"));
  const response = await GET(new Request("http://localhost/api?q=spacer"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const result = await response.json();
  assert.equal(result.items[0].photoId, "photo");
  assert.equal(result.items[0].customerName, "PT Uji");
  assert.equal(result.items[0].updatedAt, "2026-10-04T00:00:00.000Z");
  assert.equal("storagePath" in result.items[0], false);
  assert.ok(fixture.calls.some((call) => call.method === "limit" && call.args[0] === 10));
});
test("Empty results and database failure are different; long queries are rejected", async () => {
  const fixture = databaseFixture([[]]);
  const { GET } = load("src/app/api/admin/transactions/search/route.ts", mocks(fixture));
  assert.deepEqual(await (await GET(new Request("http://localhost/api?q=missing"))).json(), { items: [] });
  assert.equal((await GET(new Request(`http://localhost/api?q=${"a".repeat(121)}`))).status, 400);
  fixture.database.select = () => {
    throw new Error("offline");
  };
  assert.equal((await GET(new Request("http://localhost/api"))).status, 503);
});
const emailId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const transactionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function form(id = transactionId) {
  const data = new FormData();
  data.set("emailId", emailId);
  data.set("transactionId", id);
  return data;
}
test("Link requires a selected ID, keeps authorization, and rejects missing or already linked records", async () => {
  for (const [batches, expected] of [
    [[], /Email masuk tidak ditemukan/],
    [[[{ id: emailId, folder: "sent" }]], /Email masuk tidak ditemukan/],
    [[[{ id: emailId, folder: "inbox", linkedTransactionId: "already" }]], /sudah dikaitkan/],
    [[[{ id: emailId, folder: "inbox" }], []], /Transaksi tidak ditemukan/],
  ]) {
    const fixture = databaseFixture(batches);
    const { linkEmailToTransaction } = load("src/features/integrations/actions.ts", mocks(fixture));
    assert.match(await linkEmailToTransaction(form()), expected);
    assert.ok(!fixture.calls.some((call) => call.method === "update" || call.method === "audit"));
  }
  const fixture = databaseFixture([]);
  const action = load("src/features/integrations/actions.ts", mocks(fixture)).linkEmailToTransaction;
  assert.match(await action(form("TRX-2026-00001")), /Pilih transaksi/);
  assert.equal(fixture.calls.length, 0);
  await assert.rejects(
    load("src/features/integrations/actions.ts", mocks(fixture, "content_editor")).linkEmailToTransaction(form()),
    /tidak memiliki akses/,
  );
});
test("Link locks the email and saves association plus audit in the same transaction", async () => {
  const fixture = databaseFixture([
    [{ id: emailId, folder: "inbox", linkedTransactionId: null }],
    [{ id: transactionId, referenceNo: "QA-01" }],
  ]);
  const action = load("src/features/integrations/actions.ts", mocks(fixture)).linkEmailToTransaction;
  await assert.rejects(action(form()), /REDIRECT:.*link=success/);
  assert.ok(fixture.calls.some((call) => call.method === "for" && call.args[0] === "update"));
  assert.equal(fixture.calls.filter((call) => call.method === "update").length, 1);
  assert.equal(fixture.calls.filter((call) => call.method === "audit").length, 1);
  assert.equal(fixture.calls.find((call) => call.method === "audit").value.metadata.referenceNo, "QA-01");
});
test("Private photo endpoint rejects unauthorized access and mismatched/missing images", async () => {
  const path = "src/app/api/admin/transactions/[id]/photos/[documentId]/route.ts";
  for (const role of [null, "content_editor", "admin"]) {
    const fixture = databaseFixture([[]]);
    const { GET } = load(path, mocks(fixture, role));
    const response = await GET(new Request("http://localhost/photo"), {
      params: Promise.resolve({ id: transactionId, documentId: emailId }),
    });
    assert.equal(response.status, role === "admin" ? 404 : 403);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    if (role !== "admin") assert.equal(fixture.calls.length, 0);
  }
});

test("Photo previews decode safe raster images, enforce checksum and size, and never expose SVG", async () => {
  const sharp = require("sharp");
  const { createHash } = require("node:crypto");
  const file = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#8040c0" } })
    .png()
    .toBuffer();
  const document = {
    storagePath: "private/project.png",
    originalName: "project.png",
    checksum: createHash("sha256").update(file).digest("hex"),
  };
  for (const kind of ["valid", "checksum", "large", "svg"]) {
    const fixture = databaseFixture([
      [
        {
          ...document,
          checksum: kind === "checksum" ? "wrong" : document.checksum,
          originalName: kind === "svg" ? "project.svg" : document.originalName,
        },
      ],
    ]);
    const bindings = {
      ...mocks(fixture),
      "@/features/operations/private-storage": { privateFilePath: (value) => value },
      "node:fs/promises": {
        stat: async () => ({ isFile: () => true, size: kind === "large" ? 11 * 1024 * 1024 : file.length }),
        readFile: async () => file,
      },
    };
    const { GET } = load("src/app/api/admin/transactions/[id]/photos/[documentId]/route.ts", bindings);
    const response = await GET(new Request("http://localhost/photo"), {
      params: Promise.resolve({ id: transactionId, documentId: emailId }),
    });
    assert.equal(response.status, kind === "valid" ? 200 : 404);
    if (kind === "valid") {
      assert.equal(response.headers.get("content-type"), "image/webp");
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      assert.equal(metadata.width, 160);
      assert.equal(metadata.height, 120);
    }
  }
});
