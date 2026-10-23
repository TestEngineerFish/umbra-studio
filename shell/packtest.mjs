/** 打包产物验收（M9-4）。
 *
 *  跟 shelltest.mjs 分开，因为问的是**不一样的问题**：shelltest 问「壳的逻辑对不对」（跑源码），
 *  packtest 问「打出来的这个东西换台机器还能不能用」—— 后者只能在产物上问。
 *  开发模式下 TOOL_ROOT 和 STATE_ROOT 恰好重合，这一类缺陷永远测不出来，M9-4 一次逼出三条。
 *
 *  用法：
 *    node shell/packtest.mjs                                  验 mac arm64（默认）
 *    node shell/packtest.mjs "shell/out/mac/Umbra Studio.app"  验 mac x64（本机靠 Rosetta，读数偏慢）
 *    node shell/packtest.mjs shell/out/win-unpacked            验 win：只查结构，跑不了
 *  测试项目用 PROJ 指定，默认 projects/Umbra_design_next。
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync, rmSync, cpSync, mkdtempSync, realpathSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const TARGET = resolve(process.argv[2] ?? join(HERE, "out", "mac-arm64", "Umbra Studio.app"));
const PROJ = resolve(process.env.PROJ ?? join(REPO, "projects", "Umbra_design_next"));
const IS_MAC = TARGET.endsWith(".app");

let pass = 0, fail = 0;
const location_hint = (b) => (b.inUrl ? "地址里有 token=，不该有" : "地址里没有 token=");
const ok = (cond, name, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`); } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); } };
const note = (s) => console.log(`  · ${s}`);
/** 收尾并退出。`why` 非空 = **这一轮没跑完**。
 *
 *  ⚠️⚠️ **带 `why` 一律算没通过**（2026-10-24 修）。原来它是
 *  `fail === 0 ? "✓" : "✗"` + `exit(fail === 0 ? 0 : 1)` —— 于是「跑到一半就停」
 *  和「全跑完且全绿」**在汇总行和退出码上完全一样**。实测当天就吃到：
 *  接不上渲染进程、后面二十条一条没跑，而它打的是 `✓ 打包产物 24/24`、退出码 0。
 *  > **一个带「为什么停下」参数的收尾函数，自己就知道这一轮没跑完 —— 而它还是打了对勾。**
 *  （`selftest` 的汇总行 7c-2b 栽过同一个形状：那一类为空时「零 error」仍然成立。） */
/** 起过的实例，**全记在这儿** —— `bye` 和下面那条兜底要靠它收尾。 */
const spawned = [];
/** 这一轮用的沙箱目录（`mkdtempSync` 之后填上）—— 兜底清理要删它。 */
let sandboxForCleanup = null;

/* ⚠️⚠️ **崩溃不走 `bye`**（2026-10-24 实测踩到，而这是 `uitest` 早就有、这边缺的那一半）。
   我给 `bye` 加了「中止路也清进程」之后，以为清理齐了 —— 然后一轮**未捕获异常**
   （`ReferenceError: shut is not defined`）直接崩掉，`bye` 压根没跑。
   代价量出来了：**4 个实例在后台跑着 + 9 个沙箱目录 2.4 GB**（打包产物 331 MB × 若干轮）。
   > **「清理必须跑，判据可以不跑」这条纪律，`bye` 只覆盖了「我决定停下」那一半；
   > 「我崩了」那一半要另外兜。** 而两者在日志里长得一样：都只是输出变短了。
   ⚠️ 这里**只清不判**（判据的结论这一轮本来就不可信了），而且同步 kill + 同步删目录 ——
   handler 里 await 不可靠。
   ⚠️ 自己再抛就直接退，不然两个 handler 互相触发、进程挂住（`uitest` 那边同一条）。 */
let emergency = false;
process.on("uncaughtException", (e) => {
  if (emergency) { process.exit(1); return; }
  emergency = true;
  console.log("\n⚠️ 有东西抛出来了 —— 下面是紧急清理（这一轮的判据结论不可信）");
  console.log("   " + String(e?.stack ?? e).split("\n").slice(0, 3).join(" ⎹ ").slice(0, 300));
  let killed = 0;
  for (const pr of spawned) { try { pr.kill("SIGKILL"); killed++; } catch { /* 已经退了 */ } }
  let removed = false;
  try { if (sandboxForCleanup) { rmSync(sandboxForCleanup, { recursive: true, force: true }); removed = true; } } catch { /* 删不掉就算了 */ }
  console.log(`  · 紧急清理：杀掉 ${killed} 个实例 · 沙箱目录${removed ? "已删" : "没删掉（自己看一眼 /var/folders/**/us-pack-*）"}`);
  process.exit(1);
});
const bye = (why) => {
  /* ⚠️⚠️ **中止路也要清进程**（2026-10-24 实测踩到）。
     七条 `bye(...)` 里原来只有一条走了 `shut()`，其余五条把实例留着 ——
     而**走到中止路的时候一定有东西没收**，那恰恰是最需要清理的一类。
     实测后果：三个打包产物的实例在后台监听着 `127.0.0.1` 的三组端口，
     是我自己几轮 packtest 留下的。
     > **「清理必须跑，判据可以不跑」这条纪律 `uitest` 做成了 `uncaughtException` 兜底，
     > 而这里原来只在「正常路径」上清。**
     修法不是在五处各加一行（**漏一处就静默复发**，§162 那条），是让 `bye` 自己清。
     ⚠️ 同步 `kill`：`bye` 后面紧跟 `process.exit`，await 不到。 */
  for (const pr of spawned) { try { pr.kill(); } catch { /* 已经退了 */ } }
  const okAll = fail === 0 && !why;
  console.log(`\n${okAll ? "✓" : "✗"} 打包产物 ${pass}/${pass + fail}${why ? ` · **没跑完**：${why}` : ""}`
    + (spawned.length ? `（起过 ${spawned.length} 个实例，已收）` : "") + "\n");
  process.exit(okAll ? 0 : 1);
};

console.log(`\n打包产物验收 · ${TARGET.replace(REPO + "/", "")}\n`);

/* ── 一关：结构 ─────────────────────────────────────────
   「打出来了」和「东西齐」是两件事。全部离线，不开进程。 */
console.log("一 · 结构");
/** 包里 `plugins/<id>/` 底下**实际**那个版本目录名。找不到回 `null`。
 *
 *  ⚠️ **一处定义，两处用**（结构那一节 + 下面真起 QuickJS 那一节）。
 *  2026-10-22 栽过：S4 之后版本目录不再固定是 `1.0.0`（sync-plugins 拉的是 `1.3.0`），
 *  当时**只改了结构那一节**，而「真起一次」那一节还写死 `1.0.0` ——
 *  于是 `--allow-fs-read=<一个不存在的目录>` 照样放行，读数是 **`import 不到 tools.mjs`**。
 *  > **症状伪装成沙箱权限问题**（本仓库 verbtest 那条 realpath 教训长得一模一样），
 *  > 而真因是判据给了一个不存在的路径 —— **权限模型对不存在的路径的放行是成功的**。
 *  「一条教训只修一处，等于记了没用」（`doc/00` §147 同族）。
 *
 *  ⚠️ **排序按数字比不按字典序** —— `.sort()` 会把 `1.10.0` 排在 `1.9.0` 前面
 *  （S4 那条，`plugin/version.ts compareVersion` 的理由在这里同样适用）。 */
