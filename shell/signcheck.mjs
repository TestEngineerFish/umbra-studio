#!/usr/bin/env node
/** 签名与公证的**读数**（M9-5）。
 *
 *  为什么要有它：签名和公证这类事最容易「以为配好了」——
 *  `electron-builder` 找不到证书时**只打印一行 skipped 就继续打包**，
 *  产物看着一样、能装能跑，直到用户下载后看到「已损坏」。
 *  所以配置之后必须有一步「真去问那个 .app」。
 *
 *  用法：node shell/signcheck.mjs [产物路径]
 *  默认查 `shell/out/mac-arm64/Umbra Studio.app`。
 *
 *  四条判据来自 mimikko-desktop/docs/MAC_SIGNING_NOTARIZE.md 第五节第 6 步：
 *  codesign -dv（有没有 Developer ID + runtime + 时间戳）· codesign --verify（签名自洽）·
 *  spctl（Gatekeeper 放不放）· stapler（公证票据钉上了没）。
 *
 *  ⚠️ **未签名不算失败**，只算「这一步还没做」—— 现在默认 `identity: null`，
 *  本机没有证书。混为一谈的话这个脚本会一直红，红久了就没人看了。
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const app = process.argv[2] ?? join(import.meta.dirname ?? ".", "out", "mac-arm64", "Umbra Studio.app");
if (!existsSync(app)) {
  console.log(`✗ 找不到产物：${app}\n   先跑一次 npm --prefix shell run dist（或 dist:signed）`);
  process.exit(2);
}
if (process.platform !== "darwin") {
  console.log("– 不在 macOS 上，签名/公证查不了（这几条命令是 mac 专有的）");
  process.exit(0);
}

const run = (cmd, args) => {
  try { return { ok: true, out: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` || String(e.message) }; }
};

console.log(`签名与公证 · ${app}\n`);
let done = 0, todo = 0;
const ok = (c, what, detail = "") => { if (c) { done++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); } else { todo++; console.log(`  – ${what}${detail ? " — " + detail : ""}`); } };

/* ① 签名信息：Authority / flags / Timestamp */
const dv = run("codesign", ["-dv", "--verbose=4", app]);
const info = dv.out;
const authority = /Authority=(.+)/.exec(info)?.[1]?.trim() ?? "";
const adhoc = /Signature=adhoc/.test(info);
const runtimeFlag = /flags=.*runtime/.test(info);
const hasTs = /Timestamp=/.test(info);

if (adhoc || !authority) {
  console.log("  – 这个包**没有用 Developer ID 签名**（ad-hoc 或未签名）");
  console.log("     要签：把 Developer ID 证书导进钥匙串，然后");
  console.log('     MAC_IDENTITY="你的公司名 (TEAMID)" npm --prefix shell run dist:signed');
  console.log("     公证再设 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID（electron-builder ≥24 内置公证）");
} else {
  ok(/Developer ID Application/.test(authority), "用 Developer ID Application 证书签的", authority.slice(0, 60));
}
ok(runtimeFlag, "开了 hardened runtime（公证的硬性要求）", runtimeFlag ? "" : "mac.hardenedRuntime 没生效");
ok(hasTs, "带安全时间戳（公证要求）");

/* ② 签名自洽 —— ⚠️ 这一条 2026-09-27 真栽过：签名不自洽的包下载后报「已损坏」（`00` §63.3 一族） */
const verify = run("codesign", ["--verify", "--deep", "--strict", "-vv", app]);
ok(verify.ok, "签名自洽（--deep --strict）", verify.ok ? "" : verify.out.split("\n")[0]?.slice(0, 80));

/* ③ Gatekeeper 怎么看它 */
const spctl = run("spctl", ["-a", "-vv", "-t", "exec", app]);
const notarized = /source=Notarized Developer ID/.test(spctl.out);
ok(notarized, "Gatekeeper：已公证的 Developer ID", (spctl.out.split("\n").find((l) => l.includes("source=")) ?? spctl.out.split("\n")[1] ?? "").trim().slice(0, 70));

/* ④ 公证票据钉上了没 —— 钉了才能离线验证；没钉的话用户断网打开还是会被拦 */
const staple = run("xcrun", ["stapler", "validate", app]);
ok(staple.ok && /worked/.test(staple.out), "公证票据已 staple（断网也验得过）", staple.ok ? "" : (staple.out.split("\n").find((l) => l.trim()) ?? "").slice(0, 70));

console.log(`\n${todo === 0 ? "✓" : "–"} ${done} 项具备 · ${todo} 项还没做`);
if (todo > 0) {
  console.log("  （未签名 / 未公证**不是错误**，是这一步还没做 —— M9-5 等证书）");
}
