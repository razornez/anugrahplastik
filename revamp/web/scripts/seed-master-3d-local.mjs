import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL lokal belum tersedia.");
const host = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("Seed desain 3D hanya boleh dijalankan pada database lokal.");
}

const storageRoot = process.env.PRIVATE_STORAGE_PATH
  ? path.resolve(process.env.PRIVATE_STORAGE_PATH)
  : path.join(process.cwd(), "storage", "private");
const models = [
  {
    name: "spacer-conduit-20mm.stl",
    description: "Spacer conduit diameter 20 mm untuk pemeriksaan bentuk dan dudukan mould.",
    body: "solid spacer\nfacet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 30 0 0\n  vertex 15 26 0\n endloop\nendfacet\nendsolid spacer\n",
  },
  {
    name: "mould-conduit-preview.obj",
    description: "Pratinjau mould conduit untuk memeriksa bentuk cavity dan arah produksi.",
    body: "o mould_preview\nv -18 -12 0\nv 18 -12 0\nv 18 12 0\nv -18 12 0\nv 0 0 30\nf 1 2 5\nf 2 3 5\nf 3 4 5\nf 4 1 5\nf 1 4 3\nf 1 3 2\n",
  },
];

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  let insertedCount = 0;
  let refreshedCount = 0;
  const product = await client.query("select id from products where status = 'active' order by created_at asc limit 1");
  const mould = await client.query("select id from moulds where status = 'active' order by created_at asc limit 1");
  const material = await client.query(
    "select id from materials where status = 'active' order by created_at asc limit 1",
  );
  if (!product.rows[0] && !mould.rows[0]) {
    throw new Error("Tambahkan minimal satu barang atau mould aktif sebelum menjalankan seed 3D lokal.");
  }
  for (const [index, model] of models.entries()) {
    const duplicate = await client.query("select id from product_design_files where original_name = $1 limit 1", [
      model.name,
    ]);
    if (duplicate.rows.length) {
      await client.query(
        "update product_design_files set material_id = coalesce(material_id, $1), description = coalesce(description, $2) where id = $3",
        [material.rows[0]?.id ?? null, model.description, duplicate.rows[0].id],
      );
      refreshedCount += 1;
      continue;
    }
    const format = model.name.split(".").pop();
    const relative = path.join("designs", "local-fixtures", `${randomUUID()}.${format}`);
    const absolute = path.join(storageRoot, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, model.body, { encoding: "utf8", mode: 0o600 });
    const bytes = Buffer.byteLength(model.body);
    const checksum = createHash("sha256").update(model.body).digest("hex");
    const inserted = await client.query(
      `insert into product_design_files
        (product_id, mould_id, material_id, description, origin, file_kind, format, storage_path, original_name, mime_type, byte_size, checksum, version)
       values ($1, $2, $3, $4, 'internal', 'preview', $5, $6, $7, $8, $9, $10, 1) returning id`,
      [
        product.rows[0]?.id ?? null,
        index === 1 ? (mould.rows[0]?.id ?? null) : null,
        material.rows[0]?.id ?? null,
        model.description,
        format,
        relative,
        model.name,
        format === "stl" ? "model/stl" : "text/plain",
        bytes,
        checksum,
      ],
    );
    await client.query(
      "insert into audit_logs (action, entity_type, entity_id, metadata) values ('local_3d_fixture.seeded', 'design_file', $1, $2::jsonb)",
      [inserted.rows[0].id, JSON.stringify({ fixture: "master-3d-v1", storagePath: relative })],
    );
    insertedCount += 1;
  }
  process.stdout.write(
    insertedCount
      ? `Fixture 3D lokal selesai dibuat (${insertedCount} baru, ${refreshedCount} diperbarui).\n`
      : `Fixture 3D lokal sudah tersedia; ${refreshedCount} metadata diperiksa.\n`,
  );
} finally {
  await client.end();
}
