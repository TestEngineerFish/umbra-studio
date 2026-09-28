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
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

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

/* ── ④ 打包 ──
   ⚠️ `-c.dmg.sign=true`：**electron-builder 默认不签 dmg**（2026-09-28 实测）。
   内置公证只处理 `.app`，dmg 打好之后原封不动 —— 于是
   `codesign -dv <dmg>` 是 `code object is not signed at all`，
   `spctl -a -t open` 是 `rejected / no usable signature`。
   用户从网上下载的是 **dmg**，Gatekeeper 先检查它 ——
   这就是 §111.4 想避免的那个坑的另一面：**.app 公证了，包着它的 dmg 没有。**
   （zip 不需要签：macOS 检查的是解出来的 `.app`，实测带 quarantine 也 `accepted`。） */
const args = ["electron-builder", "--mac", ...arch, `-c.mac.identity=${env.MAC_IDENTITY}`, "-c.dmg.sign=true"];
console.log(`· 开始：npx ${args.join(" ")}\n`);
const r = spawnSync("npx", args, { stdio: "inherit", env, cwd: import.meta.dirname });

/* ── ⑤ dmg 自己也要公证 + staple ──
   内置公证只管 `.app`，所以这一步得我们做。**staple 是关键**：
   不 staple 的话首次打开要联网去问 Apple，断网或 Apple 抽风时用户就打不开。

   ⚠️ **即使 ④ 失败也走这一步**。2026-09-28 实测：arm64 的 app 公证成功、
   zip/dmg 都出来了，然后 x64 公证时 `HTTPClientError.connectTimeout`，
   整条命令返回非 0 —— 但 arm64 那份是好的。只报错不往下走的话，
   一次网络抖动会让**已经成了的产物白白浪费**，而人只看到一个 ⨯。 */
const outDir = join(import.meta.dirname, "out");
const dmgs = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith(".dmg")) : [];
let done = 0, failed = [];
if (!skip && canNotarize && dmgs.length) {
  console.log(`\n· dmg 公证（${dmgs.length} 份）—— 内置公证只管 .app，dmg 得单独做`);
  for (const f of dmgs) {
    const path = join(outDir, f);
    /* 已经 staple 过就跳过 —— 重跑这个脚本不该重新上传 128 MB */
    if (spawnSync("xcrun", ["stapler", "validate", path], { encoding: "utf8" }).status === 0) {
      console.log(`  · ${f} 已经 staple 过，跳过`); done++; continue;
    }
    let okOne = false;
    /* 重试两次：上一轮就是一次 connectTimeout 毁掉整条命令 */
    for (let i = 1; i <= 2 && !okOne; i++) {
      const sub = spawnSync("xcrun", ["notarytool", "submit", path, "--wait", "--timeout", "30m",
        "--apple-id", env.APPLE_ID, "--password", env.APPLE_APP_SPECIFIC_PASSWORD, "--team-id", env.APPLE_TEAM_ID],
        { encoding: "utf8" });
      const txt = `${sub.stdout ?? ""}${sub.stderr ?? ""}`;
      if (/status: Accepted/.test(txt)) okOne = true;
      else console.log(`  · ${f} 第 ${i} 次没成：${(txt.match(/status: \w+|error.*/i) ?? ["(说不出原因)"])[0]}`);
    }
    if (okOne && spawnSync("xcrun", ["stapler", "staple", path], { stdio: "ignore" }).status === 0) {
      console.log(`  ✓ ${f} 已公证并 staple`); done++;
    } else { console.log(`  ✗ ${f} 没成`); failed.push(f); }
  }
}

console.log("\n· 打完了。**现在验一次**（配置对不对，只有产物答得出）：");
console.log("  node shell/signcheck.mjs");
if (dmgs.length) console.log(`  dmg：${done}/${dmgs.length} 已公证并 staple${failed.length ? ` · 没成的：${failed.join(", ")}` : ""}`);
/* ④ 失败仍要报出去 —— ⑤ 成功不等于这一轮成功 */
if (r.status !== 0) {
  console.log(`\n⚠️ electron-builder 本身返回 ${r.status} —— 上面的输出里有 ⨯ 那一行，**别只看 dmg 的读数**。`);
  console.log("   最常见的是公证时网络超时（HTTPClientError.connectTimeout）。重跑一次即可，已经 staple 的不会重新上传。");
  process.exit(r.status ?? 1);
}