function pluginVer(id) {
  let vs = [];
  try {
    vs = readdirSync(join(RES, "core", "plugins", id)).filter((v) => v !== "current" && /^\d+\.\d+\.\d+/.test(v));
  } catch { return null; }
  if (!vs.length) return null;
  const n = (v) => v.split(".").map((x) => parseInt(x, 10) || 0);
  vs.sort((a, b) => { const A = n(a), B = n(b); return (A[0] - B[0]) || (A[1] - B[1]) || (A[2] - B[2]); });
  return vs[vs.length - 1];
}

/** 三个内置插件在包里那一版的关键文件（一个都没有就给一条必红的路径）。 */
function builtinFiles() {
  const want = { "com.umbra.markdown": ["manifest.json", "index.html", "markdown-it.mjs"], "com.umbra.code": ["manifest.json"], "com.umbra.html": ["manifest.json"] };
  const out = [];
  for (const [id, files] of Object.entries(want)) {
    const v = pluginVer(id) ?? "（缺）";
    for (const f of files) out.push(`core/plugins/${id}/${v}/${f}`);
  }
  return out;
}
const RES = IS_MAC ? join(TARGET, "Contents", "Resources") : join(TARGET, "resources");
const EXE = IS_MAC ? join(TARGET, "Contents", "MacOS", "Umbra Studio") : join(TARGET, "Umbra Studio.exe");
ok(existsSync(EXE) && (IS_MAC ? (statSync(EXE).mode & 0o111) !== 0 : true), "可执行文件在" + (IS_MAC ? "且可执行" : ""));
for (const f of [
  "core/server/dist/index.js", "core/server/dist/project.js", "core/server/package.json",
  "core/app/dist/index.html",
  /* ⚠️⚠️ **这里原来钉四样，2026-10-23（M16-7c-2b / C3）全删了，换成插件桥一件。**
     `core/runtime/support.js` + `react.production.min.js`：dc 的运行时副本，
     `ensureRuntimeBeside` 往每份稿旁边拷的那三个 —— 没有读者了。
     `core/ui/*`：工具界面稿，随设计侧协议一起删。
     ⚠️ **`runtime/` 这个目录仍然要进包**，因为里面还剩一件：插件桥。
     > 一个目录从「带四样」变成「带一样」时，判据要钉**剩下那一样**，
     > 而不是只把删掉的几条划掉 —— 否则「整个目录漏进包」会没人发现。 */
  "core/runtime/umbra-plugin.js",
  /* 内置插件必须进包：不进的话打包版**打开 .md 只有通用文件卡**，
     而这在开发模式下测不出来（开发时 TOOL_ROOT 就是仓库根，插件天然在）。 */
  /* S4 起内置插件是 sync-plugins 拉进来的构建产物，版本目录不再固定是 1.0.0 —— 按包里实际那一版找 */
  ...builtinFiles(),
  "core/server/node_modules/@modelcontextprotocol/sdk/package.json",
]) ok(existsSync(join(RES, f)), f);

/* ── `Info.plist` 的显示名按语言分（M17-1，2026-10-24）────────────────────
   中文系统的 Finder / Dock 显示「长尾雀 Studio」，英文系统显示「Quetail Studio」。
   `afterPack` 往 `.app/Contents/Resources/<语言>.lproj/InfoPlist.strings` 里写那两个键。

   ⚠️⚠️ **这一节必须在 `packtest` 里，开发模式一定测不出来** —— 开发时压根没有 `.app`。
   ⚠️ 判准走 **`plutil`**（系统自己的解析器）而不是读字符串：
   `.strings` 是一种有格式的东西，「文件里有这几个字」和「系统解析得出这个值」是两件事，
   而**后者才是 Finder 走的那条路**。
   ⚠️ **而「某个语言下显示什么」也不是读文件能回答的** —— 它要走 `Bundle.preferredLocalizations`
   那套语言匹配（实测：现代的 `zh-Hans` 会匹配到旧式目录名 `zh_CN`，这件事猜不出来）。
   那一半在 `shell/lprojcheck.swift` 里，由下面这条判据调它。

   ⚠️ **兜底值单独一条，而且判准是「它没被换成英文」**：
   `.lproj` 这条路要是不生效（目录名对不上、签名剥掉、Electron 改名…），
   所有人看到的就是兜底值。兜底留中文 = 不生效时和今天一样；换英文 = 中文用户看到英文。
   > **一个只能在别人的机器上才看得见的改动，要把它的失败模式选成「和今天一样」。** */
