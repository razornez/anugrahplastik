/* eslint-disable @typescript-eslint/no-require-imports -- Pure TypeScript module loaded by Node's test runner. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(file) {
  const source = readFileSync(join(__dirname, "../src", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const instance = { exports: {} };
  new Function("module", "exports", "require", compiled)(instance, instance.exports, require);
  return instance.exports;
}

const { getIntegrationHealth, getSchedulerHealth } = load("features/integrations/integration-health.ts");
const { getMailboxOperationalHealth } = load("features/integrations/mailbox-operational-health.ts");
const now = new Date("2026-10-07T03:00:00.000Z");

test("integration health never treats a stored credential as a successful connection", () => {
  assert.equal(
    getIntegrationHealth({ configured: false, configurationReady: false, staleAfterHours: 24, now }).level,
    "not-ready",
  );
  assert.equal(
    getIntegrationHealth({ configured: true, configurationReady: true, staleAfterHours: 24, now }).level,
    "needs-test",
  );
});

test("integration health distinguishes fresh, stale, and failed checks", () => {
  const input = { configured: true, configurationReady: true, staleAfterHours: 24, now };
  assert.equal(getIntegrationHealth({ ...input, lastSyncAt: new Date("2026-10-06T12:00:00.000Z") }).level, "healthy");
  assert.equal(getIntegrationHealth({ ...input, lastSyncAt: new Date("2026-10-05T00:00:00.000Z") }).level, "attention");
  assert.equal(
    getIntegrationHealth({ ...input, lastSyncAt: new Date("2026-10-07T02:00:00.000Z"), lastError: "Gagal" }).level,
    "attention",
  );
});

test("health mailbox exposes a safe recovery action for classified provider failures", () => {
  const health = getIntegrationHealth({
    configured: true,
    configurationReady: true,
    lastError: "Mailbox menolak kredensial.",
    lastErrorCode: "mail_authentication",
    staleAfterHours: 24,
    now,
  });
  assert.equal(health.level, "attention");
  assert.match(health.recovery, /kata sandi/i);
});

test("scheduler health reports an absent and a stale VPS heartbeat honestly", () => {
  assert.equal(getSchedulerHealth(null, now).level, "needs-test");
  assert.equal(getSchedulerHealth(new Date("2026-10-07T02:50:00.000Z"), now).level, "healthy");
  assert.equal(getSchedulerHealth(new Date("2026-10-07T02:40:00.000Z"), now).level, "attention");
});

test("mailbox operational health distinguishes live, unconfigured, and timed-out states", () => {
  const connection = getIntegrationHealth({
    configured: true,
    configurationReady: true,
    lastSyncAt: new Date("2026-10-07T02:55:00.000Z"),
    staleAfterHours: 0.25,
    now,
  });
  const scheduler = getSchedulerHealth(new Date("2026-10-07T02:55:00.000Z"), now);
  assert.equal(
    getMailboxOperationalHealth({
      connection,
      scheduler,
      schedulerLastRunAt: new Date("2026-10-07T02:55:00.000Z"),
      lastSyncAt: new Date("2026-10-07T02:55:00.000Z"),
      isLocalRuntime: false,
    }).label,
    "Email siap digunakan",
  );
  assert.equal(
    getMailboxOperationalHealth({
      connection,
      scheduler,
      schedulerLastRunAt: null,
      lastSyncAt: new Date("2026-10-07T02:55:00.000Z"),
      isLocalRuntime: false,
      schedulerConfigured: false,
    }).label,
    "Pembaruan otomatis belum disiapkan",
  );
  const timedOut = getIntegrationHealth({
    configured: true,
    configurationReady: true,
    lastErrorCode: "mail_timeout",
    lastError: "Mailbox tidak merespons dalam batas waktu.",
    staleAfterHours: 0.25,
    now,
  });
  assert.equal(
    getMailboxOperationalHealth({
      connection: timedOut,
      scheduler,
      schedulerLastRunAt: null,
      lastSyncAt: null,
      lastErrorCode: "mail_timeout",
      isLocalRuntime: true,
    }).label,
    "Server mailbox tidak merespons",
  );
});

test("integration settings use manual admin actions and accessible pending feedback", () => {
  const page = readFileSync(join(__dirname, "../src/app/admin/settings/integrations/page.tsx"), "utf8");
  const controls = readFileSync(
    join(__dirname, "../src/components/integrations/integration-health-controls.tsx"),
    "utf8",
  );
  assert.match(page, /getIntegrationHealth/);
  assert.match(page, /IntegrationHealthControls connected kind="mail"/);
  assert.match(page, /kind="google-ads"/);
  assert.match(controls, /runCsMailboxHealthCheck/);
  assert.match(controls, /runGoogleAdsAccessProbe/);
  assert.match(controls, /aria-live="polite"/);
  assert.match(controls, /aria-busy=\{pending\}/);
  assert.match(controls, /window\.confirm/);
  assert.match(page, /getSchedulerHealth/);
  assert.match(page, /Eksekusi sinkronisasi terbaru/);
  assert.match(page, /Data terakhir diperbarui/);
  assert.match(page, /Pemeriksaan terakhir/);
  assert.match(page, /MODE LOKAL/);
  assert.match(page, /Tidak ada scheduler atau koneksi mailbox permanen/);
  assert.match(page, /Kredensial tersimpan, koneksi belum sehat/);
  assert.match(page, /Status koneksi/);
  assert.match(page, /\["admin", "sales"\]\.includes\(user\.role\)/);
  assert.match(page, /const canManage = user\.role === "admin"/);
});

test("failed mailbox state makes retry the primary action and moves destructive disconnect behind details", () => {
  const mailboxForm = readFileSync(join(__dirname, "../src/components/integrations/mailbox-setup-form.tsx"), "utf8");
  const controls = readFileSync(
    join(__dirname, "../src/components/integrations/integration-health-controls.tsx"),
    "utf8",
  );
  assert.match(mailboxForm, /Perbarui kata sandi mailbox/);
  assert.match(mailboxForm, /Uji & perbarui koneksi/);
  assert.match(controls, /Uji ulang koneksi/);
  assert.match(controls, /className=\{isMail \? "admin-primary-button" : "admin-secondary-button"\}/);
  assert.match(controls, /<details className="integration-disconnect">/);
  assert.match(controls, /Putuskan & hapus kredensial/);
});

test("scheduled endpoint delegates to the safe sync orchestrator and stores only safe run metadata", () => {
  const route = readFileSync(join(__dirname, "../src/app/api/integrations/sync/route.ts"), "utf8");
  const runner = readFileSync(join(__dirname, "../src/features/integrations/sync-runner.ts"), "utf8");
  assert.match(route, /runIntegrationSync\(\{ trigger: "scheduled" \}\)/);
  assert.match(route, /mail: \{ status: result\.mail\.status/);
  assert.match(route, /ads: \{ status: result\.ads\.status/);
  assert.doesNotMatch(route, /syncMailbox\(/);
  assert.match(runner, /integrationSyncRuns/);
  assert.match(runner, /30 \* 86_400_000/);
  assert.match(runner, /secretCiphertext/);
  assert.match(runner, /getSchedulerConfiguration/);
  assert.doesNotMatch(runner, /bodyCiphertext/);
});

test("mailbox failures are categorized without retaining provider diagnostics", () => {
  const service = readFileSync(join(__dirname, "../src/features/integrations/mail-service.ts"), "utf8");
  const runner = readFileSync(join(__dirname, "../src/features/integrations/sync-runner.ts"), "utf8");
  const actions = readFileSync(join(__dirname, "../src/features/integrations/actions.ts"), "utf8");
  assert.match(service, /mail_authentication/);
  assert.match(service, /mail_dns_network/);
  assert.match(service, /mail_tls/);
  assert.match(service, /mail_timeout/);
  assert.match(service, /Password belum dapat diverifikasi/);
  assert.doesNotMatch(service, /mencoba lagi pada sinkronisasi berikutnya/);
  assert.match(service, /mail_folder/);
  assert.match(service, /mailLastErrorCode/);
  assert.match(runner, /mailboxCode/);
  assert.match(actions, /error instanceof MailboxSyncError\) return error\.message/);
  assert.doesNotMatch(actions, /error\.message\.startsWith\("Koneksi email belum berhasil\."\)/);
  assert.doesNotMatch(actions, /Pastikan server dan database tersedia/);
  assert.match(actions, /CS_MAIL_HOST/);
});

test("Email CS shows honest sync status from successful and attempted mailbox runs", () => {
  const page = readFileSync(join(__dirname, "../src/app/admin/email/page.tsx"), "utf8");
  const actions = readFileSync(join(__dirname, "../src/features/integrations/actions.ts"), "utf8");
  assert.match(page, /Terakhir berhasil/);
  assert.match(page, /Percobaan terakhir/);
  assert.match(page, /Mode lokal, dijalankan manual/);
  assert.match(page, /Pembaruan berikutnya/);
  assert.match(page, /MailboxRefreshControl/);
  assert.match(page, /mailboxHealth\.recovery/);
  assert.match(page, /getSchedulerConfiguration/);
  assert.doesNotMatch(page, /Email CS masih tersimpan, tetapi layanan sedang perlu perhatian/);
  assert.match(page, /getRecentIntegrationSyncRuns/);
  assert.match(actions, /runIntegrationSync\(\{ trigger: "manual", services: \["mail"\] \}\)/);
});

test("Google Ads reports require explicit OAuth, Developer Token, MCC, and customer configuration", () => {
  const service = readFileSync(join(__dirname, "../src/features/integrations/google-ads-service.ts"), "utf8");
  const callback = readFileSync(join(__dirname, "../src/app/api/integrations/google-ads/callback/route.ts"), "utf8");
  const config = readFileSync(join(__dirname, "../src/features/integrations/google-ads-config.ts"), "utf8");
  assert.match(service, /"login-customer-id": managerId/);
  assert.match(service, /probeGoogleAdsReporting/);
  assert.match(service, /"developer-token": developerToken/);
  assert.match(config, /GOOGLE_ADS_DEVELOPER_TOKEN/);
  assert.doesNotMatch(service, /GOOGLE_ADS_CUSTOMER_ID \|\| "6738895829"/);
  assert.doesNotMatch(callback, /GOOGLE_ADS_CUSTOMER_ID \|\| "6738895829"/);
  assert.match(config, /GOOGLE_ADS_LOGIN_CUSTOMER_ID/);
  assert.match(config, /MCC Login Customer ID/);
  assert.match(config, /maskGoogleAdsCustomerId/);
});

test("Google Ads health actions expose a separate read-only access probe", () => {
  const actions = readFileSync(join(__dirname, "../src/features/integrations/actions.ts"), "utf8");
  const controls = readFileSync(
    join(__dirname, "../src/components/integrations/integration-health-controls.tsx"),
    "utf8",
  );
  assert.match(actions, /runGoogleAdsAccessProbe/);
  assert.match(actions, /probeGoogleAdsReporting/);
  assert.match(controls, /Verifikasi akses API/);
  assert.match(controls, /runGoogleAdsAccessProbe/);
});

test("Google Ads refresh and probe both require the full private configuration", () => {
  const actions = readFileSync(join(__dirname, "../src/features/integrations/actions.ts"), "utf8");
  const checks =
    actions.match(
      /const configurationIssues = \[\s*\.\.\.getGoogleAdsOAuthConfigurationIssues\(\),\s*\.\.\.getGoogleAdsReportingConfigurationIssues\(\),\s*\];/g,
    ) ?? [];
  assert.equal(checks.length, 2);
});

test("integration status layout keeps mobile details compact without hiding state", () => {
  const styles = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
  assert.match(styles, /\.integration-page \.integration-facts > strong[\s\S]*font-variant-numeric: tabular-nums/);
  assert.match(
    styles,
    /@media \(max-width: 560px\)[\s\S]*?\.integration-page \.integration-card h2[\s\S]*?font-size: 18px/,
  );
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\.integration-card/);
});

test("admin mobile navigation and its portal have one scoped visual authority", () => {
  const globalStyles = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
  const adminStyles = readFileSync(join(__dirname, "../src/app/admin/admin-design.css"), "utf8");
  const sidebar = readFileSync(join(__dirname, "../src/components/admin-sidebar.tsx"), "utf8");
  assert.doesNotMatch(globalStyles, /\.admin-more-sheet/);
  assert.match(adminStyles, /\.admin-bottom-nav :is\(a, button\)[\s\S]*?display: grid/);
  assert.match(adminStyles, /\.admin-more-sheet \.admin-theme-picker[\s\S]*?grid-template-columns: repeat\(3/);
  assert.match(adminStyles, /\.admin-more-sheet\[data-theme="dark"\]/);
  assert.doesNotMatch(adminStyles, /body:has\(\.admin-shell\[data-theme="dark"\]\) \.admin-more-sheet/);
  assert.match(sidebar, /data-theme=\{theme\}/);
});

test("integration header has one clear title and keeps its actions in one grouped row", () => {
  const page = readFileSync(join(__dirname, "../src/app/admin/settings/integrations/page.tsx"), "utf8");
  const styles = readFileSync(join(__dirname, "../src/app/admin/admin-design.css"), "utf8");
  assert.match(page, /AdminPageHeader/);
  assert.match(page, /title="Integrasi"/);
  assert.doesNotMatch(page, /className="admin-page-heading integration-page-heading"/);
  assert.match(styles, /\.admin-page-header__actions[\s\S]*display: flex/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.admin-page-header__actions[\s\S]*?width: 100%/);
});

test("admin workspaces share the compact page-header primitive", () => {
  const pages = [
    "app/admin/content/page.tsx",
    "app/admin/email/page.tsx",
    "app/admin/marketing/page.tsx",
    "app/admin/masters/page.tsx",
    "app/admin/masters/[kind]/page.tsx",
    "app/admin/masters/designs/[id]/page.tsx",
    "app/admin/prospects/page.tsx",
    "app/admin/settings/invoice/page.tsx",
    "app/admin/team/page.tsx",
    "app/admin/transactions/page.tsx",
    "app/admin/transactions/[id]/page.tsx",
  ];
  for (const page of pages) {
    assert.match(readFileSync(join(__dirname, "../src", page), "utf8"), /AdminPageHeader/);
  }
});
