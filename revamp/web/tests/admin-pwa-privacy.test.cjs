/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("public pages no longer publish the Back Office manifest", () => {
  assert.equal(existsSync(join(root, "src/app/manifest.ts")), false);

  const tombstone = read("src/app/manifest.webmanifest/route.ts");
  assert.match(tombstone, /status:\s*410/);
  assert.match(tombstone, /Cache-Control["']:\s*["']no-store/);
  assert.doesNotMatch(tombstone, /Back Office|start_url|\/admin/);
});

test("the install manifest is private and scoped to authenticated admin pages", () => {
  const route = read("src/app/api/admin/app-manifest/route.ts");
  const layout = read("src/app/admin/layout.tsx");
  const provider = read("src/components/admin-install-provider.tsx");

  assert.match(route, /await getSession\(\)/);
  assert.match(route, /if \(!session\).*status:\s*404/);
  assert.match(route, /"scope":?\s*"\/admin\/"|scope:\s*"\/admin\/"/);
  assert.match(route, /Cache-Control["']:\s*["']private, no-store/);
  assert.match(layout, /if \(!session\)[\s\S]*admin-shell--public/);
  assert.match(layout, /<AdminInstallProvider>/);
  assert.ok(
    layout.indexOf("<AdminInstallProvider>") > layout.indexOf("if (!session)"),
    "the manifest provider must only render after the unauthenticated branch returns",
  );
  assert.match(provider, /manifest\.href = "\/api\/admin\/app-manifest"/);
  assert.match(provider, /manifest\.crossOrigin = "use-credentials"/);
  assert.match(provider, /event\.preventDefault\(\)/);
});

test("robots and sitemap do not advertise internal routes", () => {
  const robots = read("src/app/robots.ts");
  const sitemap = read("src/app/sitemap.ts");
  const proxy = read("src/proxy.ts");

  assert.doesNotMatch(robots, /\/admin|\/preview/);
  assert.doesNotMatch(sitemap, /\/admin|\/preview/);
  assert.match(proxy, /startsWith\("\/admin"\)/);
  assert.match(proxy, /startsWith\("\/preview"\)/);
  assert.match(proxy, /X-Robots-Tag/);
});
