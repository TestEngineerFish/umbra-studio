/** 泛型文件层的回归（M8-1 / M8-2）。
 *
 *  为什么单独一套：`write_file` 是**第二条写入口**。`write_draft` 那条被 selftest /
 *  rendertest / lifecycletest 从三个角度钉着，这一条一开始什么都没有 —— 而它管的是
 *  「写前校验别把别人的改动盖掉」「旧版留得住」「frontmatter 一个字节都不许动」。
 *  这三件事出错都不会让页面白屏，只会安静地丢东西，所以更需要基准。
 *
 *  用法：npm --prefix server run filetest
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProject } from "./project.js";
import { listVersions, snapDir } from "./history.js";
import { readdir } from "node:fs/promises";
import {
  countTypes, lineDelta, listFiles, listSnapshotMeta, listSnapshots, moveFile,
  readAnyFile, readSnapshotContent, referencesOf, revertFile, trashFile, writeAnyFile,
} from "./files.js";
import { ToolError } from "./envelope.js";

const DIR = join(tmpdir(), `umbrastudio-filetest-${Date.now()}`);
let bad = 0;
function ok(label: string, cond: boolean, extra?: unknown): void {
  if (!cond) bad++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
}
const fixOf = (e: unknown) => (e as ToolError)?.diagnostic?.fix ?? "";
const msgOf = (e: unknown) => (e as ToolError)?.diagnostic?.message ?? String((e as Error)?.message ?? e);

console.log(`\n泛型文件层回归 · ${DIR}\n`);
await rm(DIR, { recursive: true, force: true });
await mkdir(join(DIR, "docs"), { recursive: true });
await writeFile(join(DIR, "project.json"), JSON.stringify({ name: "filetest", title: "回归" }));
await writeFile(join(DIR, "需求.md"), "---\nowner: sam\nstatus: draft\n---\n\n# 日志页需求\n\n正文。\n");
await writeFile(join(DIR, "docs", "note.md"), "# 笔记\n");
await writeFile(join(DIR, "conf.json"), '{"a":1}\n');
await writeFile(join(DIR, "图.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
await writeFile(join(DIR, "图.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24"></svg>');
await writeFile(join(DIR, "稿.dc.html"), '<!DOCTYPE html><html><head><script src="./support.js"></script></head><body><x-dc><img src="图.png"><div>hi</div></x-dc></body></html>\n');
const p = await buildProject(DIR);

const l = await listFiles(p);
ok("列一层：目录在前，工具产物不列", l.entries.length === 7 && l.entries[0]!.isDir === true, { n: l.entries.length, types: l.types });
ok("图片尺寸从文件头读（png 1×1 · svg 48×24）",
  l.entries.find((e) => e.name === "图.png")?.width === 1 && l.entries.find((e) => e.name === "图.svg")?.width === 48);
ok("md 摘录跳过 frontmatter", l.entries.find((e) => e.name === "需求.md")?.excerpt === "# 日志页需求");

const r1 = await readAnyFile(p, "需求.md");
ok("读文本：正文 + sha256 + 行数", !!r1.content?.includes("日志页需求") && r1.sha256.length === 64 && r1.lines === 9);
const rimg = await readAnyFile(p, "图.png");
ok("读二进制：不给正文，但说清为什么", rimg.content === null && !!rimg.why && rimg.width === 1);

try { await writeAnyFile(p, "稿.dc.html", "x"); ok("write_file 必须拒绝 .dc.html", false); }
catch (e) { ok("write_file 拒绝 .dc.html 并指向 write_draft", /write_draft/.test(fixOf(e))); }

const w1 = await writeAnyFile(p, "需求.md", r1.content!.replace("正文。", "正文改过了。"), { expectSha256: r1.sha256 });
ok("写前校验通过 → 旧版存 s1 → 新版 s2", w1.snapshot === "s2" && w1.previous === "s1");
try { await writeAnyFile(p, "需求.md", "再改", { expectSha256: r1.sha256 }); ok("过期 sha 必须被拒（Q8）", false); }
catch (e) { ok("过期 sha 被拒，且说清两边是什么", /被改过/.test(msgOf(e)) && /重新读一次/.test(fixOf(e))); }

ok("frontmatter 逐字节不变（H5）", (await readFile(join(DIR, "需求.md"), "utf8")).startsWith("---\nowner: sam\nstatus: draft\n---\n"));

const rv = await revertFile(p, "需求.md", "s1");
/* ⚠️ 这两条原来钉的是 **4 版**（`s1..s4`）。数字从 4 变 3 不是回归 ——
   第 4 版是个**和 s2 一模一样的重复快照**（回退时「存旧」存的就是 s2 的内容，
   而 s2 刚刚才存过）。2026-09-30 消掉了那个重复。
   这两条真正要守的是「**回退不删历史**」：s1 和 s2 都还在，这一点没变。 */
ok("回到 s1：内容回来，历史不删（s1、s2 都还在）",
  (await readFile(join(DIR, "需求.md"), "utf8")).includes("正文。\n") && rv.snapshot === "s3"
  && (await listSnapshots(p, "需求.md")).join(" ") === "s1 s2 s3");
const meta = await listSnapshotMeta(p, "需求.md");
ok("快照元数据：version / src / at 齐", meta.length === 3 && meta[0]!.version === "s1" && !!meta[0]!.at && meta[2]!.note === "回到 s1");

ok("referencesOf 找到引用的文件与行号", (await referencesOf(p, "图.png")).some((r) => r.file === "稿.dc.html" && r.line > 0));
const t = await countTypes(p);
ok("countTypes 全项目分布", t.dc === 1 && t.md === 2 && t.image === 2 && t.other === 2, t);

const mv = await moveFile(p, "图.png", "assets/图.png");
ok("move_file 挪文件并改写稿里的引用",
  mv.rewrote.length === 1 && /src="assets\/图\.png"/.test(await readFile(join(DIR, "稿.dc.html"), "utf8")));
ok("被改写的稿留下语义快照（走的是 write_draft）", (await listVersions(p, "稿.dc.html")).length >= 1);
try { await moveFile(p, "稿.dc.html", "x.dc.html"); ok("move_file 必须拒绝 .dc.html", false); }
catch (e) { ok("move_file 拒绝 .dc.html 并指向 move_draft", /move_draft/.test(fixOf(e))); }

const tr = await trashFile(p, "conf.json");
ok("删除是进回收站，不是真删", tr.trashPath.includes(".umbrastudio/trash/"));

/* 防穿越的做法是把 `.` `..` 段整个吃掉，不是报错 —— 所以判据是「写出来的东西落在项目里」，
   不是「抛了异常」。第一版断言写成后者，实现正确却红了。 */
const esc = await writeAnyFile(p, "../../跑出去.md", "x");
ok("路径锁在项目内（.. 被吃掉，不是写到父目录）",
  esc.path === "跑出去.md" && existsSync(join(DIR, "跑出去.md")) && !existsSync(join(DIR, "..", "跑出去.md")), { path: esc.path });

