import { z } from "zod";
import { envelope, err, ToolError } from "../envelope.js";
import { X } from "../codes.js";
import { countTypes, lineDelta, listFiles, listSnapshotMeta, moveFile, readAnyFile, readSnapshotContent, referencesOf, revertFile, sha256, trashFile, writeAnyFile } from "../files.js";
import { gitFallbackOf } from "../gitkeep.js";
import { clearStagedDraft, getStagedDraft, listStagedDrafts, stageDraft } from "../staged.js";
import { defineCap } from "./registry.js";
import { originOf, type CapCtx } from "./types.js";

/** 泛型文件层的能力（M11-1 第一批）。
 *
 *  **为什么先搬这一组**：插件要做的就是「给某种格式加编辑方式」（Q37），
 *  而任何格式的编辑最后都落在这几件上 —— 列、读、写、改名、看版本、回退、扔、查引用。
 *  这一组定下来，插件面需要什么就清楚了。
 *
 *  ⚠️ **这里只有声明，没有实现** —— 实现在 `files.ts`，两个门面以前各包装了它一遍。
 *  这一层要做的就是把那两层样板合成一份。
 */
const p = (c: CapCtx) => c.project!;    // scope: "project" 的能力，门面保证不为 null

/** 把调用方给的 `content` 变成要落盘的东西（#108）。
 *
 *  ⚠️ **base64 不合法要当场拒**，不能让 `Buffer.from` 悄悄吃掉。
 *  `Buffer.from(x, "base64")` 对非法输入**不报错**，它跳过认不出的字符
 *  —— 于是一个打错的 base64 会写出一个**体积不对但确实存在**的文件，
 *  而用户看到的是「保存成功了，图打不开」。
 *  **静默损坏比报错糟得多**（§161.3「假成功」同一条）。 */
function decodeContent(content: string, encoding?: "utf8" | "base64"): string | Buffer {
  if (encoding !== "base64") return content;
  const clean = content.replace(/^data:[^,]*,/, "").trim();   // 顺手吃掉 data URL 前缀
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean.replace(/\s+/g, ""))) {
    throw new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name: "content" },
      "这不是合法的 base64",
      { fix: "encoding 给了 base64，而 content 里有 base64 之外的字符。要写文本就别给 encoding。" }));
  }
  return Buffer.from(clean.replace(/\s+/g, ""), "base64");
}


defineCap({
  name: "list_files", title: "列目录", scope: "project",
  summary: "列一个目录下的文件与子目录（含类型、大小、改动时间）。不递归 —— 要看深层就再调一次。",
  input: { dir: z.string().optional().describe("相对项目根的子目录，不给就是项目根"), limit: z.number().optional() },
  http: { route: "files", method: "GET" },
  run: async ({ dir, limit }, c) => envelope(await listFiles(p(c), dir ?? "", limit)),
});

defineCap({
  name: "read_file", title: "读一个文件（非设计稿）", scope: "project",
  summary: [
    "读文本文件，返回内容与 sha256。**写回去要把这个 sha256 原样带上** —— 盘上被别人改过就会被拒绝，不会把改动盖掉。",
    "`encoding` 给别的编码时**只换读法，盘上那份一个字节都没动**（M10-5，中文 CSV 常被当成 UTF-8 读成乱码）。",
    "⚠️ `sha256` 永远是**原始字节**的，不随编码变 —— 所以按 GBK 读出来的文本，拿这个 sha 回去校验仍然对得上。",
  ].join("\n"),
  input: {
    path: z.string().describe("相对项目根的文件路径"),
    encoding: z.string().optional().describe("按哪种编码读；不给就是 utf-8。能用的：gbk / gb18030 / big5 / shift_jis / utf-16le / windows-1252"),
  },
  http: { route: "file", method: "GET" },
  run: async ({ path, encoding }, c) => envelope(await readAnyFile(p(c), path, encoding)),
});

