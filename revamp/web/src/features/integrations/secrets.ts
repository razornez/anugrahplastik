import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const value = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!value || !/^[\da-f]{64}$/i.test(value)) {
    throw new Error("Kunci keamanan integrasi belum disiapkan oleh administrator server.");
  }
  return Buffer.from(value, "hex");
}

export function hasIntegrationEncryptionKey() {
  return /^[\da-f]{64}$/i.test(process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim() ?? "");
}

export function encryptSecret(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret<T>(value: string): T {
  const [iv, tag, body] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !body) throw new Error("Data koneksi tersimpan tidak valid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")) as T;
}
