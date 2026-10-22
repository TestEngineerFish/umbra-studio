/** 点文件的显示与写入边界 + 界面偏好的回归（`doc/11` Q77，2026-10-21）。
 *
 *  测的是**一个谓词被拆成三条之后，三条各自答对了自己那个问题**：
 *    ① `isOurArtifact`   我们自己产的 → 隐藏 + 拒写
 *    ② `isOpaquePath`    别人的基础设施（`.git`）→ 列得出来、拒写、不递归
 *    ③ `isHiddenFromList` 只管显示，受设置开关控制（**默认显示**）
 *
 *  ⚠️ **为什么不塞进 `filetest`**：那一套用的是**真 `STATE_ROOT`**，而这里要读写
 *  `ui_prefs.json` —— 那是**用户的设置**。写完再恢复也不行：测试中断一次，
 *  他的开关就被我们改了（§166「清掉自己造的状态」和「清掉自己造的文件」是两件事）。
 *  所以这一套自带临时状态目录，**一个字节都不往真设置里写**。
 *  环境变量要在 **import 任何核心模块之前**设：`STATE_ROOT` 在 `project.ts` 顶层算一次。
 *
 *  用法：npm --prefix server run prefstest
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { studioName } from "./shared/brand.js";

const STATE = await mkdtemp(join(tmpdir(), "umbra-prefstest-"));
process.env.UMBRASTUDIO_STATE_DIR = STATE;

const { getUiPrefs, setUiPrefs, PREF_DEFAULTS } = await import("./uiprefs.js");
const { isOurArtifact, isOpaquePath, isHiddenFromList, denyReason, listFiles, countTypes, writeAnyFile, trashFile, moveFile } = await import("./files.js");
const { buildProject, STATE_ROOT } = await import("./project.js");

const DIR = await mkdtemp(join(tmpdir(), "umbra-prefsbox-"));
let bad = 0, n = 0;
function ok(label: string, cond: boolean, extra?: unknown): void {
  n++; if (!cond) bad++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
}
/** 跑一下，把**拒绝的那句话**取回来（没拒就是空串）。
 *  ⚠️ 取 `diagnostic.message` 而不只看「抛没抛」—— ② 那一节要的正是**话本身**。 */
const threw = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return ""; } catch (e) {
    const d = (e as { diagnostic?: { message?: string } })?.diagnostic;
    return d?.message ?? String((e as Error)?.message ?? e);
  }
};
/** 同上，但取 **`fix`**。
 *  ⚠️ 分两个函数是因为本项目的信封把两件事分开放：`message` 说**出了什么事**，
 *  `fix` 说**该怎么办**。「认的只有这几项」属于后者 —— 第一版判据拿 `message` 去找它，
 *  **红的是判据不是产品**。 */
const threwFix = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return ""; } catch (e) {
    return (e as { diagnostic?: { fix?: string } })?.diagnostic?.fix ?? "";
  }
};

console.log(`\n点文件边界与界面偏好 · 状态目录 ${STATE}\n`);

/* ⚠️ **样本有效性第一条**：证明这一套真的没在碰用户的设置。
   不验这一条，整套判据可能一路绿着、同时把他的开关改掉了。 */
ok("（前提）状态目录是临时的 —— 这一套不碰用户真实的 ui_prefs.json",
   STATE_ROOT.includes("umbra-prefstest-"), STATE_ROOT);

/* ── ① 三条判准各答自己那个问题（纯函数，不碰盘）────────────────────────── */
console.log("\n① 三条判准");
{
  /** [路径, 该拒写?, 开关开时隐藏?, 开关关时隐藏?] */
  const rows: Array<[string, boolean, boolean, boolean]> = [
    // 我们自己产的 —— 开关管不着它
    [".umbrastudio/snapshots/a", true, true, true],
    [".umbradesign/x", true, true, true],
    ["_runtime/support.js", true, true, true],
    ["_ds-tool/a.css", true, true, true],
    ["index-data.js", true, true, true],
    [".DS_Store", true, true, true],
    // 别人的基础设施 —— 拒写，但**开关开着就看得见**
    [".git", true, false, true],
    [".git/config", true, false, true],
    // 用户自己的点文件 —— 可写，开关开着看得见
    [".gitignore", false, false, true],
    [".gitattributes", false, false, true],
    [".env", false, false, true],
    [".image-slots.state.json", false, false, true],
    // 普通文件 —— 两种开关下都显示
    ["a/b.png", false, false, false],
    ["稿.dc.html", false, false, false],
  ];
  let allRight = true;
  for (const [rel, wantDeny, wantHidOn, wantHidOff] of rows) {
    const deny = isOurArtifact(rel) || isOpaquePath(rel);
    const got = [deny, isHiddenFromList(rel, true), isHiddenFromList(rel, false)];
    const want = [wantDeny, wantHidOn, wantHidOff];
    if (String(got) !== String(want)) { allRight = false; console.log(`    ✗ ${rel} → ${got} 而该是 ${want}`); }
  }
  ok(`**14 个样本的三问全答对**（拒写 / 开关开时隐藏 / 开关关时隐藏）`, allRight);

  /* ⚠️ 这一条是**反面的，而且是这一批最要紧的一条**：
     Q77 放行了用户的点文件，而「放行」必须**只放行该放的那些**。 */
  ok("`.git/HEAD` 照旧拒写 —— 放行用户的点文件没有把它一起放出去",
     isOurArtifact(".git/HEAD") || isOpaquePath(".git/HEAD"));
  ok("`.umbrastudio/` 照旧拒写（快照与评论住在里面）",
     isOurArtifact(".umbrastudio/comments.json"));
}

