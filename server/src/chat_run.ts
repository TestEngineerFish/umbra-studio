/** AI 会话的执行主体（M2）：agent 循环里的工具执行 + chat_send 的完整流程。
 *  抽出来是为了让 MCP 工具（index.ts）和本地 API（api.ts，应用前端的会话面板走它）共用同一份 ——
 *  两个入口一套逻辑，落盘仍走唯一写入口（01 H3）。 */
import { createHash } from "node:crypto";
import { failHint } from "./ai_fail.js";
import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { envelope, toContent, ToolError, err, type Envelope } from "./envelope.js";
import { X } from "./codes.js";
import {
  TOOL_ROOT, buildProject, createProject, createDraft, duplicateDraft, createFolder,
  updateProject, archiveProject, deleteProject,
  draftPath, listDrafts, listProjectDirs, loadProject, projectsRoot,
  type Project,
} from "./project.js";
import { getComponent, getIcon, getToken, listComponents, listIcons, searchTokens } from "./assets.js";
import { validateDraft } from "./validate.js";
import { patchDraft, writeDraft } from "./write.js";
import { missingRuntime } from "./normalize.js";
import { getAiConfig, setAiConfig, channelSupportsImage, getChannelA, getChannelB, getOpenAiChannel, looksLikeQuotaProblem, type AiConfig } from "./ai_config.js";
import { chat, type ToolDef, type ToolCall, type ChatMessage } from "./provider.js";
import { createChat, loadChat, saveChat, listChats, deleteChat, addMessage, type ChatSession, type ChatEntry } from "./chat.js";
import { parseStub, runStubRound } from "./chat_stub.js";
import { findBrowser, renderCheck } from "./render.js";
import { runLocalCli, specOf } from "./local_cli.js";
import {
  changesSince, diffDrafts, listVersions, projectChangesSince, readSnapshot,
  resolveSnapshot, toMarkdown,
} from "./history.js";
import { serveStart, serveStatus, serveStop } from "./serve.js";
import { buildIndex, collectIndex } from "./indexpage.js";
import { locateNode } from "./locate.js";
import { listFiles, listSnapshotMeta, moveFile, readAnyFile, readSnapshotContent, revertFile, writeAnyFile } from "./files.js";
import { revertTo, setProp } from "./edit.js";
import { touchProject, listRecentProjects, removeRecentProject, clearRecentProjects } from "./workspace.js";
import { buildRefGraph, listReferences, renameDraft, moveDraft, deleteDraft, deleteDraftImpact, listTrash, restoreDraft } from "./refs.js";
import { globalSearch } from "./search.js";
import { setTokenValue } from "./token_edit.js";
import { listTemplates, saveAsTemplate, deleteTemplate } from "./templates.js";
import { exportProject, importProject } from "./export.js";
import { invokeVerb, isVerb, listVerbs, verbToolDef } from "./plugin/verbs.js";
import { allCaps } from "./cap/registry.js";   // 只取表，不在这里装配（装配在 index.ts / api.ts，免得和 cap/chat.ts 绕成环）
import { productName, studioName } from "./shared/brand.js";

/* 与 index.ts 的 GUIDES 同一张表（写稿规则文档索引）。不从 index.ts 引 —— 那会形成循环导入。 */
const GUIDES: Record<string, { file: string; note: string }> = {
  template: { file: "03-渲染与交互逻辑.md", note: "模板语言的精确语义（框架语义，与项目无关）" },
  logic: { file: "03-渲染与交互逻辑.md", note: "逻辑类契约与渲染时序" },
  interaction: { file: "06-写稿规则.md", note: "本项目的写法约定（交互、规模、收尾）" },
  checklist: { file: "06-写稿规则.md", note: "开工前与收尾的自检" },
  tokens: { file: "06-写稿规则.md", note: "取值从哪来、@ds 别名怎么写" },
};

export interface ChatSendArgs {
  message: string;
  sessionId?: string;
  channel?: "a" | "b" | "c";
  selectedNodeFile?: string;
  selectedNodeAddress?: string;
  /** 目录视图里选中的若干文件（M8-4，`01` 第 32 条）。路径相对项目根 */
  selectedFiles?: string[];
  /** `.md` 里选中的一段（M8-8，`01` 第 30 条）：label 是「路径 L9-12」，text 是那一段原文 */
  selectedRange?: { label: string; text: string };
  /** 图片上圈的一块（M8-10，`01` 第 31 条）：坐标一句话 + 备注 + 裁出来那块的 data URL */
  selectedRegion?: { label: string; note: string; image: string | null };
  /** 应用前端里当前正在看的稿（没选中节点时的弱上下文）：进系统提示，不进用户那句 */
  contextFile?: string;
  /** 作业化调用时的中断信号（本地 API chat_interrupt 触发）：通道 A 的 agent 循环在下一步前停下 */
  abortSignal?: AbortSignal;
}