/* ── 项目根的边界：**同前缀的兄弟目录**（issue #19，2026-09-28）──
   这一条的要害不是「`..` 能不能跳出去」（那个早有判据），而是
   `resolve(base, rel).startsWith(base)` **不带分隔符**：
   项目叫 `Umbra_design` 时，`../Umbra_design2` 解出来是 `/…/Umbra_design2`，
   `startsWith` 判它「在项目内」。任何以项目名为前缀的兄弟目录都能穿进去，
   而报错文案承诺的是「路径跨出了项目目录」。
   **承诺了却不成立的边界比没有边界更糟。**

   判据直接打在这上面：拿一个真实的同前缀路径问那份判定函数。
   ⚠️ 不去真写盘 —— 判据自己不该在仓库外面造文件（同 `plugintest` 那条纪律）。 */
{
  const { isInside } = await import("./pathguard.js");
  const base = "/tmp/projects/Umbra_design";
  const cases: Array<[string, boolean]> = [
    ["/tmp/projects/Umbra_design", true],                        // 项目根自己：合法（在根上建目录）
    ["/tmp/projects/Umbra_design/a/b.dc.html", true],
    ["/tmp/projects/Umbra_design2", false],                      // ← 同前缀兄弟目录，原来判成「内」
    ["/tmp/projects/Umbra_design_old/x.dc.html", false],         // ← 同上
    ["/tmp/projects/other/x.dc.html", false],
    ["/tmp/projects", false],
  ];
  let allRight = true;
  for (const [abs, want] of cases) {
    const got = isInside(base, abs);
    if (got !== want) { allRight = false; console.log(`    ✗ ${abs} → ${got}，该是 ${want}`); }
  }
  ok("**同前缀的兄弟目录不算项目内**（issue #19：原来 startsWith 不带分隔符，Umbra_design2 能穿过去）", allRight);

  /* 六处调用方共用这一份判定 —— 少一处没跟上就等于没修。
     判据：那六个文件里**不许再出现** `startsWith(p.dir)` 这种写法。 */
  const { readFile: rf } = await import("node:fs/promises");
  const guarded = ["write.ts", "project.ts", "refs.ts"];
  const leftovers: string[] = [];
  for (const f of guarded) {
    const src = await rf(new URL(`../src/${f}`, import.meta.url), "utf8").catch(() => "");
    if (/startsWith\(p\.dir\)/.test(src)) leftovers.push(f);
  }
  ok("六处调用方都换成了共用的判定（没有残留的 startsWith(p.dir)）", leftovers.length === 0, { leftovers });
}


