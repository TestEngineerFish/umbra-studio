import { z } from "zod";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { envelope } from "../envelope.js";
import { X } from "../codes.js";
import { err, ToolError } from "../envelope.js";
import { isDesignProject, listDrafts } from "../project.js";
import { resolveDraft } from "../locate.js";
import {
  changesSince, diffDrafts, humanTime, listVersions, projectChangesSince,
  readVersionMeta, resolveSnapshot, toMarkdown,
} from "../history.js";
import { addComment, deleteComment, listComments, markCommentsSent, updateComment } from "../comments.js";
import { listReferences } from "../refs.js";
import { listSnapshotMeta, walkProjectFiles } from "../files.js";
import { buildIndex, collectIndex, indexStatus, isToolPage } from "../indexpage.js";
import { defineCap } from "./registry.js";
import type { CapCtx } from "./types.js";
import { indexDataFile } from "../statedirs.js";

/** 版本 / 变更 / 索引 / 引用 / 评论（M11-7 第五批）。
 *
 *  ⚠️ **这一域里有三条留在手写路径，不搬**（`api.ts`），各有硬理由：
 *
 *  | 路由 | 为什么不能进能力分发器 |
 *  | --- | --- |
 *  | `version_html` | 它返回的是**原始 HTML 不是信封** —— 给 iframe 直接看历史版本，还要在 `<head>` 里插 `<base>` 修相对路径。分发器一律 `json(信封)`，形状根本不同 |
 *  | `check` | 走**作业系统**（起一个 job，立刻返回 jobId，前端轮询）。渲染体检要开浏览器，几秒到几十秒，同步返回会把 HTTP 连接挂住 |
 *  | `check_status` | 同上，它是轮询那一半 |
 *
 *  把它们硬塞进分发器需要给 `Cap` 加「返回原始响应」和「异步作业」两种模式，
 *  而那两种各只有一个用户 —— **为一个用户造一层抽象，比留着一条手写路径更贵**。
 */
const p = (c: CapCtx) => c.project!;
const rel = (c: CapCtx, file: string) => resolveDraft(p(c), file);

/* ⚠️⚠️ **`list_drafts` 是甲组 12 件里唯一「前端还在调」的那一件，所以它留到 M16-7c。**
 *
 *  7b 第一版把它一起删了，而全套跑出来三个 app 判据红 —— 读数是
 *  `404 /__ud/drafts`，而 `store/project.ts` 的 `fetchDrafts` 失败时会
 *  `toast("获取稿件列表失败")`：**用户看得见的错误提示**，比一条 404 更糟。
 *
 *  ⚠️ 这推翻了我定 7b 边界时说的一句话 ——「工作台上的 dc 残留**点了不会 404**」。
 *  `fetchDrafts` **不是一个入口**，它是**挂载时就调**的。
 *  > **判断一个残留会不会坏，不能只看「用户能不能点到它」 ——
 *  > 还要看「它会不会自己跑」。**
 *
 *  「稿」这个概念在前端还有五六处（`store.drafts` · `Workbench` 的页签 ·
 *  `Sheets` 新建稿件弹窗查重名 · 目录视图的「N 份稿」），
 *  要和它们一起删 —— 那是 7c 的事。
 *  > **拆步骤的判准不是「这些代码是不是一类」，是「发出去那一版自洽不自洽」。** */
/* ⚠️⚠️ **`build_index` 也留到 M16-7c，理由同 `list_drafts` —— 而我是按名字判断漏掉它的。**
 *
 *  7b 第一版把它删了，而全套跑出 `404 /__ud/rebuild_index`。
 *  ⚠️ 我前面在 `doc/12` 里明确写过「`rebuild_index` 在服务端**还在**，只是重建一个空索引」
 *  —— **那句话错了**：我删的是 `build_index`，而**它的 HTTP 路由名就叫 `rebuild_index`**。
 *  我按名字不同以为它们是两件事。
 *  > 能力名和路由名不一样是本项目的常态（`list_file_versions` → `file_versions`、
 *  > `read_file` → `file`）—— 而我**用能力名去推断路由存不存在**。
 *
 *  前端两处在调它：`store/project.ts` 的 `fetchDrafts`（没索引时自动建一次）
 *  和 `runCheck` 的收尾，还有工作台菜单里那颗「重建索引」。
 *  和那一摊一起删 —— 7c 的事。 */