/** agent 循环中真正执行一个工具调用。返回 JSON 字符串给模型。 */
export async function executeToolCall(p: Project, tc: ToolCall): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(tc.function.arguments);
  } catch {
    return JSON.stringify({ ok: false, error: `参数解析失败: ${tc.function.arguments.slice(0, 200)}` });
  }

  try {
    switch (tc.function.name) {
      // ── 项目/稿件读取 ──
      case "get_project": {
        const drafts = (await listDrafts(p)).map((a) => a.slice(p.dir.length + 1).split("\\").join("/"));
        return JSON.stringify({
          ok: true,
          name: p.name, title: p.title, dir: p.dir,
          designSystem: p.config.designSystem ? { dir: p.dsDir, alias: p.dsAlias } : null,
          tokens: p.config.tokens ?? null, icons: p.config.icons ?? null,
          limits: p.limits, gitEnabled: p.gitEnabled,
          drafts,
        });
      }

      /* ── 泛型文件（M8）。设计稿之外的东西走这四件；`.dc.html` 在 write_file / move_file 里会被拒。
         少了它们，AI 面对 `.md` 只会一路撞 patch_draft 的「文件名必须以 .dc.html 结尾」【实测 2026-09-24】。 ── */
      case "list_files": {
        const r = await listFiles(p, String(args.dir ?? ""));
        return JSON.stringify({ ok: true, dir: r.dir, types: r.types,
          entries: r.entries.map((e) => ({ path: e.path, kind: e.kind, isDir: e.isDir, size: e.size, snapshot: e.snapshot ?? null })) });
      }
      case "read_file": {
        const r = await readAnyFile(p, String(args.path ?? ""));
        return JSON.stringify({ ok: true, path: r.path, kind: r.kind, size: r.size, sha256: r.sha256,
          snapshot: r.snapshot ?? null, content: r.content, why: r.why ?? null,
          note: r.content === null ? "这是二进制或超限文件，没有正文" : "改它之前把 sha256 原样带回 write_file" });
      }
      case "write_file": {
        const r = await writeAnyFile(p, String(args.path ?? ""), String(args.content ?? ""),
          { expectSha256: typeof args.expectSha256 === "string" ? args.expectSha256 : undefined, origin: "AI", note: typeof args.note === "string" ? args.note : undefined });
        return JSON.stringify({ ok: true, path: r.path, snapshot: r.snapshot, previous: r.previous, bytes: r.bytes, sha256: r.sha256 });
      }
 
      /* ══════ M16-7b 换上来的通用三件（理由见工具表那边的注释）══════ */
      case "list_file_versions": {
        const r = await listSnapshotMeta(p, String(args.path ?? ""));
        return JSON.stringify({ ok: true, path: String(args.path ?? ""), snapshots: r });
      }
      case "read_file_version": {
        const r = await readSnapshotContent(p, String(args.path ?? ""), String(args.version ?? ""));
        return JSON.stringify({ ok: true, path: String(args.path ?? ""), version: String(args.version ?? ""), content: r });
      }
      case "revert_file": {
        const r = await revertFile(p, String(args.path ?? ""), String(args.version ?? ""), "AI");
        return JSON.stringify({ ok: true, ...r });
      }     case "move_file": {
        const r = await moveFile(p, String(args.from ?? ""), String(args.to ?? ""));
        /* ⚠️ **把警告一起给模型**（issue #99，2026-10-06）。
           原来这里手挑了三个字段，把 `refused`（引用方被写入口拒绝、**引用没改成**）
           和 `unresolved`（解不出来的写法）丢掉了 —— 于是模型拿到的是
           `ok:true` 加一份「改了哪些」的清单，**它没有任何信号知道还有稿的引用断了**，
           会照着这份结果告诉用户「挪好了，引用都更新了」。
           #92 那句「**假回执比没有回执糟**」在这条路上原样存在。
           ⚠️ `warning` 这个字段是**专门给模型读的一句话** ——
           只给 `refused` 数组的话，它得自己判断「空不空意味着什么」。 */
        const stuck = (r.refused?.length ?? 0) + (r.unresolved?.length ?? 0);
        return JSON.stringify({
          ok: true, from: r.from, to: r.to, rewrote: r.rewrote, steps: r.steps,
          ...(r.refused ? { refused: r.refused } : {}),
          ...(r.unresolved ? { unresolved: r.unresolved } : {}),
          ...(stuck ? { warning: `有 ${stuck} 处引用没改成（见 refused / unresolved）—— 文件已经挪走了，那几处引用现在是断的，要照实告诉用户` } : {}),
        });
      }

      // ── 设计系统检索 ──

      // ── 校验与写入 ──

      // ── 版本与变更 ──

      // ── 节点定位与属性编辑 ──

      // ── 引用图谱 ──

      /* ── 格式转换（2026-10-18）。实现在能力注册表（`cap/convert.ts`），这里**只转调** ——
         MCP 面（通道 B 的本地 CLI、外部客户端）和插件面（`file.convert`）走的是同一件能力，
         这条通道的工具表是手写的（见下面 `tools`），所以要在这里接一次，但判据、路径校验、成品规矩不另写。
         `via: "mcp"` → 快照记「AI」，和这条通道的 write_file 一致。 ── */
      case "convert_file":
      case "list_convert_targets": {
        const cap = allCaps().find((c) => c.name === tc.function.name);
        if (!cap) return JSON.stringify({ ok: false, error: `能力 ${tc.function.name} 不在注册表里` });
        const r = await cap.run(args as never, { project: p, via: "mcp" });
        const data = typeof r.data === "object" && r.data !== null ? r.data as object : {};
        return JSON.stringify(r.ok ? { ok: true, ...data }
          : { ok: false, ...data, error: r.errors.map((e) => e.fix ? `${e.message}（${e.fix}）` : e.message).join("；") });
      }

      default: {
        /* 插件动词（`plugin/verbs.ts`，M13-1）：名字带 `__` 的先问动词表。授权在 `invokeVerb` 里再验一次 ——
           工具表是这一轮开始时的快照，许可证可能中途过期。 */
        if (tc.function.name.includes("__") && await isVerb(tc.function.name)) {
          const r = await invokeVerb(tc.function.name, args, p);
          return JSON.stringify(r.ok ? { ok: true, ...(typeof r.data === "object" && r.data !== null ? r.data as object : { result: r.data }) }
            : { ok: false, error: r.message, code: r.code, ...(r.market_url ? { market_url: r.market_url } : {}) });
        }
        return JSON.stringify({ ok: false, error: `未实现的工具: ${tc.function.name}` });
      }
    }
  } catch (e) {
    const m = (e as Error)?.message ?? String(e);
    return JSON.stringify({ ok: false, error: `${tc.function.name} 执行失败: ${m}` });
  }
}

/** 续接会话时历史必须配得上对：每个 assistant.tool_calls 后面要跟齐全部 tool 结果（带 tool_call_id），
 *  否则 OpenAI 形状的端点会 4xx。修 toolCallId 落盘之前的旧会话里 tool 条目没有 id ——
 *  对这种条目：丢掉没 id 的 tool 消息，并把对不上结果的 tool_calls 从 assistant 里剥掉（保留文本）。 */
