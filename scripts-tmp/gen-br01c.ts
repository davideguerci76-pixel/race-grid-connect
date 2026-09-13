import { writeFileSync } from "node:fs";
import { buildLiveBackup } from "@/lib/backup-all.server";
import { encryptBackup, decryptBackup } from "@/lib/backup-crypto.server";
const pw = "Br01c-Test-Passphrase-2026!";
const t0 = Date.now();
const b = await buildLiveBackup("874c8b72-1203-45e8-aa39-ebbc35a0136c", pw);
const e1 = await encryptBackup(b.zip, pw);
const e2 = await encryptBackup(b.zip, pw);
writeFileSync("/root/br01c/test.pitbackup", e1.bytes);
writeFileSync("/root/br01c/test2.pitbackup", e2.bytes);
// tampered variants
const ct = new Uint8Array(e1.bytes); ct[ct.length - 40] ^= 0x01; writeFileSync("/root/br01c/tamper-ct.pitbackup", ct);
const hd = new Uint8Array(e1.bytes); const i = Buffer.from(hd).indexOf("created_at"); hd[i] ^= 0x01; writeFileSync("/root/br01c/tamper-header.pitbackup", hd);
writeFileSync("/root/br01c/random.pitbackup", crypto.getRandomValues(new Uint8Array(4096)));
writeFileSync("/root/br01c/original.zip", b.zip);
const back = await decryptBackup(e1.bytes, pw);
console.log(JSON.stringify({ ms: Date.now() - t0, zip: b.zip.length, enc: e1.bytes.length, datasets: (b.manifest as any).datasets.length, files_total: (b.manifest as any).files_total, roundtrip: Buffer.compare(Buffer.from(back), Buffer.from(b.zip)) === 0, ct_identical: Buffer.compare(Buffer.from(e1.bytes), Buffer.from(e2.bytes)) === 0 }));
