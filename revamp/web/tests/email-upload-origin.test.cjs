/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript route harness. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
const { NextRequest } = require("next/server");

function load(relative, stubs = {}) {
  const path = resolve(__dirname, "..", relative);
  const item = new Module(path, module);
  item.filename = path;
  item.paths = module.paths;
  item.require = (id) => stubs[id] ?? require(id);
  item._compile(
    ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    path,
  );
  return item.exports;
}
const { isRequestOriginAllowed: allowed } = load("src/lib/security/request-origin.ts");
const dev = { environment: "development" };
const prod = { environment: "production" };
function request(origin = "http://127.0.0.1:3100", extra = {}, url = "http://localhost:3100/upload") {
  return { url, headers: new Headers({ host: "127.0.0.1:3100", ...(origin === null ? {} : { origin }), ...extra }) };
}

test("NextRequest loopback normalization no longer rejects legitimate development uploads", () => {
  for (const host of ["127.0.0.1:3100", "localhost:3100", "[::1]:3100"]) {
    const origin = `http://${host}`;
    const req = new NextRequest(`${origin}/upload`, { headers: { origin, host } });
    assert.equal(new URL(req.url).hostname, "localhost");
    assert.equal(allowed(req, dev), true);
    assert.equal(allowed(req, prod), host === "localhost:3100");
  }
});

test("Origin validation rejects missing, malformed, foreign, cross-site and mismatched requests", () => {
  for (const origin of [
    null,
    "",
    "null",
    "not-url",
    "https://evil.invalid",
    "http://127.0.0.1:3200",
    "https://127.0.0.1:3100",
    "ftp://localhost:3100",
    "http://user@localhost:3100",
    "http://localhost:3100/path",
    "http://localhost:3100?",
    "http://localhost:3100#",
  ])
    assert.equal(allowed(request(origin), dev), false, String(origin));
  assert.equal(allowed(request(undefined, { host: "localhost:3100" }), dev), false);
  assert.equal(allowed(request(undefined, { "sec-fetch-site": "cross-site" }), dev), false);
  assert.equal(allowed(request(undefined, {}, "http://service.internal:3100/upload"), dev), false);
  assert.equal(
    allowed(
      request("https://evil.invalid", { "x-forwarded-host": "evil.invalid", "x-forwarded-proto": "https" }),
      prod,
    ),
    false,
  );
  assert.equal(allowed(request(undefined), { environment: "test" }), false);
});

test("APP_ORIGIN is strict, authoritative and fails closed when invalid", () => {
  const req = request("https://admin.example.com", { host: "internal:3100" }, "http://internal:3100/upload");
  assert.equal(allowed(req, { ...prod, appOrigin: "https://admin.example.com" }), true);
  assert.equal(allowed(req, prod), false);
  assert.equal(allowed(request(undefined), { ...dev, appOrigin: "https://admin.example.com" }), false);
  for (const appOrigin of [
    "null",
    "bad",
    "ftp://admin.example.com",
    "https://user:password@admin.example.com",
    "https://admin.example.com/path",
    "https://admin.example.com?query=1",
    "https://admin.example.com#fragment",
    "https://admin.example.com\\path",
  ])
    assert.equal(allowed(req, { ...prod, appOrigin }), false, appOrigin);
  assert.equal(
    allowed(request("https://admin.example.com:8443"), { ...prod, appOrigin: "https://admin.example.com" }),
    false,
  );
  assert.equal(
    allowed(request("http://admin.example.com"), { ...prod, appOrigin: "https://admin.example.com" }),
    false,
  );
  assert.equal(
    allowed(
      { ...req, headers: new Headers({ origin: "https://admin.example.com", "sec-fetch-site": "cross-site" }) },
      { ...prod, appOrigin: "https://admin.example.com" },
    ),
    false,
  );
});

