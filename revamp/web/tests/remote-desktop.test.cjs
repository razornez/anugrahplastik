/* eslint-disable @typescript-eslint/no-require-imports -- Isolated configuration and route tests. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const source = readFileSync(join(__dirname, "../src", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const instance = { exports: {} };
  new Function("module", "exports", "require", compiled)(instance, instance.exports, (name) =>
    Object.hasOwn(dependencies, name) ? dependencies[name] : name.startsWith("@/") ? {} : require(name),
  );
  return instance.exports;
}

test("konfigurasi Remote Desktop hanya menerima host privat Tailscale dan profil mematikan drive sharing", () => {
  const previousHost = process.env.REMOTE_DESKTOP_TAILSCALE_HOST;
  const previousPort = process.env.REMOTE_DESKTOP_TAILSCALE_PORT;
  process.env.REMOTE_DESKTOP_TAILSCALE_HOST = "rumah.tailnet.ts.net";
  process.env.REMOTE_DESKTOP_TAILSCALE_PORT = "3389";
  const service = load("features/remote-desktop/service.ts");
  const config = service.getRemoteDesktopConfiguration();
  assert.deepEqual(config, { status: "configured", host: "rumah.tailnet.ts.net", port: 3389 });
  const profile = service.createRemoteDesktopProfile(config);
  assert.match(profile, /full address:s:rumah\.tailnet\.ts\.net:3389/);
  assert.match(profile, /redirectprinters:i:1/);
  assert.match(profile, /redirectclipboard:i:1/);
  assert.match(profile, /redirectdrives:i:0/);
  assert.match(profile, /authentication level:i:2/);
  process.env.REMOTE_DESKTOP_TAILSCALE_HOST = "https://public.example";
  assert.deepEqual(service.getRemoteDesktopConfiguration(), { status: "not_configured" });
  if (previousHost === undefined) delete process.env.REMOTE_DESKTOP_TAILSCALE_HOST;
  else process.env.REMOTE_DESKTOP_TAILSCALE_HOST = previousHost;
  if (previousPort === undefined) delete process.env.REMOTE_DESKTOP_TAILSCALE_PORT;
  else process.env.REMOTE_DESKTOP_TAILSCALE_PORT = previousPort;
});

test("endpoint RDP menolak non-admin dan menerbitkan attachment privat sekali pakai", async () => {
  let user = null;
  let used = false;
  let audits = 0;
  const route = load("app/api/admin/remote-desktop/launch/route.ts", {
    "drizzle-orm": {
      and: (...values) => values,
      eq: (...values) => values,
      gt: (...values) => values,
      isNull: (value) => value,
    },
    "@/lib/auth/session": { getSession: async () => user },
    "@/lib/database/client": {
      getDatabase: () => ({
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => (used ? [] : ((used = true), [{ id: "ticket-1" }])),
            }),
          }),
        }),
        insert: () => ({ values: async () => audits++ }),
      }),
    },
    "@/lib/database/schema": {
      auditLogs: {},
      remoteDesktopLaunchTickets: { tokenHash: {}, actorId: {}, usedAt: {}, expiresAt: {} },
    },
    "@/features/remote-desktop/service": {
      getRemoteDesktopConfiguration: () => ({ status: "configured", host: "rumah.tailnet.ts.net", port: 3389 }),
      createRemoteDesktopProfile: () => "redirectprinters:i:1\r\nredirectdrives:i:0",
    },
  });
  const request = new Request(`http://localhost/api/admin/remote-desktop/launch?ticket=${"a".repeat(43)}`);
  assert.equal((await route.GET(request)).status, 403);
  user = { id: "admin-1", role: "content" };
  assert.equal((await route.GET(request)).status, 403);
  user = { id: "admin-1", role: "admin" };
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /komputer-rumah\.rdp/);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.match(await response.text(), /redirectdrives:i:0/);
  assert.equal(audits, 1);
  assert.equal((await route.GET(request)).status, 403);
});