function sanitizeHistory(msgs: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i] as ChatMessage;
    if (m.role === "tool") { if (m.tool_call_id) out.push(m); continue; }
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length) {
      const ids = new Set<string>();
      for (let j = i + 1; j < msgs.length && (msgs[j] as ChatMessage).role === "tool"; j++) {
        const id = (msgs[j] as ChatMessage).tool_call_id; if (id) ids.add(id);
      }
      const complete = m.tool_calls.every((tc) => ids.has(tc.id));
      if (!complete) { const { tool_calls: _drop, ...rest } = m; if (rest.content) out.push(rest as ChatMessage); continue; }
    }
    out.push(m);
  }
  return out;
}

/** chat_send：加载/新建会话 → 选中节点上下文 → 通道 A agent 循环或通道 B 子进程 → 审计变更。返回信封。 */
/** 系统提示里「看不看得了图」那一句的占位 —— 降级换通道时按新通道的能力重填 */
const IMAGE_NOTE_SLOT = "\u0000IMAGE_NOTE\u0000";
function imageNote(seeImage: boolean): string {
  return seeImage
    ? [
        "随这条消息发过去的**只有圈中的那一块**，不是整张图 —— 别拿它描述整张图长什么样。",
        "坐标是原图像素，原点在左上角：x 向右增大，y 向下增大。回答时引用坐标，别只说「这里」。",
      ].join("\n")
    : "**你看不到图**（当前通道不支持图片），只有坐标和他的话。别猜图上画的是什么；需要看图就直说「这个通道看不了图，换一个能看图的模型」。";
}
/** 换到看不了图的通道时，把已经挂上去的图片段去掉，只留文字 */
function stripImages(history: Array<{ content: unknown }>): void {
  for (const m of history) {
    if (!Array.isArray(m.content)) continue;
    const text = (m.content as Array<{ type: string; text?: string }>).filter((x) => x.type === "text").map((x) => x.text ?? "").join("");
    m.content = text;
  }
}

/** 一份稿的「跑之前长什么样」：最新版本号 + 内容哈希。 */
export interface DraftStamp { ver: string; sha: string }

/** 给一份稿记一次戳。**前后两次用同一个函数**（issue #41，2026-10-02）。
 *
 *  ⚠️ 原来前后各写一份几乎一样的代码，而**它们不对称**：
 *  before 对所有稿都记（没版本记 `ver: ""`），after 那边第一行是
 *  `if (!vs.length) continue` —— 于是「从没走过写入口的稿」只进 before 不进 after，
 *  `bypassedDrafts` 看到 after 里没有它就当「跑完被删了」，一句话都不说。
 *
 *  **两份几乎一样的代码，差别就藏在那一行里。** 收成一处之后这种不对称
 *  在结构上就不可能再出现 —— 这比加一条判据更根本（判据只能发现它，
 *  一处定义是让它发生不了）。
 *
 *  `ver` 用 `""` 表示「还没有任何版本」：它和 `bypassedDrafts` 的判定配套 ——
 *  `"" → ""` 而 sha 变了 = 被绕过改了；`"" → "v1"` = 走了写入口（版本号变了）。
 */
export async function stampInto(
  into: Map<string, DraftStamp>,
  rel: string,
  abs: string,
  versions: string[],
): Promise<void> {
  try {
    into.set(rel, {
      ver: versions.length ? (versions[versions.length - 1] as string) : "",
      sha: createHash("sha256").update(await readFile(abs)).digest("hex"),
    });
  } catch { /* 读不到就算了 —— 少一份戳只是少报一条，不该让整轮会话失败 */ }
}

/** 哪些稿是**绕过写入口**被直接改掉的（issue #29）。
 *
 *  判据只有一句：**内容变了，而版本号没变**。
 *  走写入口的每一次落盘都会产生新版本号，所以「内容变了版本号却没动」
 *  只可能是有人直接写了盘 —— 通道 B 的 codex / cursor-agent 自带写文件的工具，
 *  模型觉得 `apply_patch` 更顺手时就会那么做。
 *
 *  ⚠️ **为什么要单独有这个函数**：不抽出来的话，这段判定只在
 *  `runChatSend` 的通道 B 分支里，而那条路要真起一个 CLI 子进程才走得到 ——
 *  判据就只能跑真 AI（花钱，且不稳定）。抽成纯函数之后
 *  喂两份快照就能测，测的还是**真代码**而不是复制品（#27 / #34 同一条经验）。
 *
 *  ⚠️ 只报**两边都有**的稿：跑完才出现的新稿不算「被绕过改的」，
 *  它本来就没有上一版（新建走的是另一条路，有自己的审计）。
 */
export function bypassedDrafts(before: Map<string, DraftStamp>, after: Map<string, DraftStamp>): string[] {
  const out: string[] = [];
  for (const [rel, b] of before) {
    const a = after.get(rel);
    if (!a) continue;                       // 跑完没了（删了）—— 删除有自己的审计
    if (a.ver !== b.ver) continue;          // 版本号变了 = 走了写入口，正常
    if (a.sha !== b.sha) out.push(rel);     // 内容变了而版本号没动 = 绕过去了
  }
  return out;
}

