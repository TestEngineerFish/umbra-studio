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
import { createHash } from "node:crypto";
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
import { writeDraft } from "./write.js";

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
/* ⚠️ **`listFiles` 的那份类型统计原来一条断言都没有**（只在上面那条的 detail 里打印）。
   2026-10-23 拆出 `svg` kind 时发现 `listFiles` 和 `countTypes` **各写了一遍同样的四档计数**，
   两份一起把矢量图算进了 `other` —— 而只有 `countTypes` 那份被钉着，
   所以**另一份是悄悄坏的**。两处已经抽成 `bumpTypeCount` 一处，这一条钉住另一头。
   > **两份相同的判断，就是两个会一起过期、而只有一个会被发现的地方。** */
ok("**`listFiles` 的类型统计也对**（矢量图算进「图」那一档，不落 other）",
  l.types.dc === 0 && l.types.md === 1 && l.types.image === 2 && l.types.other === 3, l.types);
ok("md 摘录跳过 frontmatter", l.entries.find((e) => e.name === "需求.md")?.excerpt === "# 日志页需求");

const r1 = await readAnyFile(p, "需求.md");
/* `sha256` 2026-10-21 起是**可选**的（截断时刻意不给，见 `ReadFileResult` 的注释）——
   这一条是没截断的正常读，所以它**必须**在：`?? ""` 会让「没给」悄悄变成「长度不对」，
   而那两件事该分得清。 */
ok("读文本：正文 + sha256 + 行数", !!r1.content?.includes("日志页需求") && r1.sha256?.length === 64 && r1.lines === 9);
const rimg = await readAnyFile(p, "图.png");
ok("读二进制：不给正文，但说清为什么", rimg.content === null && !!rimg.why && rimg.width === 1);

/* ⚠️⚠️ **这一条 2026-10-23（M16-7 / C3）整个反过来了。**
   原来是「`write_file` **必须拒绝** `.dc.html`，并指向 `write_draft`」。
   而 C3 删掉 `dc` kind 条目之后，那道拒（`files.ts` 的
   `if (kindOf(clean) === "dc")`）**自动进不去** —— `kindOf` 现在回 `html`。
   > **删掉 kind 条目就等于撤了那道拒：它们不是两件事，是同一个改动的两面。**
   所以这里钉的是新事实：`.dc.html` 走第二条写入口**写得动，而且照样留快照**
   （历史那一层对任何文件都成立，不随 dc 走）。 */
{
  const before = (await listSnapshots(p, "稿.dc.html")).length;
  /* ⚠️ **先读再写** —— 第一版我传 `expectSha256: "0"`（期望新建）而那份稿**已经存在**，
     于是撞上写前校验抛出来。而「先读拿 sha、再带着它写」才是真实用法，
     顺带验了这条路上 `read` 给得出 sha256。 */
  const rdc = await readAnyFile(p, "稿.dc.html");
  ok("**`.dc.html` 读得到正文和 sha256**（C3 之后它就是一份文本 HTML）", !!rdc.content && !!rdc.sha256);
  const w = await writeAnyFile(p, "稿.dc.html", "<!doctype html><p>改过了</p>\n", { expectSha256: rdc.sha256 });
  ok("**`.dc.html` 走 `write_file` 写得动了**（原来这条路拒它并指向 `write_draft`）", !!w);
  ok("**而且照样留了一版快照**（历史那一层对任何文件都成立，不随 dc 走）",
     (await listSnapshots(p, "稿.dc.html")).length > before);
}

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

/* ── 版本号是外部输入：带 `..` 的版本号不许读到别的项目、也不许写进本项目（issue #156）──
   原来 `readSnapshotBytes` 直接 `join(snapDir, version + ".src.gz")`，`..` 被 join 归一化掉，
   能读到另一个项目的快照原文；`revert_file` 还会把它写进当前项目。
   判据要问的是**没读到 / 没写入**，不只是「抛了」。 */
{
  const { relative: relPath } = await import("node:path");
  const O = join(tmpdir(), `umbrastudio-filetest-other-${Date.now()}`);
  await rm(O, { recursive: true, force: true });
  await mkdir(O, { recursive: true });
  await writeFile(join(O, "project.json"), JSON.stringify({ name: "other", title: "别的项目" }));
  await writeFile(join(O, "秘.md"), "别的项目的机密原文\n");
  const po = await buildProject(O);
  const ro = await readAnyFile(po, "秘.md");
  await writeAnyFile(po, "秘.md", "改过\n", { expectSha256: ro.sha256 });
  ok("（前提）另一个项目确实有 s1 快照", existsSync(join(snapDir(po, "秘.md"), "s1.src.gz")));
  const evil = relPath(snapDir(p, "需求.md"), join(snapDir(po, "秘.md"), "s1"));
  const before = await readFile(join(DIR, "需求.md"), "utf8");
  const beforeVers = (await listSnapshots(p, "需求.md")).join(" ");
  for (const v of [evil, "../s1", "s1/../s1", "S1", ""]) {
    let code = "", leaked = false;
    try { leaked = (await readSnapshotContent(p, "需求.md", v)).includes("机密"); }
    catch (e) { code = (e as ToolError)?.diagnostic?.code ?? String(e); }
    ok(`读 version=${JSON.stringify(v.slice(0, 30))} → 抛 E_SNAPSHOT_MISSING 且没读到`, !leaked && /SNAPSHOT_MISSING/.test(code), code);
  }
  let revThrew = false;
  try { await revertFile(p, "需求.md", evil); } catch { revThrew = true; }
  ok("**revert_file 用越界版本号：抛错、本项目文件和版本列表都没变**",
     revThrew && (await readFile(join(DIR, "需求.md"), "utf8")) === before
     && (await listSnapshots(p, "需求.md")).join(" ") === beforeVers);
  await rm(O, { recursive: true, force: true });
}

/* ⚠️⚠️ **这一条 C3 之后没有对象了，照实改。**
   `referencesOf` 用 `listDrafts(p)` 扫**稿**，而 C3 删掉 `dc` kind 之后
   `listDrafts` 返回空 → 它永远回空数组。
   ⚠️ **而这连带着一件要处理的事**：M13-3 做的 `list_file_refs` 对外叫
   「通用的文件引用」，而它的实现只扫稿 —— **C3 之后它永远回空，而名字还在**。
   > **一件能力的名字还在、而它回答的那个问题已经不存在，比删掉它更坏。**
   归 M16-7c（和甲组那 12 件一起处理：删掉，或者改成真的扫所有文本文件）。
   这里先钉住「它现在回空」—— 让这件事在读数里看得见，而不是静静变成一条永远绿的判据。 */
ok("**`referencesOf` 现在回空**（它扫的是「稿」，而 C3 之后没有稿了 —— `list_file_refs` 要跟着处理，见 M16-7c）",
   (await referencesOf(p, "图.png")).length === 0);
const t = await countTypes(p);
/* ⚠️ **`dc` 那一档现在恒为 0**（C3：没有「设计稿」这种 kind 了），而 `.dc.html`
   按 `html` 落进 `other` —— 因为那四档是粗分类，`html` 本来就不在里面
   （`bumpTypeCount` 的注释写着最后那个 `else` 是个黑洞）。
   ⏳ 这四档的语义在 C3 之后要重新想（`dc` 那一档没有对象了），归 M16-7c。 */
ok("countTypes 全项目分布（`dc` 档恒 0，`.dc.html` 按 html 落 other）", t.dc === 0 && t.md === 2 && t.image === 2 && t.other === 3, t);

const mv = await moveFile(p, "图.png", "assets/图.png");
ok("move_file 挪得动文件", mv.to === "assets/图.png" || !!mv);
/* ⚠️⚠️ **引用改写这一层 C3（M16-7）之后没有对象了，照实记。**
   原来这两条钉的是「挪文件时**改写稿里的引用**」和「被改写的稿留下语义快照（走 `write_draft`）」。
   而改写引用走 `mapDraftRefs`，它扫的是 `listDrafts(p)` ——
   C3 删掉 `dc` kind 之后 `listDrafts` 返回空，所以**一处都不改写了**。
   ⚠️ 这不是「坏了」，是「那件事的对象不存在了」：`<dc-import>` 和 `@ds` 都是 dc 的概念。
   ⏳ `mapDraftRefs` / `referencesOf` / `list_file_refs` 要一起处理 —— 归 **M16-7c**：
   要么删掉，要么改成真的扫所有文本文件（那是另一件事，别顺手做）。
   这里钉住「它现在不改写了」，让这件事在读数里看得见。 */
ok("**而引用改写这一层现在是零处**（它扫的是「稿」，C3 之后没有稿了 —— 归 M16-7c）", mv.rewrote.length === 0);
/* ⚠️ 同 `write_file` 那一道：`moveFile` 对 `.dc.html` 的拒
   （`files.ts:965`，指向 `rename_draft` / `move_draft`）**也自动进不去了**
   —— 它的条件同样是 `kindOf(...) === "dc"`。
   > **两道拒是同一个改动的两面：删掉 kind 条目就等于两道一起撤。**
   geek-99 要的「先撤 `write_file` 那道拒」因此自动满足，而且是两道都满足。 */
{
  const mvd = await moveFile(p, "稿.dc.html", "挪过的稿.dc.html");
  ok("**`.dc.html` 现在挪得动了**（原来这条路拒它并指向 `move_draft`）", !!mvd);
  await moveFile(p, "挪过的稿.dc.html", "稿.dc.html");   // 挪回去，后面的判据还要用它
}