defineCap({
  name: "write_file", title: "写一个文件（非设计稿）", scope: "project",
  summary: [
    "写文本文件，顺序是：写前 sha256 校验 → 存旧版快照 → 原子写 → 存新版快照 → 返回快照号。",
    "**不归一化、不改编码、不动换行、不碰 frontmatter** —— 写进去什么样，盘上就什么样。",
    "expectSha256 传 read_file 给的那个值：盘上被别人改过就拒绝。新建文件传 \"0\"。",
    "`.dc.html` 会被拒绝并指向 write_draft（那是另一条写入口，要做归一化与资源注入）。",
    "写二进制（图片这类）给 `encoding: \"base64\"`，`content` 就是 base64 原文。",
  ].join("\n"),
  input: {
    path: z.string(), content: z.string(),
    /* ⚠️ **加一档而不是再开一条写入口**（#108，2026-10-07）：
       第二条写入口的全部价值在于「写非设计稿只有这一条路」——
       为二进制再开一件 `write_binary_file` 等于把那句话变成两条路，
       而两条路迟早会在「写前校验 / 快照 / 回退」上分叉（纪律① 的同一条道理）。 */
    encoding: z.enum(["utf8", "base64"]).optional().describe("content 怎么解。默认 utf8（文本）；写图片这类二进制给 base64"),
    expectSha256: z.string().optional().describe("read_file 返回的 sha256；新建文件给 \"0\"。不给就不做写前校验"),
    note: z.string().optional().describe("这一版为什么改，记进快照元数据"),
  },
  http: { route: "file_write", method: "POST" },
  /* `origin` 就是两个门面唯一的真实差异，现在它从 `via` 来，不再各写一遍 */
  run: async ({ path, content, encoding, expectSha256, note }, c) =>
    envelope(await writeAnyFile(p(c), path, decodeContent(content, encoding), { expectSha256, origin: originOf(c.via), note })),
});

defineCap({
  name: "move_file", title: "改名 / 移动一个文件（非设计稿）", scope: "project",
  summary: "改名或移动。引用它的稿会被一起改写 —— 所以不要用系统的文件管理器搬，那样引用会断。",
  input: { from: z.string(), to: z.string() },
  http: { route: "file_move", method: "POST" },
  run: async ({ from, to }, c) => envelope(await moveFile(p(c), from, to)),
});

defineCap({
  name: "trash_file", title: "把文件挪进回收站", scope: "project",
  summary: "不是真删 —— 挪进项目的回收站，可以恢复。",
  input: { path: z.string() },
  http: { route: "file_trash", method: "POST" },
  run: async ({ path }, c) => envelope(await trashFile(p(c), path)),
});

defineCap({
  name: "list_file_versions", title: "一个文件的历史版本", scope: "project",
  summary: "列这个文件存过的快照（版本号、时间、谁改的、备注）。",
  input: { path: z.string() },
  http: { route: "file_versions", method: "GET" },
  run: async ({ path }, c) => {
    const proj = p(c);
    /* `gitFallback` 一起给：版本历史那一面要在头上说一句「这个文件没有 git 兜底」，
       而那句话的依据只有后端知道（要问 `git check-ignore`）。 */
    const [snapshots, gitFallback] = await Promise.all([
      listSnapshotMeta(proj, path),
      gitFallbackOf(proj.dir, path),
    ]);
    return envelope({ path, snapshots, gitFallback });
  },
});

defineCap({
  name: "read_file_version", title: "读一个文件的某一个历史版本", scope: "project",
  summary: [
    "读某一版快照里存的**原文**，不动盘上那份。",
    "这是「**看**那一版」和「**比**那一版」的底座 —— 在它之前只能列出版本号、读不到内容，",
    "于是界面能显示「有 7 版」却打不开其中任何一版。",
    "`list_file_versions` 给的 `delta`（`+N −M`）**已经由后端算好**，不必为了算它来调这一件。",
  ].join("\n"),
  input: { path: z.string(), version: z.string().describe("快照号，`list_file_versions` 给的那个，形如 s3") },
  http: { route: "file_version", method: "GET" },
  run: async ({ path, version }, c) => {
    const content = await readSnapshotContent(p(c), path, version);
    return envelope({ path, version, content, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8"),
      lines: content.split("\n").length });
  },
});

defineCap({
  name: "compare_file_versions", title: "两个版本之间增删了几行", scope: "project",
  summary: [
    "只回 `+N −M` 两个数，不回 diff 正文。",
    "`to` 不给就是**和盘上现在那份比** —— 「我在看 s5，它和当前差多少」问的就是这个。",
    "⚠️ 这和 `list_file_versions` 给的 `delta` **不是一回事**：那个是「每一版和它上一版」，",
    "这个是「任意两版之间」。**两者不能互相换算** —— 中间各版的 delta 累加会高估",
    "（一处改了又改回来，累加算两次改动，实际是零）。",
  ].join("\n"),
  input: {
    path: z.string(),
    from: z.string().describe("起点版本，形如 s3"),
    to: z.string().optional().describe("终点版本；不给就是盘上现在那份"),
  },
  http: { route: "file_compare", method: "GET" },
  run: async ({ path, from, to }, c) => {
    const proj = p(c);
    const a = await readSnapshotContent(proj, path, from);
    const b = to ? await readSnapshotContent(proj, path, to) : (await readAnyFile(proj, path)).content;
    if (b === null) {
      return envelope({ path, from, to: to ?? null, delta: null, note: "盘上那份读不出正文（二进制？），没法按行比" });
    }
    return envelope({ path, from, to: to ?? null, delta: lineDelta(a, b) });
  },
});

