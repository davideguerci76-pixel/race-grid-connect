/**
 * Minimal Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) sender built on Web
 * Crypto only, so it runs inside the Cloudflare Worker runtime. No Node-only
 * dependency, no external push provider.
 */

const encoder = new TextEncoder();

function b64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}

/** HKDF with a single-block expand (all Web Push outputs are <= 32 bytes). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

/** Builds the ES256 VAPID Authorization header for one push endpoint. */
async function vapidHeader(audience: string, subject: string, publicKey: string, privateKey: string): Promise<string> {
  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    encoder.encode(
      JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject }),
    ),
  );
  const unsigned = `${header}.${claims}`;

  const pub = b64urlToBytes(publicKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privateKey,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${publicKey}`;
}

/** Encrypts the payload for one subscription using aes128gcm. */
async function encryptPayload(payload: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const clientPublic = b64urlToBytes(p256dh);
  const auth = b64urlToBytes(authSecret);

  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
  const clientKey = await crypto.subtle.importKey("raw", clientPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeys.privateKey, 256),
  );

  const keyInfo = concat(encoder.encode("WebPush: info\0"), clientPublic, serverPublic);
  const ikm = await hkdf(auth, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plaintext as BufferSource),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number; error: string };

/** Sends one push message. Returns `gone: true` when the endpoint is dead (404/410). */
export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: unknown,
  vapid: { publicKey: string; privateKey: string; subject: string },
  ttlSeconds = 12 * 60 * 60,
): Promise<PushResult> {
  try {
    const audience = new URL(subscription.endpoint).origin;
    const [authorization, body] = await Promise.all([
      vapidHeader(audience, vapid.subject, vapid.publicKey, vapid.privateKey),
      encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth),
    ]);

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: "high",
      },
      body: body as BodyInit,
    });

    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status, error: text.slice(0, 300) };
  } catch (e) {
    return { ok: false, gone: false, status: 0, error: e instanceof Error ? e.message : "push failed" };
  }
}
