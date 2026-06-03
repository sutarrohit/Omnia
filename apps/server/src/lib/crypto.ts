import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import env from "../env.js";

// 32-byte key (validated in env.ts to decode to exactly 32 bytes).
const KEY = Buffer.from(env.APP_ENCRYPTION_KEY, "base64");
const ALGO = "aes-256-gcm";

/**
 * Encrypt a UTF-8 string with AES-256-GCM. Returns `iv:tag:ciphertext`, each
 * part base64-encoded. The random IV makes every ciphertext unique.
 */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/** Reverse of {@link encrypt}. Throws if the payload is malformed or tampered. */
export function decrypt(packed: string): string {
  const [ivB64, tagB64, ctB64] = packed.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed ciphertext");

  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}