/* ── git 版本记录：**补的是我们自己的机制看不见的盲区**（M9-7，用户 2026-09-28 提）──
   用户的原话：「哪怕限制了 AI 工具的权限，也无法保证相关文件在其他编辑器里没有被修改。」
   快照只在走写入口时产生 —— 别人在 VS Code 里改的那一版，我们的快照里没有。
   所以判据就是这一句：**在别处改一个文件，那一版能在 git 历史里找回来。**
   这是这一整套东西存在的理由，也是现在唯一的盲区。 */
{
  const { execFileSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const { commitExternalChanges, isDirty } = await import("./gitkeep.js");
  const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
  /* ⚠️ `-c core.quotepath=false`：不加的话 git 会把非 ASCII 路径转义成
     `"\347\254\224\350\256\260.md"` 并加引号，于是判据里按「笔记.md」比较永远不成立 ——
     实测被它绊倒过两条。**这是仪器的问题，不是产品的问题**，而两者报出来的样子一样。 */
  /* ⚠️ **仓库在我们自己的状态目录里，不在项目里**（issue #74，2026-10-05）——
     所以判据要带 `--git-dir` / `--work-tree`，而且 `gitDirForTest` 必须**调实现那个函数**
     （自己复刻那段哈希的话，算法一改判据就指到一个不存在的目录，
     而 `git --git-dir <不存在>` 的报错看起来像「产品没提交」）。 */
  const { gitDirForTest } = await import("./gitkeep.js");
  const GD = gitDirForTest(DIR);
  const git = (args: string[]) => execFileSync("git",
    ["--git-dir", GD, "--work-tree", DIR, "-c", "core.quotepath=false", ...args],
    { cwd: DIR, encoding: "utf8" }).trim();

  await writeAnyFile(p, "笔记.md", "第一版\n");
  /* ⚠️ 判据从「项目里有 `.git`」改成「**我们自己那个 GIT_DIR 建起来了**」——
     而且**项目里不该有** `.git`：那是这一版最重要的性质
     （我们再也不在用户的仓库上操作）。 */
  ok("写入口给这个项目建了版本库（在我们的状态目录里）", existsSync(join(GD, "HEAD")), GD.split("/").pop());
  ok("**而项目目录里没有 `.git`**（我们不再碰用户的仓库）", !existsSync(join(DIR, ".git")));
  /* 提交身份现在由产品自己给（`-c user.name=Umbra Studio`）——
     ⚠️ 原来这里要在测试里 `git config user.name`，因为产品没给；
     而 `GIT_CONFIG_GLOBAL=/dev/null` 之后不给就会报 "Author identity unknown"，
     所以产品那边加上了。**判据不该再替产品配它** —— 配了就测不出产品漏没漏。 */
  await writeAnyFile(p, "笔记.md", "第二版（走写入口）\n", { expectSha256: sha("第一版\n") });
  for (let i = 0; i < 40 && await isDirty(DIR); i++) await new Promise((r) => setTimeout(r, 100));
  ok("走写入口落盘之后有提交", git(["log", "--oneline"]).split("\n").filter(Boolean).length >= 1);

  /* ═══ 核心那一条：绕过写入口直接改文件（= 别的编辑器改的），再走一次写入口 ═══ */
  const 别处写的 = "别的编辑器改的这一版\n";
  await writeFile(join(DIR, "笔记.md"), 别处写的, "utf8");
  const rescued = await commitExternalChanges(DIR, "笔记.md");
  ok("**别处改过 → 落盘前先记一版**（救下那一版）", !!rescued, { commit: rescued });
  await writeAnyFile(p, "笔记.md", "工具又改了一版\n", { expectSha256: sha(别处写的) });
  for (let i = 0; i < 40 && await isDirty(DIR); i++) await new Promise((r) => setTimeout(r, 100));
  const 从git取回 = rescued ? git(["show", `${rescued}:笔记.md`]) : "";
  ok("**别的编辑器改的那一版，能从 git 里原样取回**（这是这一层存在的理由）",
     从git取回 === 别处写的.trim(), { 取回: 从git取回.slice(0, 24) });
  const msgs = git(["log", "--pretty=%s"]).split("\n");
  ok("提交消息分得出「别处改的」和「工具写入」",
     msgs.some((m) => m.includes("在别处被改过")) && msgs.some((m) => m.startsWith("写入 ")), { 消息: msgs.slice(0, 3) });
  /* **从不 push**：远端一个都不许有（用户明确要求「提交只要在本地」） */
  ok("从不配远端（提交只在本地）", git(["remote"]).trim() === "");
  /* `.umbrastudio/` 不许进仓库 —— 里面有 `ai_config.json`（有 key）。
     **这一条是安全问题，不是整洁问题。** */
  ok("`.umbrastudio/` 没被提交进去（里面有 key）",
     !git(["ls-files"]).split("\n").some((f) => f.startsWith(".umbrastudio")));

  /* ═══ 用户 2026-09-28 问的那条：项目已经有 git、而且他**正在里面工作** ═══
     判据：我们落盘时**不许把他手上的活儿一起提交**。
     这是 `add -A` 和「只 add 点名的文件」之间的全部差别，
     而症状很难联想到我们：他的十个未完成改动突然出现在一个叫
     「写入 X.dc.html v3」的提交里。 */
  await writeFile(join(DIR, "用户正在改的.md"), "他手上的活儿，还没想提交\n", "utf8");
  await writeFile(join(DIR, "他也在改的.txt"), "另一个\n", "utf8");
  await writeAnyFile(p, "笔记.md", "工具第三次落盘\n", { expectSha256: sha("工具又改了一版\n") });
  for (let i = 0; i < 40 && await isDirty(DIR, "笔记.md"); i++) await new Promise((r) => setTimeout(r, 100));
  const 提交里有什么 = git(["show", "--name-only", "--pretty=", "HEAD"]).split("\n").filter(Boolean);
  ok("**不把用户正在改的别的文件卷进我们的提交**（只 add 点名的那一个）",
     提交里有什么.length === 1 && 提交里有什么[0] === "笔记.md", { 提交里: 提交里有什么 });
  ok("他手上那两个文件还是未跟踪状态（我们没碰）",
     git(["status", "--porcelain"]).includes("用户正在改的.md") && git(["status", "--porcelain"]).includes("他也在改的.txt"));

  /* ⚠️ **正在 rebase / merge 时一律不动这个仓库**。
     用户只问了「已经有 git 怎么办」，但更糟的是「他正在 rebase」——
     那时候提交会落在临时状态上，轻则打乱 rebase，重则丢掉他正在整理的历史。
     造法：伪造一个 `MERGE_HEAD`（真跑一次 merge 冲突太重，而判据看的就是这个标记）。
     ⚠️ **放在我们自己的 GIT_DIR 里**（issue #74）—— 原来写的是 `DIR/.git/MERGE_HEAD`，
     而那个目录现在根本不存在。
     ⚠️ 这一条的**语义也变了**：原来防的是「用户正在他的仓库里 rebase」，
     而现在我们不碰他的仓库了 —— 它防的是**我们自己那个仓库**中途出事
     （比如上一次提交被打断）。价值小了，但留着：`inMiddleOfSomething` 还在那条路上。 */
  const gitDirAbs = GD;
  await writeFile(join(gitDirAbs, "MERGE_HEAD"), git(["rev-parse", "HEAD"]) + "\n", "utf8");
  const before = git(["rev-parse", "HEAD"]);
  await writeFile(join(DIR, "笔记.md"), "merge 中途别处又改了\n", "utf8");
  const duringMerge = await commitExternalChanges(DIR, "笔记.md");
  ok("**正在 merge 时什么都不做**（兜底不该有破坏力）",
     duringMerge === null && git(["rev-parse", "HEAD"]) === before, { 提交号: duringMerge });
  await rm(join(gitDirAbs, "MERGE_HEAD"), { force: true });
}

/* ── 项目**在别人的 git 仓库里**时，别往那个仓库提交（2026-09-28）──
   用户当初问的是「项目根目录已经有 git 怎么办」，这是它的**更深一层**：
   项目不是仓库，而是某个更大的仓库里的一个子目录
   （`~/work/我的主项目/设计稿/`，而 `~/work/我的主项目` 是他的仓库）。
   往那里提交等于**在他的主项目历史里插一条「写入 X.dc.html v3」**。

   ⚠️ 实测下来现在是安全的，但**这个安全是 `git init` 带来的，不是显式判定带来的**：
   `ensureRepo` 看的是 `existsSync(dir/.git)`，子目录没有 `.git` 于是它建了一个自己的。
   哪天有人把它改成看起来更「正确」的 `git rev-parse --is-inside-work-tree`
   （那个命令对大仓库里的子目录返回 **true**），就会当场引入这条缺陷。
   **这条判据钉的就是那个未来的改动。** */
{
  /* 放在临时目录里，不放仓库 —— 它自己是个 git 仓库，落在仓库里会变成嵌套 */
  const BIG = join(tmpdir(), `umbrastudio-gitbig-${Date.now()}`);
  const { execFileSync } = await import("node:child_process");
  await rm(BIG, { recursive: true, force: true });
  await mkdir(join(BIG, "设计稿"), { recursive: true });
  const g = (a: string[], cwd = BIG) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  g(["init", "-q"]);
  await writeFile(join(BIG, "README.md"), "用户的主项目\n", "utf8");
  g(["add", "-A"]); g(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "用户的大仓库"]);
  const bigHeadBefore = g(["rev-parse", "HEAD"]);
  const sub = join(BIG, "设计稿");
  const { commitAfterWrite } = await import("./gitkeep.js");
  await writeFile(join(sub, "稿.dc.html"), "<html>x</html>", "utf8");
  const sha = await commitAfterWrite(sub, "稿.dc.html", "v1", null);
  /* ⚠️ **这条判据的期望变了**（issue #74，2026-10-05）——
     它钉的性质没变（**不往用户的大仓库提交**），而「落在哪」变了：
     原来建一个 `<子目录>/.git`，现在落在我们自己的状态目录。
     ⚠️ 新架构下这件事**更彻底**：我们不再往用户的目录树里建任何仓库 ——
     所以顺带多钉一条「子目录里也没有 `.git`」。 */
  const { gitDirForTest: gdOf } = await import("./gitkeep.js");
  ok("**项目在别人的仓库里时，提交落进我们自己的状态目录**（不是那个大仓库）",
     sha !== null && existsSync(join(gdOf(sub), "HEAD")),
     { 提交号: sha, 我们的仓库: existsSync(join(gdOf(sub), "HEAD")) });
  ok("**而且没在子目录里建 `.git`**（新架构：不往用户的目录树里建任何仓库）",
     !existsSync(join(sub, ".git")));
  ok("**用户那个大仓库一条提交都没多**（他的主项目历史没被插东西）",
     g(["rev-parse", "HEAD"]) === bigHeadBefore, { 前: bigHeadBefore.slice(0, 7), 后: g(["rev-parse", "HEAD"]).slice(0, 7) });
  await rm(BIG, { recursive: true, force: true });
}

