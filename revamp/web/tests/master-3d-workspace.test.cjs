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

test("private OpenCascade worker enables authenticated IGES and STEP previews", async () => {
  const viewer = await read("src/components/design-model-viewer.tsx");
  const page = await read("src/app/admin/masters/designs/[id]/page.tsx");
  const route = await read("src/app/api/admin/three/occt/[asset]/route.ts");
  const storage = await read("src/features/operations/private-storage.ts");
  const config = await read("next.config.ts");
  assert.match(viewer, /"step" \| "stp" \| "iges" \| "igs"/);
  assert.match(viewer, /occt-import-js-worker\.js/);
  assert.match(viewer, /worker\.postMessage/);
  assert.match(viewer, /CAD_IMPORT_FAILED/);
  assert.match(viewer, /const validMeshes/);
  assert.match(viewer, /new Uint32Array\(indexCount\)/);
  assert.match(page, /isBrowserPreviewable/);
  assert.match(storage, /isCadPreviewable/);
  assert.match(storage, /isBrowserPreviewable/);
  assert.match(route, /occt-import-js\.wasm/);
  assert.match(route, /operationsUser/);
  assert.match(route, /asset in occtAssets/);
  assert.match(config, /node_modules\/occt-import-js\/dist\/\*\*\/\*/);
});

test("large CAD source files keep the 100 MB source policy instead of the mesh preview limit", async () => {
  const uploadInput = await read("src/features/operations/design-file-input.ts");
  assert.match(uploadInput, /isPreviewable\(format\) && byteSize > previewFileLimit/);
  assert.doesNotMatch(uploadInput, /isBrowserPreviewable\(format\) && byteSize > previewFileLimit/);
});

test("design upload validates every selected server-side relation", async () => {
  const helper = await read("src/features/operations/design-file-input.ts");
  const route = await read("src/app/api/admin/design-files/route.ts");
  assert.match(helper, /validateDesignLinks/);
  assert.match(helper, /businessTransactions/);
  assert.match(helper, /Data yang dipilih sudah tidak tersedia/);
  assert.match(route, /operationsUser/);
});

test("design upload and edit allow files without a business relation", async () => {
  const upload = await read("src/components/design-upload-form.tsx");
  const editor = await read("src/components/design-file-manage-dialog.tsx");
  const helper = await read("src/features/operations/design-file-input.ts");

  for (const source of [upload, editor]) {
    assert.match(source, /Tautkan ke \(opsional\)/);
    assert.match(source, /Bisa ditambahkan nanti/);
    assert.doesNotMatch(source, /name="targetLookup"[\s\S]{0,220}required/);
    assert.doesNotMatch(source, /disabled=\{[^}]*!options\.links\.length/);
  }
  assert.doesNotMatch(helper, /if \(!relationIds\.length\)/);
  assert.match(helper, /fields\.materialId/);
  assert.match(helper, /Data yang dipilih sudah tidak tersedia/);
});

test("3D viewer groups touch controls above a concise mobile hint", async () => {
  const viewer = await read("src/components/design-model-viewer.tsx");
  const styles = await read("src/app/admin/admin-design.css");
  assert.match(viewer, /Tarik untuk putar · Cubit untuk zoom/);
  assert.match(styles, /\.design-viewer__toolbar[\s\S]*flex-wrap:\s*nowrap/);
  assert.match(styles, /\.design-viewer__toolbar button[\s\S]*width:\s*44px[\s\S]*height:\s*44px/);
  assert.match(styles, /\.design-viewer__hint-mobile/);
});

test("design upload keeps the proxy above the source limit and recovers from interrupted streams", async () => {
  const config = await read("next.config.ts");
  const route = await read("src/features/operations/design-file-input.ts");
  assert.match(config, /proxyClientMaxBodySize: "105mb"/);
  assert.match(route, /pipeline\(Readable\.fromWeb/);
  assert.match(route, /pendingPaths/);
  assert.match(route, /Upload terputus sebelum file selesai diterima/);
  assert.match(route, /removePrivateFile\(path\)/);
});

test("design files support guarded metadata edits, source replacement, and permanent admin deletion", async () => {
  const route = await read("src/app/api/admin/design-files/[id]/route.ts");
  const dialog = await read("src/components/design-file-manage-dialog.tsx");
  const list = await read("src/app/admin/masters/[kind]/page.tsx");
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /role !== "admin"/);
  assert.match(route, /design\.metadata_updated/);
  assert.match(route, /design\.source_replaced/);
  assert.match(route, /design\.deleted/);
  assert.match(route, /version: sql/);
  assert.match(route, /derivedPreviewStoragePath: null/);
  assert.match(dialog, /Simpan perubahan/);
  assert.match(dialog, /Hapus permanen/);
  assert.match(dialog, /expectedUpdatedAt/);
  assert.match(dialog, /aria-busy/);
  assert.match(list, /user\.role === "sales" && rawKind === "designs"/);
});