defineCap({
  name: "build_index", title: "生成项目入口页", scope: "project",
  summary: "把项目里的稿生成一张入口页（带健康度与缩略图）。`renderCheck: true` 会对缺截图的稿跑渲染体检补缩略图 —— **那会开浏览器，慢**。",
  input: {
    renderCheck: z.boolean().optional().describe("对缺截图的稿跑渲染体检生成缩略图（慢）"),
  },
  /* HTTP 侧叫 `rebuild_index`（前端在用）。
     ⚠️ MCP 侧原来还有个 `serve: true` 顺手起服务 —— **不搬**：
     从界面调它时服务本来就开着，而「读一个东西顺手起个服务」是两件事挤在一个开关里。
     模型要起服务用 `serve_start`。 */
  http: { route: "rebuild_index", method: "POST" },
  run: async ({ renderCheck }, c) => {
    const proj = p(c);
    /* ⚠️⚠️ **这道闸是 B3 的另一半，而它比 `open_project` 那一句更要紧**（2026-10-21）。
       `open_project` 不再无条件建索引之后，前端 `store/project.ts` 那句
       「`indexed` 为假就 `rebuild_index`」会**立刻把它补回来** ——
       于是「打开目录零写入」在界面上根本不成立，而 HTTP 判据全绿
       （`apitest` 只调 `open_project`，不调这一件）。
       > **一道闸只守住一条路等于没守**（issue #75 原话）。闸要装在「真正动手的那一层」。

       这件能力**就是**往项目里部署壳与运行时的那条路（MCP 面也走它），
       所以判准放在这里，三个门面一起守住。 */
    if (!isDesignProject(proj.dir)) {
      throw new ToolError(err(X.BAD_INPUT, proj.rel, { kind: "path", name: proj.dir },
        "这个目录还没接管为设计项目，不建索引",
        { fix: "建索引会往这个目录里放预览壳与运行时副本（约 780 KB）。要用的话先「接管为设计项目」（界面上工作台顶部那条横条，或 `adopt_project`）。只看文件不需要它。" }));
    }
    const url = c.port ? `http://127.0.0.1:${c.port}/` : null;
    const r = await buildIndex(proj, url, { renderCheck });
    return envelope(r, [], { drafts: r.drafts, ...r.byHealth });
  },
});

defineCap({
  name: "list_drafts", title: "列出项目里的稿", scope: "project",
  summary: "文件名 + 索引里算好的类型 / 健康 / 元素数 / 版本。**读的是索引缓存，不现场校验** —— 几十份稿现场校验太慢。没建过索引就只有文件名。",
  input: {},
  http: { route: "drafts", method: "GET" },
  run: async (_i, c) => {
    const proj = p(c);
    const files = (await listDrafts(proj)).map((a) => relative(proj.dir, a).split(sep).join("/")).filter((x) => !isToolPage(x));
    let indexed: Record<string, unknown> = {};
    const dataFile = indexDataFile(proj.dir);
    if (existsSync(dataFile)) {
      try {
        const data = JSON.parse(await readFile(dataFile, "utf8")) as { drafts?: Array<{ file: string }> };
        for (const d of data.drafts ?? []) indexed[d.file] = d;
      } catch { indexed = {}; }
    }
    return envelope({
      project: proj.name, title: proj.title, files,
      drafts: files.map((f) => ({ file: f, ...(indexed[f] as object | undefined ?? {}) })),
      indexed: Object.keys(indexed).length > 0,
    }, [], { count: files.length });
  },
});

defineCap({
  name: "list_versions", title: "列出一份稿的版本", scope: "project",
  summary: "列快照版本序列（v1、v2 …）以及项目有没有 git 兜底。版本在每次 write_draft 落盘时递增，**按稿独立计数**。",
  input: { file: z.string() },
  http: { route: "versions", method: "GET" },
  run: async ({ file }, c) => {
    const proj = p(c);
    const r = await rel(c, file);
    const vs = await listVersions(proj, r);
    return envelope({ file: r, versions: vs, latest: vs[vs.length - 1] ?? null, gitEnabled: proj.gitEnabled },
      [], { count: vs.length });
  },
});