/* ── 版本历史的两块底座（M10-2b 前置，设计侧第十三轮问出来的）──
   它定的形制是「点一行 = 看那一版」+ 每行一个 `+N −M` 摘要。
   ⚠️ 这两样原来**都拿不到**：`file_versions` 只给元数据，
   而读某一版原文的函数存在却从没暴露成能力 ——
   于是界面能显示「有 7 版」却打不开其中任何一版。 */
{
  const proj = await buildProject(DIR);
  const F = "版本历史样本.ts";
  await writeAnyFile(proj, F, "一\n二\n三\n", { expectSha256: "0" });
  await writeAnyFile(proj, F, "一\n二改了\n三\n四\n五\n", { expectSha256: (await readAnyFile(proj, F)).sha256 });
  await writeAnyFile(proj, F, "一\n三\n四\n五\n", { expectSha256: (await readAnyFile(proj, F)).sha256 });

  /* 1. 读得到某一版的原文（不是盘上那份） */
  const s1 = await readSnapshotContent(proj, F, "s1");
  ok("**读得到某一版的原文**（「看那一版」的底座）", s1 === "一\n二\n三\n", JSON.stringify(s1));
  const now = (await readAnyFile(proj, F)).content;
  ok("它给的是那一版，不是盘上现在那份", s1 !== now, { s1版: s1.length, 盘上: now?.length ?? null });

  /* 2. `+N −M` 由后端算好，逐版对 */
  const metas = await listSnapshotMeta(proj, F);
  /* ⚠️ **三次写就该是三版**。原来是**五**版 —— 每次写都存两遍
     （存旧 + 存新，而「旧」就是上次的「新」），于是一半的行 delta 是 `+0 −0`。
     设计侧刚定了每行写 `+N −M`，那样一半的行没有意义。 */
  ok("**写三次就是三版**（不是每次写都留一个重复的）", metas.length === 3, metas.map((m) => m.version).join(" "));
  ok("没有一条是 `+0 −0` 的空行", metas.every((m) => (m.delta?.plus ?? 1) + (m.delta?.minus ?? 1) > 0),
     metas.map((m) => `${m.version}:${JSON.stringify(m.delta)}`).join(" "));
  ok("**第一版是「全新增」**（它没有上一版可比）",
     metas[0]?.delta?.plus === 4 && metas[0]?.delta?.minus === 0, JSON.stringify(metas[0]?.delta));
  /* s1「一 二 三 ␊」→ 「一 二改了 三 四 五 ␊」：改一行 = +1 −1，再加两行 = +2 */
  ok("**改一行 + 加两行 算成 +3 −1**（不是按字节、也不是整份重算）",
     metas[1]?.delta?.plus === 3 && metas[1]?.delta?.minus === 1, JSON.stringify(metas[1]?.delta));
  ok("**删一行算成 +0 −1**", metas[2]?.delta?.plus === 0 && metas[2]?.delta?.minus === 1, JSON.stringify(metas[2]?.delta));

  /* ⚠️ 去重**不许把外部改动一起省掉** —— 那一步存在的理由就是它。
     模拟「别人在 VS Code 里改了这份文件」：绕过写入口直接改盘上那份。 */
  const absF = join(DIR, F);
  await writeFile(absF, "别的编辑器改成这样\n", "utf8");
  await writeAnyFile(proj, F, "工具接着写\n", { expectSha256: (await readAnyFile(proj, F)).sha256 });
  const metas2 = await listSnapshotMeta(proj, F);
  const rescuedSrc = await Promise.all(metas2.map((m) => readSnapshotContent(proj, F, m.version).catch(() => "")));
  ok("**外部改的那一版被存下来了**（去重只省重复的，不省真不一样的）",
     rescuedSrc.includes("别的编辑器改成这样\n"),
     metas2.map((m) => m.version).join(" "));
  /* ⚠️ **而且它得标成「外部改动」，不能标成调用方的 origin。**（设计侧第十三轮问出来的）
     原来这里填 `opts.origin ?? "人手改"` —— 于是版本历史里那一行说「人手改」，
     而它恰恰是**别人改的那一版**。**救下这一版正是这条兜底存在的全部理由，
     而它把自己救下来的东西标错了。** */
  {
    const i = rescuedSrc.indexOf("别的编辑器改成这样\n");
    ok("**外部改的那一版标成「外部改动」**（不是调用方的 origin）",
       i >= 0 && metas2[i]?.src === "外部改动", `${metas2[i]?.version} 标成 ${metas2[i]?.src}`);
    ok("而它说得出为什么被存下来", !!metas2[i]?.note, metas2[i]?.note ?? "（没有 note）");
    /* 同一批里**调用方写的那一版**仍然按调用方打标 —— 两件事不能混 */
    const mine = metas2[metas2.length - 1];
    ok("而调用方自己写的那一版照旧按调用方打标（两件事不混）",
       mine?.src === "人手改", `${mine?.version} 标成 ${mine?.src}`);
  }
  ok("这条兜底和 git 无关，所以 `.gitignore` 忽略了也照样有",
     metas2.length === 5, `${metas2.length} 版`);

  /* 3. 掐头去尾那段优化不许改答案 —— 拿一份两头一大片相同、中间动一行的来对 */
  const pad = Array.from({ length: 50 }, (_, i) => `第${i}行`);
  const big1 = [...pad, "中间", ...pad].join("\n");
  const big2 = [...pad, "中间改了", ...pad].join("\n");
  ok("**掐头去尾没把答案改掉**（两头各 50 行相同，中间改一行）",
     JSON.stringify(lineDelta(big1, big2)) === JSON.stringify({ plus: 1, minus: 1 }), JSON.stringify(lineDelta(big1, big2)));

  /* 4. 太大就明说没算，而不是卡住 */
  const huge = Array.from({ length: 4100 }, (_, i) => `x${i}`).join("\n");
  ok("**超过上限回 `null`（明说没算），不是硬算到卡死**", lineDelta(huge, huge + "\ny") === null);

  /* 5. 一版坏掉不许毁掉整个列表（§九十二 那条） */
  /* ⚠️ 路径**用 `snapDir()` 算，别自己拼**（2026-10-02 实测栽过）。
     原来这里写的是 `join(DIR, ".umbrastudio", "snapshots", F, …)` ——
     判据绕过被测代码自己复刻了一遍目录名规则，于是 issue #47 改了编码之后
     `rm` 删的是一个**不存在的路径**（`rm` 带 `force` 不报错），
     s2 还在，判据红在「列表没变空」上 —— 而它测的根本不是那件事。
     **判据要拼实现的路径时，必须调实现那个函数。** */
  await rm(join(snapDir(proj, F), "s2.src.gz"), { force: true });
  const after = await listSnapshotMeta(proj, F);
  /* ⚠️ 2026-10-02 这条判据的**期望变了**（issue #48）：delta 现在写快照时就算好存进
     `s<N>.json`，所以**原文丢了 delta 还在** —— 那是改进，不是回归。
     原来写的是 `after[1]?.delta === null`（原文丢了 → 读的时候算不出来 → null），
     现在 s2 照样有数。

     但这条判据**钉的不变量没变**：一个坏数据不该毁掉整个列表（§九十二）。
     所以判据改成直接问那一条 —— 列表还是 5 条、每一条都在。
     ⚠️ 另外加一条：**那一版的原文确实取不回来了**，
     否则「列表完整」可能只是因为我删的文件根本没被用到。 */
  let lostThrew = false;
  try { await readSnapshotContent(proj, F, "s2"); } catch { lostThrew = true; }
  ok("**一版的原文丢了，别的版照样列出来**（不是整个列表变空）",
     after.length === 5 && after.every((m) => !!m.version),
     after.map((m) => `${m.version}:${m.delta === null ? "没算" : JSON.stringify(m.delta)}`).join(" "));
  ok("**而那一版的原文确实取不回来了**（否则上一条「列表完整」可能只是因为我删的东西没被用到）",
     lostThrew, lostThrew ? "读 s2 抛了 E_SNAPSHOT_MISSING" : "✗ 居然还读得到");
}