if (IS_MAC) {
  const { execFileSync: exec0 } = await import("node:child_process");
  const rawOf = (key) => {
    try { return exec0("plutil", ["-extract", key, "raw", join(TARGET, "Contents", "Info.plist")], { encoding: "utf8" }).trim(); }
    catch { return "(读不到)"; }
  };
  const B = await import(pathToFileURL(join(REPO, "server", "dist", "shared", "brand.js")).href);
  ok(rawOf("CFBundleDisplayName") === B.bundleDisplayName,
     "`Info.plist` 里的兜底显示名**是中文那一份**（`.lproj` 不生效时，所有人看到的就是它）",
     `${rawOf("CFBundleDisplayName")} vs ${B.bundleDisplayName}`);

  /* 每种语言各一条：**`plutil` 解析得出来**，而且值等于 `brand.ts` 那张表里的。 */
  const miss = [];
  const wrong = [];
  for (const [loc, want] of Object.entries(B.bundleDisplayNameByLocale)) {
    const f = join(TARGET, "Contents", "Resources", `${loc}.lproj`, "InfoPlist.strings");
    if (!existsSync(f)) { miss.push(`${loc}.lproj`); continue; }
    let got = "(解析不出来)";
    try { got = exec0("plutil", ["-extract", "CFBundleDisplayName", "raw", f], { encoding: "utf8" }).trim(); } catch { /* 下面报 */ }
    if (got !== want) wrong.push(`${loc}=${got}≠${want}`);
  }
  ok(miss.length === 0 && wrong.length === 0,
     "**每种语言的 `InfoPlist.strings` 都在，而且 `plutil` 解析出来等于 `brand.ts` 那张表**",
     miss.length || wrong.length ? `缺 ${miss.join("·") || "无"} · 对不上 ${wrong.join("·") || "无"}`
       : `${Object.keys(B.bundleDisplayNameByLocale).length} 种：${Object.entries(B.bundleDisplayNameByLocale).map(([k, v]) => `${k}=${v}`).join(" · ")}`);

  /* ── ⚠️⚠️ **`CFBundleName` 必须等于冻结的身份名**（2026-10-24，一条真缺陷的闸）──
     Electron 按它拼 helper 路径（`Contents/Frameworks/<它> Helper.app`），
     而 helper 目录名跟着 `productName`。改名那一批把它换成中文 →
     **改名之后打的每一个包都起不来**（`FATAL … Unable to find helper app`，退出码 133），
     而没人发现，因为这一节下面「真起一次」在那之后没人跑过。
     > **一个键同时被当成「称呼」和「身份」，必然在其中一个上是错的。**
     ⚠️ 这条和下面「真起一次」**都要有**：这一条说得出**为什么**崩（省掉一轮排查），
     那一条保证**没说出来的崩也会被抓到**。两条不是重复，是「诊断」和「兜底」。 */
  ok(rawOf("CFBundleName") === B.appIdentityName,
     "**`CFBundleName` 等于冻结的身份名**（Electron 拿它找 helper —— 本地化或改名都会让包起不来）",
     `${rawOf("CFBundleName")} vs ${B.appIdentityName}`);
  /* 反面：`.lproj` 里**不许**出现 `CFBundleName` —— 本地化身份键 =
     「只在某些系统语言下起不来」，比每个包都起不来**更难查**。 */
  const locNamed = Object.keys(B.bundleDisplayNameByLocale).filter((loc) => {
    const f = join(TARGET, "Contents", "Resources", `${loc}.lproj`, "InfoPlist.strings");
    /* ⚠️⚠️ **判准认真正的键赋值，不认提到它的注释**（2026-10-24 当场栽了一次）。
       第一版是 `includes("CFBundleName")`，而生成出来的文件里**我自己写了一行注释**
       「只有 CFBundleDisplayName：CFBundleName 是 Electron 找 helper 的键，不许本地化」——
       判据被那行注释命中，报「四份里都有」，而那四份里一个赋值都没有。
       > **判据里出现的字符串，要是它检查的那个东西本身，不是提到它的文字**（§106 同族，
       > 而这次是我亲手给它造的样本）。 */
    try { return existsSync(f) && /^\s*CFBundleName\s*=/m.test(readFileSync(f, "utf8")); } catch { return false; }
  });
  ok(locNamed.length === 0,
     "**`.lproj` 里没有 `CFBundleName`**（只本地化显示名 —— 本地化身份键 = 按系统语言随机破坏启动）",
     locNamed.length ? `这几个里有：${locNamed.join(" · ")}` : "四份都只有 CFBundleDisplayName");

  /* ⚠️⚠️ **这一条才是用户那件事**：某个系统语言下，Finder 到底显示什么。
     前面两条只说明「文件写对了」，而**写对了不等于匹配得上** ——
     语言匹配是系统的事（`zh-Hans` → `zh_CN` 这一跳就是实测才知道的）。
     > **「文件在那儿」和「系统会用它」是两件事，而判据很容易只问前一件。**
     ⚠️ 没有 `swiftc` 就**照实说没验到**，不静默跳过（那会让这一条在 CI 上永远「通过」）。 */
  let langOut = "";
  try {
    const bin = join(REPO, "shell", ".lprojcheck");
    exec0("swiftc", ["-O", "-o", bin, join(REPO, "shell", "lprojcheck.swift")], { stdio: "pipe" });
    langOut = exec0(bin, [TARGET], { encoding: "utf8" }).trim();
  } catch (e) { langOut = `(跑不起来：${String(e.message).slice(0, 60)})`; }
  const want = (lang, name) => new RegExp(`${lang} → [^\n]*「${name}」`).test(langOut);
  ok(want("en", B.bundleDisplayNameByLocale.en) && want("zh-Hans", B.bundleDisplayNameByLocale.zh_CN)
     && want("zh-Hant", B.bundleDisplayNameByLocale.zh_TW),
     "**按系统语言真的取到了对应的名字**（走 `Bundle.preferredLocalizations`，和 Finder 同一条路）",
     langOut.replace(/\n/g, " ⎹ ").slice(0, 200));
}
// 不该在包里的：编译期依赖、我们的回归基准、收设计侧稿的暂存处、插件
/* `core/.umbrastudio` 是 M11-4 加的**预防闸**（当时并没有漏进去 —— 打包配置逐项列目录，
   没有拷仓库根的项）。钉它是因为：**插件装在 STATE_ROOT，开发时那就是仓库根**，
   将来谁为了省事加一条「把仓库根某处也拷进去」，插件就会跟着进包，
   变成 `.app` 里的只读文件 —— 卸不掉也更新不了，而这在开发模式下测不出来
   （开发时两个 root 都可写，`doc/00` §63.1 同一个坑）。 */
/* ⚠️ 2026-10-23（C3）这张「不该在包里」的名单加了两条，而两条的理由不同：
   · `core/doc` —— 它当初进包**只为 `get_syntax_guide` 读那两份写稿规则**（`doc/00` §63.1 那一批
     逼出过「doc/ 没进包」）。那件工具 7b 删了，于是 2.0 MB · 48 份文档跟着撤出。
     > **不是新决定，是一个决定的理由消失之后它自己该有的样子。**
   · `core/ui` —— 整个目录删了（原来这里只钉 `core/ui/_incoming` 不进包）。
   ⚠️ **`core/server/node_modules/playwright-core` 没列进来**，而它的理由也没了
   （原来钉它「体检经 CDP 也要它」，体检删了）——
   但它现在是**判据**在用（`uitest` / `hometest` / `actxtest` 都要），
   而把它从包里排除要先在 `extraResources` 加 filter。
   > **「这个东西的理由没了」和「它该从包里拿掉」是两步，中间那一步是加排除规则。**
   没做那一步之前不钉「它没进包」—— 那会红在一个我们还没做的改动上。 */
for (const f of ["core/server/node_modules/typescript", "core/server/node_modules/@types",
                 "core/fixtures", "core/ui", "core/doc", "core/.umbrastudio"])
  ok(!existsSync(join(RES, f)), `${f} 没进包`);

if (!IS_MAC) {
  const size = execFileSync("sh", ["-c", `du -sm ${JSON.stringify(TARGET)} | cut -f1`], { encoding: "utf8" }).trim();
  note(`体积 ${size} MB`);
  note("win 产物只能验结构 —— 这台机器跑不了 .exe。真机第一次跑是 doc/12 M9-6");
  bye("win：结构关");
}

/* mac：签名。这条是 M9-4 的第三条缺陷 —— electron-builder 在 identity:null 下不签，
   剩下的 linker 签名不覆盖我们塞进 Resources 的 core/，`codesign` 一验就报
   「code has no resources…」，用户下载后双击是「已损坏，移到废纸篓」。afterPack 补的完整
   ad-hoc 签名让它自洽；这一条必须通过，否则后面「签名没被毁」那条判据就没有基线。 */
try { execFileSync("lipo", ["-archs", EXE], { encoding: "utf8" }).trim() && note(`架构 ${execFileSync("lipo", ["-archs", EXE], { encoding: "utf8" }).trim()}`); } catch { note("lipo 读不出架构"); }
const verify = (app) => { try { execFileSync("codesign", ["-v", "--deep", "--strict", app], { stdio: "pipe" }); return "自洽"; } catch (e) { return String(e.stderr ?? "").trim().split("\n").pop() || "不自洽"; } };
const sigBefore = verify(TARGET);
ok(sigBefore === "自洽", "签名自洽（不会被 macOS 判「已损坏」）", sigBefore);
{ // Gatekeeper 的判定：ad-hoc 没公证，被拦是预期。写出来免得下次有人当缺陷查
  let spctl = "?";
  try { execFileSync("spctl", ["-a", "-t", "exec", TARGET], { stdio: "pipe" }); spctl = "放行"; } catch { spctl = "拦（预期：ad-hoc 签名没经 Apple 公证）"; }
  note(`Gatekeeper：${spctl} —— 用户头一次打开要右键「打开」或在系统设置里放行；要免这一步得买证书走 notarytool（M9-5）`);
}

/* ── 二关：换个地方真跑 ──────────────────────────────────
   拷到跟仓库毫无关系的目录。若壳或核心还偷偷指着仓库，这里就会露。 */