defineCap({
  name: "list_changes", title: "一份稿的版本与变更", scope: "project",
  summary: [
    "一次给全：版本序列 · 每版的「来源 · 时间 · 摘要」· 两版之间的语义变更清单。",
    "`since` 给 `prev` 是「上一版」的简写；不给就从第一版起算。",
    "`to` 给了就是**任意两版对比**；不给就是 since → 最新。",
  ].join("\n"),
  input: {
    file: z.string(),
    since: z.string().optional().describe("起点版本，或 prev（上一版）"),
    to: z.string().optional().describe("终点版本。不给就是最新"),
  },
  http: { route: "changes", method: "GET" },
  run: async ({ file, since: sinceRaw, to }, c) => {
    const proj = p(c);
    const r = await rel(c, file);
    const vs = await listVersions(proj, r);
    /* 版本弹层（S2，设计侧 §3.2）每行要「来源 · 时间 · 摘要」—— 形状按它给的 */
    const metaRaw = await readVersionMeta(proj, r);
    const versionMeta: Record<string, { src: string; time: string; summary: string }> = {};
    for (const [v, m] of Object.entries(metaRaw)) versionMeta[v] = { src: m.origin, time: humanTime(m.capturedAt), summary: m.summary };
    if (vs.length < 2) {
      return envelope({ file: r, versions: vs, versionMeta, diff: null, markdown: null,
        note: vs.length ? "只有一版，没有可比的" : "还没有快照" });
    }
    const since = sinceRaw === "prev" ? (vs[vs.length - 2] as string) : (sinceRaw || (vs[0] as string));
    const d = to ? await diffDrafts(proj, r, { from: since, to }) : await changesSince(proj, r, since);
    return envelope({ file: r, versions: vs, versionMeta, diff: d, markdown: toMarkdown(d) });
  },
});

defineCap({
  name: "list_project_changes", title: "整个项目自某一版以来改了什么", scope: "project",
  summary: "扫全项目的稿，**只回有变更的那些** —— 一个项目几十份稿，大半是「只有一版，没有可比的」，全给过去等于让人在噪声里找。",
  input: { since: z.string().optional().describe("起点版本；不给就从各自的第一版起算") },
  http: { route: "project_changes", method: "GET" },
  run: async ({ since }, c) => {
    const proj = p(c);
    const files = (await listDrafts(proj)).map((a) => relative(proj.dir, a).split(sep).join("/")).filter((x) => !isToolPage(x));
    const rows = await projectChangesSince(proj, files, since ?? null);
    const changed = rows.filter((r) => r.diff && r.diff.changes.length > 0);
    return envelope({
      project: proj.name, title: proj.title,
      scanned: rows.length, changed: changed.length, rows: changed,
      skipped: rows.filter((r) => !r.diff).map((r) => ({ path: r.path, note: r.note })),
    }, [], { scanned: rows.length, changed: changed.length });
  },
});


defineCap({
  name: "list_references", title: "查询稿件的引用关系", scope: "project",
  summary: "谁引用了它、它引用了谁。**删或改名之前看一眼** —— 引用断了那些稿会缺资源。不给 file 就是整个项目的引用概览。",
  input: { file: z.string().optional().describe("稿的相对路径。不给时返回整个项目的概览") },
  http: { route: "refs", method: "GET" },
  run: async ({ file }, c) => envelope(await listReferences(p(c), file)),
});


/* ── 评论：钉在节点上的一句话（M6-2）。存 `.umbrastudio/comments.json` ── */

defineCap({
  name: "list_comments", title: "列出钉在节点上的评论", scope: "project",
  summary: "稿 + 节点地址（data-ud-node）+ 一句话 + 是否已处理。**改稿前看看设计侧留了什么话**。",
  input: {
    file: z.string().optional().describe("只看这一份稿"),
    unresolvedOnly: z.boolean().optional().describe("只看没处理的"),
  },
  http: { route: "comments", method: "GET" },
  run: async ({ file, unresolvedOnly }, c) => {
    const proj = p(c);
    let list = await listComments(proj.dir, file ? await rel(c, file) : undefined);
    if (unresolvedOnly) list = list.filter((x) => !x.resolved);
    return envelope({ comments: list }, [], { count: list.length });
  },
});

