import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

test("bundled Indonesian region snapshot is complete and has valid hierarchy", () => {
  const file = new URL("../scripts/data/indonesia-regions-493bd1.json.gz", import.meta.url);
  const snapshot = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
  assert.equal(snapshot.sourceCommit, "493bd1c390ca6dc8156cd3fd579394b375ab2398");
  assert.ok(snapshot.rows.length > 90_000);

  const codes = new Set(snapshot.rows.map(([code]) => code));
  assert.equal(codes.size, snapshot.rows.length);
  for (const [code, name] of snapshot.rows) {
    assert.ok(name.length > 0);
    const parts = code.split(".");
    assert.ok(parts.length >= 1 && parts.length <= 4);
    if (parts.length > 1) assert.ok(codes.has(parts.slice(0, -1).join(".")), `Missing parent for ${code}`);
  }
  assert.equal(snapshot.rows.filter(([code]) => !code.includes(".")).length, 38);
  assert.ok(snapshot.rows.some(([code]) => code.startsWith("32.73.")));
});

test("release package includes the offline region importer and snapshot", () => {
  const file = new URL("../scripts/release/package-linux.sh", import.meta.url);
  const source = readFileSync(file, "utf8");
  assert.match(source, /scripts\/import-indonesia-regions\.mjs/);
  assert.match(source, /scripts\/data\/indonesia-regions-493bd1\.json\.gz/);
});