/* ── ② 拒因跟着判准分档（拆了判准不跟着拆话 = 把判断错误换成表达错误）───── */
console.log("\n② 拒因分档");
{
  const ours = denyReason("index-data.js");
  const git = denyReason(".git/config");
  const user = denyReason(".gitignore");
  /* ⚠️ 判据**读常量**而不是写死品牌名（geek-99 2026-10-22 第 4 条）——
   写死的话改一次品牌名就要改一次判据，而「判据跟着改」会掩盖「文案忘了改」。 */
ok(`我们的产物：说的是「${studioName} 自己产的」`, new RegExp(`${studioName} 自己产的`).test(ours?.why ?? ""), ours?.why);
  /* ⚠️ 这一条钉的正是拆判准时自己踩的坑：`.git` 曾被说成「这是工具自己的文件」。 */
  ok("`.git` 里的东西：**不说成「工具自己的文件」**，说的是版本控制自己的数据",
     /\.git/.test(git?.why ?? "") && !/自己产的/.test(git?.why ?? ""), git?.why);
  ok("两档的 fix 不一样 —— 出路本来就不同（一个是「会被重建覆盖」，一个是「用 git 命令」）",
     (ours?.fix ?? "") !== (git?.fix ?? "") && /git 命令/.test(git?.fix ?? ""));
  ok("用户自己的点文件：`denyReason` 回 null（可以碰）", user === null);
}

/* ── ③ 真项目上的集成：显示 / 不递归 / 能写能删 ──────────────────────────── */
console.log("\n③ 真项目上的集成");
{
  await writeFile(join(DIR, "project.json"), JSON.stringify({ name: "prefstest", title: "回归" }));
  await writeFile(join(DIR, ".gitignore"), "node_modules/\n");
  await writeFile(join(DIR, ".env"), "KEY=1\n");
  await writeFile(join(DIR, "稿.md"), "# 一份稿\n");
  await mkdir(join(DIR, ".git", "objects"), { recursive: true });
  await writeFile(join(DIR, ".git", "HEAD"), "ref: refs/heads/master\n");
  await writeFile(join(DIR, ".git", "config"), "[core]\n");
  for (let i = 0; i < 5; i++) await writeFile(join(DIR, ".git", "objects", `o${i}.md`), "# 不是用户的稿\n");
  await mkdir(join(DIR, ".umbrastudio"), { recursive: true });
  await writeFile(join(DIR, ".umbrastudio", "comments.json"), "[]\n");
  const p = await buildProject(DIR);

  ok("（前提）默认就是「显示隐藏文件」—— 用户 2026-10-21 定的", PREF_DEFAULTS.showHiddenFiles === true);
  ok("（前提）没写过设置文件时读到的就是默认值", (await getUiPrefs()).showHiddenFiles === true);

  const namesOf = async () => (await listFiles(p)).entries.map((e) => e.name);
  const on = await namesOf();
  ok("开关默认开：`.gitignore` 在文件树里**看得见**（这是这一条需求的全部）", on.includes(".gitignore"), on);
  ok("开关默认开：`.env` 也看得见", on.includes(".env"));
  ok("`.git` 列得出来 —— 用户该知道它在（用户选的「显示但折叠」）", on.includes(".git"));
  ok("`.umbrastudio/` **不**出现 —— 它是我们的产物，开关管不着", !on.includes(".umbrastudio"));

  const gitEntry = (await listFiles(p)).entries.find((e) => e.name === ".git");
  ok("`.git` 带 `opaque` 标记 —— 界面靠它折叠 / 置灰，而不是在前端再抄一份名单",
     gitEntry?.opaque === true, gitEntry?.opaque);

  /* ⚠️ **这一条是性能与正确性两头的**：`countTypes` 是整个项目递归的。
     走进 `.git` 等于拿 git 的 object 数量去算「这个项目有几份稿」。
     夹具里 `.git/objects/` 放了 **5 个 `.md`** —— 走进去的话 md 会多 5。 */
  const t = await countTypes(p);
  ok("`countTypes` **不递归进 `.git`** —— 夹具在 `.git/objects/` 埋了 5 个 .md，算出来只该有 1 份",
     t.md === 1, t);

  await setUiPrefs({ showHiddenFiles: false });
  const off = await namesOf();
  ok("关掉开关：点文件都不见了", !off.includes(".gitignore") && !off.includes(".env") && !off.includes(".git"), off);
  ok("关掉开关：普通文件照旧在", off.includes("稿.md"));
  await setUiPrefs({ showHiddenFiles: true });

  /* ── 能写能删：这是「拆开」真正买到的东西 ── */
  const w = await threw(() => writeAnyFile(p, ".gitignore", "node_modules/\ndist/\n"));
  ok("**`.gitignore` 写得动了** —— 拆开之前它和 `.git/HEAD` 一个待遇", w === "", w);
  const w2 = await threw(() => writeAnyFile(p, ".git/config", "[core]\n\tx = 1\n"));
  ok("而 `.git/config` 照旧拒 —— 放行没有漫出边界", w2 !== "" && /\.git/.test(w2), w2);
  const w3 = await threw(() => writeAnyFile(p, ".umbrastudio/comments.json", "[]"));
  ok("`.umbrastudio/` 照旧拒", w3 !== "", w3);

  await writeFile(join(DIR, ".eslintrc.json"), "{}\n");
  const d = await threw(() => trashFile(p, ".eslintrc.json"));
  ok("**用户的点文件删得动**（进回收站）", d === "" && !existsSync(join(DIR, ".eslintrc.json")), d);
  const d2 = await threw(() => trashFile(p, ".git/HEAD"));
  ok("而 `.git/HEAD` 删不动", d2 !== "");

  await writeFile(join(DIR, "tmp.txt"), "x");
  const m = await threw(() => moveFile(p, "tmp.txt", ".git/x"));
  ok("`move_file` 往 `.git/` 里塞照旧拒（issue #75 那道闸还在）", m !== "");
}