test("Private download route preserves bytes and protective headers, denies inaccessible files", async () => {
  for (const denied of [false, true]) {
    const route = load("src/app/api/admin/email-drafts/[id]/files/route.ts", {
      "@/lib/auth/session": {},
      "@/lib/security/request-origin": { isRequestOriginAllowed: allowed },
      "@/features/integrations/email-workspace-model": {},
      "@/features/integrations/email-drafts": {
        downloadDraftFile: async (id, fileId) => {
          assert.equal(id, "test-draft");
          assert.equal(fileId, "test-file");
          if (denied) throw new Error("Akses ditolak");
          return { bytes: Buffer.from("fixture"), filename: "fixture.pdf", contentType: "application/pdf" };
        },
      },
    });
    const response = await route.GET(new Request("http://localhost:3100/files?file=test-file"), {
      params: Promise.resolve({ id: "test-draft" }),
    });
    assert.equal(response.status, denied ? 404 : 200);
    if (!denied) {
      assert.equal(await response.text(), "fixture");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("content-security-policy"), "sandbox");
      assert.match(response.headers.get("content-disposition"), /^attachment;/);
    }
  }
});

function harness({ role = "admin", readError, uploadError } = {}) {
  const calls = { read: 0, upload: 0, body: 0, cancel: 0 };
  const route = load("src/app/api/admin/email-drafts/[id]/files/route.ts", {
    "@/lib/auth/session": { getSession: async () => (role ? { role } : null) },
    "@/lib/security/request-origin": { isRequestOriginAllowed: (req) => allowed(req, dev) },
    "@/features/integrations/email-workspace-model": { maxUploadBytes: 10 * 1024 * 1024 },
    "@/features/integrations/email-drafts": {
      readDraft: async () => {
        calls.read++;
        if (readError) throw new Error(readError);
      },
      uploadDraftFile: async (id, revision, filename, bytes) => {
        calls.upload++;
        if (uploadError) throw new Error(uploadError);
        assert.equal(id, "test-draft");
        assert.equal(revision, 1);
        assert.equal(filename, "fixture.pdf");
        assert.equal(bytes.toString(), "fixture");
        return { revision: 2, files: [{ filename }] };
      },
    },
  });
  function req(origin, chunks = [Buffer.from("fixture")], revision = "1") {
    let index = 0;
    return {
      ...request(
        origin,
        {},
        `http://localhost:3100/api/admin/email-drafts/test-draft/files?revision=${revision}&filename=fixture.pdf`,
      ),
      body: {
        getReader: () => ({
          read: async () => {
            calls.body++;
            return index < chunks.length ? { value: chunks[index++], done: false } : { done: true };
          },
          cancel: async () => {
            calls.cancel++;
          },
        }),
      },
    };
  }
  return { calls, req, post: (req) => route.POST(req, { params: Promise.resolve({ id: "test-draft" }) }) };
}

test("Endpoint rejects unauthorized roles and foreign origins before reading or storing uploads", async () => {
  for (const role of [null, "content"]) {
    const h = harness({ role });
    assert.equal((await h.post(h.req())).status, 403);
    assert.deepEqual(h.calls, { read: 0, upload: 0, body: 0, cancel: 0 });
  }
  const h = harness();
  const response = await h.post(h.req("https://evil.invalid"));
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Muat ulang/);
  assert.deepEqual(h.calls, { read: 0, upload: 0, body: 0, cancel: 0 });
});

test("Endpoint preserves draft access, revisions, size limits and service validation failures", async () => {
  const denied = harness({ readError: "Akses draf ditolak" });
  assert.equal((await denied.post(denied.req())).status, 400);
  assert.equal(denied.calls.body, 0);
  assert.equal(denied.calls.upload, 0);
  const revision = harness();
  assert.equal((await revision.post(revision.req(undefined, [], "0"))).status, 400);
  assert.equal(revision.calls.body, 0);
  const large = harness();
  assert.equal((await large.post(large.req(undefined, [Buffer.alloc(10 * 1024 * 1024 + 1)]))).status, 413);
  assert.equal(large.calls.cancel, 1);
  assert.equal(large.calls.upload, 0);
  for (const uploadError of ["Revisi draf berubah", "File rusak", "Maksimal 5 lampiran"]) {
    const h = harness({ uploadError });
    const response = await h.post(h.req());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, uploadError);
  }
  for (const role of ["admin", "sales"]) {
    const h = harness({ role });
    const response = await h.post(h.req());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).revision, 2);
    assert.equal(h.calls.upload, 1);
  }
});
