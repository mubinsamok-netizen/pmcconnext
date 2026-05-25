import { createHash, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function deterministicSalt(identity: string) {
  return createHash("sha256")
    .update(`pcm-connext:${identity || "team-member"}`)
    .digest("hex")
    .slice(0, 32);
}

export function hashPassword(password: string, identity: string) {
  if (!password) return "";
  const salt = deterministicSalt(identity);
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${hash}`;
}

export function verifyPasswordHash(password: string, encoded: string) {
  if (!password || !encoded) return false;
  const parts = encoded.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