/* ── git 兜底在不在：三态（M10-2b 要在版本历史头上说那句话）──
   ⚠️ 这一条直接来自用户 2026-09-30 的提问「如果 add 的这个文件是被用户自己 git 忽略的呢」。
   实测出来的洞是：两道兜底全静默失效而**界面一个字都不说**（§126.1）。
   所以先让后端能回答这个问题，界面才有话可说。 */
{
  const { gitFallbackOf } = await import("./gitkeep.js");
  const { execFileSync } = await import("node:child_process");
  const G = join(DIR, "gitfallback");
  await mkdir(G, { recursive: true });
  /* ⚠️ **夹具要走 `ensureRepo`，不能自己在项目里 `git init`**（issue #74）。
     仓库搬到状态目录之后，`gitFallbackOf` 查的是**我们那个 GIT_DIR** ——
     夹具在项目里 init 一个，它看不见，于是三态全回 `off`/`broken`。
     ⚠️ 这是「夹具复刻实现的布局」那一类：实现一改，夹具就指到别处
     （§134.6 那条「判据要拼实现的路径，必须调实现那个函数」）。 */
  const { ensureRepo: mkRepo, gitDirForTest, commitPaths: ciPaths } = await import("./gitkeep.js");
  const GG = gitDirForTest(G);
  const gx = (args: string[]) => execFileSync("git",
    ["--git-dir", GG, "--work-tree", G, ...args], { cwd: G, encoding: "utf8" }).trim();

  ok("**没有 git 的目录回 `off`**（不是谎称有兜底）", await gitFallbackOf(G, "a.txt") === "off");

  await mkRepo(G);
  /* 忽略规则写在项目里的 `.gitignore` —— ⚠️ git 读工作区的 `.gitignore`
     （那是**用户自己的**文件，我们只读不写），所以这一条照旧有效。 */
  await writeFile(join(G, ".gitignore"), "dist/\n*.log\n", "utf8");
  await writeFile(join(G, "a.txt"), "x\n", "utf8");
  await mkdir(join(G, "dist"), { recursive: true });
  await writeFile(join(G, "dist", "bundle.js"), "y\n", "utf8");
  await writeFile(join(G, "跑起来.log"), "z\n", "utf8");
  await ciPaths(G, ["a.txt", ".gitignore"], "init");

  ok("普通文件回 `on`", await gitFallbackOf(G, "a.txt") === "on", await gitFallbackOf(G, "a.txt"));
  /* ⚠️ 这两条是**用户那个问题的正面答案**：代码仓库的 .gitignore 里必然有 dist/ */
  ok("**`dist/` 下的文件回 `ignored`**（这正是用户问的那种情况）",
     await gitFallbackOf(G, "dist/bundle.js") === "ignored", await gitFallbackOf(G, "dist/bundle.js"));
  ok("按后缀忽略的也认得出来（`*.log`）",
     await gitFallbackOf(G, "跑起来.log") === "ignored", await gitFallbackOf(G, "跑起来.log"));
  /* 判据自己也要证一次「为什么不能用 status --porcelain」—— 那是这个洞的成因 */
  ok("**`status --porcelain` 对被忽略的文件什么都不说**（所以不能拿它当判据）",
     gx(["status", "--porcelain", "--", "dist/bundle.js"]) === "");   // 走 gx：项目里已经没有 .git 了（#74）

  /* ── `broken`：有 git 但现在提交不了（2026-09-30 在用户自己的项目上实测抓到）──
     ⚠️ 这一条不是想出来的场景。他那个仓库 **24 份快照、0 个 git 提交**，
     根因是一个残留的 `.git/index.lock` —— 有它时 `git add` 一律失败，
     而 `commitPaths` 的 `catch` 把失败吃掉了，**界面一个字都没说**。
     而这个函数的第一版**照样回 `on`**：它只看 `.git` 在不在。
     「有 git 目录」和「兜底真的在」是两件事。 */
  await writeFile(join(GG, "index.lock"), "", "utf8");
  ok("**`index.lock` 残留时回 `broken`**（不是谎称有兜底）",
     await gitFallbackOf(G, "a.txt") === "broken", await gitFallbackOf(G, "a.txt"));
  /* 而且这时候提交**真的**做不了 —— 证明 `broken` 不是虚报 */
  {
    const { commitPaths } = await import("./gitkeep.js");
    await writeFile(join(G, "a.txt"), "改一下\n", "utf8");
    ok("锁着的时候提交确实失败（`broken` 不是虚报）", await commitPaths(G, ["a.txt"], "试试") === null);
  }
  await rm(join(GG, "index.lock"), { force: true });
  ok("**锁一拿掉就自动恢复**（不用重启、不用点什么）", await gitFallbackOf(G, "a.txt") === "on");

  /* 正在 merge 也算 broken —— 那时候提交会打乱用户正在整理的历史 */
  await writeFile(join(GG, "MERGE_HEAD"), "deadbeef\n", "utf8");
  ok("正在 merge 时也回 `broken`", await gitFallbackOf(G, "a.txt") === "broken", await gitFallbackOf(G, "a.txt"));
  await rm(join(GG, "MERGE_HEAD"), { force: true });
}

