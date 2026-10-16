#!/usr/bin/env node
/** 生成 / 刷新 `sdk/test-vectors/`（给服务端 Python 对拍 canonical 与签名用，见 PACKAGE-FORMAT.md §五）。
 *
 *    node scripts/make-test-vectors.mjs                 # 只重算 canonical / 包；签名必须还对得上，否则报错
 *    node scripts/make-test-vectors.mjs --key tmp.pem   # 用一把**临时**私钥重签，并写出配对的公钥
 *
 *  ⚠️ 私钥**永远不进仓库**。临时钥匙这样生成，用完就删：
 *    node -e "const c=require('crypto');const k=c.generateKeyPairSync('ed25519');
 *      require('fs').writeFileSync('tmp.pem',k.privateKey.export({type:'pkcs8',format:'pem'}))"
 */
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, encodePackage, packDir, sha256hex } from "./lib/package.mjs";

const TV = fileURLToPath(new URL("../sdk/test-vectors/", import.meta.url));
const args = process.argv.slice(2);
const keyArg = args.includes("--key") ? args[args.indexOf("--key") + 1] : null;

const pkg = await packDir(join(TV, "minimal"));
const canon = canonical(pkg);
const sha = sha256hex(canon);
const name = `${pkg.manifest.id}-${pkg.manifest.version}`;

await writeFile(join(TV, "canonical.bytes.json"), canon);
await writeFile(join(TV, "canonical.sha256"), sha + "\n", "utf8");
await writeFile(join(TV, `${name}.unsigned.umbraplugin`), encodePackage(pkg));

let signature;
if (keyArg) {
  const priv = createPrivateKey(await readFile(resolve(keyArg)));
  signature = edSign(null, canon, priv).toString("base64");                 // Ed25519：第一个参数必须是 null
  const pub = createPublicKey(priv).export({ type: "spki", format: "pem" });
  await writeFile(join(TV, "test-publisher.pub"), pub);
  await writeFile(join(TV, "signature.base64"), signature + "\n", "utf8");
  console.log("✓ 用临时私钥重签了；**现在删掉那把私钥**");
} else {
  if (!existsSync(join(TV, "signature.base64"))) { console.error("✗ 还没有签名：先 --key <临时私钥> 跑一次"); process.exit(1); }
  signature = (await readFile(join(TV, "signature.base64"), "utf8")).trim();
  const pub = createPublicKey(await readFile(join(TV, "test-publisher.pub")));
  if (!edVerify(null, canon, pub, Buffer.from(signature, "base64"))) {
    console.error("✗ canonical 变了，已有的签名对不上。用一把新的临时钥匙重签（--key），别试图改向量迁就旧签名");
    process.exit(1);
  }
}
await writeFile(join(TV, `${name}.signed.umbraplugin`), encodePackage({ ...pkg, signature }));
console.log(`✓ 测试向量已写到 sdk/test-vectors/：canonical ${canon.length} 字节 · sha256 ${sha}`);
