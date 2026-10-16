#!/usr/bin/env node
/** 核对 `sdk/test-vectors/` 自洽：从 `minimal/` 重算出来的每一样都要和仓库里存的一字不差。
 *  CI 每次跑 —— 它钉的是 `scripts/lib/package.mjs` 和 PACKAGE-FORMAT.md 没有悄悄分叉。 */
import { createPublicKey, verify as edVerify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, decodePackage, packDir, sha256hex } from "./lib/package.mjs";

const TV = fileURLToPath(new URL("../sdk/test-vectors/", import.meta.url));
let n = 0, bad = 0;
const ok = (cond, what, detail = "") => { n++; if (cond) console.log(`✓ ${what}${detail ? " — " + detail : ""}`); else { bad++; console.log(`✗ ${what}${detail ? " — " + detail : ""}`); } };

const pkg = await packDir(join(TV, "minimal"));
const canon = canonical(pkg);
const name = `${pkg.manifest.id}-${pkg.manifest.version}`;

const storedCanon = await readFile(join(TV, "canonical.bytes.json"));
ok(storedCanon.equals(canon), "canonical 字节和存的一致", `${canon.length} 字节`);
const storedSha = (await readFile(join(TV, "canonical.sha256"), "utf8")).trim();
ok(storedSha === sha256hex(canon), "canonical.sha256 一致", storedSha.slice(0, 16) + "…");
ok(sha256hex(storedCanon) === storedSha, "sha256 文件是对 canonical.bytes.json 算的");

const unsigned = decodePackage(await readFile(join(TV, `${name}.unsigned.umbraplugin`)));
ok(canonical(unsigned).equals(canon) && !unsigned.signature, "未签名包解出来 canonical 一致、没有 signature");
/* 容器里的 manifest 副本要等于 files 里那份归一后的结果（priority 补 50） */
const inner = JSON.parse(Buffer.from(unsigned.files["manifest.json"], "base64").toString("utf8"));
ok(inner.kinds[0].priority === undefined && unsigned.manifest.kinds[0].priority === 50, "副本里的 kinds[0].priority 补成了 50，files 里那份原样");

const sig = (await readFile(join(TV, "signature.base64"), "utf8")).trim();
const pub = createPublicKey(await readFile(join(TV, "test-publisher.pub")));
ok(edVerify(null, canon, pub, Buffer.from(sig, "base64")), "signature.base64 用 test-publisher.pub 验得过");
const signed = decodePackage(await readFile(join(TV, `${name}.signed.umbraplugin`)));
ok(signed.signature === sig && canonical(signed).equals(canon), "已签名包里的 signature 和 canonical 都一致");
/* 改一个字节就得验不过 —— 不验这一条的话「签名」可能只是把一串 base64 存了又读回来 */
const tampered = Buffer.from(canon); tampered[tampered.length - 2] ^= 1;
ok(!edVerify(null, tampered, pub, Buffer.from(sig, "base64")), "改 canonical 一个字节签名就验不过");

console.log(bad ? `\n✗ 测试向量 ${n - bad}/${n}` : `\n✓ 测试向量 ${n}/${n}`);
process.exit(bad ? 1 : 0);
