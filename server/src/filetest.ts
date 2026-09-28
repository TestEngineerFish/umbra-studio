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
import { listVersions } from "./history.js";
import {
  countTypes, listFiles, listSnapshotMeta, listSnapshots, moveFile,
  readAnyFile, referencesOf, revertFile, trashFile, writeAnyFile,
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
ok("回到 s1：内容回来，历史不删（s1..s4）",
  (await readFile(join(DIR, "需求.md"), "utf8")).includes("正文。\n") && rv.snapshot === "s4" && (await listSnapshots(p, "需求.md")).length === 4);
const meta = await listSnapshotMeta(p, "需求.md");
ok("快照元数据：version / src / at 齐", meta.length === 4 && meta[0]!.version === "s1" && !!meta[0]!.at && meta[3]!.note === "回到 s1");

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
  const git = (args: string[]) => execFileSync("git", ["-c", "core.quotepath=false", ...args], { cwd: DIR, encoding: "utf8" }).trim();

  await writeAnyFile(p, "笔记.md", "第一版\n");
  ok("写入口自动给项目建了 git 仓库", existsSync(join(DIR, ".git")));
  /* ⚠️ 提交身份：干净环境里可能没配 user.name —— 不配的话下面量到的是
     「git 不能提交」而不是「我们没提交」。**只在测试里配**，产品代码不替用户配
     （那会让他别的仓库看起来莫名其妙地不一致）。 */
  try { git(["config", "user.email", "filetest@local"]); git(["config", "user.name", "filetest"]); } catch { /* 没装 git */ }
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
     造法：伪造一个 `.git/MERGE_HEAD`（真跑一次 merge 冲突太重，而判据看的就是这个标记）。 */
  const gitDirAbs = join(DIR, ".git");
  await writeFile(join(gitDirAbs, "MERGE_HEAD"), git(["rev-parse", "HEAD"]) + "\n", "utf8");
  const before = git(["rev-parse", "HEAD"]);
  await writeFile(join(DIR, "笔记.md"), "merge 中途别处又改了\n", "utf8");
  const duringMerge = await commitExternalChanges(DIR, "笔记.md");
  ok("**正在 merge 时什么都不做**（兜底不该有破坏力）",
     duringMerge === null && git(["rev-parse", "HEAD"]) === before, { 提交号: duringMerge });
  await rm(join(gitDirAbs, "MERGE_HEAD"), { force: true });
}

await rm(DIR, { recursive: true, force: true });
console.log(`\n${bad === 0 ? "✓" : "✗"} 泛型文件层 ${bad === 0 ? "全通过" : `${bad} 条没过`}\n`);
process.exitCode = bad === 0 ? 0 : 1;