test("design file actions use accessible eye, pencil, and admin-only trash controls", async () => {
  const actions = await read("src/components/design-file-manage-dialog.tsx");
  const list = await read("src/app/admin/masters/[kind]/page.tsx");
  const detail = await read("src/app/admin/masters/designs/[id]/page.tsx");
  const styles = await read("src/app/admin/admin-design.css");
  assert.match(actions, /function EyeIcon/);
  assert.match(actions, /function PencilIcon/);
  assert.match(actions, /function TrashIcon/);
  assert.match(actions, /Lihat detail \$\{file\.originalName\}/);
  assert.match(actions, /Edit \$\{file\.originalName\}/);
  assert.match(actions, /Hapus \$\{file\.originalName\}/);
  assert.match(actions, /role="tooltip"/);
  assert.match(actions, /editDialogRef/);
  assert.match(actions, /deleteDialogRef/);
  assert.match(actions, /canDelete \?/);
  assert.match(list, /detailHref=\{`\/admin\/masters\/designs\/\$\{row\.id\}`\}/);
  assert.doesNotMatch(detail, /detailHref=/);
  assert.match(styles, /\.design-file-icon-action \{/);
  assert.match(styles, /width: 44px/);
  assert.match(styles, /height: 44px/);
  assert.match(styles, /\.design-file-icon-action:focus-visible/);
  assert.match(styles, /\.design-file-action-tooltip/);
  assert.match(styles, /flex-wrap: nowrap/);
});

test("CAD previews persist one checksum-bound private GLB and bypass the worker on later opens", async () => {
  const route = await read("src/app/api/admin/design-files/[id]/derived-preview/route.ts");
  const viewer = await read("src/components/design-model-viewer.tsx");
  const schema = await read("src/lib/database/schema.ts");
  const storage = await read("src/features/operations/private-storage.ts");
  assert.match(route, /model\/gltf-binary/);
  assert.match(route, /readUInt32LE\(0\) === 0x46546c67/);
  assert.match(route, /readUInt32LE\(4\) === 2/);
  assert.match(route, /eq\(productDesignFiles\.checksum, sourceChecksum\)/);
  assert.match(route, /isNull\(productDesignFiles\.derivedPreviewStoragePath\)/);
  assert.match(route, /designStorageUsage/);
  assert.match(viewer, /derived-preview/);
  assert.match(viewer, /derivedPreviewAvailable/);
  assert.match(viewer, /GLTFExporter/);
  assert.match(viewer, /sourceChecksum/);
  assert.match(schema, /derivedPreviewSourceChecksum/);
  assert.match(storage, /derivedPreviewStorageName/);
});

test("3D storage quota includes source, thumbnail, and derived preview bytes", async () => {
  const helper = await read("src/features/operations/design-file-input.ts");
  const thumbnail = await read("src/app/api/admin/design-files/[id]/thumbnail/route.ts");
  assert.match(helper, /productDesignFiles\.byteSize/);
  assert.match(helper, /productDesignFiles\.thumbnailByteSize/);
  assert.match(helper, /productDesignFiles\.derivedPreviewByteSize/);
  assert.match(thumbnail, /designStorageUsage/);
  assert.match(thumbnail, /storageBlockAt/);
});

test("design upload exposes an accessible busy state without the private button label", async () => {
  const form = await read("src/components/design-upload-form.tsx");
  const styles = await read("src/app/admin/admin-design.css");
  assert.match(form, /aria-busy=\{busy\}/);
  assert.match(form, /design-upload__spinner/);
  assert.match(form, /Mengunggah…/);
  assert.match(form, /"Upload"/);
  assert.doesNotMatch(form, /Upload privat/);
  assert.match(form, /busyRef\.current/);
  assert.match(form, /finally \{/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /design-upload__message\[data-state="error"\]/);
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
