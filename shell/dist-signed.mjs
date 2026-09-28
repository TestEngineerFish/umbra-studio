#!/usr/bin/env node
/** 签名 + 公证打包入口（M9-5）。
 *
 *  **为什么不直接 `electron-builder --mac`：** 这一步最容易「以为做了」——
 *  找不到证书时 electron-builder **只打印一行 skipped 就继续打包**，
 *  公证变量名写错时**连一行都不打**，产物看着一样、能装能跑，
 *  直到用户下载后看到「已损坏」。所以先把前提查清、缺什么就**明说并停下**。
 *
 *  它还顺手做两件适配：
 *  - `APPLEID` / `APPLEIDPASS`（用户其它项目在用的名字）→ 映射成 electron-builder ≥24
 *    内置公证认的 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`。**差一个下划线就静默跳过公证。**
 *  - `MAC_IDENTITY` 没设时，用 `APPLE_TEAM_ID` 去钥匙串里把证书名找出来 ——
 *    identity 要的是「公司名 (TEAMID)」，而人手里通常只有 TeamID。
 *
 *  用法：node shell/dist-signed.mjs [--arm64|--x64|--universal]
 *  跳过公证（只签名，快）：SKIP_NOTARIZE=1 node shell/dist-signed.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";

const arch = process.argv.slice(2).filter((a) => a.startsWith("--")).length
  ? process.argv.slice(2).filter((a) => a.startsWith("--"))
  : ["--arm64", "--x64"];

const env = { ...process.env };
const has = (k) => typeof env[k] === "string" && env[k].trim().length > 0;

/* ── ① 公证凭据：把旧名字映射成内置公证认的名字 ── */
if (!has("APPLE_ID") && has("APPLEID")) env.APPLE_ID = env.APPLEID;
if (!has("APPLE_APP_SPECIFIC_PASSWORD") && has("APPLEIDPASS")) env.APPLE_APP_SPECIFIC_PASSWORD = env.APPLEIDPASS;

/* ── ② 证书：MAC_IDENTITY 没给就按 TeamID 在钥匙串里找 ── */
if (!has("MAC_IDENTITY")) {
  if (!has("APPLE_TEAM_ID")) {
    console.error("✗ 既没有 MAC_IDENTITY，也没有 APPLE_TEAM_ID —— 无法确定用哪张证书签名。");
    console.error("   设一个就行：MAC_IDENTITY=\"你的公司名 (TEAMID)\"  或  APPLE_TEAM_ID=XXXXXXXXXX");
    process.exit(2);
  }
  let out = "";
  try { out = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" }); }
  catch { /* 没有钥匙串访问权限 */ }
  /* 只认 Developer ID Application（官网分发用的那一类，见 mimikko 文档第二节的对照表） */
  const line = out.split("\n").find((l) => l.includes("Developer ID Application") && l.includes(env.APPLE_TEAM_ID));
  const name = /"([^"]+)"/.exec(line ?? "")?.[1];
  if (!name) {
    console.error(`✗ 钥匙串里找不到 Team ${env.APPLE_TEAM_ID} 的「Developer ID Application」证书。`);
    console.error("   核对：security find-identity -v -p codesigning");
    console.error("   只有 .cer 没有私钥的证书不会出现在那个列表里 —— 换机器要导入 .p12。");
    process.exit(2);
  }
  /* identity 用**不带前缀**的部分即可（electron-builder 做的是包含匹配） */
  env.MAC_IDENTITY = name.replace(/^Developer ID Application:\s*/, "");
  console.log(`· 证书：${name}`);
}

/* ── ③ 公证前提：缺了就明说，而不是打出一个没公证的包 ── */
const canNotarize = has("APPLE_ID") && has("APPLE_APP_SPECIFIC_PASSWORD") && has("APPLE_TEAM_ID");
const skip = has("SKIP_NOTARIZE");
if (skip) {
  console.log("· 按 SKIP_NOTARIZE 跳过公证（只签名）—— 这种包给别人下载会报「已损坏」，只适合自己测");
  delete env.APPLE_ID; delete env.APPLE_APP_SPECIFIC_PASSWORD;   // 不留着，免得 builder 又去公证
} else if (!canNotarize) {
  console.error("✗ 公证凭据不全，停下（不打一个「签了名但没公证」的包 —— 那种包下载后照样报「已损坏」）。");
  console.error(`   APPLE_ID=${has("APPLE_ID") ? "有" : "缺"} · APPLE_APP_SPECIFIC_PASSWORD=${has("APPLE_APP_SPECIFIC_PASSWORD") ? "有" : "缺"} · APPLE_TEAM_ID=${has("APPLE_TEAM_ID") ? "有" : "缺"}`);
  console.error("   只想签名不公证：SKIP_NOTARIZE=1 node shell/dist-signed.mjs");
  process.exit(2);
} else {
  console.log(`· 公证：${env.APPLE_ID.replace(/(.{2}).*(@.*)/, "$1***$2")} · Team ${env.APPLE_TEAM_ID}（公证要几分钟，别中断）`);
}

/* ── ④ 打包 ── */
const args = ["electron-builder", "--mac", ...arch, `-c.mac.identity=${env.MAC_IDENTITY}`];
console.log(`· 开始：npx ${args.join(" ")}\n`);
const r = spawnSync("npx", args, { stdio: "inherit", env, cwd: import.meta.dirname });
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("\n· 打完了。**现在验一次**（配置对不对，只有产物答得出）：");
console.log("  node shell/signcheck.mjs");
