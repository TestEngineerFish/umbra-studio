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
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
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

/* ⚠️ **stdout 和 stderr 一定要合起来看**（2026-09-28 实测栽过）。
   `codesign -dv` 把 Authority / flags / Timestamp **全部打到 stderr**，stdout 是空的。
   原来这里成功路径只取 `execFileSync` 的返回值（= 只有 stdout），
   于是 `authority` 永远是空串，这台仪器**对任何包都报「未签名」** ——
   包括一个刚用 Developer ID 签好、`codesign -dv` 手跑明明白白写着
   `Authority=Developer ID Application: …` + `flags=0x10000(runtime)` 的包。
   这正是纪律④那一族：**「量到零」的两种可能里，这次是仪器是零。**
   碰巧上一批的包真没签，读数看着是对的，所以一直没人发现。 */
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` || String(r.error?.message ?? "") };
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

/* ⑤ **用户下载的是 dmg / zip，不是 .app** —— 前四条只看 `.app`，
   于是 2026-09-28 漏掉了一条真缺陷：`.app` 六项全绿，而包着它的 **dmg 根本没签名**
   （`code object is not signed at all` · `spctl -a -t open` → `rejected / no usable signature`）。
   Gatekeeper 先检查用户双击的那个文件，所以 dmg 没签 = 下载后打不开。
   ⚠️ 判据必须**看用户真正拿到手的那个文件**，不是看我们心里认为的那个主体。

   zip 不在这里查：macOS 检查的是解出来的 `.app`，zip 自己不是签名对象。
   那一条实测过（打上 quarantine 后 `accepted` + `source=Notarized Developer ID`），
   验法写在 `00` §114。 */
const outDir = join(app.includes(".app") ? join(app, "..", "..") : app, ".");
const dmgs = (() => {
  try { return readdirSync(outDir).filter((f) => f.endsWith(".dmg")).map((f) => join(outDir, f)); }
  catch { return []; }
})();
if (!dmgs.length) {
  console.log("  · 这一轮没有 dmg 产物，跳过 dmg 那一关（zip 只分发 .app，不用签 dmg）");
} else for (const d of dmgs) {
  const name = d.split("/").pop();
  /* ⚠️ **必须带 `--verbose=2`** —— 不带的话 `codesign -dv` 只打 Executable / Identifier / Format，
     **没有 `Authority=` 那一行**，于是这条判据对一个签好的 dmg 也报「没签」。
     2026-09-28 当天第三条「仪器自己是零」的缺陷（前两条见 §112.3）。
     第一次跑出来时 dmg 确实没签，所以这个 bug 藏在一个真读数后面。 */
  const signed = run("codesign", ["-dv", "--verbose=2", d]).out;
  const gate = run("spctl", ["-a", "-vv", "-t", "open", "--context", "context:primary-signature", d]).out;
  const st = run("xcrun", ["stapler", "validate", d]);
  ok(/Authority=Developer ID/.test(signed), `dmg 签了名：${name}`, /not signed/.test(signed) ? "code object is not signed at all（下载后会被拦）" : "");
  ok(/accepted/.test(gate) && /source=Notarized/.test(gate), `dmg 过 Gatekeeper：${name}`,
    (gate.split("\n").find((l) => l.includes("source=") || l.includes("rejected")) ?? "").trim().slice(0, 60));
  ok(st.ok && /worked/.test(st.out), `dmg 的公证票据已 staple：${name}`, st.ok ? "" : "没 staple：首次打开要联网问 Apple");
}

console.log(`\n${todo === 0 ? "✓" : "–"} ${done} 项具备 · ${todo} 项还没做`);
if (todo > 0) {
  console.log("  （未签名 / 未公证**不是错误**，是这一步还没做 —— M9-5 等证书）");
}
