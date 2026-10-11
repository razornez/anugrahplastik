/* eslint-disable @typescript-eslint/no-require-imports -- Local isolated TypeScript service harness. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

function load(path, stubs, cache = new Map()) {
  if (cache.has(path)) return cache.get(path);
  const item = new Module(path, module);
  item.filename = path;
  item.paths = module.paths;
  item.require = (id) =>
    stubs[id] ??
    (id.startsWith("@/")
      ? load(resolve(__dirname, "../src", `${id.slice(2)}.ts`), stubs, cache)
      : id.startsWith(".")
        ? load(resolve(dirname(path), `${id}.ts`), stubs, cache)
        : require(id));
  item._compile(
    ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    path,
  );
  cache.set(path, item.exports);
  return item.exports;
}

test("Two independent DB connections claim one send; post-acceptance DB failure stays blocked", async (context) => {
  require("dotenv").config({ path: resolve(__dirname, "../.env.local"), quiet: true });
  if (
    !process.env.DATABASE_URL ||
    !["127.0.0.1", "localhost", "::1"].includes(new URL(process.env.DATABASE_URL).hostname)
  )
    return context.skip("Local database required");
  const { Pool } = require("pg");
  const { drizzle } = require("drizzle-orm/node-postgres");
  const pools = [
    new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
    new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
  ];
  const prior = Object.fromEntries(
    ["NODE_ENV", "EMAIL_CS_SEND_MODE", "EMAIL_CS_TEST_RECIPIENTS"].map((key) => [key, process.env[key]]),
  );
  const drafts = [];
  try {
    process.env.NODE_ENV = "development";
    process.env.EMAIL_CS_SEND_MODE = "live";
    process.env.EMAIL_CS_TEST_RECIPIENTS = "qa@example.invalid";
    const owner = (await pools[0].query("select id,name from users order by created_at limit 1")).rows[0];
    assert(owner, "Local owner required");
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "[UJI INTEGRASI]" }] }],
    };
    let calls = 0;
    let failFinalWrite = false;
    let transactions = 0;
    const makeWorkspace = (index) => {
      const db = drizzle(pools[index]);
      const guarded = new Proxy(db, {
        get(target, key) {
          if (key === "transaction")
            return async (...args) => {
              if (failFinalWrite && ++transactions === 2) throw new Error("INJECTED POST SMTP PERSISTENCE FAILURE");
              return target.transaction(...args);
            };
          const value = target[key];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const stubs = {
        "server-only": {},
        "@/lib/database/client": { getDatabase: () => guarded },
        "@/lib/auth/session": { getSession: async () => ({ ...owner, role: "admin" }) },
        "./mail-service": {
          getMailboxSettings: async () => ({
            email: "sender@example.invalid",
            host: "never-connect.invalid",
            smtpPort: 587,
            password: "fixture",
          }),
          getEmailRecord: async () => null,
        },
        "./email-templates": {
          getActiveTemplate: async () => ({ content, version: 1 }),
          validateEmailDoc: (value) => value,
          buildTemplatedEmail: async () => ({ html: "<p>UJI</p>", text: "UJI", attachments: [] }),
        },
        "./secrets": {
          encryptSecret: (value) => Buffer.from(JSON.stringify(value)).toString("base64"),
          decryptSecret: (value) => JSON.parse(Buffer.from(value, "base64").toString()),
        },
        nodemailer: {
          createTransport: (options) => {
            assert.equal(options.secure, false);
            assert.equal(options.requireTLS, true);
            return {
              close() {},
              async sendMail(message) {
                calls++;
                await new Promise((resolve) => setTimeout(resolve, 20));
                return { messageId: message.messageId, accepted: [{ address: "qa@example.invalid" }], rejected: [] };
              },
            };
          },
        },
      };
      return load(resolve(__dirname, "../src/features/integrations/email-drafts.ts"), stubs);
    };
    const a = makeWorkspace(0),
      b = makeWorkspace(1);
    const payload = {
      to: "qa@example.invalid",
      cc: "",
      bcc: "",
      subject: "[UJI INTEGRASI] concurrency",
      originalSubject: "",
      content,
    };
    const first = await a.createDraft(payload, 1);
    drafts.push(first.id);
    const preview = await a.prepareDraft(first.id, 1);
    const outcomes = await Promise.allSettled([
      a.sendPreparedDraft(preview.attemptId),
      b.sendPreparedDraft(preview.attemptId),
    ]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(calls, 1);
    const successful = (
      await pools[0].query("select status,result_ciphertext from cs_email_outbox where id=$1", [preview.attemptId])
    ).rows[0];
    assert.equal(successful.status, "sent");
    assert.deepEqual(JSON.parse(Buffer.from(successful.result_ciphertext, "base64").toString()).accepted, [
      "qa@example.invalid",
    ]);
    const second = await a.createDraft({ ...payload, subject: "[UJI INTEGRASI] persistence failure" }, 1);
    drafts.push(second.id);
    const frozen = await a.prepareDraft(second.id, 1);
    failFinalWrite = true;
    transactions = 0;
    await assert.rejects(a.sendPreparedDraft(frozen.attemptId), /POST SMTP/);
    failFinalWrite = false;
    const pending = (await pools[0].query("select status from cs_email_outbox where id=$1", [frozen.attemptId]))
      .rows[0];
    assert.equal(pending.status, "pending");
    await assert.rejects(b.sendPreparedDraft(frozen.attemptId), /kedaluwarsa|berubah|diproses/);
    assert.equal(calls, 2);
    context.diagnostic(
      "Independent connections: one transport call; persistence failure after acceptance remains pending and cannot resend. No real SMTP.",
    );
  } finally {
    // Remove only exact IDs created by this test, never customer records or existing drafts.
    if (drafts.length) {
      const client = await pools[0].connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "delete from audit_logs where entity_id = any($1::text[]) or entity_id in (select id::text from cs_email_outbox where draft_id = any($1::uuid[]))",
          [drafts],
        );
        await client.query("delete from cs_email_outbox where draft_id = any($1::uuid[])", [drafts]);
        await client.query("delete from cs_email_drafts where id = any($1::uuid[])", [drafts]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all(pools.map((pool) => pool.end()));
  }
});