/* ── 草稿暂存（M10-2c）──
   设计侧的形制：打开时**先给盘上的**，顶上一条横条；底稿变过则不给直接恢复。
   ⚠️ 这一段的重点是**「回来那一下」**，不是「存得下来」—— 存是容易的部分。 */
{
  const { stageDraft, getStagedDraft, clearStagedDraft, listStagedDrafts } = await import("./staged.js");
  const proj = await buildProject(DIR);
  const F = "草稿样本.ts";
  await writeAnyFile(proj, F, "一\n二\n三\n", { expectSha256: "0" });

  ok("没草稿时就说没有", (await getStagedDraft(proj, F)).has === false);

  /* 存一份：在盘上那份的基础上加两行 */
  const st = await stageDraft(proj, F, "一\n二\n三\n四\n五\n");
  ok("存得下来", st.staged === true);
  const g1 = await getStagedDraft(proj, F);
  ok("**拿回来的是草稿内容**（不是盘上那份）", g1.content === "一\n二\n三\n四\n五\n", JSON.stringify(g1.content));
  ok("底稿没变 → 可以直接恢复（`stale` 为假）", g1.stale === false);
  ok("**横条上那个读数是「草稿相对盘上」**（不是相对某一版）",
     g1.delta?.plus === 2 && g1.delta?.minus === 0, JSON.stringify(g1.delta));
  ok("记着它是在哪一版上改的", g1.baseVersion === "s1" && g1.currentVersion === "s1",
     `base=${g1.baseVersion} cur=${g1.currentVersion}`);

  /* ⚠️ 核心：**别人改了盘上那份之后，草稿就不能直接恢复了** */
  await writeAnyFile(proj, F, "一\n二改了\n三\n", { expectSha256: (await readAnyFile(proj, F)).sha256 });
  const g2 = await getStagedDraft(proj, F);
  ok("**盘上那份被改过之后，草稿变成不可直接恢复**（不然会静默盖掉别人的改动）",
     g2.stale === true, `stale=${g2.stale}`);
  ok("这时候说得出「草稿是在哪一版、盘上已经是哪一版」",
     g2.baseVersion === "s1" && g2.currentVersion === "s2", `${g2.baseVersion} → ${g2.currentVersion}`);
  ok("草稿内容还在（不是因为过期就丢掉）", g2.content === "一\n二\n三\n四\n五\n");

  /* ⚠️ 「改了又改回来」不该留下一条点了没反应的提示 */
  const back = await stageDraft(proj, F, (await readAnyFile(proj, F)).content ?? "");
  ok("**内容和盘上一样时不存，还把旧草稿清掉**（不留「点恢复什么都不变」的提示）",
     back.staged === false && (await getStagedDraft(proj, F)).has === false,
     back.why ?? "");

  /* 列表：给 AI / 秘书回答「哪些文件我改了没落盘」 */
  await stageDraft(proj, F, "又改了\n");
  const rows = await listStagedDrafts(proj);
  ok("列得出还挂着哪些草稿（AI 看不见编辑器，只能问这一件）",
     rows.length === 1 && rows[0]?.path === F, JSON.stringify(rows));

  /* 丢掉 */
  ok("丢得掉", (await clearStagedDraft(proj, F)).cleared === true);
  ok("丢完就说没有了", (await getStagedDraft(proj, F)).has === false);
  ok("本来没有再丢一次也不报错", (await clearStagedDraft(proj, F)).cleared === false);

  /* 坏掉的草稿要自己清掉并说一句 —— 留着的话每次打开都弹一条恢复不了的提示 */
  const { writeFile: wf2, mkdir: mk2 } = await import("node:fs/promises");
  await mk2(join(DIR, ".umbrastudio", "staged"), { recursive: true });
  await wf2(join(DIR, ".umbrastudio", "staged", `${F}.json`), "{坏的", "utf8");
  const bad2 = await getStagedDraft(proj, F);
  ok("**坏掉的草稿自己清掉并说一句**（不留一条永远消不掉的提示）",
     bad2.has === false && !!bad2.note, bad2.note ?? "");

  /* 路径规范化要和快照那边**同一套** —— 两处不一致的话「有没有草稿」永远查不到 */
  await stageDraft(proj, `./${F}`, "用带点的路径存\n");
  ok("**`./x` 和 `x` 是同一份草稿**（路径规范化和快照那边共用一份）",
     (await getStagedDraft(proj, F)).content === "用带点的路径存\n");
  await clearStagedDraft(proj, F);
}

/* ── 按别的编码读（M10-5，S20 演示态 7「编码不对」）──
   ⚠️ S20 的原话：「只换读法不改文件」「编码没确定之前只读 ——
   按错的编码落盘会把原文写坏」。所以这一段要钉两件：
   **读得对**，以及**沿着这条路进来的写不会绕过写前校验**。 */
{
  const proj = await buildProject(DIR);
  /* ⚠️ **先把 csv 类型注册上** —— 它由内置插件声明（`plugins/com.umbra.code/`），
     而这个判据跑在一个独立的 node 进程里，没走插件注册那条路。
     不注册的话 `.csv` 判成 `other`，`readAnyFile` 当场以「不是文本文件」返回，
     **而那和「按 GBK 读不出来」长得一模一样** —— 第一版我就是这么被读数骗了一下。
     注册一次就是在**模拟用户的真实状态**（代码插件是内置的，卸不掉）。 */
  const { registerKind, unregisterKindsFrom } = await import("./shared/kinds.js");
  registerKind({ id: "csv", label: "CSV", icon: "▦", priority: 10, textual: true,
    match: (n: string) => n.endsWith(".csv") || n.endsWith(".tsv"), from: "filetest" });
  const G = "gbk样本.csv";
  /* GBK 的「订单,金额\n1,100\n」—— 直接写字节，不经写入口（它只收字符串） */
  const bytes = Buffer.from([
    0xb6, 0xa9, 0xb5, 0xa5, 0x2c, 0xbd, 0xf0, 0xb6, 0xee, 0x0a,   // 订单,金额\n
    0x31, 0x2c, 0x31, 0x30, 0x30, 0x0a,                             // 1,100\n
  ]);
  await writeFile(join(DIR, G), bytes);

  const asUtf8 = await readAnyFile(proj, G);
  ok("**按 UTF-8 读是乱码**（这就是用户看到的症状）",
     /\uFFFD/.test(asUtf8.content ?? ""), (asUtf8.content ?? "").slice(0, 14));
  const asGbk = await readAnyFile(proj, G, "gbk");
  ok("**按 GBK 读就对了**", asGbk.content === "订单,金额\n1,100\n", JSON.stringify(asGbk.content));
  ok("而且说得出是按哪种编码读的", asGbk.encoding === "gbk", asGbk.encoding);

  /* ⚠️ 这一条是这一段的核心：**sha 是原始字节的，不随编码变**。
     不这样的话「按 GBK 读 → 拿它的 sha 去写」会绕过写前校验那道闸。 */
  ok("**sha256 不随编码变**（它是原始字节的 —— 否则按别的编码读就绕过了写前校验）",
     asGbk.sha256 === asUtf8.sha256, `${asGbk.sha256.slice(0, 12)} vs ${asUtf8.sha256.slice(0, 12)}`);

  /* 盘上一个字节都没动 */
  const after = await readFile(join(DIR, G));
  ok("**盘上那份一个字节都没动**（只换读法）", Buffer.compare(after, bytes) === 0, `${after.length} 字节`);

  /* 白名单：不认识的编码要说不行，不能静默回退成 UTF-8 */
  const weird = await readAnyFile(proj, G, "没这个编码");
  ok("不支持的编码说不行，并列出能用的（不静默回退成 UTF-8）",
     weird.content === null && /不支持按/.test(weird.why ?? ""), weird.why);
  /* utf-8 显式传也行，且不设 encoding 字段（它只在「不是默认」时才有意义） */
  const explicit = await readAnyFile(proj, G, "utf-8");
  ok("显式传 utf-8 等于不传", explicit.content === asUtf8.content && explicit.encoding === undefined);
  unregisterKindsFrom("filetest");         // 自己注册的自己摘掉，别影响后面的判据
}