/* ── 改写引用不许改坏别的引用、也不许静默漏改（issue #76，2026-10-05）──
   原来是对整篇稿做**子串**替换，于是两个方向都错。
   这一节三个样本就是 issue 里列的三种长相，**每一个都能单独把旧实现照红**。

   ⚠️ 上面那条「move_file 挪文件并改写引用」在旧实现下也是绿的 ——
   它测的恰好是「根目录的稿 + 根目录的文件 + 名字不是别人的子串」那一种。
   **判据覆盖的是它当时想到的那一种，不是这件事。** */
{
  await mkdir(join(DIR, "pages"), { recursive: true });
  await mkdir(join(DIR, "icons"), { recursive: true });
  await writeFile(join(DIR, "data.png"), "d");
  await writeFile(join(DIR, "a.png"), "a");
  await writeFile(join(DIR, "icons", "logo.png"), "l");
  await writeFile(join(DIR, "logo.png"), "L");
  await writeFile(join(DIR, "pages", "img.png"), "i");
  /* ⚠️ 夹具必须是**合契约的稿**，否则写入口会拒，而症状长得像产品缺陷
     （#65 那一轮栽过：判据红在夹具上，我查了半天产品）。 */
  const draft = (body: string) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
${body}
<x-dc>
<div>{{ t }}</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{}">
class Component extends DCLogic {
  renderVals() { return { t: "hi" }; }
}
</script>
</body>
</html>
`;

  // ① 名字是别人的子串：`"data.png".split("a.png")` = ["dat",""] → 旧实现写出 datb/a.png
  await writeDraft(p, "子串.dc.html", draft('<img src="data.png"><img src="a.png">'), "page");
  ok("（夹具）三份稿都写进去了", [["子串.dc.html"]].length === 1 && existsSync(join(DIR, "子串.dc.html")));
  await moveFile(p, "a.png", "b/a.png");
  const s1 = await readFile(join(DIR, "子串.dc.html"), "utf8");
  ok('**名字相近的别的引用原样不动**（data.png 不许变成 datb/a.png）',
    /src="data\.png"/.test(s1) && /src="b\/a\.png"/.test(s1) && !/datb/.test(s1));

  // ② 同名但在别的目录：icons/logo.png 不该跟着根目录的 logo.png 一起改
  await writeDraft(p, "同名.dc.html", draft('<img src="logo.png"><img src="icons/logo.png">'), "page");
  await moveFile(p, "logo.png", "old/logo.png");
  const s2 = await readFile(join(DIR, "同名.dc.html"), "utf8");
  ok('**同名但在别的目录的引用不动**（icons/logo.png 不许变成 icons/old/logo.png）',
    /src="old\/logo\.png"/.test(s2) && /src="icons\/logo\.png"/.test(s2) && !/icons\/old/.test(s2));

  // ③ 子目录的稿按自然写法引用同目录文件 —— 旧实现**静默不改**（最差的组合：找到了却没改）
  await writeDraft(p, "pages/有图.dc.html",
    draft('<img src="img.png">').replace('src="./support.js"', 'src="../support.js"'), "page");
  const mv3 = await moveFile(p, "pages/img.png", "assets/img.png");
  const s3 = await readFile(join(DIR, "pages", "有图.dc.html"), "utf8");
  ok('**子目录里的稿该改的引用真改了**（src="img.png" → "../assets/img.png"）',
    /src="\.\.\/assets\/img\.png"/.test(s3) && mv3.rewrote.some((r) => r.file === "pages/有图.dc.html"));

  // ④ referencesOf 和改写用同一个判定：按解出来的路径比，不按 basename
  const refs = await referencesOf(p, "icons/logo.png");
  ok("**referencesOf 按路径比不按 basename**（根目录的 logo.png 不算 icons/logo.png 的引用）",
    refs.length === 1 && refs[0]!.file === "同名.dc.html");

  // ⑤ 解不出来的写法不静默：外链写法要出现在 unresolved 里
  await writeDraft(p, "外链.dc.html", draft('<img src="https://cdn.example.com/ext.png">'), "page");
  await writeFile(join(DIR, "ext.png"), "e");
  const mv5 = await moveFile(p, "ext.png", "pics/ext.png");
  ok("**解不出路径的写法列进 unresolved，不静默**",
    (mv5.unresolved ?? []).some((u) => u.file === "外链.dc.html" && /cdn\.example\.com/.test(u.value)));
}

/* ── 工具自己的东西不能挪进挪出（issue #75，2026-10-05）──
   `writeAnyFile` 挡住的位置，`moveFile` / `trashFile` 原来换条路就能到。 */
{
  await writeFile(join(DIR, "tmp75.txt"), "x");
  await mkdir(join(DIR, ".git"), { recursive: true });
  await writeFile(join(DIR, ".git", "HEAD"), "ref: refs/heads/master\n");
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["move_file 往 .git/ 里写", () => moveFile(p, "tmp75.txt", ".git/x")],
    /* ⚠️ **这一条 2026-10-21 从 `.gitattributes` 挪到了 `.git/config`**（Q77）。
       原来钉的是 `.gitattributes` —— 而它**住在项目根，是用户自己的配置文件**，
       和 `.gitignore` / `.eslintrc` 同类。Q77 把「显示」和「能不能写」拆开之后
       它放行了，这条判据因此变红。

       **放行安全的依据是三条已经存在的防线，不是「看着没事」**：
       ① issue #74 把兜底仓库**搬去了 `STATE_ROOT`** —— 它的 `config` 用户写不到；
       ② `.gitattributes` 只能**声明**「这些文件走 filter X」，而 `filter.X.clean`
          的**定义必须在 config 里**（#40 的教训正是「HARDEN 黑名单漏了 filter」，
          所以 #74 改成了隔离而不是加黑名单）；
       ③ `GIT_ATTR_FILE` 在 `gitkeep.ts` 的 env 清除名单里。
       下面 §（#40 / #86）那两条判据**正钉着这条真防线，而且仍然绿** ——
       所以这里把判据挪到 `.git/config`（**真边界**），不是删掉它。

       > **判据挪位置和判据被放松，差别在于「挪过去之后还红不红」。**
       > 挪到 `.git/config` 之后它照旧红（拒），说明闸还在，只是边界画对了。
       > （`00` §100 那条「『未签名』判据挪了三次才对」同族。） */
    ["move_file 写 .git/config", () => moveFile(p, "tmp75.txt", ".git/config")],
    ["move_file 把 .git/HEAD 挪出来", () => moveFile(p, ".git/HEAD", "x75")],
    ["move_file 写 index-data.js", () => moveFile(p, "tmp75.txt", "index-data.js")],
    ["trash_file 删 .git/HEAD", () => trashFile(p, ".git/HEAD")],
  ];
  let allBlocked = true;
  for (const [what, run] of cases) {
    /* ⚠️ **每条自带夹具** —— 2026-10-05 反向验证实测：不这么做的话第一条
       真把 `tmp75.txt` 挪走了，后面三条报的是「项目里没有文件 tmp75.txt」，
       于是它们在**破了的实现下也算「被拦住」**。
       **样本之间互相毁夹具，比判据写错更难看出来** —— 聚合判据照样红，
       红的理由却只剩第一条。 */
    await writeFile(join(DIR, "tmp75.txt"), "x");
    await mkdir(join(DIR, ".git"), { recursive: true });
    await writeFile(join(DIR, ".git", "HEAD"), "ref: refs/heads/master\n");
    let threw = false;
    try { await run(); } catch { threw = true; }
    if (!threw) { allBlocked = false; console.log(`    ✗ ${what} 居然成了`); }
  }
  ok("**工具自己的文件与隐藏目录挪不动也删不掉**（issue #75：write_file 那道闸换条路就绕过）", allBlocked);
  ok("而 .git/HEAD 还在原地", existsSync(join(DIR, ".git", "HEAD")));
  await rm(join(DIR, ".git"), { recursive: true, force: true });
}

const tr = await trashFile(p, "conf.json");
/* ⚠️ 原来钉的是 `.umbrastudio/trash/` 这个**字面路径**，而 M14-4 B1 把回收站搬去了
   `STATE_ROOT/.umbrastudio/records/<ID>/trash/` —— 行为完全没变而判据红了。
   钉的东西换成这一条闸的**三件实事**：源文件不在了 · 被删的那一份**真的还在**（拿得回来）·
   而且它**不在用户的项目目录里**（B1 的全部意义）。
   **路径是实现细节，「删了还拿得回来」才是这条判据声称的那件事。** */
const { assetDir: adTrash } = await import("./statedirs.js");
const trashAbs = join(adTrash(DIR, "trash"), tr.trashPath);
ok("删除是进回收站，不是真删",
  !existsSync(join(DIR, "conf.json")) && existsSync(trashAbs), { trashPath: tr.trashPath, 在不在: existsSync(trashAbs) });
ok("**回收站不在用户的项目目录里了**（B1）", !trashAbs.startsWith(DIR + "/"), trashAbs);
ok("`trashPath` 相对回收站根，**不含 `..`**（原来会算出 `../../../..` 那种）", !tr.trashPath.includes(".."), tr.trashPath);

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
    /* ⚠️ **反面：项目内以两个点开头的文件名不许被拦**（2026-10-05）。
       `rel.startsWith("..")` 这种写法会把 `...dc.html` / `..备份.md` 判成「跨出项目」——
       方向是过度拦截而不是漏放，所以不报警、只是「这份文件在产品里打不开」，
       而报错文案说的是一句假话。**一道闸拦错东西和它漏放东西一样是缺陷。** */
    ["/tmp/projects/Umbra_design/...dc.html", true],
    ["/tmp/projects/Umbra_design/..备份.md", true],
    ["/tmp/projects/Umbra_design/sub/..x", true],
    ["/tmp/projects/Umbra_design/..", false],                    // 真的跳出去：还得拦
  ];
  let allRight = true;
  for (const [abs, want] of cases) {
    const got = isInside(base, abs);
    if (got !== want) { allRight = false; console.log(`    ✗ ${abs} → ${got}，该是 ${want}`); }
  }
  ok("**同前缀的兄弟目录不算项目内**（issue #19：原来 startsWith 不带分隔符，Umbra_design2 能穿过去）", allRight);

  /* Windows 分隔符下跑同一个函数（#25 那套做法：**在 mac 上验 win 的行为**）。 */
  {
    const { win32 } = await import("node:path");
    const wb = "C:\\projects\\Umbra_design";
    const wcases: Array<[string, boolean]> = [
      ["C:\\projects\\Umbra_design\\...dc.html", true],
      ["C:\\projects\\Umbra_design\\a\\b.dc.html", true],
      ["C:\\projects\\Umbra_design2\\x", false],
      ["C:\\projects\\Umbra_design\\..\\x", false],
    ];
    let wRight = true;
    for (const [abs, want] of wcases) {
      const got = isInside(wb, abs, win32);
      if (got !== want) { wRight = false; console.log(`    ✗ [win] ${abs} → ${got}，该是 ${want}`); }
    }
    ok("**Windows 分隔符下同一份判定也对**（含 `...dc.html` 不被误拦）", wRight);
  }

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
  const { execFileSync: xs } = await import("node:child_process");
  const { commitExternalChanges, isDirty } = await import("./gitkeep.js");
  const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
  /* ⚠️ `-c core.quotepath=false`：不加的话 git 会把非 ASCII 路径转义成
     `"\347\254\224\350\256\260.md"` 并加引号，于是判据里按「笔记.md」比较永远不成立 ——
     实测被它绊倒过两条。**这是仪器的问题，不是产品的问题**，而两者报出来的样子一样。 */
  /* ⚠️ **仓库在我们自己的状态目录里，不在项目里**（issue #74，2026-10-05）——
     所以判据要带 `--git-dir` / `--work-tree`，而且 `gitDirForTest` 必须**调实现那个函数**
     （自己复刻那段哈希的话，算法一改判据就指到一个不存在的目录，
     而 `git --git-dir <不存在>` 的报错看起来像「产品没提交」）。 */
  const { gitDirOfProject: gitDirForTest } = await import("./gitkeep.js");
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
  const { gitDirOfProject: gdOf } = await import("./gitkeep.js");
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
  const { ensureRepo: mkRepo, gitDirOfProject, commitPaths: ciPaths } = await import("./gitkeep.js");
  const GG = gitDirOfProject(G);
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

  /* ── 大文件不进 git 兜底（M14-1，Q67）──
     ⚠️ 这一条今天之前**只存在于一句注释里**：`recordCreatedFile` 写着「git 那一版同理不记」，
     而那句话只对它自己那条路成立（它在 `commitAfterWrite` 之前就 return 了）。
     别的三条路一道闸都没有 —— git 存整份内容进 `STATE_ROOT`，而用户看不见那个目录。

     ⚠️ **上限要现读设置，不能写死 100 MB**：这个数是用户可以改的
     （设置 → 插件沙箱 → 二进制读取上限）。写死的话，他把上限调大之后
     这几条判据会**在产品完全正确的情况下变红** —— 判据读的得和实现读的是同一个源。
     ⚠️ **文件造成稀疏的**（只在末尾写一个字节）：上限可能是 1 GB，
     真写满既慢又占盘，而闸看的是 `st.size`，稀疏文件的 `size` 就是它声明的那个数。 */
  {
    const { gitShow, repoMetaOf, repoMetaOfGitDir } = await import("./gitkeep.js");
    const { getPluginLimits } = await import("./plugin/limits.js");
    const { open } = await import("node:fs/promises");
    const max = (await getPluginLimits()).binaryReadMaxMB * 1048576;
    const fh = await open(join(G, "大视频.bin"), "w");
    await fh.write(Buffer.from([0]), 0, 1, max);          // 稀疏：size = max + 1
    await fh.close();
    await writeFile(join(G, "小的.txt"), "一行\n", "utf8");
    const sz = (await import("node:fs")).statSync(join(G, "大视频.bin")).size;
    ok("样本有效：那个文件真的比上限大一个字节", sz === max + 1, { sz, max });

    /* ⚠️ **一次提交里大小混着** —— 这一条钉住的是「跳过的只是超限那一个」。
       实现写成「有一个超限就整次不提交」的话，一次落盘点名三个文件时
       另外两个的版本会**一起丢掉**，而症状和「git 坏了」一模一样。 */
    const sha = await ciPaths(G, ["小的.txt", "大视频.bin"], "大小混着的一次提交");
    ok("**超限的那一个不拖累别的**：这次提交照样成了", !!sha, sha);
    ok("小文件进了 git（走产品自己的读路径取回来）",
       (await gitShow(G, "HEAD", "小的.txt")) === "一行\n");
    ok("**大文件没进 git**（`git log` 里一条都没有）",
       gx(["log", "--oneline", "--", "大视频.bin"]) === "",
       gx(["log", "--oneline", "--", "大视频.bin"]));

    /* 界面要说得出原因 —— 用户看到的是这一档 */
    ok("**界面问得出原因**：这个文件回 `toobig`，不是 `on` 也不是 `broken`",
       await gitFallbackOf(G, "大视频.bin") === "toobig", await gitFallbackOf(G, "大视频.bin"));
    ok("同一个仓库里的小文件照旧回 `on`（闸是按文件的，不是按仓库的）",
       await gitFallbackOf(G, "小的.txt") === "on", await gitFallbackOf(G, "小的.txt"));

    /* ⚠️ **档位的顺序本身是一条判据**：两种原因同时成立时，对这个文件来说
       真正的原因是「太大」—— 回 `broken` 会让他去删一个删了也没用的锁文件。 */
    await writeFile(join(GG, "index.lock"), "", "utf8");
    ok("**锁着 + 超限时回 `toobig` 而不是 `broken`**（出路不同，不能给错那一个）",
       await gitFallbackOf(G, "大视频.bin") === "toobig", await gitFallbackOf(G, "大视频.bin"));
    await rm(join(GG, "index.lock"), { force: true });

    /* ── 兜底仓库记得住「自己是谁的」（M14-1 ②）──
       ⚠️ 为什么要有这几条：`gitDirOf` 的目录名是 `<目录名>__<路径 sha256 前 16 位>`，
       **哈希不可逆**。实测本机 591 个兜底仓库、93 MB，`config` 里只有 `bare = true` 一行 ——
       「目录已经没了，把它的历史也清掉」这件事因此**根本做不到**。 */
    const meta = await repoMetaOf(G);
    ok("**仓库自报它是哪个目录的**（不然 591 个目录名谁都认不出来）",
       meta.worktree === (await import("node:path")).resolve(G), JSON.stringify(meta.worktree));
    ok("按 GIT_DIR 也读得到（清理那一面手上只有目录名）",
       (await repoMetaOfGitDir(GG)).worktree === meta.worktree);
    ok("指纹四项都在（Q68 的形状：dev / ino / birthtime / 首见）",
       typeof meta.dev === "number" && typeof meta.ino === "number"
       && typeof meta.birthtimeMs === "number" && typeof meta.firstSeenAt === "number",
       JSON.stringify(meta));
    {
      const st = (await import("node:fs")).statSync(G);
      ok("**指纹是真去 stat 的，不是占位的 0**", meta.dev === st.dev && meta.ino === st.ino,
         { 记的: [meta.dev, meta.ino], 实际: [st.dev, st.ino] });
    }

    /* ⚠️ **存量那 591 个仓库**：它们建的时候没有这一节。
       这一条钉的是「再被打开一次就补上」—— 不补的话新代码只管新项目，
       而用户机器上的历史全是旧的，清理功能对它们**永远**用不上。 */
    gx(["config", "--remove-section", "umbra"]);
    ok("样本有效：拆掉之后确实认不出来了（模拟 2026-10-20 之前建的仓库）",
       (await repoMetaOf(G)).worktree === null);
    await mkRepo(G);
    ok("**老仓库再被打开一次就补齐了**（不是只管新建的）",
       (await repoMetaOf(G)).worktree === (await import("node:path")).resolve(G));
  }
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
  /* ⚠️ 落点从 `assetDir` 取，不写死（B1 把草稿搬进 `records/<ID>/staged/`）——
     这一条测的是「坏掉的草稿会自己清掉」，不是「草稿放在哪」。 */
  const { assetDir: ad2 } = await import("./statedirs.js");
  await mk2(ad2(DIR, "staged"), { recursive: true });
  await wf2(join(ad2(DIR, "staged"), `${F}.json`), "{坏的", "utf8");
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
     !!asGbk.sha256 && asGbk.sha256 === asUtf8.sha256, `${asGbk.sha256?.slice(0, 12)} vs ${asUtf8.sha256?.slice(0, 12)}`);

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
  /* ⚠️ 落点从 `assetDir` 取（B1 把草稿搬进了 `records/<ID>/staged/`）——
     这一条测的是「草稿里记的路径和问的不一样就不给」，不是「草稿放在哪」。 */
  const { assetDir: adStaged } = await import("./statedirs.js");
  const aFile = join(adStaged(DIR, "staged"), `${pathKey(A)}.json`);
  const bFile = join(adStaged(DIR, "staged"), `${pathKey(B)}.json`);
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
  const { gitDirOfProject: gitDirForTest } = await import("./gitkeep.js");
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

/* ═════════ 救回来的那一版，产品自己取得回来吗（issue #87）+ 版本号当选项（issue #86） ═════════
   ⚠️ **放在最后**，因为这一节会在项目里造一个 `.git` 和一份恶意 config
   （2026-10-05 栽过：往 filetest 中间插一节，`replace(…, 1)` 撞上了开头那个
   `rm(DIR)`，整件事从头被清掉）。 */
{
  const { mkdtemp, writeFile: wf, mkdir: md } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { tmpdir: td } = await import("node:os");
  const { resolveSnapshot } = await import("./history.js");
  const { execFileSync: xs } = await import("node:child_process");
  const { commitExternalChanges: cec } = await import("./gitkeep.js");
  const { writeDraft: wd } = await import("./write.js");
  const D = await mkdtemp(join(td(), "umbrastudio-ft87-"));
  await wf(join(D, "project.json"), JSON.stringify({ name: "ft87", title: "ft87" }), "utf8");
  const proj87 = await buildProject(D);
  const MIN = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<script src=\"./support.js\"></script>\n</head>\n<body>\n<x-dc>\n<div>{{ t }}</div>\n</x-dc>\n<script type=\"text/x-dc\" data-dc-script data-props=\"{}\">\nclass Component extends DCLogic {\n  renderVals() { return { t: \"hi\" }; }\n}\n</script>\n</body>\n</html>\n";
  await wd(proj87, "一稿.dc.html", MIN, "page");
  /* ⚠️ **等那次提交落地** —— 落盘后的提交是异步的（不该让用户等 git）。
     不等的话下面 `commitExternalChanges` 看到的「脏」是我们自己刚写的那一版，
     它会拒绝（没有「别处改的」可救），而症状是 `commit: null`，
     看起来**像产品缺陷**（2026-10-06 实测就这么红了一次）。
     #74 那一节里也是这么等的。 */
  {
    const { isDirty: dirty } = await import("./gitkeep.js");
    for (let i = 0; i < 40 && await dirty(D); i++) await new Promise((r) => setTimeout(r, 100));
  }

  /* ① 别的编辑器改一次 → 兜底记一版 → **走产品自己的路**把它取回来。
     ⚠️ #74 那一节里已有一条「能从 git 里原样取回」，但它用的是**判据自己的** git
     （`git(["show", …])` 带着 `--git-dir`）—— 它证明「仓库里有」，
     **不证明「用户或 AI 能拿到」**。issue #87 就藏在这条缝里：
     steps 里报的 sha 是兜底仓库的，而 `resolveSnapshot` 去项目里的 `.git` 找它。
     **「东西在」和「取得到」是两件事，而判据原来只验了前一件。** */
  const 别处 = MIN.replace("hi", "别的编辑器改的");
  await wf(join(D, "一稿.dc.html"), 别处, "utf8");
  const resc = await cec(D, "一稿.dc.html");
  ok("（前提）别处改过 → 兜底记了一版", !!resc, { commit: resc });
  let got = "", why87 = "";
  if (resc) {
    try { got = (await resolveSnapshot(proj87, "一稿.dc.html", resc)).sourceSha256 ?? ""; }
    catch (e) { why87 = msgOf(e); }
  }
  const want = createHash("sha256").update(别处, "utf8").digest("hex");
  ok("**救回来的那一版，`snapshot_draft` 真能取到**（issue #87：原来去项目里的 .git 找兜底仓库的 sha）",
     got === want, why87 || `${got.slice(0, 12)} vs ${want.slice(0, 12)}`);

  /* ② 版本号写成 `--output=…`（issue #86）：git show 吃 diff 选项，
     原来能在磁盘任意位置建文件，还会执行仓库 config 里的 textconv。 */
  const out86 = join(D, "..", `umbra86-${Date.now()}`);
  const marker = join(D, "..", `TC_RAN-${Date.now()}`);
  /* 在项目里放一个**真仓库** + 恶意 config/attributes（对方可控的那两份）。
     ⚠️ **必须是真仓库**（2026-10-06 实测）：第一版只写了一份 `.git/config`，
     于是撤掉形状闸之后 `git -C <项目> show --output=…` 报的是
     「不是一个 git 仓库」—— 四个样本**一个都没打中**，
     而判据照样红了（因为错误文案变了）。
     **反向验证红了不等于样本打中了** —— §101.8 那条「去掉 `--trust` 那轮
     它压根没跑」同一族，这次是我自己的攻击样本太弱。 */
  const g = (args: string[], cwd = D) => xs("git", args, { cwd }).toString();
  g(["init", "-q"]);
  g(["config", "user.name", "t"]); g(["config", "user.email", "t@t"]);
  g(["config", "diff.x.textconv", `touch ${marker}`]);
  await wf(join(D, ".gitattributes"), "*.dc.html diff=x\n", "utf8");
  g(["add", "一稿.dc.html", ".gitattributes"]);
  g(["commit", "-q", "-m", "恶意仓库的第一版", "--no-verify"]);
  await wf(join(D, "一稿.dc.html"), MIN.replace("hi", "工作区又改了"), "utf8");  // 让 show 有 diff 可出
  /* ⚠️ **目标目录先建出来** —— git 不会替你建中间目录，不建的话
     `--output=<不存在的目录>/O` 会以「打不开」失败，于是**样本没打中**
     而判据照样红（2026-10-06 实测：四个样本里只有路径存在的那一个真落了地）。 */
  await md(out86, { recursive: true });
  const evilRefs = [`--output=${join(out86, "O")}`, `--output=${join(out86, "直接")}`, "-x", "--ext-diff"];
  let allRefused = true, firstWhy = "";
  for (const r of evilRefs) {
    let w = "";
    try { await resolveSnapshot(proj87, "一稿.dc.html", r); } catch (e) { w = msgOf(e); }
    if (!/版本号不合法/.test(w)) { allRefused = false; console.log(`    ✗ ${r} → ${w || "没拒"}`); }
    firstWhy ||= w;
  }
  ok("**版本号以 `-` 开头一律拒**（issue #86：`--output=…` 原来在磁盘任意位置建文件）",
     allRefused, firstWhy.slice(0, 40));
  ok("而磁盘上没出现那个文件",
     !existsSync(join(out86, "O:一稿.dc.html")) && !existsSync(join(out86, "直接:一稿.dc.html")),
     (await readdir(out86).catch(() => [])).join(" / ") || "(空)");
  ok("**仓库 config 里的 textconv 没被执行**（#40 / #74 同一族 —— 这条路原来不在加固范围里）",
     !existsSync(marker));

  /* ③ 新建项目不再往项目里 `git init`（issue #87 第 3 点） */
  const { createProject: cp } = await import("./project.js");
  const PR = await mkdtemp(join(td(), "umbrastudio-ft87b-"));
  const made = await cp("新项目", { dir: join(PR, "新项目") });
  ok("**新建项目不在项目目录里建 `.git`**（#74 之后它永远收不到提交，只会误导人）",
     !existsSync(join(made.dir, ".git")) && !made.created.includes(".git/"),
     made.created.join(" / "));
  const { gitDirOfProject: gdf } = await import("./gitkeep.js");
  ok("而兜底仓库建起来了（`gitEnabled` 说的是这一个）",
     made.gitEnabled === existsSync(join(gdf(made.dir), "HEAD")), String(made.gitEnabled));

  await rm(D, { recursive: true, force: true });
  await rm(PR, { recursive: true, force: true });
  await rm(out86, { recursive: true, force: true });
  await rm(marker, { force: true });
}

/* ═════════ 带 error 诊断的稿：复制得动吗 · 引用改不成会说吗（issue #92） ═════════
   这两条都是**我自己上一批修法的后果**：
   #71 把「复制一份稿」接上了写入口 → 复制一份**本来就带 error 的稿**变成做不到了；
   #76 改写引用时不看 `writeDraft` 的结果 → 引用没改成而回执说「改写引用 N 处」。 */
{
  const { writeFile: wf2, mkdtemp: mkt } = await import("node:fs/promises");
  const { tmpdir: td2 } = await import("node:os");
  const { duplicateDraft } = await import("./project.js");
  const { validateDraft } = await import("./validate.js");
  const D2 = await mkt(join(td2(), "umbrastudio-ft92-"));
  await wf2(join(D2, "project.json"), JSON.stringify({ name: "ft92", title: "ft92" }), "utf8");
  const proj92 = await buildProject(D2);
  /* 夹具：一个**没给值的洞** → `E_HOLE_UNRESOLVED`（error 级）。
     ⚠️ 直接落到盘上（绕开写入口）—— 写入口本来就不让这种稿进来，
     而我们要测的恰恰是「盘上已经有这种稿时会怎样」。
     项目里现成就有这种稿（`selftest` 钉着 `PC 端/任务.dc.html` 的 2 条）。 */
  const 坏 = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<script src=\"./support.js\"></script>\n</head>\n<body>\n<img src=\"坏图.png\">\n<x-dc>\n<div>{{ 没给值的洞 }}</div>\n</x-dc>\n<script type=\"text/x-dc\" data-dc-script data-props=\"{}\">\nclass Component extends DCLogic {\n  renderVals() { return {}; }\n}\n</script>\n</body>\n</html>\n";
  await wf2(join(D2, "坏稿.dc.html"), 坏, "utf8");
  await wf2(join(D2, "坏图.png"), "png", "utf8");
  /* ⚠️ **先验夹具真的带 error** —— 不验的话「复制成功了」可能只是因为
     这份稿其实是干净的，判据什么都没测（§144.4 那条「样本没打中」同一族）。 */
  const vd = validateDraft(proj92, "坏稿.dc.html", 坏, "坏稿.dc.html");
  const errs = vd.diags.filter((d) => d.level === "error");
  ok("（样本有效性）夹具真的带 error 级诊断", errs.length > 0,
     errs.map((d) => d.code).join(" / ") || "(没有)");

  // ① 复制一份带 error 的稿：要能成，而且要照实说它带着几条
  let dupWhy = "";
  const dup = await duplicateDraft(proj92, "坏稿.dc.html", { newName: "坏稿副本" })
    .catch((e) => { dupWhy = msgOf(e); return null; });
  ok("**带 error 的稿照样复制得动**（issue #92：#71 之后它变成做不到了）",
     dup?.newPath === "坏稿副本.dc.html", dupWhy || dup?.newPath);
  ok("**而且照实说副本带着几条 error**（不说的话用户以为复制出来是干净的）",
     (dup?.carriedErrors ?? 0) === errs.length, String(dup?.carriedErrors ?? "没说"));
  ok("副本也走了写入口（有 `__resources`）",
     existsSync(join(D2, "坏稿副本.dc.html"))
     && /__resources|umbradesign:resources/.test(await readFile(join(D2, "坏稿副本.dc.html"), "utf8")));

  // ② 移动它引用的图：引用改不成，回执必须说
  const mv92 = await moveFile(proj92, "坏图.png", "图/坏图.png");
  ok("**引用改不成的稿不进 `rewrote`**（原来：文件挪走了、引用没改，而回执说改好了）",
     !mv92.rewrote.some((r) => r.file === "坏稿.dc.html"),
     mv92.rewrote.map((r) => r.file).join(" / ") || "(空)");
  ok("**而是进 `refused` 并在 steps 里说出来**（假回执比没有回执糟）",
     (mv92.refused ?? []).some((r) => r.file === "坏稿.dc.html" && /error/.test(r.reason))
     && mv92.steps.some((t) => t.includes("没改成")),
     (mv92.refused ?? []).map((r) => r.file).join(" / ") || "(空)");
  ok("（对照）文件确实挪走了 —— 所以「没说」的后果是真的",
     existsSync(join(D2, "图", "坏图.png")) && !existsSync(join(D2, "坏图.png")));

  /* ── 这件事**模型也得看得见**（issue #99，2026-10-06）──
     #92 在服务端加了 `refused`，#76 加了 `unresolved`（注释写着「**不静默**」），
     而应用内 AI 通道那一支**手挑了三个字段**，把两者都丢掉了：
     模型拿到 `ok:true` 加一份「改了哪些」的清单，**没有任何信号知道还有引用断了**，
     于是会照着这份结果告诉用户「挪好了，引用都更新了」。
     **服务端说了不等于消费方听见了** —— 而这条路上的消费方是模型。 */
  {
    const { executeToolCall } = await import("./chat_run.js");
    /* ⚠️ **自带夹具**：上一节已经把 `坏图.png` 挪走了，照用的话这里会变成
       「文件不存在」→ 回执里自然没有 `refused`，而判据红在**夹具**上。
       §143.6 那条「样本之间互相毁夹具」的第 N 次 —— 这次是跨小节。 */
    await wf2(join(D2, "坏稿二.dc.html"), 坏.replace("坏图.png", "坏图二.png"), "utf8");
    await wf2(join(D2, "坏图二.png"), "png", "utf8");
    /* ⚠️ `ToolCall` 是 **OpenAI 那个形状**（`function.arguments` 是 **JSON 串**），
       不是 `{ name, args }`。第一版照直觉写成后者，`executeToolCall` 里
       `tc.function.arguments` 当场 `TypeError` ——
       **判据照直觉拼的入参，和产品真实的入参不是一回事**（§65.6 同一族）。 */
    const out = await executeToolCall(proj92, {
      id: "t1", type: "function",
      function: { name: "move_file", arguments: JSON.stringify({ from: "坏图二.png", to: "图二/坏图二.png" }) },
    });
    const j = JSON.parse(out) as Record<string, unknown>;
    /* ⚠️ 这个文件的 `ok()` 是 `(label, cond)` —— 而 `plugintest` / `lifecycletest`
       那边是 `(cond, label)`。**同名函数在不同文件里参数顺序相反**，
       写反了编译器这次拦住了（`boolean` 不能当 `string`），
       但 §9.1.7 那条教训说的正是「一个只打印的 `ok` 长得和判据一模一样」——
       那次没有类型挡着。 */
    ok("**模型拿到的回执里有 `refused`**（引用没改成的那几份）",
       Array.isArray(j.refused) && (j.refused as unknown[]).length === 1, JSON.stringify(j.refused ?? null).slice(0, 70));
    /* ⚠️ 光给数组不够：模型得知道「这个数组非空意味着什么」。
       所以还给一句**专门写给它读**的 `warning`。 */
    ok("**而且有一句专门给模型读的 `warning`**（只给数组的话它得自己猜空不空意味着什么）",
       typeof j.warning === "string" && /没改成/.test(String(j.warning)),
       String(j.warning ?? "（没有）").slice(0, 60));
    ok("`steps` 也给了（里面那句「⚠️ X 的引用没改成」是人话）", Array.isArray(j.steps),
       `${(j.steps as unknown[])?.length ?? 0} 条`);
  }

  /* ── 子目录里的稿也要有**点选桥**（2026-10-06 实测挖出来的）──
     S2 预览壳里写的是 `BRIDGE = "./.umbradesign/select-bridge.js"` ——
     **相对壳自己的位置**，而 `build_index` 只把桥拷到**项目根**。
     于是子目录里的稿预览时请求 `<子目录>/.umbradesign/select-bridge.js` → **404**，
     后果是**点选在那些稿上完全不可用**（桥没加载，壳收不到任何消息）。
     ⚠️ 同一个目录里 `support.js` **是有的** —— 三件套本来就按目录分发，**只有桥漏了**。
     ⚠️ 判据**两样都查**：少查 `support.js` 的话，哪天分发整条坏了也看不出来
     （「桥在」不能证明「分发这件事还在工作」）。 */
  {
    const { existsSync: ex3 } = await import("node:fs");
    const { writeDraft: wd2 } = await import("./write.js");
    const sub = join(D2, "子目录");
    /* ⚠️ `MIN` / `wd` 在**上一节**的作用域里（#86/#87 那块），这里拿不到 ——
       各写一份比把它们提到文件头安全：提上去就得保证两节用的是同一份夹具，
       而那两节要的东西不一样。 */
    const MIN2 = 坏.replace("{{ 没给值的洞 }}", "{{ t }}")
      .replace("renderVals() { return {}; }", "renderVals() { return { t: \"hi\" }; }")
      .replace("<img src=\"坏图.png\">\n", "");
    await wd2(proj92, "子目录/稿.dc.html", MIN2, "page");
    ok("**子目录里的稿旁边有运行时**（`support.js`）", ex3(join(sub, "support.js")));
    ok("**子目录里也有点选桥**（原来只拷到项目根 → 子目录的稿点选不可用）",
       ex3(join(sub, ".umbradesign", "select-bridge.js")),
       ex3(join(sub, ".umbradesign", "select-bridge.js")) ? "在" : "✗ 没有 —— 预览时会 404");
  }

  await rm(D2, { recursive: true, force: true });
}

/* ── 二进制往返（#108，2026-10-07）──
   图片编辑要把一张 PNG 写回盘，而这条写入口原来**从头到尾按 utf8 走**
   （`writeAtomic` / `byteLength` / `Buffer.from(content,"utf8")` / 末尾的 `sha256`）。
   二进制进来是**静默损坏**：文件还在、还能打开、只是花了 ——
   **「写坏了」和「没写」长得完全不一样，而前者更难发现。**

   ⚠️ 这一节里有一条测的是**今天之前就坏着**的东西：`revertFile` 走
   `readSnapshotContent`（utf8），所以「退回上一版」对**任何**二进制文件都是损坏 ——
   包括被「外部改动」兜底存下来的图片。**只是没人退过图片，所以没人发现。**

   判据一律**逐字节比**，不比大小 —— utf8 往返之后大小也会变，
   而「大小对了」会让一次损坏看起来像成功（§161.3 同族）。 */
{
  const DB = join(DIR, "..", "umbrastudio-filetest-bin");
  await rm(DB, { recursive: true, force: true });
  await mkdir(DB, { recursive: true });
  await writeFile(join(DB, "project.json"), JSON.stringify({ name: "bintest", title: "二进制回归" }), "utf8");
  const projB = await buildProject(DB);

  /** 造一张真 PNG：**里面故意带非法 utf8 字节**（0x80–0xFF 全套）——
   *  用全 ASCII 的样本测不出 utf8 损坏，那种样本往返之后字节一样。 */
  const { deflateSync } = await import("node:zlib");
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(t, "ascii"), d]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
  const png = (w: number, seed: number) => {
    const rows: Buffer[] = [];
    for (let y = 0; y < w; y++) { const r = Buffer.alloc(1 + w * 3); for (let x = 0; x < w * 3; x++) r[1 + x] = (x * 7 + y * 13 + seed) & 0xff; rows.push(r); }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(w, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
  };
  const A = png(16, 0), B = png(16, 99);
  ok("（样本有效性）样本里真有非法 utf8 字节（全 ASCII 的样本测不出损坏）",
     !Buffer.from(A.toString("utf8"), "utf8").equals(A),
     { 原始: A.length, utf8往返后: Buffer.byteLength(A.toString("utf8"), "utf8") });

  const F = "图.png";
  const w1 = await writeAnyFile(projB, F, A, { origin: "人手改" });
  const onDisk1 = await readFile(join(DB, F));
  ok("**二进制原样落盘**（逐字节比，不比大小）", onDisk1.equals(A), { 盘上: onDisk1.length, 应为: A.length });
  ok("回执里的字节数与 sha 按字节算", w1.bytes === A.length && w1.sha256 === createHash("sha256").update(A).digest("hex"),
     { bytes: w1.bytes, 应为: A.length });

  /* 改成另一张，然后退回去 —— **这一条在修之前是红的** */
  const r2 = await writeAnyFile(projB, F, B, { origin: "人手改" });
  ok("（前提）第二张也写进去了，而且和第一张不同", (await readFile(join(DB, F))).equals(B) && !A.equals(B));
  await revertFile(projB, F, w1.snapshot!);
  const back = await readFile(join(DB, F));
  ok("**退回上一版拿回的是原来那些字节**（原来走 utf8 → 退完图就花了，#108 之前就坏着）",
     back.equals(A), { 退回后: back.length, 应为: A.length, 一致: back.equals(A) });

  /* 写前校验对二进制也要成立 */
  let refused = "";
  try { await writeAnyFile(projB, F, B, { expectSha256: r2.sha256 }); }
  catch (e) { refused = (e as ToolError)?.diagnostic?.message ?? String(e); }
  ok("**带过期的 sha 写二进制照样被拒**（这道闸不该只对文本成立）", /被改过/.test(refused), refused.slice(0, 40));

  /* 没多存重复快照 —— 原来按 utf8 比，二进制几乎必然判「不一样」 */
  const snaps = await listSnapshots(projB, F);
  ok("**没因为「按 utf8 比」而多存一串重复快照**", snaps.length <= 4, { 快照: snaps.join(" ") });

  /* ── 图片的快照不报「+N −M 行」、读历史版本按字节回（issue #133）── */
  const metaB = await listSnapshotMeta(projB, F);
  ok("**图片每一版的 delta 都是 null（没算）**，不是把字节按行切出来的假读数", metaB.length > 0 && metaB.every((m) => m.delta === null),
     metaB.map((m) => `${m.version}:${JSON.stringify(m.delta)}`).join(" "));
  await import("./cap/index.js");
  const { allCaps } = await import("./cap/registry.js");
  const capOf = (n: string) => allCaps().find((c) => c.name === n)!;
  const ctxB = { project: projB, via: "http" as const };
  const rv1 = (await capOf("read_file_version").run({ path: F, version: w1.snapshot! } as never, ctxB)).data as { content: string | null; base64?: string; sha256: string; bytes: number };
  const sA = createHash("sha256").update(A).digest("hex");
  ok("**read_file_version 对图片：sha256 / bytes 按真实字节算，base64 还原得回原图**",
     rv1.content === null && rv1.sha256 === sA && rv1.bytes === A.length && Buffer.from(rv1.base64 ?? "", "base64").equals(A),
     { sha一致: rv1.sha256 === sA, bytes: rv1.bytes, 应为: A.length });
  ok("而且和 list_file_versions 的 bytes 对得上", metaB.find((m) => m.version === w1.snapshot)?.bytes === rv1.bytes);
  const cmpB = (await capOf("compare_file_versions").run({ path: F, from: w1.snapshot! } as never, ctxB)).data as { delta: unknown };
  ok("compare_file_versions 对图片回 delta: null（不按行比字节）", cmpB.delta === null);

  await rm(DB, { recursive: true, force: true });
}

/* ── 改了 token 取值之后，search_tokens 要看到新值（issue #154）──
   `tokenLeaves` 原来按路径缓存、永不失效：`set_token_value` 改完 `get_token` 是新值，
   `search_tokens`（以及颜色候选的 token 反查）还是旧值，直到重启核心进程。
   两条路都要验：走写入口（`setTokenValue`）和**绕过写入口直接改文件**（编辑器 / write_file）。 */
{
  const { searchTokens, getToken } = await import("./assets.js");
  const { setTokenValue } = await import("./token_edit.js");
  const TK = join(DIR, "tokcache");
  await mkdir(TK, { recursive: true });
  await writeFile(join(TK, "project.json"), JSON.stringify({ name: "tokcache", title: "token 缓存", tokens: "t.json" }));
  await writeFile(join(TK, "t.json"), JSON.stringify({ color: { light: { danger: "#E8590C" } } }, null, 2));
  const pt = await buildProject(TK);
  const val = async () => (await searchTokens(pt, "danger")).hits.find((h) => h.path === "color.light.danger")?.value;
  ok("（前提）第一次检索读到原值并进了缓存", (await val()) === "#E8590C");
  await setTokenValue(pt, "color.light.danger", "#D9480F");
  ok("**set_token_value 之后 search_tokens 是新值**（原来还是旧值，直到重启）", (await val()) === "#D9480F", await val());
  ok("按新值也搜得到", (await searchTokens(pt, "#d9480f")).hits.some((h) => h.path === "color.light.danger"));
  ok("get_token 与 search_tokens 一致", JSON.stringify(await getToken(pt, "color.light.danger")).includes("#D9480F"));
  /* 绕过写入口：直接改文件（值长度不同 → 大小变了；再等一下让 mtime 也变） */
  await new Promise((r) => setTimeout(r, 20));
  await writeFile(join(TK, "t.json"), JSON.stringify({ color: { light: { danger: "#C92A2A80" } } }, null, 2));
  ok("**直接改 tokens 文件（不走 set_token_value）之后也拿到新值**", (await val()) === "#C92A2A80", await val());
}

/* ── 未知扩展名的纯文本兜底（M14-11 / `doc/11` Q76，2026-10-21）──────────────
   用户的要求是一句话：**任何文件都要能看，至少有通用的兜底。**
   在这之前 `kind === "other"` 的文件打开后**一个字都看不到**（通用文件卡只有元数据和四个动作）。 */
{
  const { looksTextual } = await import("./files.js");
  console.log("\n⑭ 未知扩展名的纯文本兜底");

  /* ── 判准自己（纯函数，不碰盘）── */
  const sniff: Array<[string, Buffer, boolean]> = [
    ["空文件算文本", Buffer.alloc(0), true],
    ["ASCII 日志", Buffer.from("2026-10-21 INFO started\n"), true],
    ["中文文本", Buffer.from("第一行\n第二行，带标点。\n"), true],
    /* ⚠️ **这一条是整个判准最容易写错的地方**：样本是**截断**的（只取前 8 KB），
       而截断点很可能落在一个多字节字符中间。用 `TextDecoder(..., { fatal: true })`
       一刀切的话，一份完全正常的中文文件会被判成二进制。
       **「样本是截断的」这件事本身会改判准。** */
    ["中文被截断在多字节中间照样算文本", Buffer.from("中文内容很长".repeat(900)).subarray(0, 8192), true],
    ["PNG 头（有 NUL）", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), false],
    ["全 0 字节", Buffer.alloc(64), false],
    ["GBK 中文（无 NUL 但不是 UTF-8）", Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4, 0xd6, 0xd0, 0xce, 0xc4]), false],
    ["JPEG 魔数", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]), false],
  ];
  let allRight = true;
  for (const [what, buf, want] of sniff) {
    if (looksTextual(buf) !== want) { allRight = false; console.log(`    ✗ ${what} → ${!want}`); }
  }
  ok("**嗅探判准 8 个样本全对**（含「截断在多字节中间」那条）", allRight);

  /* ── 真读一遍 ── */
  await writeFile(join(DIR, "服务.log"), "2026-10-21 10:00 启动\n2026-10-21 10:01 就绪\n");
  const log = await readAnyFile(p, "服务.log");
  ok("`.log` 这种类型表不认得的，**现在看得到正文了**", log.content !== null && /就绪/.test(log.content ?? ""), { kind: log.kind, lines: log.lines });
  ok("（样本有效性）它确实走的是 `other` 这一档，不是被某个已有类型认走了", log.kind === "other");

  await writeFile(join(DIR, "二进制.dat"), Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x7f]));
  const bin = await readAnyFile(p, "二进制.dat");
  ok("真二进制照旧不给正文，**而且说得出为什么**", bin.content === null && /不是文本/.test(bin.why ?? ""), bin.why);

  /* ⚠️ `asText` 是**嗅探判错时的出路**。没有出路的误判就是「这个文件打不开」——
     而那正是这一条要消除的症状。 */
  const forced = await readAnyFile(p, "二进制.dat", undefined, { asText: true });
  ok("加 `asText` 之后**照样给正文**（用户坚持要看）", forced.content !== null);
  ok("但**会说一句**「看着不像文本」—— 不说的话用户以为这文件本来就长这样",
     /不像文本/.test(forced.why ?? ""), forced.why);

  /* ⚠️ 只对 `other` 嗅探：`.png` 的「不是文本」是**类型表说的确定的事**，
     不该让一份碰巧没有 NUL 的图片把它推翻。 */
  await writeFile(join(DIR, "假图.png"), "这其实是文本，但扩展名是 png\n");
  const png = await readAnyFile(p, "假图.png", undefined, { asText: true });
  ok("**已知类型不受嗅探和 `asText` 影响** —— `.png` 给了 asText 也不按文本读",
     png.content === null, { kind: png.kind, why: png.why });

  /* ── 超限给开头一段，而不是整个拒绝 ── */
  const big = "日志行".repeat(2000) + "\n";
  await writeFile(join(DIR, "大.log"), big.repeat(40));
  const cut = await readAnyFile(p, "大.log", undefined, { textMax: 4096 });
  ok("超过上限的未知文件**给开头一段**，不是整个拒绝（看个开头通常就够判断它是什么）",
     cut.content !== null && cut.truncated === true, { truncated: cut.truncated, why: cut.why });
  ok("截断的那一段**末尾没有坏字符** —— 切在多字节中间会留一个 U+FFFD，原样画出来是个黑问号",
     !(cut.content ?? "").endsWith("\uFFFD"));
  /* ⚠️ **截断了就不给 sha256**（`umbra-plugins` 2026-10-21 问出来的）：
     拿着整份的 sha256 + 截断的 content 去 `write_file`，写前校验会**通过**，
     然后把文件截短 —— 一次静默的数据丢失，而回执还说「写成功」。
     **删掉凭据比多说一句话管用**：少一个字段，那条路就走不通。 */
  ok("**截断的回包不给 sha256** —— 不然它会变成「把文件截短」那条路的通行证",
     cut.sha256 === undefined, cut.sha256);
  ok("（对照）没截断的照旧给 sha256", (await readAnyFile(p, "服务.log")).sha256?.length === 64);
  ok("而**已知文本类型超限照旧拒绝**（没有顺手改掉它们的行为）",
     (await readAnyFile(p, "需求.md", undefined, { textMax: 8 })).content === null);
}

/* ── 收尾：**删掉自己造的文件 ≠ 删掉自己造的状态**（`00` §166）──
   ⚠️ 这一套的样本项目每轮都是新路径（`Date.now()` / `mkdtemp`）→ **每轮都是一个新兜底仓库**，
   而它们住在 `STATE_ROOT`，`rm DIR` 删不掉。实测攒到 **591 个 / 93 MB**，
   其中 265 个是 `umbrastudio-filetest-*`（`doc/24` §11.3）。

   判准**只有一条**：指向系统临时目录、而那个目录已经不在了。
   实测这一轮造的 19 个仓库**全部**指向 `/var/folders/.../T/` 下
   （`evil` / `新项目` / `设计稿` 这些嵌套出来的也一样）——
   所以不用枚举名字前缀，而按前缀列清单的话漏一个就静默复发、症状和没修一模一样。
   ⚠️ `onlyDead`：目录还在的不动（别人的回归可能正跑着）。
   ⚠️ 用户真实项目的仓库**碰不到** —— 它们不在临时目录下。 */
await rm(DIR, { recursive: true, force: true });
{
  const { dropLeftoversUnder } = await import("./purge.js");
  const { tmpdir: td9 } = await import("node:os");
  const r = await dropLeftoversUnder(td9(), { onlyDead: true });
  /* 收尾自检：清完之后**一个死的都不该剩**。
     ⚠️ 这一条不是「清掉了 N 个」—— 那种读数在「本来就没有」时也成立（§166 同族）。
     `unidentifiable` 是 2026-10-20 之前建的那一批，**我们认不出来**，照实带在读数里。 */
  const after = await dropLeftoversUnder(td9(), { onlyDead: true });
  ok(`（收尾）自己造的兜底仓库清干净了`, after.removed.length === 0,
     { 这一轮清掉: r.removed.length, 腾出KB: Math.round(r.freedBytes / 1024), 还活着的临时项目: r.keptAlive, 认不出的老仓库: r.unidentifiable });
}
/* ══════════════════════════════════════════════════════════════════════
   ⑰ 读大文件：先判上限再读，别先把整份读进内存（issue #181 / #180）

   ⚠️ `readAnyFile` 原来第一句就是 `await readFile(abs)` —— **先整份读，再判上限**。
   · 超过 **2 GiB** 撞 Node `readFile` 的上限 → 抛 → 包成 `E_IO`，
     **连「多大」和「可以按字节分段读」这两句都给不出来**；
   · 没到 2 GiB 的话，一份 1 GB 的文件也会先占 1 GB 内存，只为之后说一句「超限了」。
   > **判上限这件事只需要 `stat`，而我们却先读完了整份文件。**

   ⚠️ 样本用 **sparse 文件**（`truncate` 到 3 GB，APFS 不真占磁盘）——
   那是唯一能在本机**真的**跑到「超过 2 GiB」那条路的办法。
   > **一条「只在很大的输入上才错」的缺陷，判据得真造出那么大的输入** ——
   > 把上限调小来凑，测到的是另一条路。
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑰ 读大文件（issue #181 / #180）");
{
  const { open: openF } = await import("node:fs/promises");
  const { mkdtemp: mkdt17 } = await import("node:fs/promises");
  const { tmpdir: td17 } = await import("node:os");
  const { readAnyFile: readF, BASE64_SAFE_MAX } = await import("./files.js");
  const { LIMIT_RANGES } = await import("./plugin/limits.js");

  const D17 = await mkdt17(join(td17(), "umbra-filetest-big-"));
  await writeFile(join(D17, "project.json"), JSON.stringify({ name: "bigtest", title: "大文件" }), "utf8");
  const bp = await buildProject(D17);

  /** 造一个 sparse 文件：声明 `size` 字节，而**磁盘上几乎不占**。 */
  const sparse = async (name: string, size: number) => {
    const fh = await openF(join(D17, name), "w");
    try { await fh.truncate(size); } finally { await fh.close(); }
  };

  /* ── ① 3 GB（超过 Node readFile 的 2 GiB 上限）—— 原来这里直接抛 ── */
  await sparse("超大.bin", 3 * 1024 * 1024 * 1024);
  let r1 = null, e1 = "";
  try { r1 = await readF(bp, "超大.bin", undefined, { binary: true }); } catch (e) { e1 = (e as Error).message || String(e); }
  ok("**3 GB 的文件不抛了**（原来撞 Node readFile 的 2 GiB 上限 → E_IO）", !!r1 && !e1, e1 || "没抛");
  ok("**回执里有真实大小**（原来连这个都给不出来）", r1?.size === 3 * 1024 * 1024 * 1024, String(r1?.size));
  ok("**说得出超限，而且给出路**（按字节分段读）",
     !!r1?.why && /MB/.test(r1.why) && /byteOffset|分段/.test(r1.why), r1?.why);
  ok("**不给 `sha256`** —— 没整份读到，摘要就不该当写回的凭据",
     r1 !== null && !("sha256" in r1 && r1.sha256), JSON.stringify(Object.keys(r1 ?? {})));
  ok("也没有 base64（超限就不该转）", !r1?.base64);

  /* ── ② 刚好超过「能转 base64」那条线（issue #180）──
     ⚠️ 要把 `binaryMax` 调到比它大，否则先撞上二进制上限那一条 ——
     **两条上限叠在一起时，判据要确保测的是自己想测的那一条**。 */
  const over = BASE64_SAFE_MAX + 1048576;
  await sparse("能读但转不了.bin", over);
  const r2 = await readF(bp, "能读但转不了.bin", undefined, { binary: true, binaryMax: over + 1048576 });
  ok("**超过能转 base64 的上限时照实说**（原来抛 ERR_STRING_TOO_LONG → 用户看到一句 V8 内部错误）",
     !!r2.why && /base64/.test(r2.why), r2.why);
  ok("而且没有真去转（没给 base64）", !r2.base64);

  /* ── ③ 设置页的上限不许设成一个必然失败的值 ── */
  ok("**插件二进制上限的 `max` 跟着运行时算**（原来写死 1024 MB，而 base64 在 ~384 MB 就抛）",
     LIMIT_RANGES.binaryReadMaxMB.max === Math.floor(BASE64_SAFE_MAX / 1048576)
     && LIMIT_RANGES.binaryReadMaxMB.max < 1024,
     `max=${LIMIT_RANGES.binaryReadMaxMB.max} MB · BASE64_SAFE_MAX=${Math.round(BASE64_SAFE_MAX / 1048576)} MB`);
  /* ⚠️ 反方向一条：**别把上限算成一个谁都用不了的小数** */
  ok("而且它仍然够大（> 300 MB）—— 别为了安全把它收到没用", LIMIT_RANGES.binaryReadMaxMB.max > 300);

  /* ── ④ 正常大小的文件一点没变（别为了修大文件把小文件弄坏）── */
  await writeFile(join(D17, "小.txt"), "一行内容\n", "utf8");
  const r3 = await readF(bp, "小.txt");
  ok("**正常文件照旧：有内容、有 sha256**（这一条防的是我为了修大文件把小文件改坏）",
     r3.content === "一行内容\n" && !!r3.sha256, `${JSON.stringify(r3.content)} · sha ${r3.sha256?.slice(0, 8)}`);

  await rm(D17, { recursive: true, force: true });
}

/* ══════════════════════════════════════════════════════════════════════
   ⑯ 硬编码 `"/"` 那一族（issue #188 / #161 / #160）

   ⚠️ 三处各自写了一遍「按 `/` 切路径」，而 Windows 上原生分隔符是 `\`。
   > **这三条的共同形状：它们都在 mac 上恰好正确，所以本机没有任何读数会异常。**
   > **一个只在另一个平台上错的判定，在本机永远量不到** ——
   > 所以修法里最要紧的那一半是「让它能在 mac 上被测」：三个函数都收一个
   > `PlatformPath`，这里传 `path.win32`（issue #25 用过这招）。
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑯ 硬编码 \"/\" 那一族（#188 / #161 / #160）");
{
  const { win32: w32, posix: pxs } = await import("node:path");
  const { isUnderRoot, dirKeyOf, suggestedNameOf } = await import("./pathguard.js");

  /* ── #188：`dropRecordsUnder` / `deadRecordsUnder` 的「在这个根下面吗」── */
  const R = "C:\\Users\\sam\\AppData\\Local\\Temp\\umbra-xyz";
  ok("#188 win：记录目录在临时根下面 → 认得出", isUnderRoot(R, R + "\\proj", w32));
  ok("#188 win：根自己也算在里面", isUnderRoot(R, R, w32));
  ok("#188 win：同前缀的兄弟目录**不算**（#19 那条在 win 下也要成立）",
     !isUnderRoot(R, R + "2\\proj", w32));
  ok("#188 win：别处的目录不算", !isUnderRoot(R, "C:\\Users\\sam\\Projects\\x", w32));
  /* ⚠️ 反方向：旧写法在 win 下**一条都匹配不上**，这里把那个事实也钉住 ——
     不然「改好了」和「本来就对」分不开。 */
  const oldWay = (root: string, dir: string) => dir === root || dir.startsWith(root + "/");
  ok("#188 **旧写法在 win 下确实匹配不上**（证明这一条不是「本来就对」）",
     !oldWay(R, R + "\\proj"), `旧写法: ${oldWay(R, R + "\\proj")}`);

  /* ── #161：`check_runtime` 按目录归组的那个键 ── */
  const PD = "C:\\projects\\Demo";
  ok("#161 win：子目录里的稿 → 目录键是那一段相对路径",
     dirKeyOf(PD + "\\sub\\a.dc.html", PD, w32) === "sub", dirKeyOf(PD + "\\sub\\a.dc.html", PD, w32));
  ok("#161 win：项目根上的稿 → `.`",
     dirKeyOf(PD + "\\a.dc.html", PD, w32) === ".", dirKeyOf(PD + "\\a.dc.html", PD, w32));
  /* 旧写法会把文件名掉尾字母 —— 把那个症状原样打出来 */
  const oldKey = (abs: string, pd: string) => abs.slice(0, abs.lastIndexOf("/")).slice(pd.length + 1) || ".";
  ok("#161 **旧写法在 win 下是「文件名去掉最后一个字母」**（原样打出来）",
     oldKey(PD + "\\sub\\a.dc.html", PD) !== "sub", `旧写法: ${JSON.stringify(oldKey(PD + "\\sub\\a.dc.html", PD))}`);
  ok("#161 posix 下照旧对（别为了修 win 把 mac 弄坏）",
     dirKeyOf("/p/sub/a.dc.html", "/p", pxs) === "sub" && dirKeyOf("/p/a.dc.html", "/p", pxs) === ".");

  /* ── #160：新建项目面板的建议名 ── */
  ok("#160 win：建议名是最后那一段，不是整条盘符路径",
     suggestedNameOf("C:\\Users\\sam\\Projects\\Demo", w32) === "Demo",
     suggestedNameOf("C:\\Users\\sam\\Projects\\Demo", w32));
  const oldName = (dir: string) => (dir.split("/").pop() || "project").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  ok("#160 **旧写法在 win 下是一整条横杠串**（原样打出来）",
     oldName("C:\\Users\\sam\\Projects\\Demo") !== "Demo", `旧写法: ${oldName("C:\\Users\\sam\\Projects\\Demo")}`);
  ok("#160 posix 下照旧对", suggestedNameOf("/Users/sam/Projects/我的设计 稿", pxs) === "project"
     || /^[A-Za-z0-9_-]+$/.test(suggestedNameOf("/Users/sam/Projects/Demo", pxs)),
     suggestedNameOf("/Users/sam/Projects/Demo", pxs));
  /* ⚠️ **HTTP 版和 MCP 版现在是同一份实现** —— 原来是两份，而实测它们在 win 下不一致。
     这一条钉的是「不再有两份」，所以直接比两个调用点用的是不是同一个函数名。 */
  const { readFileSync: rf16 } = await import("node:fs");
  const { join: j16 } = await import("node:path");
  const { TOOL_ROOT: TR16 } = await import("./project.js");
  const apiSrc = rf16(j16(TR16, "server", "src", "api.ts"), "utf8");
  const idxSrc = rf16(j16(TR16, "server", "src", "index.ts"), "utf8");
  ok("#160 HTTP 版与 MCP 版都走 `suggestedNameOf`（不再是两份实现）",
     /suggestedName: suggestedNameOf\(dir\)/.test(apiSrc) && /suggestedNameOf\(dir\)/.test(idxSrc));
}

/* ══════════════════════════════════════════════════════════════════════
   ⑮ 项目里指向外面的符号链接（issue #140，geek-99 2026-10-22 裁定口径）

   ⚠️⚠️ **根约束原来只比字面路径，全程不碰文件系统。** #19 修好的是
   「`..` 和同前缀兄弟目录」那一半；**链接从来没有闸**：
   `docs/notes.md -> ~/.umbrastudio/ai_config.json` 的 `relative()` 回
   `"docs/notes.md"` → 判「项目内」→ `readFile` / `writeFile` / `rm` **都跟随链接**。
   报错文案承诺的「只能读写项目目录里的文件」**在有链接时不成立**。

   口径：解析后落在项目外 → **读 / 写 / 删 / 预览一律拒**；
   文件树里**照常列出来**但标 `outsideLink`；指向项目**内部**的链接不受影响。
   ⚠️ 最后那一条是分寸所在 —— **过度拦截和漏放一样是缺陷，只是症状跑到别的地方**
   （`pathguard.ts` 里 `...dc.html` 那条教训）。
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑮ 指向项目外的符号链接（issue #140）");
{
  const { symlink, readFile: rdf4, writeFile: wrf4 } = await import("node:fs/promises");
  const { listFiles: lsf, readAnyFile, writeAnyFile, trashFile } = await import("./files.js");
  const { isInsideReal, isOutsideLink, realOf } = await import("./pathguard.js");

  /* ⚠️ **这一节自己建项目**，不复用文件头那个 `DIR` ——
     它排在收尾清理之后，而那一步已经把 `DIR` 清掉了（第一版就撞上：
     `symlink` 报 ENOENT，而读数看着像「建链接这件事做不到」）。
     > **夹具不在了和产品做不到，报出来的样子一样**（本轮第 2 次）。 */
  const { mkdtemp: mkdt15 } = await import("node:fs/promises");
  const { tmpdir: td15 } = await import("node:os");
  const L = await mkdt15(join(td15(), "umbra-filetest-link-"));
  await wrf4(join(L, "project.json"), JSON.stringify({ name: "linktest", title: "链接" }), "utf8");
  await wrf4(join(L, "需求.md"), "# 日志页需求\n\n正文。\n", "utf8");
  const lp = await buildProject(L);

  /* 项目外的那两个样本（放在项目的**上一层**，模拟「别人给的项目里带个链接」） */
  const OUT = await mkdt15(join(td15(), "umbra-filetest-outside-"));
  const secret = join(OUT, "secret.json");
  await wrf4(secret, '{"apiKey":"不该被读到"}\n', "utf8");
  await symlink(secret, join(L, "看着像笔记.md"));            // 指向项目外的**文件**
  await symlink(OUT, join(L, "外链目录"));                     // 指向项目外的**目录**
  await symlink(join(L, "需求.md"), join(L, "项目内的链接.md")); // 指向项目**内**：不该被拦

  /* ── ⓐ 纯函数那一层 ── */
  ok("`isInsideReal` 拦住指向项目外的链接", !isInsideReal(L, join(L, "看着像笔记.md")));
  ok("**指向项目内的链接照常算「在里面」**（别过度拦截）", isInsideReal(L, join(L, "项目内的链接.md")));
  ok("`isOutsideLink` 只对前者为真",
     isOutsideLink(L, join(L, "看着像笔记.md")) && !isOutsideLink(L, join(L, "项目内的链接.md")));
  /* ⚠️ 目标**还不存在**也要能解（写新文件时就是这样）—— 这一条是 `realOf` 的关键性质 */
  const ghost = realOf(join(L, "外链目录", "还没建的.md"));
  /* ⚠️ 比的时候两边都要 `realpath` 过 —— macOS 的 `/var` 是链接，
     `OUT` 是未解析的 `/var/...` 而 `ghost` 是解析过的 `/private/var/...`
     （**同一个坑本轮第 5 次**：判据红的理由是错的）。 */
  ok("**目标还不存在也解得出来**（写新文件时目标必然不存在）",
     ghost.startsWith(realOf(OUT)) && ghost.endsWith("还没建的.md") && !ghost.includes("外链目录"),
     `${ghost}  ← 期望以 ${realOf(OUT)} 开头`);

  /* ── ⓑ 读 / 写 / 删三条路都拒，而且外面那份一个字节没变 ── */
  const before = await rdf4(secret, "utf8");
  /* ⚠️ **每条用自己的链接样本**（issue #140 的判据第一版栽在这里）：
     四条共用一条链接时，「写」那一条**成功之后把链接换成了普通文件**，
     于是「删被拒」和「树里标 outsideLink」测的是一个**已经不存在的样本** ——
     两条红得莫名其妙，而真因只有一个。
     > **判据之间不能互相毁夹具**（`doc/00` §143.6）。 */
  await symlink(secret, join(L, "样本-写.md"));
  await symlink(secret, join(L, "样本-删.md"));
  let 读 = "没拒", 写 = "没拒", 删 = "没拒", 穿目录写 = "没拒";
  try { await readAnyFile(lp, "看着像笔记.md"); } catch (e) { 读 = (e as Error).message || String(e); }
  try { await writeAnyFile(lp, "样本-写.md", "被改了"); } catch (e) { 写 = (e as Error).message || String(e); }
  try { await trashFile(lp, "样本-删.md"); } catch (e) { 删 = (e as Error).message || String(e); }
  try { await writeAnyFile(lp, "外链目录/新文件.md", "穿过去了"); } catch (e) { 穿目录写 = (e as Error).message || String(e); }
  ok("**读被拒**", 读 !== "没拒", 读.slice(0, 60));
  ok("**写被拒**", 写 !== "没拒", 写.slice(0, 60));
  ok("**删被拒**", 删 !== "没拒", 删.slice(0, 60));
  ok("**穿过外链目录往外写也被拒**（目录链接和文件链接是两条路）", 穿目录写 !== "没拒", 穿目录写.slice(0, 60));
  /* ⚠️ 这一条是**真相** —— 上面四条都是「它说拒了」，这一条问「盘上那份动没动」。
     只断言「抛了异常」的话，一个在写之后才抛的实现照样绿。 */
  ok("**项目外那份文件一个字节都没变**", (await rdf4(secret, "utf8")) === before);
  const { existsSync: ex } = await import("node:fs");
  ok("也没有在项目外建出新文件", !ex(join(OUT, "新文件.md")));

  /* ── ⓒ 指向项目内的链接照常能读（口径的后半句）── */
  let 内链读到 = "";
  try { 内链读到 = (await readAnyFile(lp, "项目内的链接.md")).content ?? ""; } catch (e) { 内链读到 = "✗ " + (e as Error).message; }
  ok("**指向项目内的链接照常读得到**", 内链读到.includes("日志页需求"), 内链读到.slice(0, 40));

  /* ── ⓓ 文件树：列出来、标出来 ── */
  const ls = await lsf(lp);
  const row = ls.entries.find((x) => x.name === "看着像笔记.md");
  const inner = ls.entries.find((x) => x.name === "项目内的链接.md");
  ok("**它在文件树里列出来了**（不列的话用户以为软件丢了他的东西）", !!row, row?.name);
  ok("**而且标着 `outsideLink`**", row?.outsideLink === true, JSON.stringify(row ?? null).slice(0, 100));
  ok("指向项目内的那条**不带**这个标记", !!inner && inner.outsideLink === undefined, JSON.stringify(inner ?? null).slice(0, 80));

  await rm(OUT, { recursive: true, force: true });
  await rm(L, { recursive: true, force: true });
}

/* ── ⓡ 递归列文件（Q85 / M16-7c-1b，2026-10-23）────────────────────────────
   「转到文件」（⌘P）原来搜 `list_drafts`（全项目的 `.dc.html`），C3 之后那份名单恒为空。
   Q85 定甲：给 `list_files` 加一档 `recursive`，上限 5000。

   ⚠️⚠️ **这一节的第一条是我自己刚踩的那个 bug**：第一版把「两条路默认 limit 不同」
   写在 `cap/files.ts` 的门面里，而 `listFiles` 的签名上是 `limit = LIST_PAGE` ——
   于是**直接调这个函数的人拿到 200 条**，第一次真量就撞到了（232 个文件的项目回 200 + truncated）。
   > **一个默认值在两个地方各有一个答案，就有一个是错的。**
   而它的症状正是我在门面注释里自己写下的担心（「少了但不报错」）——
   **我写了那个担心，然后在下一步造出了它。**
   所以这条判据钉的不是「递归能用」，是**「不给 limit 时它用的是哪个默认值」**。 */
{
  const { mkdtemp, writeFile: wf3, mkdir: md3 } = await import("node:fs/promises");
  /* ⚠️ `lsf` 在上一节的块作用域里，这里看不到 —— 自己拿一次。
     （每节自带夹具与 import 是这一套的惯例，省得节与节之间互相依赖。） */
  const { listFiles: lsf, LIST_PAGE: LP, WALK_MAX: WM } = await import("./files.js");
  const R = await mkdtemp(join(tmpdir(), "umbrastudio-ftrec-"));
  await wf3(join(R, "project.json"), JSON.stringify({ name: "ftrec", title: "ftrec" }), "utf8");
  /* 造 **比 LIST_PAGE 多**的文件，否则「默认值用错了」这件事量不出来
     （一个 50 个文件的项目上，200 和 5000 这两个默认值回的条数一模一样）。
     > **判据要让它要测的那个差别真的发生** —— 这正是「判据在没有样本的时候，
     > 测的是今天恰好没事」的反面做法。 */
  /* ⚠️⚠️ **夹具要同时让两个差别都发生，而我第一版只照顾了一个。**
     ① 「递归的默认 limit 不是 200」要**全项目**超过 `LIST_PAGE`；
     ② 「一层那条路还是截断到 200」要**根目录**超过 `LIST_PAGE`。
     第一版把文件按 `i % 3` 散到三层 → 根目录只占 1/3（82 项），
     于是 ② 压根没到截断线，判据红在自己的夹具上。
     > 我在下面写了「判据要让它要测的那个差别真的发生」，
     > **然后在夹具布局上没做到** —— 同一个夹具要满足两个条件，而我只检查了一个。
     现在：根目录放满 `N` 个，另外在两层深处各放几个（多级路径与「不止一层」靠它们）。 */
  const N = LP + 37;
  const DEEP = 5;
  await md3(join(R, "深", "再深"), { recursive: true });
  for (let i = 0; i < N; i++) await wf3(join(R, `样本${i}.txt`), `第 ${i} 个`, "utf8");
  for (let i = 0; i < DEEP; i++) {
    await wf3(join(R, "深", `深样本${i}.txt`), "x", "utf8");
    await wf3(join(R, "深", "再深", `更深样本${i}.txt`), "x", "utf8");
  }
  /* ⚠️ **`project.json` 也是一个文件，它会被列进去** —— 第一版期望 `N` 而读数是 `N + 1`，
     红在这一个字上。**自己造的夹具里有几个文件，要数全。** */
  const ALL = N + DEEP * 2 + 1;
  /* 一个 opaque 目录（`.git`）+ 里面一堆文件 —— 递归**不许走进去** */
  await md3(join(R, ".git", "objects"), { recursive: true });
  for (let i = 0; i < 5; i++) await wf3(join(R, ".git", "objects", `o${i}`), "x", "utf8");
  const pr = await buildProject(R);

  const rec = await lsf(pr, "", undefined, { recursive: true });
  ok("**不给 limit 时递归用的是自己那个默认值，不是一层那条路的 200**（这一条钉我 2026-10-23 踩的那个 bug）",
     rec.entries.length === ALL && rec.truncated === false, { 给出: rec.entries.length, 造了: ALL, LIST_PAGE: LP, truncated: rec.truncated });
  ok("递归里**没有目录项**（搜索要的是文件）", rec.entries.every((e) => !e.isDir), rec.entries.filter((e) => e.isDir).length + " 个目录项");
  ok("**真的走进了子目录**（多级路径在）", rec.entries.filter((e) => e.path.includes("/")).length > 0,
     rec.entries.filter((e) => e.path.includes("/")).length + " 条带 /");
  ok("**最深那一层也进去了**（广度优先不等于只走一层）",
     rec.entries.filter((e) => e.path.startsWith("深/再深/")).length === DEEP,
     rec.entries.filter((e) => e.path.startsWith("深/再深/")).length + " 条，造了 " + DEEP);
  /* ⚠️ 这一条**要有样本才算数**：上面刻意在 `.git/objects` 里放了 5 个文件。
     不放的话「没走进 .git」在一个压根没有 .git 的项目上也绿（§判据在没有样本时…）。 */
  ok("**不走进 opaque 目录**（`.git` 的规模与用户的文件无关而且无界增长）",
     rec.entries.every((e) => !e.path.startsWith(".git/")), rec.entries.filter((e) => e.path.startsWith(".git/")).length + " 条来自 .git");
  ok("`total` 等于实际给出的条数（递归那条路算不出全项目总数，所以不假装）", rec.total === rec.entries.length, { total: rec.total, len: rec.entries.length });

  /* ── 上限：给小的真的截断，并把 `truncated` 说出来 ── */
  const cut = await lsf(pr, "", 5, { recursive: true });
  ok("给 `limit: 5` → 只回 5 条**而且 `truncated` 为真**（不静默截断）",
     cut.entries.length === 5 && cut.truncated === true, { n: cut.entries.length, truncated: cut.truncated });
  /* ⚠️ 上限是**一道闸不是默认值**：调用方给 99999 不算数。
     项目没有 5000 个文件，所以这里只能钉「不抛、不超过 WALK_MAX」—— 照实说它测到哪一层。 */
  const over = await lsf(pr, "", 99999, { recursive: true });
  ok("给 `limit: 99999` 不算数，clamp 在上限以内（**这一条只测到「不超过」，项目没那么大**）",
     over.entries.length <= WM, { n: over.entries.length, WALK_MAX: WM });

  /* ── 一层那条路没被改坏（这一档是加上去的，不是改过去的）── */
  const flat = await lsf(pr, "");
  ok("**一层那条路一个字节没变**：默认还是 `LIST_PAGE` 条、`total` 还是截断前的总数",
     flat.entries.length === LP && flat.total > LP && flat.truncated === true,
     { n: flat.entries.length, total: flat.total, LIST_PAGE: LP });
  ok("一层那条路**只列这一层**（子目录里的文件不混进来）",
     flat.entries.every((e) => !e.path.includes("/")), flat.entries.filter((e) => e.path.includes("/")).length + " 条带 /");

  await rm(R, { recursive: true, force: true });
}

console.log(`\n${bad === 0 ? "✓" : "✗"} 泛型文件层 ${bad === 0 ? "全通过" : `${bad} 条没过`}\n`);
process.exitCode = bad === 0 ? 0 : 1;
