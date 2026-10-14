#!/usr/bin/env node
import process from "node:process";
import bcrypt from "bcryptjs";
import pg from "pg";

const [command, ...args] = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const username = value("username")?.trim().toLowerCase();
const validUsername = (input) => /^[a-z0-9](?:[a-z0-9.]{1,22}[a-z0-9])?$/.test(input ?? "") && !input.includes("..");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL wajib tersedia di environment VPS.");
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  if (command === "create-admin") {
    const email = value("email")?.trim().toLowerCase();
    const name = value("name")?.trim();
    const pin = process.env.ADMIN_AUTH_PIN;
    if (!validUsername(username) || !email || !name || !/^\d{6}$/.test(pin ?? ""))
      throw new Error("Gunakan --username, --email, --name dan ADMIN_AUTH_PIN berisi 6 digit.");
    const pinHash = await bcrypt.hash(pin, 12);
    const result = await client.query(
      `insert into users (username,email,name,role,password_hash,pin_hash,pin_changed_at)
       values ($1,$2,$3,'admin',null,$4,now()) returning id`,
      [username, email, name, pinHash],
    );
    await client.query(
      `insert into audit_logs (action,entity_type,entity_id,metadata) values ('auth.cli_admin_created','user',$1,'{"source":"vps_cli"}'::jsonb)`,
      [result.rows[0].id],
    );
    console.log(`Admin ${username} berhasil dibuat.`);
  } else if (command === "reset-pin") {
    const pin = process.env.ADMIN_AUTH_PIN;
    if (!validUsername(username) || !/^\d{6}$/.test(pin ?? ""))
      throw new Error("Gunakan --username dan ADMIN_AUTH_PIN berisi 6 digit.");
    const pinHash = await bcrypt.hash(pin, 12);
    const result = await client.query(
      `update users set pin_hash=$2,temporary_pin=true,pin_changed_at=now(),locked_until=null,updated_at=now() where username=$1 returning id`,
      [username, pinHash],
    );
    if (!result.rowCount) throw new Error("Username tidak ditemukan.");
    await client.query(`update sessions set revoked_at=now() where user_id=$1 and revoked_at is null`, [
      result.rows[0].id,
    ]);
    await client.query(`update auth_tokens set used_at=now() where user_id=$1 and used_at is null`, [
      result.rows[0].id,
    ]);
    await client.query(`delete from auth_rate_limits where user_id=$1`, [result.rows[0].id]);
    await client.query(
      `insert into audit_logs (action,entity_type,entity_id,metadata) values ('auth.cli_pin_reset','user',$1,'{"source":"vps_cli"}'::jsonb)`,
      [result.rows[0].id],
    );
    console.log(`PIN ${username} direset dan seluruh sesi dicabut.`);
  } else if (command === "reset-username") {
    const next = value("new")?.trim().toLowerCase();
    if (!validUsername(username) || !validUsername(next))
      throw new Error("Gunakan --username dan --new dengan format username valid.");
    const result = await client.query(`update users set username=$2,updated_at=now() where username=$1 returning id`, [
      username,
      next,
    ]);
    if (!result.rowCount) throw new Error("Username tidak ditemukan.");
    await client.query(
      `insert into audit_logs (action,entity_type,entity_id,metadata) values ('auth.cli_username_reset','user',$1,jsonb_build_object('source','vps_cli','previous',$2))`,
      [result.rows[0].id, username],
    );
    console.log(`Username dipulihkan menjadi ${next}.`);
  } else if (command === "revoke-sessions") {
    if (!validUsername(username)) throw new Error("Gunakan --username.");
    const result = await client.query(
      `update sessions set revoked_at=now() where user_id=(select id from users where username=$1) and revoked_at is null`,
      [username],
    );
    console.log(`${result.rowCount} sesi dicabut.`);
  } else if (command === "audit") {
    if (!validUsername(username)) throw new Error("Gunakan --username.");
    const result = await client.query(
      `select action,created_at,metadata from audit_logs where entity_type='user' and entity_id=(select id from users where username=$1) order by created_at desc limit 50`,
      [username],
    );
    console.table(result.rows);
  } else {
    console.log("Perintah: create-admin, reset-pin, reset-username, revoke-sessions, audit");
    console.log("PIN hanya dibaca dari ADMIN_AUTH_PIN dan tidak pernah dicetak.");
  }
} finally {
  await client.end();
}