console.log("\n二 · 换地方真跑（模拟干净机器：产物脱离仓库，状态目录全新）");
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), "us-pack-")));
sandboxForCleanup = sandbox;   // ⚠️ 立刻登记给兜底清理 —— 崩在后面任何一行，这个目录都得删掉   // realpath：macOS 的 /var 是 /private/var 的软链，不解开对不上主进程报的路径
const appCopy = join(sandbox, basename(TARGET));
cpSync(TARGET, appCopy, { recursive: true, verbatimSymlinks: true });
const projCopy = join(sandbox, "proj");
cpSync(PROJ, projCopy, { recursive: true });
rmSync(join(projCopy, ".umbrastudio"), { recursive: true, force: true });   // 没建过索引，跟第一次打开一样

const exeCopy = join(appCopy, "Contents", "MacOS", "Umbra Studio");
const userData = join(sandbox, "userdata");
const logFile = join(sandbox, "autotest.log");
const env = { ...process.env, UMBRASTUDIO_AUTOTEST_LOG: logFile };
const errLines = [];
/* ⚠️ CDP 端口和那行日志都是**主进程起来之后才写的**，而「窗口出现」比它们早。
   2026-09-26 实测过一次偶发：同样的产物，一次没有 CDP、一次有 ——
   那不是产品的问题，是判据抢跑。**等它，别抢**（最多 15 秒）。
   抢跑的判据比没有判据更糟：它偶尔红一次，人就开始怀疑判据而不是怀疑产品。 */
const waitFor = async (label, read, ms = 15000) => {
  const t = Date.now();
  for (;;) {
    const v = await read().catch(() => null);
    if (v) return v;
    if (Date.now() - t > ms) return null;
    await new Promise((r) => setTimeout(r, 300));
  }
};

/* ⚠️⚠️⚠️ **进门方式 2026-10-24 换掉了，而换的理由是一道有意为之的加固。**
   原来走 `_electron.launch`（Playwright 接**主进程的 Node inspector**）。
   `fb56145`（10-22）为 #138 把签名包的 `--inspect` 关掉
   （`electronFuses.enableNodeCliInspectArguments: false`）—— 那条路从此不通，
   症状是 `TimeoutError: Timeout 180000ms exceeded`，而**上一次这一关全绿是 10-06**。
   > **一道为了安全关掉的入口，正是测试用来进门的那一个。**
   > 加固和可测性在这里是同一扇门的两面。

   三条路里选了第三条（geek-99 2026-10-24 定）：**fuse 不动，换判据的进门方式** ——
   前两条（打包时放开 fuse / 另打一份可测版）都会让「测的不再是发出去那一份」。

   新方式：起成**普通子进程** → 读 `UMBRASTUDIO_AUTOTEST_LOG` 那一行 →
   按里面的 `cdp` 走 `chromium.connectOverCDP`（那是**渲染进程**那一侧，不是主进程）。
   ⚠️ **代价要照实列**（geek-99 要求「哪条验不了就照实列出来，不准悄悄少掉」）：
   · 主进程那几条读数（`packaged` / `stateDir` / `userData` / `cdp` / `electron`）
     改从那一行日志拿 —— 为此给 `main.mjs` 那一块补了 `stateDir` / `userData` 两项；
   · **「把窗口挪到非主显示器」做不到了** —— 那要 `BrowserWindow`，只有主进程给得了。
     见下面 `moveOffMain` 处的说明。
   · 「打开一个没建过索引的目录」换成**从命令行传目录**，而这一换是**加强**：
     它现在走的是产品真有的那条路（M14-5 的 argv / 冷启动双击），不是注入一个 IPC 事件。 */
const { chromium } = await import("../server/node_modules/playwright-core/index.mjs");
const { spawn } = await import("node:child_process");

/** 读 autotest 那一行（主进程写的）。读不到回 `null` —— **不抛**：
 *  抛掉的话后面二十条判据一条都不跑，而输出里只有一个栈，看不出「是坏了还是没跑到」。 */
const logLines = async () => {
  const txt = await readFile(logFile, "utf8").catch(() => "");
  return txt.trim().split("\n").filter((l) => l.startsWith("{"));
};
/** 读那一行。给了 `pid` 就**按 pid 取自己那一个实例的**；否则退回「比 `after` 更新的那一行」。
 *
 *  ⚠️⚠️ **不能只取「最后一行」**（2026-10-24 实测踩到）：日志是 `flag: "a"` 追加的，
 *  而这一套会起**两个实例**（一次验首页、一次带目录冷启动）。
 *  第二次 `launch` 时新实例还没写，「最后一行」指的是**上一个实例**的 ——
 *  于是判据拿着一个已经死掉的 CDP 端口去连，读数是
 *  `connectOverCDP(…:53709) 失败: ECONNREFUSED`，而**那个端口确实曾经是对的**。
 *  > **一个累积型的日志，读「最后一行」只在「只有一个写者」时才等于「这一次的」。**
 *  （和「判据读到上一轮的状态」同一族 —— 这次上一轮就在同一次运行里。） */
const readLog = async (after = 0, pid = null) => {
  const ls = await logLines();
  /* ⚠️ **按 pid 认是首选**（`main.mjs` 2026-10-24 起每行带 pid）——
     「比 after 更新的最后一行」只是退路：它在「同一时刻只有一个写者」时才对，
     而这一套会同时留着两个实例（单实例锁那一条）。 */
  if (pid != null) {
    for (let i = ls.length - 1; i >= 0; i--) {
      try { const o = JSON.parse(ls[i]); if (o.pid === pid) return o; } catch { /* 跳过坏行 */ }
    }
    return null;
  }
  if (ls.length <= after) return null;
  try { return JSON.parse(ls[ls.length - 1]); } catch { return null; }
};

