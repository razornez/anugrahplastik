/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("admin uses one shared stylesheet as the final UI authority", () => {
  const layout = read("src/app/admin/layout.tsx");
  const designCss = read("src/app/admin/admin-design.css");
  assert.match(layout, /import "\.\/admin-home\.css";[\s\S]*import "\.\/admin-design\.css";/);
  assert.doesNotMatch(layout, /admin-native\.css/);
  assert.match(designCss, /Final responsive authority/);
  assert.match(designCss, /min-height:\s*44px/);
  assert.match(designCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.ok(
    designCss.lastIndexOf("Final responsive authority") > designCss.lastIndexOf("Final master workspace overrides"),
    "responsive authority must remain after legacy route rules",
  );
});

test("shared section headers keep actions out of the title row", () => {
  const component = read("src/components/admin-ui.tsx");
  const dashboard = read("src/app/admin/page.tsx");
  const designCss = read("src/app/admin/admin-design.css");

  assert.match(component, /export function AdminSectionHeader/);
  assert.match(component, /admin-section-header__meta/);
  assert.match(dashboard, /title="Permintaan pelanggan terbaru"/);
  assert.match(dashboard, /eyebrow=\{`LAPORAN \$\{label\.toUpperCase\(\)\}`\}/);
  assert.match(designCss, /\.admin-section-header__meta[\s\S]*justify-content:\s*space-between/);
});

test("ranking evidence uses responsive rows instead of squeezed columns", () => {
  const ranking = read("src/components/seo-ranking-card.tsx");
  const competitors = read("src/app/admin/growth/competitors/page.tsx");
  const designCss = read("src/app/admin/admin-design.css");

  for (const source of [ranking, competitors]) {
    assert.match(source, /seo-ranking-list__item/);
    assert.match(source, /seo-ranking-list__link/);
    assert.match(source, /seo-ranking-list__points/);
    assert.match(source, /seo-score-row__keyword/);
    assert.match(source, /seo-score-row__meta/);
    assert.match(source, /seo-score-row__evidence/);
  }
  assert.match(ranking, /growth-competitors__category-row[\s\S]*Cara nilai ini dihitung/);
  assert.match(designCss, /\.seo-score-row__keyword\s*\{[\s\S]*grid-column:\s*1 \/ -1/);
  assert.match(designCss, /\.seo-ranking-list__identity > \.seo-ranking-list__link[\s\S]*display:\s*grid/);
});

test("transaction detail exposes compact step labels and one workspace surface", () => {
  const transaction = read("src/app/admin/transactions/[id]/page.tsx");
  const designCss = read("src/app/admin/admin-design.css");

  assert.match(transaction, /short:\s*"Surat jalan"/);
  assert.match(transaction, /short:\s*"STB"/);
  assert.match(transaction, /data-ui-surface="workspace"/);
  assert.match(transaction, /Isi barang, jasa, dan harga\./);
  assert.match(designCss, /\.transaction-flow-focus[\s\S]*\.transaction-flow-card[\s\S]*border-radius:\s*0/);
  assert.match(designCss, /--transaction-mobile-content-padding:\s*10px/);
  assert.match(designCss, /--transaction-mobile-section-inset:\s*8px/);
  assert.match(
    designCss,
    /\.transaction-flow-page \.transaction-flow-focus \.transaction-flow-card\s*\{[\s\S]*?padding:\s*var\(--transaction-mobile-content-padding\)/,
  );
  assert.match(
    designCss,
    /\.transaction-flow-page \.transaction-flow-aside\s*\{[\s\S]*?padding:\s*18px var\(--transaction-mobile-content-padding\) 0/,
  );
  assert.doesNotMatch(designCss, /\.admin-shell \.transaction-flow-card\s*\{/);
});

test("admin typography keeps mobile copy compact and controls iOS-safe", () => {
  const globalCss = read("src/app/globals.css");
  const designCss = read("src/app/admin/admin-design.css");
  const quoteEditor = read("src/components/transaction-quote-editor.tsx");

  assert.doesNotMatch(globalCss, /admin-shell :is\(p, small, label, input, textarea, select, button\)/);
  assert.match(designCss, /--admin-text-page-title:\s*22px/);
  assert.match(designCss, /--admin-text-body:\s*14px/);
  assert.match(designCss, /--admin-text-label:\s*13px/);
  assert.match(designCss, /--admin-text-control:\s*13px/);
  assert.match(designCss, /--admin-mobile-page-gutter:\s*8px/);
  assert.match(designCss, /-webkit-touch-callout:[\s\S]*:focus[\s\S]*font-size:\s*16px/);
  assert.match(
    designCss,
    /\.transaction-flow-page \.transaction-quote-editor__line\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(quoteEditor, />\s*Material\s*</);
  assert.match(quoteEditor, />\s*PIC pelanggan\s*</);
});

test("landing collections use compact editors and a lazy media dialog", () => {
  const editor = read("src/components/landing-content-editor.tsx");
  assert.match(editor, /function LandingEditorItem/);
  assert.match(editor, /<LandingEditorItem[\s\S]*title=\{item\.title/);
  assert.match(editor, /<Dialog\.Content className="landing-media-dialog">/);
  assert.match(editor, /useFormStatus/);
  assert.match(editor, /aria-busy=\{pending\}/);
  assert.doesNotMatch(editor, /useEffect\(\(\) => \{[\s\S]{0,240}fetch\("\/api\/admin\/landing-media"/);
});

test("material reorder only updates the material collection", () => {
  const editor = read("src/components/landing-content-editor.tsx");
  const materialBlock = editor.slice(
    editor.lastIndexOf('if (activeSectionId === "material")'),
    editor.lastIndexOf('if (activeSectionId === "portfolio")'),
  );
  assert.match(materialBlock, /moveItem\(content\.material\.items, index, -1\)/);
  assert.match(materialBlock, /moveItem\(content\.material\.items, index, 1\)/);
  assert.doesNotMatch(materialBlock, /moveItem\(content\.portfolio\.items/);
});

test("media library API exposes search and cursor pagination", () => {
  const route = read("src/app/api/admin/landing-media/route.ts");
  const service = read("src/features/content/landing-media.ts");
  assert.match(route, /url\.searchParams\.get\("q"\)/);
  assert.match(route, /url\.searchParams\.get\("cursor"\)/);
  assert.match(service, /nextCursor/);
  assert.match(service, /Math\.min\(48/);
});

test("large 3D uploads expose real progress and prevent duplicate submits", () => {
  const upload = read("src/components/design-upload-form.tsx");
  assert.match(upload, /new XMLHttpRequest\(\)/);
  assert.match(upload, /request\.upload\.addEventListener\("progress"/);
  assert.match(upload, /busyRef\.current/);
  assert.match(upload, /<progress[\s\S]*max="100"/);
});

test("login and active sessions land on the back office home", () => {
  const actions = read("src/features/auth/actions.ts");
  const loginPage = read("src/app/admin/login/page.tsx");
  const authSetup = read("tests/ui/auth.setup.ts");

  assert.match(actions, /createSession[\s\S]*redirect\("\/admin"\)/);
  assert.match(loginPage, /if \(session\) redirect\("\/admin"\)/);
  assert.match(authSetup, /toHaveURL\(\/\\\/admin\(\?:\\\?\.\*\)\?\$\//);
  assert.doesNotMatch(actions, /createSession[\s\S]{0,180}redirect\("\/admin\/content"\)/);
});

test("transaction email uses an adaptive in-context composer", () => {
  const detail = read("src/app/admin/transactions/[id]/page.tsx");
  const composer = read("src/components/transaction-email-composer.tsx");
  const designCss = read("src/app/admin/admin-design.css");
  assert.match(detail, /<TransactionEmailComposer/);
  assert.match(composer, /createTransactionEmailDraft/);
  assert.match(composer, /Periksa sebelum kirim/);
  assert.match(composer, /Lihat di Email CS/);
  assert.match(composer, /requiresPicConfirmation/);
  assert.match(composer, /transaction-email-template-catalog/);
  assert.match(composer, /Kirim ulang/);
  assert.match(composer, /Izinkan pengiriman bila scanner lampiran sedang tidak tersedia/);
  assert.doesNotMatch(composer, /window\.confirm|window\.alert/);
  assert.match(designCss, /\.transaction-email-sheet/);
  assert.match(designCss, /@media \(max-width: 720px\)[\s\S]*\.transaction-email-sheet[\s\S]*width:\s*100vw/);
});

test("production routes reuse one bounded database pool", () => {
  const source = read("src/lib/database/client.ts");

  assert.match(source, /globalForDatabase\.pool \?\?/);
  assert.match(source, /globalForDatabase\.pool = pool/);
  assert.match(source, /max: resolvePoolLimit\(\)/);
  assert.doesNotMatch(source, /NODE_ENV !== ["']production["']/);
});

test("VPS release smoke blocks landing runtime errors before cutover", () => {
  const smoke = read("scripts/release/smoke-release.sh");
  const packager = read("scripts/release/package-linux.sh");
  const runbook = read("docs/VPS-DEPLOYMENT.md");
  assert.match(smoke, /Runtime Error\|Failed query\|DrizzleQueryError/);
  assert.match(smoke, /\/api\/health/);
  assert.match(smoke, /\/admin\/login/);
  assert.match(packager, /smoke-release\.sh/);
  assert.match(runbook, /Jangan mengubah symlink bila satu pemeriksaan gagal/);
});