/* ── 插件调得到 `read_file_version` 吗（白名单是白名单，新加的能力默认进不来）── */
{
  const { allowedCapNames } = await import("./plugin/host.js");
  const names = allowedCapNames();
  ok("**`read_file_version` 在插件白名单里**（编辑区是插件的，它得自己读那一版）",
     names.includes("read_file_version"), names.join(" "));
  ok("白名单没顺手放开写权限的东西", !names.includes("revert_draft") && !names.includes("delete_draft"));
  ok("**草稿暂存三件也在白名单里**（插件自己存不了，只能调宿主）",
     names.includes("stage_draft") && names.includes("get_staged_draft") && names.includes("clear_staged_draft"),
     names.filter((n) => /staged|stage_/.test(n)).join(" "));
}

/* ── 路径编码撞号（issue #47）──
   `docs/x.md` 和 `docs__x.md` 在旧编码（`/` → `__`）下落到**同一个**状态目录。
   这一节钉的是三件各自独立的后果，**少钉哪一件，那一件就会回来**：
   ① 版本历史不混 ② 草稿不串 ③ 回退拿到的是自己的内容。 */
{
  const { stageDraft, getStagedDraft, clearStagedDraft } = await import("./staged.js");
  const { pathKey } = await import("./history.js");
  await mkdir(join(DIR, "docs"), { recursive: true });
  const A = "docs/x.md", B = "docs__x.md";
  await writeFile(join(DIR, A), "我是 A 的第一版\n", "utf8");
  await writeFile(join(DIR, B), "我是 B 的第一版\n", "utf8");
  const proj2 = await buildProject(DIR);

  ok("**两个撞号的路径算出来的目录名不一样**（旧编码下它们完全相同）",
     pathKey(A) !== pathKey(B), `${pathKey(A)} vs ${pathKey(B)}`);

  /* 各写两次 —— 各自该只看到自己的版本 */
  const a1 = await readAnyFile(proj2, A), b1 = await readAnyFile(proj2, B);
  await writeAnyFile(proj2, A, "我是 A 的第二版\n", { expectSha256: a1.sha256 });
  await writeAnyFile(proj2, B, "我是 B 的第二版\n", { expectSha256: b1.sha256 });
  const a2 = await readAnyFile(proj2, A), b2 = await readAnyFile(proj2, B);
  await writeAnyFile(proj2, A, "我是 A 的第三版\n", { expectSha256: a2.sha256 });
  await writeAnyFile(proj2, B, "我是 B 的第三版\n", { expectSha256: b2.sha256 });
  /* ⚠️ 用 `listSnapshots`（源码快照）不是 `listVersions`（语义快照）——
     后者读 `${version}.json`，那是 `.dc.html` 那条路。第一版用错了，
     读回空数组而目录里明明有三个，**症状是「没有 undefined 的快照」**。 */
  const va = await listSnapshots(proj2, A), vb = await listSnapshots(proj2, B);

  /* ⚠️ **不许只看版本数。**（2026-10-02 反向验证抓到的假通过）
     第一版写的是 `va.length === vb.length && va.length >= 2` ——
     而混在一起时两边读的是**同一个目录**，长度当然相等、也当然 ≥2，
     于是判据在 `A s1..s8 · B s1..s8` 这种明显混了的读数下**照样绿**。
     我在上一版的注释里**写过这句警告**（「版本数相等也可能是两边都看到一半」），
     却把判据写成了只数数。

     钉性质的写法：**把每一版的原文都取出来，每一份都必须是自己的。**
     混在一起时必然有对方的内容出现在列表里 —— 这是数数测不到的。 */
  const allOf = async (rel: string) => {
    const out: string[] = [];
    for (const v of await listSnapshots(proj2, rel)) out.push(await readSnapshotContent(proj2, rel, v));
    return out;
  };
  const aSnaps = await allOf(A), bSnaps = await allOf(B);
  ok("**A 的每一版原文都是 A 的**（旧编码下 B 的版本会混进这个列表）",
     aSnaps.length >= 2 && aSnaps.every((c) => c.includes("我是 A 的")),
     `${aSnaps.length} 版 · 混进来的：${aSnaps.filter((c) => !c.includes("我是 A 的")).map((c) => c.trim().slice(0, 12)).join(",") || "无"}`);
  ok("**B 的每一版原文都是 B 的**（两边都要验 —— 只验一边的话先写的那个恰好会通过）",
     bSnaps.length >= 2 && bSnaps.every((c) => c.includes("我是 B 的")),
     `${bSnaps.length} 版 · 混进来的：${bSnaps.filter((c) => !c.includes("我是 B 的")).map((c) => c.trim().slice(0, 12)).join(",") || "无"}`);
  ok("**两份文件的版本数各自独立**（混在一起时两边会读到同一个目录、数字一模一样）",
     va.length === 3 && vb.length === 3, `A ${va.join("/")} · B ${vb.join("/")}`);

  /* 草稿：A 存一份，B 不该看见 */
  await stageDraft(proj2, A, "A 的草稿，没落盘\n");
  const bDraft = await getStagedDraft(proj2, B);
  ok("**A 的草稿不会被当成 B 的**（旧编码下 B 会读到它，点「用草稿覆盖」就把 A 的内容写进 B）",
     !bDraft.has, bDraft.has ? `拿到了：${(bDraft.content ?? "").slice(0, 16)}` : "没拿到");
  await stageDraft(proj2, B, "B 的草稿，没落盘\n");
  const aDraft = await getStagedDraft(proj2, A);
  ok("**B 存了之后 A 的草稿还在**（旧编码下后存的会把前一份冲掉 —— 刷新就找不回来）",
     aDraft.has && (aDraft.content ?? "").includes("A 的草稿"), (aDraft.content ?? "").trim().slice(0, 16));
  await clearStagedDraft(proj2, A); await clearStagedDraft(proj2, B);

  /* ⚠️ 和编码无关的那一层保险：草稿里记的 `path` 和问的不是一个，就不给。
     手工把 A 的草稿文件搬到 B 的名字下，模拟旧数据撞号。 */
  await stageDraft(proj2, A, "A 的草稿第二次\n");
  const { readFile: rf, writeFile: wf } = await import("node:fs/promises");
  const aFile = join(DIR, ".umbrastudio", "staged", `${pathKey(A)}.json`);
  const bFile = join(DIR, ".umbrastudio", "staged", `${pathKey(B)}.json`);
  await wf(bFile, await rf(aFile, "utf8"), "utf8");
  const spoofed = await getStagedDraft(proj2, B);
  ok("**草稿里记的路径和问的不一样就不给**（这一道和编码无关，是最后一层）",
     !spoofed.has && /不是这个文件/.test(spoofed.note ?? ""), spoofed.note ?? "（没说话）");
  await clearStagedDraft(proj2, A); await clearStagedDraft(proj2, B);
}