defineCap({
  name: "revert_file", title: "把文件回退到某一版", scope: "project",
  summary: "回退**也是一次写** —— 会先给当前内容存一版快照，所以回错了还能再回来。",
  input: { path: z.string(), version: z.string() },
  http: { route: "file_revert", method: "POST" },
  run: async ({ path, version }, c) => envelope(await revertFile(p(c), path, version)),
});

/* ════ 草稿暂存（M10-2c）════
   ⚠️ 这三件**不是**写入口的例外：它们写的是 `.umbrastudio/staged/` 下的工具状态，
   和 `snapshots/` 同类，不是用户的文件。草稿要变成用户文件里的内容时
   （「用草稿覆盖」）走的是 `write_file`，一样都不少。 */

defineCap({
  name: "stage_draft", title: "暂存一份没落盘的草稿", scope: "project",
  summary: [
    "把编辑器里还没落盘的内容存起来，**刷新 / 崩溃 / 关窗之后还找得回来**。",
    "⚠️ 插件自己存不了 —— 它在不透明源的 iframe 里，`localStorage` 访问会抛，所以这一层由宿主兜。",
    "**内容和盘上那份一样时不存，反而清掉已有的草稿** —— 「改了又改回来」不该留下一条",
    "点了恢复什么都不变的提示。",
    "每一份草稿都记着它是在哪一版上改的，所以下次打开答得出「还能不能直接恢复」。",
  ].join("\n"),
  input: { path: z.string(), content: z.string() },
  http: { route: "draft_stage", method: "POST" },
  run: async ({ path, content }, c) => envelope(await stageDraft(p(c), path, content)),
});

defineCap({
  name: "get_staged_draft", title: "这个文件有没有暂存的草稿", scope: "project",
  summary: [
    "回草稿内容、什么时候存的、相对盘上那份增删了几行，以及**还能不能直接恢复**。",
    "`stale: true` = 草稿的底稿和现在盘上那份不是同一个（别的编辑器改过、AI 改过、回退过）。",
    "**这时候不该直接恢复** —— 那会静默盖掉别人的改动。",
  ].join("\n"),
  input: { path: z.string() },
  http: { route: "draft_staged", method: "GET" },
  run: async ({ path }, c) => envelope(await getStagedDraft(p(c), path)),
});

defineCap({
  name: "clear_staged_draft", title: "丢掉暂存的草稿", scope: "project",
  summary: "落盘之后、或者用户点「丢掉」时调。本来就没有也算成功。",
  input: { path: z.string() },
  http: { route: "draft_clear", method: "POST" },
  run: async ({ path }, c) => envelope(await clearStagedDraft(p(c), path)),
});

defineCap({
  name: "list_staged_drafts", title: "这个项目里还挂着哪些草稿", scope: "project",
  summary: "「哪些文件我改了还没落盘」——**给 AI 和秘书用的**：它们看不见编辑器，只能问这一件。",
  input: {},
  http: { route: "drafts_staged", method: "GET" },
  run: async (_i, c) => {
    const rows = await listStagedDrafts(p(c));
    return envelope({ rows, count: rows.length, stale: rows.filter((r) => r.stale).length },
      [], { count: rows.length });
  },
});

defineCap({
  name: "list_file_refs", title: "谁引用了这个文件", scope: "project",
  summary: "找出哪些稿引用了它。删之前先看这个 —— 有人引用还删，那些稿会缺资源。",
  input: { path: z.string() },
  http: { route: "file_refs", method: "GET" },
  run: async ({ path }, c) => envelope({ path, referencedBy: await referencesOf(p(c), path) }),
});

defineCap({
  name: "count_file_types", title: "项目里各类型文件各有多少", scope: "project",
  summary: "按类型统计。目录视图的筛选条用它填数字。",
  input: {},
  http: { route: "file_types", method: "GET" },
  run: async (_i, c) => envelope({ types: await countTypes(p(c)) }),
});