defineCap({
  name: "add_comment", title: "在一个节点上留一句话", scope: "project",
  summary: "钉在节点地址上。⚠️ **节点地址是内容哈希**，那个节点被改过之后地址会变 —— 评论会跟着失效，这是有意的（评论说的是那一版的那个东西）。",
  input: {
    file: z.string(), node: z.string().describe("data-ud-node 的值"),
    text: z.string(), tag: z.string().optional(),
    /* 行号存下来而不是每次查：「全部发给 AI」时要一起给 AI，
       而那会儿节点可能已经被改过、地址都变了（M8-32） */
    line: z.number().optional().describe("那个节点在源码第几行（写评论时的，只是线索）"),
  },
  http: { route: "comment_add", method: "POST" },
  run: async ({ file, node, text, tag, line }, c) => {
    const proj = p(c);
    return envelope(await addComment(proj.dir, { file: await rel(c, file), node, tag, text, line }));
  },
});

defineCap({
  name: "update_comment", title: "改一条评论 / 标记已处理", scope: "project",
  summary: "改文字，或把它标成已处理。",
  input: { id: z.string(), text: z.string().optional(), resolved: z.boolean().optional(), sent: z.boolean().optional() },
  http: { route: "comment_update", method: "POST" },
  run: async ({ id, text, resolved, sent }, c) => envelope(await updateComment(p(c).dir, id, { text, resolved, sent })),
});

defineCap({
  name: "mark_comments_sent", title: "把几条评论标成已发给 AI", scope: "project",
  summary: [
    "「暂存的评论 · 全部发给 AI」合成的是**一条**消息，所以这几条的标记也一次做完。",
    "⚠️ `sentAt` 和 `resolved` 是两个维度：发过 ≠ 处理完（AI 可能改错），处理完也不必发过（自己改的）。",
  ].join("\n"),
  input: { ids: z.array(z.string()).min(1) },
  http: { route: "comments_sent", method: "POST" },
  run: async ({ ids }, c) => envelope(await markCommentsSent(p(c).dir, ids)),
});

defineCap({
  name: "delete_comment", title: "删掉一条评论", scope: "project",
  summary: "真删。评论没有回收站 —— 它只是一句话。",
  input: { id: z.string() },
  http: { route: "comment_delete", method: "POST" },
  run: async ({ id }, c) => envelope(await deleteComment(p(c).dir, id)),
});

defineCap({
  name: "list_activity", title: "最近谁改了什么", scope: "project",
  summary: [
    "全项目按时间倒序列最近落盘的版本：文件、版本号、来源（AI / 人手改 / 插件 / 外部改动 / 新建）、时间、摘要。",
    "回答「今天 AI 改了什么」「上次我手改的是哪些」这类问题；`origin` 过滤来源，`since` 过滤时间。",
    "⚠️ 经 MCP 改的记作 `AI`（`originOf`：外部模型客户端和应用内 AI 同一档）。设计稿与别的文件两套快照都看。",
  ].join("\n"),
  input: {
    since: z.string().optional().describe("只看这个时刻之后的（ISO 时间）。不给 = 最近 24 小时"),
    origin: z.string().optional().describe("只看这种来源：AI / 人手改 / 插件 / 外部改动 / 新建"),
    limit: z.number().int().min(1).max(1000).optional().describe("最多回几条，默认 100"),
  },
  http: { route: "activity", method: "GET" },
  run: async ({ since, origin, limit }, c) => {
    const proj = p(c);
    const sinceMs = since ? Date.parse(since) : Date.now() - 86400e3;
    if (!Number.isFinite(sinceMs)) return envelope({ rows: [] }, [{ level: "error", code: "E_BAD_INPUT", message: `since 不是时间：${since}`, where: "(input)", at: { kind: "key", name: "since" } } as never]);
    const { files, truncated } = await walkProjectFiles(proj);
    const rows: Array<{ path: string; version: string; origin: string; at: string; summary: string }> = [];
    for (const f of files) {
      if (isToolPage(f)) continue;
      if (f.endsWith(".dc.html")) {
        for (const [v, m] of Object.entries(await readVersionMeta(proj, f))) {
          rows.push({ path: f, version: v, origin: m.origin, at: m.capturedAt, summary: m.summary });
        }
      } else {
        for (const m of await listSnapshotMeta(proj, f, false)) {
          rows.push({ path: f, version: m.version, origin: m.src, at: m.at, summary: m.note ?? "" });
        }
      }
    }
    const picked = rows
      .filter((r) => Date.parse(r.at) >= sinceMs && (!origin || r.origin === origin))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const max = limit ?? 100;
    return envelope({ since: new Date(sinceMs).toISOString(), rows: picked.slice(0, max), total: picked.length, scanned: files.length, truncated },
      [], { total: picked.length, returned: Math.min(max, picked.length) });
  },
});
