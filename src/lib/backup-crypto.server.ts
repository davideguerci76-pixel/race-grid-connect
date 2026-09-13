// OPS-BR-01B — PITCALL encrypted backup envelope.
//
// Primitives (runtime authorities, no custom crypto):
//   KDF    : scrypt (node:crypto, RFC 7914)  N=2^15, r=8, p=1, dkLen=32  → 32 MiB memory-hard
//   Cipher : AES-256-GCM (WebCrypto SubtleCrypto)  12-byte random nonce, 128-bit auth tag
//   Salt   : 16 random bytes (per backup)     Nonce: 12 random bytes (per backup)
//   AAD    : magic + header (so header tampering also fails authentication)
//
// Envelope layout (single binary file, extension .pitbackup):
//   [0..8)   magic "PITBKP01"
//   [8..12)  header length, uint32 big-endian
//   [12..12+len) header JSON (UTF-8) — public crypto metadata ONLY (never the password)
//   [rest)   AES-GCM ciphertext || 16-byte tag
import { randomBytes, scrypt as scryptCb } from "node:crypto";

export const ENVELOPE_MAGIC = "PITBKP01";
export const ENVELOPE_FORMAT = "PITCALL_BACKUP_ENVELOPE";
export const ENVELOPE_VERSION = 1;
export const KDF_PARAMS = { N: 32768, r: 8, p: 1, dkLen: 32 } as const;
export const SALT_BYTES = 16;
export const NONCE_BYTES = 12;
export const TAG_BITS = 128;
export const MIN_BACKUP_PASSWORD = 12;
export const MAX_BACKUP_PASSWORD = 1024;

export type EnvelopeHeader = {
  format: typeof ENVELOPE_FORMAT;
  version: number;
  kdf: "scrypt";
  kdf_params: { N: number; r: number; p: number; dkLen: number };
  salt: string; // base64
  cipher: "AES-256-GCM";
  nonce: string; // base64
  tag_bits: number;
  plaintext_content: "zip";
  created_at: string;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(u8: Uint8Array): string {
  return Buffer.from(u8).toString("base64");
}
function unb64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

function scrypt(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    scryptCb(
      password.normalize("NFKC"),
      salt,
      KDF_PARAMS.dkLen,
      { N: KDF_PARAMS.N, r: KDF_PARAMS.r, p: KDF_PARAMS.p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(new Uint8Array(key))),
    );
  });
}

/** Copies into a fresh ArrayBuffer-backed view (WebCrypto BufferSource typing). */
export function toAB(u8: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(u8.byteLength));
  out.set(u8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function buildPrefix(header: EnvelopeHeader): Uint8Array {
  const headerBytes = enc.encode(JSON.stringify(header));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, headerBytes.length, false);
  return concat(enc.encode(ENVELOPE_MAGIC), len, headerBytes);
}

export function assertBackupPasswordPolicy(password: string) {
  if (typeof password !== "string") throw new Error("BACKUP_PASSWORD_INVALID");
  if (password.length < MIN_BACKUP_PASSWORD) throw new Error("BACKUP_PASSWORD_TOO_SHORT");
  if (password.length > MAX_BACKUP_PASSWORD) throw new Error("BACKUP_PASSWORD_TOO_LONG");
}

/** Encrypts a plaintext archive. The password is used once and never stored. */
export async function encryptBackup(plaintext: Uint8Array, password: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; header: EnvelopeHeader }> {
  assertBackupPasswordPolicy(password);
  const salt = toAB(randomBytes(SALT_BYTES));
  const nonce = toAB(randomBytes(NONCE_BYTES));
  const header: EnvelopeHeader = {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    kdf: "scrypt",
    kdf_params: { ...KDF_PARAMS },
    salt: b64(salt),
    cipher: "AES-256-GCM",
    nonce: b64(nonce),
    tag_bits: TAG_BITS,
    plaintext_content: "zip",
    created_at: new Date().toISOString(),
  };
  const prefix = buildPrefix(header);
  const keyBytes = await scrypt(password, salt);
  const key = await crypto.subtle.importKey("raw", toAB(keyBytes), { name: "AES-GCM" }, false, ["encrypt"]);
  keyBytes.fill(0);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: prefix, tagLength: TAG_BITS }, key, toAB(plaintext)),
  );
  return { bytes: concat(prefix, ct), header };
}

/** Parses the public envelope header without decrypting. */
export function parseEnvelope(bytes: Uint8Array): { header: EnvelopeHeader; prefix: Uint8Array<ArrayBuffer>; ciphertext: Uint8Array<ArrayBuffer> } {
  if (bytes.length < 12 || dec.decode(bytes.subarray(0, 8)) !== ENVELOPE_MAGIC) throw new Error("NOT_A_PITCALL_BACKUP");
  const len = new DataView(bytes.buffer, bytes.byteOffset + 8, 4).getUint32(0, false);
  if (12 + len > bytes.length) throw new Error("ENVELOPE_TRUNCATED");
  const header = JSON.parse(dec.decode(bytes.subarray(12, 12 + len))) as EnvelopeHeader;
  if (header.format !== ENVELOPE_FORMAT || header.version !== ENVELOPE_VERSION) throw new Error("ENVELOPE_VERSION_UNSUPPORTED");
  if (header.kdf !== "scrypt" || header.cipher !== "AES-256-GCM") throw new Error("ENVELOPE_ALGORITHM_UNSUPPORTED");
  return { header, prefix: toAB(bytes.subarray(0, 12 + len)), ciphertext: toAB(bytes.subarray(12 + len)) };
}

/**
 * DECRYPT + VERIFY (read-only). Used only to prove a freshly generated backup is recoverable.
 * Wrong password or any modified byte → AES-GCM authentication failure → throws.
 */
export async function decryptBackup(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const { header, prefix, ciphertext } = parseEnvelope(bytes);
  const salt = toAB(unb64(header.salt));
  const nonce = toAB(unb64(header.nonce));
  const p = header.kdf_params;
  const keyBytes = await new Promise<Uint8Array>((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, p.dkLen, { N: p.N, r: p.r, p: p.p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(new Uint8Array(key)),
    ),
  );
  const key = await crypto.subtle.importKey("raw", toAB(keyBytes), { name: "AES-GCM" }, false, ["decrypt"]);
  keyBytes.fill(0);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: prefix, tagLength: header.tag_bits }, key, ciphertext),
    );
  } catch {
    throw new Error("BACKUP_AUTHENTICATION_FAILED");
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", toAB(bytes));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
