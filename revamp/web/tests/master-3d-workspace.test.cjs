/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("viewer exposes accessible reset, fit, and fullscreen controls", async () => {
  const viewer = await read("src/components/design-model-viewer.tsx");
  assert.match(viewer, /Sesuaikan tampilan/);
  assert.match(viewer, /Reset posisi/);
  assert.match(viewer, /Layar penuh/);
  assert.match(viewer, /IntersectionObserver/);
  assert.match(viewer, /renderer\.dispose/);
  assert.match(viewer, /AdminShimmer/);
  assert.match(viewer, /document\.exitFullscreen/);
  assert.match(viewer, /setSize\(width, height, false\)/);
  assert.match(viewer, /DRACOLoader/);
  assert.match(viewer, /setDecoderPath\("\/api\/admin\/three\/draco\/"\)/);
  assert.match(viewer, /Shift \+ tarik/);
  assert.match(viewer, /controls\.enablePan = true/);
  assert.match(viewer, /ArrowLeft/);
  assert.match(viewer, /thumbnail/);
});

test("design thumbnails remain private, normalized, and written once", async () => {
  const route = await read("src/app/api/admin/design-files/[id]/thumbnail/route.ts");
  const storage = await read("src/features/operations/private-storage.ts");
  assert.match(route, /operationsUser/);
  assert.match(route, /thumbnailLimit/);
  assert.match(route, /sharp\(/);
  assert.match(route, /isNull\(productDesignFiles\.thumbnailStoragePath\)/);
  assert.match(storage, /thumbnailStorageName/);
});

test("private Draco decoder exposes only the required decoder assets", async () => {
  const route = await read("src/app/api/admin/three/draco/[asset]/route.ts");
  assert.match(route, /draco_decoder\.wasm/);
  assert.match(route, /draco_wasm_wrapper\.js/);
  assert.match(route, /operationsUser/);
  assert.match(route, /asset in decoderAssets/);
});

test("design upload validates every selected server-side relation", async () => {
  const route = await read("src/app/api/admin/design-files/route.ts");
  assert.match(route, /validateLinks/);
  assert.match(route, /businessTransactions/);
  assert.match(route, /Data yang dipilih sudah tidak tersedia/);
  assert.match(route, /operationsUser/);
});

test("local fixture seed refuses non-local databases and remains idempotent", async () => {
  const seed = await read("scripts/seed-master-3d-local.mjs");
  assert.match(seed, /127\.0\.0\.1/);
  assert.match(seed, /hanya boleh dijalankan pada database lokal/);
  assert.match(seed, /local_3d_fixture\.seeded/);
  assert.match(seed, /sudah tersedia/);
});

test("private design download resolves through the storage containment helper", async () => {
  const route = await read("src/app/api/admin/design-files/[id]/route.ts");
  assert.match(route, /privateFilePath/);
  assert.doesNotMatch(route, /resolve\(storageRoot\(\)/);
});

test("master records expose guarded update and deletion actions", async () => {
  const actions = await read("src/features/operations/actions.ts");
  const dialog = await read("src/components/master-record-dialog.tsx");
  assert.match(actions, /export async function updateMasterRecord/);
  assert.match(actions, /export async function deleteMasterRecord/);
  assert.match(actions, /masih dipakai oleh pekerjaan atau file lain/);
  assert.match(dialog, /Simpan perubahan/);
  assert.match(dialog, /Hapus permanen/);
});

test("mobile master rows keep the manage action as a trailing control", async () => {
  const styles = await read("src/app/admin/admin-design.css");
  assert.match(styles, /article:not\(\.design-list-row\) > \.directory-manage/);
  assert.match(styles, /grid-column: 3/);
  assert.match(styles, /min-height: 44px/);
});

test("design directory keeps search visible and moves filters into an accessible compact dialog", async () => {
  const toolbar = await read("src/components/design-directory-toolbar.tsx");
  const page = await read("src/app/admin/masters/[kind]/page.tsx");
  assert.match(toolbar, /Filter & urutkan/);
  assert.match(toolbar, /<dialog/);
  assert.match(toolbar, /router\.push/);
  assert.match(toolbar, /aria-haspopup="dialog"/);
  assert.match(toolbar, /name=.*material|Material/);
  assert.match(page, /DesignDirectoryToolbar/);
});

test("mobile design rows keep a concise summary and grouped status action", async () => {
  const page = await read("src/app/admin/masters/[kind]/page.tsx");
  const styles = await read("src/app/admin/admin-design.css");
  assert.match(page, /design-list-row__actions/);
  assert.match(page, /row\.description \|\|/);
  assert.match(styles, /-webkit-line-clamp: 2/);
  assert.match(styles, /design-list-row__thumbnail/);
});
