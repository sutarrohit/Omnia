import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/src/lib/crypto.js";

describe("crypto", () => {
  it("round-trips a value through encrypt/decrypt", () => {
    const plain = "123456:ABC-DEF_telegram-bot-token";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects a tampered ciphertext", () => {
    const [iv, tag, ct] = encrypt("secret").split(":");
    const tampered = [iv, tag, Buffer.from("evil").toString("base64")].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decrypt("not-valid")).toThrow(/malformed/);
  });
});