export async function runChatSend(p: Project, a: ChatSendArgs): Promise<Envelope<any>> {
  const { message, sessionId, channel, selectedNodeFile, selectedNodeAddress, selectedFiles, selectedRange, selectedRegion, contextFile, abortSignal } = a;
  const cfgAll = await getAiConfig();
  const ch = channel ?? cfgAll.defaultChannel ?? "a";
  /** A 与 C 同形（OpenAI 兼容），走同一条 agent 循环；B 是 Claude Code 子进程 */
  const isOpenAiChannel = ch === "a" || ch === "c";

  // 加载或新建会话
  let session: ChatSession | null = sessionId ? await loadChat(p.dir, sessionId) : null;
  if (!session) {
    session = await createChat(p.dir, {
      projectId: p.name,
      channel: ch,
      model: (ch === "c" ? cfgAll.channelC?.model : ch === "b" ? cfgAll.channelB?.model : cfgAll.channelA?.model) ?? "unknown",
      // 本地 CLI 那条要记下具体是谁（claude / codex / cursor-agent），不然历史里只剩「本机工具」
      ...(ch === "b" ? { tool: cfgAll.channelB?.cli ?? "claude" } : {}),
    });
  }

  // 用户消息写入会话 —— 要拿回更新后的会话对象：下面的 history 从它取，
  // 否则发给模型的只有 system 一条，用户那句根本不在（智谱直接 400「messages 参数非法」，2026-09-23 实测）
  session = await addMessage(p.dir, session.id, { role: "user", content: message });

  /* ── 打桩的那一轮（Q49，2026-10-07）──
     一句以 `#stub` 开头的话走打桩，**不联网、不读 key、不落盘**。
     规则**只住在这一处**，理由与代价全写在 `chat_stub.ts` 的文件头。
     ⚠️ 放在用户消息落盘**之后** —— 界面是乐观追加那句话的，
     而第一次轮询会用服务端的消息整份替换掉；服务端没有的话用户那句**当场消失**。 */
  const stubPlan = parseStub(message);
  if (stubPlan) {
    const out = await runStubRound(p.dir, session, stubPlan, abortSignal);
    return envelope(out, stubPlan.fail ? [err(X.IO, p.rel, { kind: "key", name: "ai" }, stubPlan.fail)] : [], {});
  }

  // ── 选中节点上下文（M2-8） ──
  let nodeContext: string | null = null;
  if (selectedNodeFile && selectedNodeAddress) {
    try {
      const loc = await locateNode(p, selectedNodeFile, selectedNodeAddress);
      const editableSlots = loc.slots.filter((s) => s.editable);
      nodeContext = [
        `【当前选中节点】`,
        `  稿: ${loc.file}`,
        `  节点地址: ${loc.node}`,
        `  标签: ${loc.tag}`,
        `  源码位置: 第 ${loc.at.line} 行第 ${loc.at.col} 列`,
        `  在 sc-for 循环中: ${loc.inList ? "是（改动会影响循环所有行）" : "否"}`,
        `  可编辑项 (${editableSlots.length} 个):`,
        ...editableSlots.slice(0, 15).map((s) => `    - ${s.kind}: ${s.name} = "${String(s.value).slice(0, 80)}"`),
        ...(editableSlots.length > 15 ? [`    ... 还有 ${editableSlots.length - 15} 个可编辑项`] : []),
      ].join("\n");
    } catch {
      // 节点地址可能已过期，静默忽略
    }
  }

  /* ── 选中文件上下文（M8-4）：给路径、类型、大小，外加文本的头几行。
     不把正文整份塞进系统提示 —— 模型有 read_file，要看自己去读；这里只保证它**知道是哪几个**。 ── */
  let filesContext: string | null = null;
  if (selectedFiles && selectedFiles.length) {
    const lines: string[] = [`【当前选中的文件】共 ${selectedFiles.length} 个`];
    for (const rel of selectedFiles.slice(0, 20)) {
      try {
        const info = await readAnyFile(p, rel);
        const head = info.content ? info.content.split("\n").slice(0, 3).map((x) => x.trim()).filter(Boolean).join(" / ").slice(0, 100) : "";
        lines.push(`  - ${rel}（${info.kind}，${info.size} 字节${info.width ? `，${info.width}×${info.height}` : ""}）${head ? ` — ${head}` : ""}`);
      } catch {
        // 目录不是「读不到」，它本来就不是文件 —— 说错了模型会以为出了故障
        try { const d = await listFiles(p, rel); lines.push(`  - ${rel}（目录，${d.entries.length} 项）`); }
        catch { lines.push(`  - ${rel}（读不到，可能刚被挪走）`); }
      }
    }
    if (selectedFiles.length > 20) lines.push(`  … 还有 ${selectedFiles.length - 20} 个`);
    filesContext = lines.join("\n");
  }

  /* ── 选中段落（M8-8）：给路径、行范围、原文。改的时候要**只改这一段** ── */
  let rangeContext: string | null = null;
  if (selectedRange?.text) {
    rangeContext = [`【当前选中的一段】${selectedRange.label}`, "```", selectedRange.text.slice(0, 4000), "```"].join("\n");
  }

  /* ── 图片圈选（M8-10）：坐标与备注一律发（文字通道也读得懂）；**图只在通道支持时发**。
     不支持还硬发，对面要么报错要么把 base64 当文本吞进去烧 token —— 两种都比说一句「这个通道看不了图」差。 ── */
  let canSeeImage = false;
  let regionContext: string | null = null;
  if (selectedRegion?.label) {
    regionContext = [`【用户在图上圈了一块】${selectedRegion.label}`, selectedRegion.note ? `他说：${selectedRegion.note}` : ""].filter(Boolean).join("\n");
  }

  // 通道 A / C：同一条 agent 循环，只是配置不同（C 是订阅额度那条，优先用）
  if (isOpenAiChannel) {
    let providerCfg = await getOpenAiChannel(ch as "a" | "c");
    canSeeImage = channelSupportsImage(providerCfg);

    // ── 记录循环前各稿的版本（用于审计变更） ──
    const draftVersionsBefore: Map<string, string> = new Map();
    try {
      const allDrafts = await listDrafts(p);
      for (const abs of allDrafts) {
        const rel = abs.slice(p.dir.length + 1).split("\\").join("/");
        const vs = await listVersions(p, rel);
        if (vs.length > 0) draftVersionsBefore.set(rel, vs[vs.length - 1] as string);
      }
    } catch { /* 忽略，不影响主流程 */ }

    const history: ChatMessage[] = sanitizeHistory(session.messages.map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content,
      ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId, name: m.toolName } : {}),
    })));

    // 工具定义：把我们现有的 MCP 工具暴露给模型
    const tools: ToolDef[] = [
      { type: "function", function: { name: "get_project", description: "取项目配置与稿清单", parameters: { type: "object", properties: { project: { type: "string" } }, required: ["project"] } } },
      { type: "function", function: { name: "list_files", description: "列一层目录里的所有文件（不只设计稿）。每项带 kind（dir/dc/md/image/code/html/other）、大小、快照号", parameters: { type: "object", properties: { project: { type: "string" }, dir: { type: "string", description: "相对项目根的子目录，不给就是项目根" } }, required: ["project"] } } },
      { type: "function", function: { name: "read_file", description: "读非设计稿的文件（.md / .json / .css / .svg…）。返回 content 与 sha256；改它之前先读，把 sha256 带回 write_file。二进制只给元数据", parameters: { type: "object", properties: { project: { type: "string" }, path: { type: "string" } }, required: ["project", "path"] } } },
      { type: "function", function: { name: "write_file", description: "写非设计稿的文件。写前用 expectSha256 校验（盘上被别人改过就拒绝），自动存快照可回退。不归一化、不动 frontmatter。.dc.html 会被拒，那个要用 write_draft", parameters: { type: "object", properties: { project: { type: "string" }, path: { type: "string" }, content: { type: "string", description: "整份新内容" }, expectSha256: { type: "string", description: "read_file 给的那个值；新建文件给 \"0\"" }, note: { type: "string", description: "这一版为什么改" } }, required: ["project", "path", "content"] } } },
      { type: "function", function: { name: "move_file", description: "改名 / 移动非设计稿的文件，并把稿里指向它的 href/src/url() 一起改掉", parameters: { type: "object", properties: { project: { type: "string" }, from: { type: "string" }, to: { type: "string" } }, required: ["project", "from", "to"] } } },
      /* ══════ 这三件是 M16-7b 换上来的通用版（2026-10-23，C3）══════
       *
       *  ⚠️⚠️ **摘掉 dc 那一套的时候，差点让模型丢掉一个它本来就有的能力。**
       *  工具表里原来列的是 `list_versions` / `revert_to` —— 它们读的是
       *  `snapDir` 里的 `v<N>.json`，也就是 **`write_draft` 存的语义快照**，
       *  和第二条写入口存的 `s<N>` **是两套**（`files.ts` 明说不混）。
       *  单纯摘掉它们，模型就没有「看版本 / 回退」的工具了 ——
       *  **而那个能力对任何文件本来就有，只是工具表里列的是 dc 那一版。**
       *  > **摘掉一件 dc 专属的工具之前，先问一句：它是不是某个通用能力的 dc 版？**
       *  所以换上 `cap/` 里的通用三件。 */
      { type: "function", function: { name: "list_file_versions", description: "这个文件存过哪些快照（版本号、时间、谁改的、备注）。改它之前想看历史就用它", parameters: { type: "object", properties: { project: { type: "string" }, path: { type: "string", description: "相对项目根的文件路径" } }, required: ["project", "path"] } } },
      { type: "function", function: { name: "read_file_version", description: "读某一版快照里存的原文，不动盘上那份。版本号用 list_file_versions 给的那个（形如 s3）", parameters: { type: "object", properties: { project: { type: "string" }, path: { type: "string" }, version: { type: "string", description: "快照号，形如 s3" } }, required: ["project", "path", "version"] } } },
      { type: "function", function: { name: "revert_file", description: "把文件退回某一版。退回本身也会留一版快照，所以退错了还能再退回来", parameters: { type: "object", properties: { project: { type: "string" }, path: { type: "string" }, version: { type: "string", description: "快照号，形如 s3" } }, required: ["project", "path", "version"] } } },
      { type: "function", function: { name: "list_convert_targets", description: "一个文件在这台电脑上能转成哪些格式。不能转的给 reason（如「没装 LibreOffice」）和 hint（安装命令），照实告诉用户；转之前先问它", parameters: { type: "object", properties: { project: { type: "string" }, path: { type: "string", description: "相对项目根的文件路径" } }, required: ["project", "path"] } } },
      { type: "function", function: { name: "convert_file", description: "把项目里一个文件转成别的格式（图片 / 文档 / 表格 / 音视频）。成品放在源文件旁边、重名加「 (1)」、永不覆盖；返回 state / output（成品路径）/ error / note（有损提醒）/ via", parameters: { type: "object", properties: { project: { type: "string" }, path: { type: "string", description: "相对项目根的源文件路径" }, to: { type: "string", description: "目标格式，如 pdf / jpg / mp4 / docx" }, quality: { type: "number", description: "有损图片（jpg / heic / avif / webp）质量 1–100，可不给" } }, required: ["project", "path", "to"] } } },
      /* 插件动词（M13-1）：装了什么、授权到哪，表就长什么样 —— 没授权的只剩插件标了 free 的那几件（`doc/22` §3.3）。
         扫不到（沙箱起不来）就当没有，不让一个坏插件把整轮会话拖死。 */
      ...(await listVerbs().catch(() => [])).map(verbToolDef),
    ];

    // 系统提示：设计助手角色 + 选中节点上下文
    const systemParts: string[] = [
      `你是 ${studioName} 助手，在一个本地目录工作台里干活。**全程用简体中文回答**，包括思考过程里给用户看的那些话。`,
      "这个目录里有两类文件，各走各的路，别串：",
      "  · **设计稿 `.dc.html`**：read_draft 读（每个元素带 data-ud-node 地址）→ set_prop 改一处 / patch_draft 增量改 / write_draft 整份写；改前后各 validate_draft 一次。",
      "  · **别的文件**（`.md`、`.json`、`.css`、图片…）：list_files 列 → read_file 读（拿 content 与 sha256）→ write_file 写（把那个 sha256 原样带回去，盘上被别人改过会被拒）。write_file 不归一化、不动 frontmatter。",
      "落盘要靠工具，不要口头说改了什么。",
      "⚠️ set_prop 只能改一处（一条样式/一个属性），用户说改多处时先改当前选中的。",
    ];
    if (nodeContext) {
      systemParts.push("", "### 当前选中节点（用户正在编辑的元素）", nodeContext, "", "用户说「这个」「这里」「字号大一点」等指向性描述时，就是指这个节点。用 set_prop 修改它的可编辑项，或调用 write_draft/patch_draft 做更大改动。");
    } else if (contextFile) {
      systemParts.push("", `### 用户当前正在看的稿：${contextFile}`, "用户说「这份稿」「这个按钮」时，默认指这份稿里的内容；先读它再改。");
    }
    if (filesContext) {
      systemParts.push("", "### 用户选中的文件", filesContext, "",
        "用户说「这几个」「它们」时就是指这些文件。要看内容用 read_file；改非设计稿用 write_file（带上 read_file 给的 sha256），改设计稿用 write_draft。");
    }
    if (rangeContext) {
      systemParts.push("", "### 用户选中的一段文字", rangeContext, "",
        "用户说「这段」时就是指它，**不要再问是哪一段**。改法：先 read_file 拿到全文与 sha256，把这一段替换掉、其余一个字都不动，再 write_file 带上那个 sha256。不要重写整份文档。");
    }
    if (regionContext) {
      systemParts.push("", "### 用户在图上圈的区域", regionContext, "", IMAGE_NOTE_SLOT);
    }

    /* 语言约束放最后一条：模型对系统提示末尾的指令更听话。
       放开头时 DeepSeek 仍会用英文写「I'll start by reading the file.」这类过渡句【实测 2026-09-24】。 */
    systemParts.push("", "### 语言", "所有回复一律用简体中文，包括「我先读一下文件」这类过渡句和工具调用前后的说明。不要用英文写给用户看的句子。");

    /* 图片只在通道支持时才随消息发。history 的最后一条是用户那句话，把图挂在它上面。 */
    if (canSeeImage && selectedRegion?.image) {
      for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i]!;
        if (m.role !== "user" || typeof m.content !== "string") continue;
        m.content = [
          { type: "text", text: m.content },
          { type: "image_url", image_url: { url: selectedRegion.image } },
        ];
        break;
      }
    }

    /** 系统提示随通道能力变（看不看得了图那句话不一样），所以降级时要重算 */
    const buildSystem = (seeImage: boolean) =>
      systemParts.map((x) => x === IMAGE_NOTE_SLOT ? imageNote(seeImage) : x).join("\n");

    const chatOpts = {
      messages: history,
      tools,
      maxSteps: 10,
      abortSignal,
      /* 逐步落盘（doc/00 §四十）：模型每回一条、每个工具一出结果就写进会话文件 ——
         界面轮询 chat_get 才能边跑边看到工具行长出来；中断时已跑的步骤也都留在会话里。 */
      onReply: async (reply: ChatMessage) => {
        await addMessage(p.dir, session!.id, {
          role: "assistant", content: typeof reply.content === "string" ? reply.content : (reply.content ?? []).map((x: { type: string; text?: string }) => x.type === "text" ? x.text ?? "" : "[图片]").join(""),
          ...(reply.tool_calls ? { toolCalls: reply.tool_calls } : {}),
        });
      },
      onToolCall: async (tc: ToolCall) => {
        const out = await executeToolCall(p, tc);
        // 工具结果要带 tool_call_id 落盘，否则续接会话时 provider 直接 422「missing field tool_call_id」【实测 DeepSeek 2026-09-23】
        await addMessage(p.dir, session!.id, { role: "tool", content: out, toolCallId: tc.id, toolName: tc.function.name });
        return out;
      },
    };

    let result = await chat(providerCfg, { ...chatOpts, systemPrompt: buildSystem(canSeeImage) });

    /* 订阅额度用完就退回按量那条（`11` Q33）。**只在这一轮什么都没干成时才退** ——
       已经调过工具（可能落过盘）的话重跑会重复改稿，那比报一次错糟得多。 */
    let fellBack: string | null = null;
    if (result.error && ch === "c" && looksLikeQuotaProblem(result.error) && !result.messages.some((m) => m.role === "assistant" && m.tool_calls?.length)) {
      const before = result.error;
      try {
        providerCfg = await getChannelA();
        canSeeImage = channelSupportsImage(providerCfg);
        if (!canSeeImage) stripImages(history);   // A 看不了图就别把图带过去
        result = await chat(providerCfg, { ...chatOpts, systemPrompt: buildSystem(canSeeImage) });
        fellBack = `通道 C 这一轮没跑成（${before.slice(0, 120)}），已自动换成通道 A（${providerCfg.model}）`;
        await addMessage(p.dir, session.id, { role: "system", content: fellBack });
      } catch (e) {
        // A 也没配就照原样报 C 的错
        void e;
      }
    }

    const diags = result.error ? [err(X.IO, p.rel, { kind: "key", name: "ai" }, result.error)] : [];
    session = (await loadChat(p.dir, session.id)) ?? session;   // 回包里的消息要含模型回复与工具调用，重新读盘

    // ── 审计本次 AI 会话对稿件的变更（M2-9） ──
    const changes: Array<{ path: string; from: string; to: string; counts: Record<string, number>; summary: string }> = [];
    try {
      const allDrafts = await listDrafts(p);
      for (const abs of allDrafts) {
        const rel = abs.slice(p.dir.length + 1).split("\\").join("/");
        const vs = await listVersions(p, rel);
        if (!vs.length) continue;
        const before = draftVersionsBefore.get(rel);
        if (!before) continue;
        const after = vs[vs.length - 1];
        if (after === before) continue;  // 这个稿没变

        // 有变更，计算 diff
        const d = await diffDrafts(p, rel, { from: before, to: after });
        if (d.changes.length > 0) {
          changes.push({
            path: rel,
            from: before, to: after as string,   // 面板上「回退到 <from>」要知道退到哪一版
            counts: d.counts,
            summary: `${d.counts.L1 ?? 0} 处契约变更(需改代码) · ${d.counts.L2 ?? 0} 处取值变更 · ${d.counts.L3 ?? 0} 处文案变更 · ${d.counts.L4 ?? 0} 处等价变更`,
          });
        }
      }
    } catch { /* 忽略，不影响主流程 */ }

    const chVal: "a" | "b" | "c" = ch;
    /* 服务端 AI 的失败分档（没会员 / 额度用完 / 欠费）随回包给界面：按钮文案与去处都在里面，界面不再抄一份表。
       只在这一轮真的失败了才给 —— 换通道重跑成功的话 `result.fail` 已经是新那轮的（空）。 */
    const failOut = result.fail && result.fail.action
      ? { kind: result.fail.kind, message: result.fail.message, action: result.fail.action, topupUrl: result.fail.topupUrl, hint: failHint(result.fail.kind) }
      : null;
    return envelope<{ sessionId: string; channel: "a" | "b" | "c"; messages: ChatEntry[]; usage: typeof result.usage; interrupted: boolean; changes: typeof changes; fellBack?: string | null; fail?: typeof failOut }>({
      sessionId: session.id,
      channel: chVal,
      messages: session.messages.slice(-10),
      usage: result.usage,
      interrupted: result.interrupted,
      changes,
      ...(failOut ? { fail: failOut } : {}),
    }, diags, {});
  }

  // 通道 B：Claude Code 子进程（M2-3）

  // 记录循环前各稿的版本（用于审计变更）
  const draftVersionsBeforeB: Map<string, string> = new Map();
  /* ⚠️ **也记内容哈希**（issue #29，2026-09-28）。
     通道 B 的 CLI 里 codex / cursor-agent **自带写文件的工具**，模型觉得
     `apply_patch` 更顺手时就会绕开我们的写入口 —— 那样没有快照、没有归一化、
     没有 `__resources`，**而且版本号不变**。
     下面的审计靠「版本号变了没」判断改动，于是这种改动会让变更卡**显示为空**，
     界面等于在说「这一轮什么都没改」。
     **界面说谎比功能缺失糟**（和 issue #35 那条「假回执」是同一族）。
     所以再记一份 sha：内容变了而版本号没变 = 有人绕过写入口动了它。 */
  const stampBeforeB: Map<string, DraftStamp> = new Map();
  try {
    const allDrafts = await listDrafts(p);
    for (const abs of allDrafts) {
      const rel = abs.slice(p.dir.length + 1).split("\\").join("/");
      const vs = await listVersions(p, rel);
      if (vs.length > 0) draftVersionsBeforeB.set(rel, vs[vs.length - 1] as string);
      await stampInto(stampBeforeB, rel, abs, vs);
    }
  } catch { /* 忽略 */ }

  const bCfg = await getChannelB();  // 通道 B 自己的配置，不和 A 共用（doc/11 Q11）
  const bCli = bCfg.cli ?? "claude";
  const bSpec = specOf(bCli);

  /* 通道 B 的系统提示。
     **第一句必须是当前项目的绝对路径** —— 通道 B 的工具跑在独立的 MCP server 进程里，
     它不像通道 A/C 那样天生知道「用户正在看哪个项目」，只能靠 `project` 参数。
     不给路径它就得 `list_projects` 猜，而用户打开的目录多半不在 projectsRoot 下（这正是
     Umbra Studio 的核心场景），于是它反复试到超时 —— 2026-09-24 实测 120 秒耗尽、零工具调用。 */
  const bSystemParts: string[] = [
    `你是 ${studioName} 设计助手。你可以通过 MCP 工具 umbrastudio 读取和修改这个项目里的文件。`,
    "",
    "### 当前项目（所有工具的 project 参数一律传这个绝对路径，不要传项目名，也不要去 list_projects 找）",
    `project = ${p.dir}`,
    `项目名：${p.name}${p.title && p.title !== p.name ? `（${p.title}）` : ""}`,
    "",
    "两类文件分两条路走，不要混：",
    "- `.dc.html` 设计稿 → `write_draft` / `patch_draft`。改前先 `validate_draft`，改完再 `validate` 一次。",
    "- 其它文件（`.md`、代码、文本）→ `read_file` / `write_file`。`write_file` 要先读到 sha256 再带上，它靠这个防覆盖。",
    "",
    "全程用简体中文回答。",
  ];
  if (nodeContext) {
    bSystemParts.push("", "### 当前选中节点", nodeContext, "", "用户说「这个」「这里」时，就是指这个节点。");
  } else if (contextFile) {
    bSystemParts.push("", `### 用户当前正在看的稿：${contextFile}`);
  }
  if (filesContext) bSystemParts.push("", "### 用户选中的文件", filesContext);
  if (rangeContext) bSystemParts.push("", "### 用户选中的一段文字", rangeContext, "", "只改这一段，其余不动。");
  /* ⚠️ **圈选的坐标和备注原来整段漏在通道 B 外面**（issue #28）：
     前端把 `selectedRegion` 发过来了、`runChatSend` 也算出了 `regionContext`，
     但通道 B 的系统提示只拼了 node / file / files / range 四样。
     症状是「在图上圈一块说『这里换个颜色』，CLI 只收到那六个字」——
     坐标、备注、圈的是哪张图全没有，而且**不报错**：M8-10 这个功能在
     claude / cursor-agent / codex / gemini / opencode 五家上整个不可用，还看不出来。

     ⚠️ 那句「你看不到图」也必须给到 —— 不给的话模型不会说「这个通道看不了图」，
     只会去猜图上画的是什么。本地 CLI 这一类**一律看不到图**（我们只传文字给它），
     所以这里写死 `imageNote(false)`，不像 A/C 那样按通道能力填。 */
  if (regionContext) bSystemParts.push("", "### 用户在图上圈的区域", regionContext, "", imageNote(false));

  const ccResult = await runLocalCli({
    cli: bCli,
    model: bCfg.model,
    mcpServerPath: join(TOOL_ROOT, "server", "dist", "index.js"),
    cwd: p.dir,
    prompt: message,
    systemPrompt: bSystemParts.join("\n"),
    timeoutMs: 240000,
    maxBudgetUsd: bCfg.maxBudgetUsd,
    baseUrl: bCfg.baseUrl,
    apiKey: bCfg.apiKey,
    logFile: process.env.UMBRASTUDIO_CHANNEL_B_LOG,
  });

  /* 把结果存入会话。**要拿 addMessage 的返回值覆盖 session** ——
     它写的是盘上的文件，内存里这个 `session` 是请求开始时读的旧对象，
     而下面 `messages: session.messages.slice(-10)` 就是从它取的。不覆盖的话
     前端发一次消息只看得到自己那句，AI 的回答要等下次刷新才出现（2026-09-24 实测）。 */
  if (ccResult.result) {
    session = await addMessage(p.dir, session.id, { role: "assistant", content: ccResult.result });
  }

  const usageInfo = ccResult.usage
    ? { promptTokens: ccResult.usage.inputTokens, completionTokens: ccResult.usage.outputTokens, totalTokens: ccResult.usage.inputTokens + ccResult.usage.outputTokens }
    : null;

  const diagsB = ccResult.error
    ? [err(X.IO, p.rel, { kind: "key", name: "channel-b" }, `${bSpec.label}：${ccResult.error}`,
        bSpec.verified ? undefined : { fix: `这个 CLI 的适配器还没在真机上验过（${bSpec.note}）。要看它到底吐了什么：UMBRASTUDIO_CHANNEL_B_LOG=<文件> 再跑一次` })]
    : [];
  /* 为了让 CLI 认得我们的 MCP server，有些 CLI 要在项目里落一个配置文件（cursor 的 .cursor/mcp.json）。
     **动了用户的项目就要说一声** —— 悄悄写文件是最招人烦的那种「贴心」。 */
  if (ccResult.wroteFiles.length) {
    await addMessage(p.dir, session.id, { role: "system",
      content: `为了让 ${bSpec.label} 认得${productName}的工具，在这个项目里写了 ${ccResult.wroteFiles.join("、")}（只加了 umbrastudio 这一项，你原有的其它 MCP server 没动）。` });
  }

  // ── 审计本次 AI 会话对稿件的变更（M2-9，通道 B） ──
  const changesB: Array<{ path: string; from: string; to: string; counts: Record<string, number>; summary: string }> = [];
  /** 跑完的快照，和 `stampBeforeB` 对一遍就知道谁被绕过去改了（issue #29）。 */
  const stampAfterB: Map<string, DraftStamp> = new Map();
  try {
    const allDrafts = await listDrafts(p);
    for (const abs of allDrafts) {
      const rel = abs.slice(p.dir.length + 1).split("\\").join("/");
      const vs = await listVersions(p, rel);
      /* ⚠️ **after 戳要对每一份稿都记，不管它有没有版本**（issue #41，2026-10-02）。
         原来这里第一行是 `if (!vs.length) continue;` —— 于是**跑之前从没走过写入口的稿**
         （快照目录里 0 个版本）永远进不了 `stampAfterB`，
         而 `bypassedDrafts` 看到 after 里没有它就按「跑完被删了」处理、不报。

         结果是：codex / cursor-agent 用自带工具直接改这种稿时，
         变更卡为空，**那条「这一轮有 N 份稿是被直接改的」也不出现** ——
         正是 issue #29 要消掉的「界面说这一轮什么都没改」。

         而「从没走过写入口」恰恰是**最常见的一类**：用户导入的、在别的编辑器里写的
         （#31 里他项目 29 份稿全是这一类）。对它们这道兜底完全不生效，
         而且它们被直接改之后**连一版快照都没有**，比有版本的稿更退不回去。

         `stampBeforeB` 本来就是对所有稿都记的（没版本记 `ver: ""`）——
         **两边不对称才是这条 bug**。 */
      await stampInto(stampAfterB, rel, abs, vs);
      if (!vs.length) continue;
      const before = draftVersionsBeforeB.get(rel);
      if (!before) continue;
      const after = vs[vs.length - 1];
      /* 版本号没变的交给 `bypassedDrafts` 一处判断 —— **判定逻辑只有一份**，
         判据测的就是它（见那个函数的注释）。戳上面已经记了。 */
      if (after === before) continue;

      const d = await diffDrafts(p, rel, { from: before, to: after });
      if (d.changes.length > 0) {
        changesB.push({
          path: rel,
          from: before, to: after as string,
          counts: d.counts,
          summary: `${d.counts.L1 ?? 0} 处契约变更(需改代码) · ${d.counts.L2 ?? 0} 处取值变更 · ${d.counts.L3 ?? 0} 处文案变更 · ${d.counts.L4 ?? 0} 处等价变更`,
        });
      }
    }
  } catch { /* 忽略 */ }

  /* ⚠️ **绕过写入口的改动要在会话里留一条**（issue #29）。
     写成 system 消息而不是只放进返回值：**它得留在会话记录里** ——
     用户过一会儿回来翻这一轮，才知道那几份稿是被直接改的、没有可退的上一版。
     文案里说清三件：改了哪几份 · 为什么没有快照 · 现在能做什么。 */
  const bypassed = bypassedDrafts(stampBeforeB, stampAfterB);
  if (bypassed.length) {
    await addMessage(p.dir, session.id, { role: "system",
      content: `⚠️ 这一轮有 ${bypassed.length} 份稿是**被 ${bSpec.label} 直接改的**，没走${productName}的写入口：${bypassed.join("、")}。\n`
        + `所以它们**没有快照，退不回去**，变更卡上也看不到这次改动（那不是「没改」，是我们拿不到前后两版）。\n`
        + `这几份稿还可能缺 __resources（断网会白屏）和节点地址（点选用不了）—— 在它上面点一次「加上地址」可以补回来。\n`
        + `要根治：在设置里把这条通道换成 Claude Code（它只放行${productName}的工具），或者让 AI 一律用 write_draft / write_file。` });
  }

  const chValB: "a" | "b" | "c" = ch;
  return envelope<{ sessionId: string; channel: "a" | "b" | "c"; messages: ChatEntry[]; usage: typeof usageInfo; interrupted: boolean; toolCalls: typeof ccResult.toolCalls; numTurns: number; changes: typeof changesB }>({
    sessionId: session.id,
    channel: chValB,
    messages: session.messages.slice(-10),
    usage: usageInfo,
    interrupted: false,
    toolCalls: ccResult.toolCalls,
    numTurns: ccResult.numTurns,
    changes: changesB,
  }, diagsB, {});
}