/** 起一个实例并接上它的渲染进程。回 `{ proc, browser, win, log }`，接不上则 `win` 为 `null`。 */
const launch = async (extraArgs = []) => {
  const before = (await logLines()).length;   // 只认比这更新的那一行，见 `readLog`
  const proc = spawn(exeCopy, [`--user-data-dir=${userData}`, ...extraArgs], { env, cwd: sandbox, stdio: ["ignore", "pipe", "pipe"] });
  spawned.push(proc);   // ⚠️ 登记给 `bye` 收尾 —— 中止路也要清，见那里的说明
  proc.stderr?.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => errLines.push(l)));
  proc.stdout?.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => errLines.push(l)));
  /* ⚠️ 进程提前退出要**当场说出来**：它退出之后下面那些等待只会等到超时，
     而「超时」这个读数说不出「它压根没起来」。单实例锁没拿到就是这条路（退出码 0）。 */
  let exited = null;
  proc.on("exit", (code) => { exited = code; });
  /* ⚠️ 按**这个子进程自己的 pid** 取 —— 见 `readLog`。
     ⚠️ `proc.pid` 是 Electron 主进程的 pid，而日志里写的是 `process.pid`（同一个）。 */
  const log = await waitFor("autotest 日志", async () => (exited === null ? await readLog(before, proc.pid) : "exited"), 60000);
  if (log === "exited" || exited !== null) {
    return { proc, browser: null, win: null, log: null, exited };
  }
  if (!log?.cdp) return { proc, browser: null, win: null, log, exited };
  /* ⚠️⚠️ **`cdp` 那个字段是端口号，不是 URL** —— 实测它写的是 `53327`，
     而 `connectOverCDP` 要 `http://127.0.0.1:53327`。
     第一版直接把它当 URL 传，`connectOverCDP` 抛、被 `.catch` 吃成 `null`，
     读数变成「接不上渲染进程 —— 日志里有没有 cdp？」**而日志里有**。
     > **一个被 catch 吃掉的类型错误，会伪装成「那个东西不在」。**
     ⚠️ 两种都认（将来谁把它改成完整 URL 也不会坏）。 */
  const cdpUrl = /^https?:\/\//.test(String(log.cdp)) ? String(log.cdp) : `http://127.0.0.1:${log.cdp}`;
  const browser = await chromium.connectOverCDP(cdpUrl).catch((e) => { errLines.push(`connectOverCDP(${cdpUrl}) 失败: ${String(e.message).slice(0, 120)}`); return null; });
  const ctx = browser?.contexts()[0];
  /* 工作台那个窗口可能还没挂上来 —— 等它，别抢（§113 那条）。 */
  let win = ctx?.pages().find((pg) => /__app\//.test(pg.url())) ?? null;
  for (let i = 0; !win && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    win = browser?.contexts()[0]?.pages().find((pg) => /__app\//.test(pg.url())) ?? null;
  }
  return { proc, browser, win, log, exited };
};
const dumpErr = () => console.log(errLines.length ? "    主进程 stderr:\n" + errLines.slice(-12).map((l) => "      " + l.slice(0, 220)).join("\n") : "    主进程 stderr 一行都没有");
/** 把这个实例的所有窗口挪到**非主显示器**上（sam 2026-10-22 的要求）。
 *
 *  ⚠️ 这一套起的是**真 Electron 窗口**（它测的就是打包产物能不能起来），
 *  没有无头模式可用；而主屏上 sam 自己在用。
 *  ⚠️ **不改产品代码** —— 位置由测试自己摆，不给主进程加一个只有测试会设的开关
 *  （那种「只在测试里走的分支」迟早会和真实行为分叉）。
 *  只有一个显示器时它是空操作，并**说出来** —— 不然「挪过去了」和
 *  「这台机器只有一个屏」读数一样。和 `shelltest` 的 `park` 是同一份。 */
/** ⚠️⚠️ **挪窗口到非主显示器：2026-10-24 从判据搬进了主进程。**
 *  原来 `packtest` 自己 `app.evaluate(BrowserWindow.setBounds)` 摆 ——
 *  调试口收进测试态之后，判据只通到**渲染进程**，`setBounds` 没了（主进程才有）。
 *  > **一个只有主进程能做的动作，在一条只通到渲染进程的路上没有替代品。**
 *  所以（geek-99 定）在主进程里加了一个**只在 `UMBRASTUDIO_AUTOTEST_LOG` 置位时才生效**的
 *  初始窗口位置（`main.mjs` 的 `autotestBounds`，可用 `UMBRASTUDIO_AUTOTEST_DISPLAY`
 *  点名显示器），条件和调试口**同一个变量**。结论写进 autotest 日志的 `parked`。
 *  ⚠️ 这是「不给主进程加只有测试会设的开关」那条纪律的一次**例外**，所以条件要窄 ——
 *  而它换来的是 sam 2026-10-22 那个要求（主屏他自己在用）能继续成立。 */

/** 收掉一个实例：先断 CDP，再杀进程，再等它真的走。
 *  ⚠️ **不能只断 CDP** —— 那只是断了我们这头的连接，进程还在，
 *  而下一次 `launch` 会被单实例锁挡住、退出码 0，读数变成「产物起来就退了」。
 *  > **「我不看它了」和「它结束了」是两件事。**
 *  ⚠️ 2026-10-24 这个定义被我自己误删过一次：改上面那段 `park` 说明时，
 *  替换的区间把它一起切掉了，读数是 `ReferenceError: shut is not defined`。
 *  > **按「两个锚点之间」替换文本，会把夹在中间的东西一起换掉** ——
 *  而它恰好报在很后面（第 490 行），看着像另一处的问题。 */
const shut = async (a) => {
  try { await a.browser?.close(); } catch { /* 连接可能已经没了 */ }
  try { a.proc?.kill(); } catch { /* 已经退了 */ }
  for (let i = 0; i < 40 && a.proc && a.proc.exitCode === null; i++) await new Promise((r) => setTimeout(r, 150));
};

const t0 = Date.now();
/* ⚠️⚠️ **第一次起**不带参数 —— 后面那条判据等的是**首页**（「最近打开 / 还没有项目」）。
   第一版我把目录直接从命令行传进去，于是 app 直奔工作台、首页那两个词永远不出现，
   读数是 `page.waitForFunction: Timeout 90000ms exceeded`。
   > **我把「打开目录」那一条改强了，而它改掉了另一条判据的前提。**
   （§163.5 同族：「判据把后面判据要用的前置状态改掉了」—— 这次是在同一个文件里自己踩的。）
   所以分两次起：**这一次验首页那一路**，打开目录那一条在下面单独起一次、带 argv。 */
let app = await launch();
let win = app.win;
if (app.exited !== null && app.exited !== undefined) {
  /* ⚠️ **进程提前退了要说清是哪一种** —— 退出码 0 多半是单实例锁
     （用户自己的 Studio 正开着），而那和「产物坏了」完全是两件事。
     这条路 2026-10-24 真踩过：`--user-data-dir` 被 `main.mjs` 静默盖掉 →
     共用同一把锁 → 第二个实例 `process.exit(0)`，而 Playwright 报
     `Process failed to launch!`，一句和真因毫无关系的话。 */
  dumpErr();
  rmSync(sandbox, { recursive: true, force: true });
  bye(`产物起来就退了（退出码 ${app.exited}）—— 退出码 0 多半是单实例锁：`
    + `检查有没有别的实例正开着，以及 --user-data-dir 有没有真的生效`);
}
if (!win) { dumpErr(); rmSync(sandbox, { recursive: true, force: true }); bye("接不上渲染进程（CDP 那条路）—— 日志里有没有 cdp？"); }
{
  /* ⚠️ **只有一个显示器时照实跳过，不算红**（geek-99 定）——
     「挪过去了」和「这台机器只有一个屏」必须在读数上分得开。 */
  const pk = app.log?.parked ?? null;
  if (!pk) console.log("窗口位置: 读不到 `parked`（主进程那行日志里没有它？）");
  else if (pk.ok) ok(true, "**测试态窗口挪到了非主显示器**（主屏留给人用，sam 2026-10-22 的要求）", `「${pk.label}」@ ${pk.x},${pk.y} · 共 ${pk.displays} 个屏`);
  else console.log(`窗口位置: 没验到 —— ${pk.why}（共 ${pk.displays} 个屏）。这台机器只有一个屏时这一条本来就没地方验`);
}
/* 这一关靠哪条路进门，**写进读数** —— 不写的话下次有人看到「第二关全绿」
   不会知道它绕过了主进程，也不会知道因此少了哪条（摆窗口那条）。 */
console.log(`进门方式: 普通子进程 + connectOverCDP（${app.log?.cdpPort ? `端口 ${app.log.cdpPort}` : "没读到 cdp"}）—— 不接主进程 inspector（fuse 关着）`);
await win.waitForFunction(() => /最近打开|还没有项目/.test(document.body.innerText), null, { timeout: 90000 });
ok(true, "启动到首页", `${Date.now() - t0} ms`);

/* ⚠️ **令牌走 preload 这条路，打包后还成不成立**（`11` Q42 / `00` §一一二）。
   这一条只有产物答得出：`additionalArguments` 里的 boot 由**主进程**拼，
   而主进程在包里的路径、preload 的加载方式都和开发模式不一样 ——
   正是 §63.1 那一族「打包版才会炸、开发模式测不出」的东西。
   下面那些判据其实间接依赖它（拿不到令牌就是兜底屏，什么都点不了），
   但间接依赖会把根因藏起来：真坏了的话会看到「打开目录失败」而不是「令牌没到」。 */
const boot = await win.evaluate(() => ({
  has: !!window.__UD_APP,
  tokenLen: window.__UD_APP?.token?.length ?? 0,
  inUrl: /token=/.test(location.href),
  url: window.__UD_APP?.url ?? null,
}));
ok(boot.has && boot.tokenLen > 0, "打包版里令牌经 preload 到了页面", `token ${boot.tokenLen} 字符`);

/* ⚠️ **宿主共享库进包了吗**（M10-2 / `00` §一一七）。
   `shared/codemirror.js` 是插件 import 的大依赖，而 `extraResources` 里
   **一开始就漏了它** —— 漏了的话开发模式一切正常（源码目录下有 `shared/`），
   **打包版里插件直接白屏**：import 404。这正是 §63.1 那一族
   「可写状态写进 .app / doc 没进包」的同一种病：**清单式配置，加东西时忘了改它**。
   判据从**产物**问，不从源码问。 */
{
  /* ⚠️ **带一个对照组**：同时取一个**一定不存在**的文件。
     第一版只测「存在的那个回 200」，反向验证（把 `core/shared` 整个移走）时
     它**照样绿** —— 一条只会说「是」的判据，等于没有判据。
     两个一起看：真的 200 + 假的 404，才说明这条路由在按文件存在与否回答。
     ⚠️ 顺带记一条：那次反向验证还**红了两条签名自洽** ——
     移走 `.app` 里的目录会破坏签名封印。**反向验证的手法本身也会有副作用**，
     看红的是不是你要验的那条。 */
  const r = await win.evaluate(async (base) => {
    /* ⚠️ **看拿到的是不是那个文件，不是看状态码。**
       hub 服务对未知路径有 SPA fallback（回 `index.html`，**200**）——
       所以对照组那个「一定不存在的文件」也是 200，状态码在这里什么都证明不了。
       改成认内容：CM 的产物里一定有 `EditorView`，而 SPA fallback 是一段 HTML。 */
    const one = async (u) => {
      try { const res = await fetch(base + u); const t = await res.text(); return { s: res.status, len: t.length, head: t.slice(0, 200) }; }
      catch (e) { return { s: 0, len: 0, head: String(e).slice(0, 60) }; }
    };
    const real = await one("__shared/codemirror.js");
    const fake = await one("__shared/一定没有这个文件.js");
    return { real, fake, base };
  }, boot.url ?? new URL(win.url()).origin + "/");
  /* ⚠️ **判据不认 minify 之后的名字。** 第一版查 `EditorView`，而产物是压缩过的 ——
     那个名字只在**文件末尾**的 export 列表里，我却只取了前 4000 字符，于是**永远 false**。
     差点让我去追一个不存在的产品缺陷（`/__shared/` 其实一直是通的）。
     现在认三样都不依赖压缩结果的：**够大** · **不是 HTML 兜底页** · **对照组是 404**。 */
  const realOk = r.real.s === 200 && r.real.len > 400_000 && !/<!DOCTYPE|<html/i.test(r.real.head);
  ok(realOk && r.fake.s === 404, "**宿主共享库进包了**（够大 · 不是兜底页 · 对照组 404）",
     `真的 ${r.real.s}/${Math.round(r.real.len / 1024)}KB · 对照组 ${r.fake.s} · ${r.base}`);
}
ok(!boot.inUrl, "**而地址里不带令牌**（带了会进历史记录、也会被 webContents.getURL() 读到）", location_hint(boot));

/* ⚠️ 主进程那几条读数**只能从 autotest 日志那一行拿**（`app.evaluate` 那条路随
   `--inspect` 一起没了）。为此给 `main.mjs` 那一块补了 `stateDir` / `userData` 两项 ——
   **不是给产品加功能**：那一整块只在 `UMBRASTUDIO_AUTOTEST_LOG` 置位时才跑。
   ⚠️ 读不到就给一个全空的对象，让下面三条**各自红**，而不是整个崩 ——
   崩掉的话后面二十条一条都不跑，而输出里只有一个栈。 */
/* ⚠️ 直接用 `launch` 已经拿到的那一行 —— 再读一次就又会撞上「最后一行是谁的」那个坑。 */
const probe = app.log ?? {};
ok(probe.packaged === true, "主进程认得自己是打包版", `Electron ${probe.electron}`);
ok(probe.stateDir === probe.userData, "状态目录 = userData（不是 .app 内部）", probe.stateDir ?? "(没设)");
ok(!!probe.cdp, "自带 Chromium 的 CDP 端口已就绪", probe.cdp ?? "(没有)");

/* 日志同理要等。**而且读不到时要报红，不能让整个测试崩** ——
   崩掉的话后面二十条判据一条都不跑，而输出里只有一个 ENOENT 栈，
   看不出「是坏了还是没跑到」。 */
const coreRoot = probe.coreRoot ?? "";   // 同一行日志，不再读第二遍
ok(!!coreRoot && coreRoot.startsWith(appCopy), "核心根指着拷过来的产物，没指回仓库",
  coreRoot ? coreRoot.replace(sandbox, "<sandbox>") : "(等不到主进程那行日志)");

/* ⚠️ **打开目录单独起一次，而且走命令行**（M14-5 的 argv / 冷启动那条路）。
   原来是 `app.evaluate` 往渲染进程注入一个 `host:event` —— 那要主进程，没了。
   换成 argv 之后这一条**变强了**：它走的是产品真有的那条路，不是注入一个事件。
   ⚠️ 必须另起一个实例：上面那个已经在首页上，而**单实例锁**意味着
   「再起一个带路径的」会被第一个接走（`second-instance`）—— 那是另一条路，
   这里要验的是**冷启动带路径**。所以先收掉第一个。 */
await shut(app);
app = await launch([projCopy]);
win = app.win;
if (!win) { dumpErr(); rmSync(sandbox, { recursive: true, force: true }); bye("带目录冷启动时接不上渲染进程"); }
/* ⚠️ **判据钉在结构上，不钉文案**（2026-09-26 修）。
   原来等的是页面里出现「N 份稿」—— 那串字在第八/九轮重画时从工作台移走了
   （现在只在首页的项目卡上，而打开项目之后首页就不在了）。
   于是这条判据从那时起一直红着，而**打包版其实是好的**。

   它躲了两天没被发现，是因为**这条判据跑一次要先打包**（几分钟）——
   代价高的判据人就不会顺手跑，不跑的判据就会悄悄过期。
   这是「判据成本」本身带来的盲区，记一笔。

   现在钉：目录树里真的列出了条目（`role="treeitem"`）。
   这是「项目打开了、索引现建成功了」的结构证据，重画不会动它。 */
await win.waitForFunction(() => document.querySelectorAll('[role="treeitem"]').length > 0
  && !/核心断开/.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
const rows = await win.evaluate(() => document.querySelectorAll('[role="treeitem"]').length);
ok(rows > 0, "打开一个从没建过索引的目录（索引现建）", `目录树 ${rows} 条`);
if (!(rows > 0)) { dumpErr(); await shut(app); rmSync(sandbox, { recursive: true, force: true }); bye("卡在索引这一步，后面没跑"); }

/* ⚠️⚠️ **体检那两条判据 2026-10-24 整块删掉了，而理由是「它钉的东西不存在了」。**
   它原来钉「自带 Chromium 那条路」：调 `__ud/drafts` 找一份稿 → `__ud/check` 起体检 →
   `__ud/check_status` 轮询 → 认 `alive` 和 `browser.from === "UMBRASTUDIO_CDP"`。
   而 **C3 把这三条路由全删了**（`list_drafts` 在 7b/7c 撤、`check` / `check_status` 在
   M16-7c-2a 删，连 `render.ts` / `rendertest` 一起）。
   症状：`page.evaluate: TypeError: Cannot read properties of undefined (reading 'drafts')` ——
   **判据在读一个不存在的字段，然后把整关带崩**。

   > **一条判据钉的那个功能被删掉之后，它不会变红，它会抛。**
   > 而抛出来比红更糟：它把它后面所有判据一起带走（`doc/00` 那条「一个判据抛出来，
   > 代价不是它自己红，是它后面所有判据都没跑」）。

   ⚠️ **这一块属于「三种不跑」里的第二种：它已经不该存在，从分母里拿掉。**
   不是「等以后补回来」—— 自带 Chromium 体检这个功能 C3 已经整条删了。
   ⚠️ 抓到它的是 geek-99 要求的那个**对照实验**（临时放开 fuse 跑一次）：
   没有那一次，换完进门方式之后这一条会以**另一种面目**再红一次，
   而那时我会以为是新进门方式的问题。
   > **「证明只是进门方式的问题」这个对照，证出来的是「确实还有别的病」。** */


await shut(app);
await new Promise((r) => setTimeout(r, 1200));

/* ── 三关：写过一轮之后还起得来 ────────────────────────
   钉住第一条缺陷：状态若写进 .app，ad-hoc 签名会失效，第二次启动就被判「已损坏」。
   一关已经把签名基线校准成「自洽」，这里量到的「仍然自洽」才说明得了问题。 */
/* ── ⚠️⚠️ **没有 `UMBRASTUDIO_AUTOTEST_LOG` 时，产物一个调试口都不开**（2026-10-24，乙）──
   这一条是「乙」这条路的代价的**读数**：乙让测试态和用户态跑在不同的开关组合下，
   而那正是 fuse 那件事刚教过的（「测的不再是发出去那一份」）。
   所以「用户那份不开」这件事**必须自己有判据**，不能靠记得。
   > **一个按条件生效的加固，它的「条件不满足时真的没生效」那一半，才是要钉的那一半。**

   三件一起钉（它们在 `main.mjs` 里共用同一个条件）：
   ① CDP 端口**连不上**（不是「日志里没写」—— 那只说明没人告诉我们）；
   ② `userData` 里**不出现** `DevToolsActivePort`（Chromium 只在开了调试口时写它）；
   ③ **没有体检窗口**（`about:blank#umbrastudio-check` 那个隐藏窗口）。
   ⚠️ ③ 没法从外面直接数窗口（我们接不上主进程），所以**用 ① 的手段反过来问**：
   调试口既然没开，就没有任何 target 可列 —— 于是 ③ 和 ① 在读数上合成一条，
   **照实写在判据的话里**，不假装单独验到了。
   ⚠️ 这一次**不给 `UMBRASTUDIO_AUTOTEST_LOG`**，所以也拿不到 hub/令牌 ——
   只能从外面看「端口在不在、文件在不在」，而那恰好就是要验的东西。 */
{
  const { spawn: spawn2 } = await import("node:child_process");
  const ud2 = join(sandbox, "userdata-nolog");
  const envNoLog = { ...process.env };
  delete envNoLog.UMBRASTUDIO_AUTOTEST_LOG;      // ⚠️ 删掉而不是设空串 —— `!!""` 也是 false，但删掉更贴近用户的环境
  const pr = spawn2(exeCopy, [`--user-data-dir=${ud2}`], { env: envNoLog, cwd: sandbox, stdio: ["ignore", "pipe", "pipe"] });
  spawned.push(pr);
  const seen = [];
  pr.stderr?.on("data", (d) => seen.push(String(d)));
  /* 等它真起来 —— 等「`userData` 里出现 Chromium 自己的文件」，不定时等。
     ⚠️ 等的是**别的**文件（不是 DevToolsActivePort），不然这条判据就循环了。 */
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (existsSync(join(ud2, "Local Storage")) || existsSync(join(ud2, "Preferences")) || existsSync(join(ud2, "session.json"))) break;
  }
  const portFile = join(ud2, "DevToolsActivePort");
  ok(!existsSync(portFile),
     "**没有 `AUTOTEST_LOG` 时：`userData` 里不出现 `DevToolsActivePort`**（Chromium 只在开了调试口时写它）",
     existsSync(portFile) ? `它在：${portFile.replace(sandbox, "<sandbox>")}` : "不在");
  /* ⚠️ 顺带把 stderr 里那行 `DevTools listening on …` 也查一遍 ——
     两条证据各自独立：文件是 Chromium 写的，那一行是它打的。 */
  ok(!/DevTools listening on/.test(seen.join("")),
     "**而且它一个字都没说「DevTools listening on」**（开了调试口的话这一行一定在）"
     + " —— 这一条同时说明**没有体检窗口**：口没开，就没有 target 可列",
     seen.join("").match(/DevTools listening on \S+/)?.[0] ?? "没有这一行");
  await shut({ proc: pr });
}

console.log("\n三 · 写过一轮之后（状态落在哪、还起不起得来）");
const stateFiles = execFileSync("sh", ["-c", `find ${JSON.stringify(userData)} -name workspace.json -o -name ai_config.json | sed 's|${userData}|<userData>|'`], { encoding: "utf8" }).trim();
ok(/workspace\.json/.test(stateFiles), "workspace.json 落在 userData", stateFiles.split("\n").join(" · "));
const insideApp = execFileSync("sh", ["-c", `find ${JSON.stringify(join(appCopy, "Contents", "Resources", "core"))} -name workspace.json -o -name ai_config.json -o -name projects -type d | wc -l`], { encoding: "utf8" }).trim();
ok(insideApp === "0", ".app 内部没有被写进任何状态", `命中 ${insideApp} 个`);
const sigAfter = verify(appCopy);
ok(sigAfter === "自洽", "跑过一轮之后签名仍然自洽（没被自己毁掉）", `${sigBefore} → ${sigAfter}`);
app = await launch(); win = app.win;
if (!win) { dumpErr(); bye("第二次启动接不上渲染进程"); }
await win.waitForFunction(() => /最近打开|还没有项目/.test(document.body.innerText), null, { timeout: 90000 });
const recent = await win.evaluate(() => /proj/.test(document.body.innerText) ? "记住了" : "没记住");
ok(recent === "记住了", "第二次启动照样起来，最近打开记在 userData 里", recent);
await shut(app);


/* ── 四关：打包版当 MCP server 起 ──────────────────────
   `01` §4.8 的秘书接入就靠这条：别的模型客户端把这个可执行文件当 MCP server 起，
   stdio 归 MCP，不开窗口。打包后核心路径全变了（Resources/core），必须在产物上验。 */
console.log("\n四 · 打包版当 MCP server 起（秘书接入那条路）");
{
  const { Client } = await import("../server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
  const { StdioClientTransport } = await import("../server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js");
  const t = Date.now();
  const tr = new StdioClientTransport({ command: exeCopy, args: ["--mcp", `--user-data-dir=${userData}`], env, cwd: sandbox, stderr: "pipe" });
  const c = new Client({ name: "packtest", version: "0" });
  try {
    await c.connect(tr);
    const tools = await c.listTools();
    const r = await c.callTool({ name: "list_projects", arguments: {} });
    const j = JSON.parse(r.content[0].text);
    ok(tools.tools.length > 20, "MCP 握手成功，工具表齐", `${tools.tools.length} 件工具 · initialize ${Date.now() - t} ms`);
    ok(j.ok === true, "调一件工具拿到信封", `list_projects → 项目根 ${String(j.data?.projectsRoot ?? "?").replace(userData, "<userData>")}`);
    ok(String(j.data?.projectsRoot ?? "").startsWith(userData), "MCP 里的项目根也在 userData，不在 .app 里");
    await c.close();
  } catch (e) { ok(false, "MCP 起不来", String(e).slice(0, 200)); }
}

/* 单实例：第二个进程应当立刻退出，把请求转给第一个。
   前提是**真有**第一个在跑 —— 锁是按 userData 目录拿的，没人持锁时第二个进程就是第一个，
   不退出反而是对的（这条判据第一版就是这么写错的）。 */
{
  const first = await launch();
  /* ⚠️ 这一条只要**第一个真在跑**，不需要接上它的渲染进程 —— 所以不判 `win`。
     而「真在跑」要看它**没有提前退出**：第一个自己就退了的话，第二个不退反而是对的，
     那时这条判据红在一个错的理由上。 */
  ok(first.exited === null || first.exited === undefined, "（前提）第一个实例真的在跑着", `exited=${String(first.exited)}`);
  const second = spawn(exeCopy, [`--user-data-dir=${userData}`], { env, stdio: "ignore" });
  spawned.push(second);
  const code = await new Promise((res) => { const t = setTimeout(() => { second.kill(); res("6 秒还没退"); }, 8000); second.on("exit", (c) => { clearTimeout(t); res(c); }); });
  ok(code === 0, "有实例在跑时，第二个立刻退出（单实例锁）", `退出码 ${code}`);
  await shut(first);
}

/* ⚠️ **插件 B 面的 QuickJS 在打包版里起得来吗**（Q48 / issue #94，2026-10-06）。
   和上面「宿主共享库进包了吗」是**同一族**（§63.1）：
   `@jitl/quickjs-wasmfile-release-sync` 要在运行时读一个 **503 KB 的 `.wasm` 文件**，
   而打包后 `server/node_modules` 是经 `extraResources` 拷进 `Resources/core/` 的，
   那条 filter 里排掉了 `*.md` / `*.map` —— **再排掉一类，`.wasm` 就跟着没了**，
   而开发模式下一切正常。

   ⚠️ 判据**不是「那个文件在不在」** —— 文件在而加载不起来是另一回事
   （路径算错、权限模型没放行 `node_modules`、Electron 当 node 跑时 import 解析不到）。
   所以这里**真起一次**：用**打包版的 Electron** 跑**打包版的 runner**，
   装**打包版的真插件**（markdown），看它那两件能力报不报上来。 */
{
  const { fork } = await import("node:child_process");
  const CORE = join(RES, "core");
  const RUNNER = join(CORE, "server", "dist", "plugin", "runner.js");
  const NB = join(CORE, "server", "dist", "plugin", "net-block.cjs");
  const SROOT = join(CORE, "server");
  /* ⚠️ 版本目录**按包里实际那一版找**，不写死 —— 理由全文在上面 `pluginVer` 那段 */
  const PV = pluginVer("com.umbra.markdown");
  const PLUG = join(CORE, "plugins", "com.umbra.markdown", PV ?? "（包里没有版本目录）");
  const wasm = join(SROOT, "node_modules", "@jitl", "quickjs-wasmfile-release-sync", "dist", "emscripten-module.wasm");
  ok(existsSync(wasm), "QuickJS 的 `.wasm` 进包了", existsSync(wasm) ? `${Math.round(statSync(wasm).size / 1024)} KB` : "没有");
  const out = await new Promise((res) => {
    let caps = null, err = "";
    const c = fork(RUNNER, [], {
      execPath: exeCopy,
      execArgv: ["--permission", `--allow-fs-read=${PLUG}/`, `--allow-fs-read=${RUNNER}`,
                 `--allow-fs-read=${NB}`, `--allow-fs-read=${join(SROOT, "node_modules")}/`,
                 `--allow-fs-read=${join(SROOT, "package.json")}`, "--require", NB],
      env: { ELECTRON_RUN_AS_NODE: "1", UD_PLUGIN_DIR: PLUG, UD_PLUGIN_ENTRY: "tools.mjs", PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    c.stderr.on("data", (b) => { err += b.toString(); });
    c.on("message", (m) => {
      if (m.type === "caps") caps = m.caps;
      if (m.id === 1) { c.kill(); res({ caps, err: m.error ?? "", stderr: err }); }
    });
    c.on("exit", () => { if (caps === null) res({ caps: null, err: "子进程退了", stderr: err }); });
    c.send({ id: 1, type: "init" });
    setTimeout(() => { c.kill(); res({ caps, err: "20 秒没反应", stderr: err }); }, 20000);
  });
  /* 「都在」的标准**从插件自己取**，不写死件数。
     2026-10-22 栽过第二面：原来写的是 `=== 2`（`outline` / `replace_section`，M13-1 那天的第一批），
     而 umbra-plugins 后来加到 **6 件** —— 判据红了，而产品是对的。
     > **把一个会增长的数字写死，等于让判据在下一次正常演进时报假警。**
     改成「**声明了几件就该报上来几件**」：源码文本里 `defineCap(` 的次数，
     和 QuickJS 里真 eval 完报回来的件数，是**两个独立的东西** ——
     所以这不是「判据引用了它要检查的东西」那种循环（`doc/00` §91 那条）。
     ⚠️ 不写成 `>= 2`：「至少一条」几乎总是假判据（§145.4）。
     ⚠️ 还要钉住**名字**：只比数的话「6 件全错名」照样绿。 */
  const declared = (await readFile(join(PLUG, "tools.mjs"), "utf8").catch(() => "")).match(/defineCap\s*\(/g)?.length ?? 0;
  const names = out.caps?.map((c) => c.name) ?? [];
  ok(Array.isArray(out.caps) && declared > 0 && out.caps.length === declared
     && names.some((n) => n.endsWith(".outline")) && names.some((n) => n.endsWith(".replace_section")),
     `**打包版里 QuickJS 真起来了，真插件 B 面声明的 ${declared || "?"} 件能力都报上来了**（文件在 ≠ 加载得起来）`,
     /* ⚠️ 把**用的哪一版**打进读数：这一条红过一次，而「判据路径过期」和「产物真坏了」
        在读数里长得一样（都是 import 不到）—— 版本号是分得开它们的那一个字 */
     out.caps ? `${PV ?? "没找到版本目录"} · 声明 ${declared} / 报上来 ${out.caps.length} · ${names.join(" / ")}`
              : `${PV ?? "没找到版本目录"} · 声明 ${declared} · ${out.err} ${out.stderr.slice(0, 120)}`);
}

rmSync(sandbox, { recursive: true, force: true });
bye();