/* ── ④ 设置的读写口径：读宽容、写严格 ─────────────────────────────────── */
console.log("\n④ 设置的读写口径");
{
  await writeFile(join(STATE_ROOT, ".umbrastudio", "ui_prefs.json"), "{ 这不是 json");
  ok("**读**：文件坏了回落默认，不让一份坏配置把文件树弄空",
     (await getUiPrefs()).showHiddenFiles === true);
  await writeFile(join(STATE_ROOT, ".umbrastudio", "ui_prefs.json"), JSON.stringify({ showHiddenFiles: "false" }));
  /* ⚠️ `"false"` 是**真值** —— 照 JS 的真假规则它会变成 `true`，而写的人想的是 false。
     回落默认比「按真假规则猜」老实。 */
  ok("**读**：`\"false\"` 这种字符串不当布尔用（它在 JS 里是真值），回落默认",
     (await getUiPrefs()).showHiddenFiles === true);
  await rm(join(STATE_ROOT, ".umbrastudio", "ui_prefs.json"), { force: true });

  const e1 = await threw(() => setUiPrefs({ showHiddenFiles: "yes" } as unknown as Record<string, unknown>));
  ok("**写**：给字符串当场拒 —— 界面上以为存进去了而其实没有，比报错糟", /true 或 false/.test(e1), e1);
  const e2 = await threw(() => setUiPrefs({ 没这一项: true }));
  ok("**写**：不认的键当场拒", /不认识/.test(e2) && /没这一项/.test(e2), e2);
  const e2fix = await threwFix(() => setUiPrefs({ 没这一项: true }));
  ok("而且**说出认哪些** —— 拒绝不给出路，等于让人去猜键名", /showHiddenFiles/.test(e2fix), e2fix);
}

/* ── 收尾 ───────────────────────────────────────────────────────────── */
await rm(DIR, { recursive: true, force: true });
await rm(STATE, { recursive: true, force: true });

/** ⚠️ **总数本身也是一条判据**（§160.4）：只拦变少不拦变多。 */
const EXPECT_AT_LEAST = 29;
if (n < EXPECT_AT_LEAST) {
  console.log(`\n⚠️ 只跑了 ${n} 条，少于 ${EXPECT_AT_LEAST} —— 有一节静默没跑（「没验到」要出现在分母里）`);
  bad += EXPECT_AT_LEAST - n;
}
console.log(`\n${bad ? "✗" : "✓"} 点文件边界与界面偏好 ${n - bad}/${Math.max(n, EXPECT_AT_LEAST)}\n`);
process.exit(bad ? 1 : 0);