/* ── 别人的仓库里那些配置不许被执行（issue #40 → #74）──
   git 仓库自带的配置能让 git 执行任意命令，而 `--no-verify` 管不住它们。
   设计项目天然会被打包转手，而 git 的 `safe.directory` 只拦「属主不是当前用户」——
   解压出来的拦不住。

   ⚠️ **#40 的修法（HARDEN 黑名单 + `umbrastudio.managed` 标记）实测两道都能绕过**
   （#74，2026-10-05）：
   | 闸 | 怎么绕 | 实测 |
   | --- | --- | --- |
   | `managed` 标记 | 它读**仓库自己的 `.git/config`** —— 攻击者可控的文件 | `isOurs` 读到 `true` |
   | HARDEN 五项 | 漏了 `filter.<任意名>.clean`（`git add` 必跑）、`commit.gpgSign`+`gpg.program`（`git commit` 必跑） | `PWNED_FILTER` 真出现了 |

   **黑名单在这里原理上不可能完备** —— `filter.<名字>.clean` 的名字由对方取，
   `-c` 只能覆盖已知名字；而我实测过所有环境开关
   （`GIT_CONFIG_NOSYSTEM` / `GIT_CONFIG_GLOBAL` / `core.attributesFile`），
   **没有一个能屏蔽仓库自己的 `.git/config`**。

   现在的修法是换一层：`GIT_DIR` 指到**我们自己的状态目录** ——
   git 读的 config 是我们的，对方那份根本不在链路上。

   ⚠️ 这一节造**四种**雷（不是 #40 那版的两种）—— 那一版全绿正是因为它没造
   filter 和 gpg。**判据造几种雷，决定它能发现几种绕过。** */
{
  const { execFile, execFileSync } = await import("node:child_process");
  const run = (args: string[], cwd: string) => new Promise<void>((res) => execFile("git", args, { cwd }, () => res()));
  const EVIL = join(DIR, "evil");
  await mkdir(EVIL, { recursive: true });
  await writeFile(join(EVIL, "project.json"), JSON.stringify({ name: "evil", title: "恶意仓库" }), "utf8");
  await writeFile(join(EVIL, "稿子.md"), "第一版\n", "utf8");
  await run(["init", "-q", "."], EVIL);
  const mark = (n: string) => join(DIR, n);
  /* 四种雷，各自在不同的 git 子命令上触发 */
  await writeFile(join(EVIL, ".gitattributes"), "* filter=pwn\n", "utf8");
  await run(["config", "filter.pwn.clean", `touch ${mark("PWNED_FILTER")}; cat`], EVIL);
  await run(["config", "commit.gpgSign", "true"], EVIL);
  await run(["config", "gpg.program", `/bin/sh -c "touch ${mark("PWNED_GPG")}; exit 1" --`], EVIL);
  await run(["config", "core.fsmonitor", `touch ${mark("PWNED_FSM")}; false`], EVIL);
  await mkdir(join(EVIL, ".git", "hooks"), { recursive: true });
  await writeFile(join(EVIL, ".git", "hooks", "post-commit"), `#!/bin/sh\ntouch ${mark("PWNED_HOOK")}\n`, { mode: 0o755 });
  /* 对方自写信任标记 —— #40 那道闸就是这么被绕过的 */
  await run(["config", "umbrastudio.managed", "true"], EVIL);

  /* ⚠️ **先证明雷是活的**（纪律④：量到零的两种可能）。
     用普通 git 跑一次 `add`，filter 该被触发。 */
  try { execFileSync("git", ["add", "--", "稿子.md"], { cwd: EVIL, stdio: "pipe" }); } catch { /* 忽略 */ }
  ok("**夹具自己先中招**（证明雷是活的 —— 不然下面全绿也说明不了什么）", existsSync(mark("PWNED_FILTER")));
  await run(["reset", "-q"], EVIL);
  /* ⚠️ **把自验留下的痕迹清掉。**（2026-10-05 实测栽过）
     自验那一次 `git add` 会同时触发 filter **和 fsmonitor** ——
     不清的话下面量到的是「我自己刚触发的」，而我会以为是产品漏的。
     **「夹具自己先中招」这条做法的副作用：自验留下和真实攻击一样的痕迹。** */
  for (const n of ["PWNED_FILTER", "PWNED_GPG", "PWNED_FSM", "PWNED_HOOK"]) await rm(mark(n), { force: true });

  const evilProj = await buildProject(EVIL);
  const e1 = await readAnyFile(evilProj, "稿子.md");
  await writeAnyFile(evilProj, "稿子.md", "第二版\n", { expectSha256: e1.sha256 });
  await new Promise((r) => setTimeout(r, 1500));      // 落盘后的提交是异步的

  for (const [n, what] of [
    ["PWNED_FILTER", "`filter.<名>.clean`（`git add` 必跑，**#40 漏的**）"],
    ["PWNED_GPG", "`gpg.program`（`git commit` 必跑，**#40 漏的**）"],
    ["PWNED_FSM", "`core.fsmonitor`"],
    ["PWNED_HOOK", "`post-commit` 钩子"],
  ] as const) {
    ok(`**${what} 没被执行**`, !existsSync(mark(n)), existsSync(mark(n)) ? `✗ ${n} 出现了` : "没出现");
  }

  /* 功能还在吗 —— ⚠️ **问「我们的 GIT_DIR 里有几个提交」，不是看返回值**：
     `writeAnyFile` 内部已经提交过了，手工再调一次就是 nothing to commit、照样回 null
     （§140.3② 那个坑，两天内第二次）。 */
  const { gitDirForTest } = await import("./gitkeep.js");
  const gd = gitDirForTest(EVIL);
  let ours = 0;
  try { ours = Number(execFileSync("git", ["--git-dir", gd, "rev-list", "--count", "HEAD"]).toString().trim()) || 0; } catch { ours = 0; }
  ok("**而我们自己的 GIT_DIR 里真的记上了版本**（闸不该把 M9-7 那份兜底关掉）", ours > 0, `${ours} 个提交`);

  /* ⚠️ 两条「对方一点没动」—— 这是搬 GIT_DIR 换来的最大好处 */
  let theirs = -1;
  try { theirs = Number(execFileSync("git", ["rev-list", "--count", "--all"], { cwd: EVIL }).toString().trim()) || 0; } catch { theirs = -1; }
  ok("**对方仓库一个提交都没多**（我们再也不在他的仓库上操作）", theirs === 0, `${theirs} 个提交`);
  ok("**也没往他的项目里塞 `.gitignore`**（排除规则写在我们的 `info/exclude` 里）",
     !existsSync(join(EVIL, ".gitignore")));

  const e2 = await readAnyFile(evilProj, "稿子.md");
  ok("而文件照常落盘了（这道闸只拦 git，不拦写入口）", (e2.content ?? "").includes("第二版"));
}

await rm(DIR, { recursive: true, force: true });
console.log(`\n${bad === 0 ? "✓" : "✗"} 泛型文件层 ${bad === 0 ? "全通过" : `${bad} 条没过`}\n`);
process.exitCode = bad === 0 ? 0 : 1;
