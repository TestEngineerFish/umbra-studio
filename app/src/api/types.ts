/** 核心返回的形状（与 server/src/api.ts 一一对应；只写前端用到的字段） */
export type Health = "ok" | "warn" | "error" | "unchecked";

export interface Draft {
  file: string; title: string; kind: "page" | "component"; health: Health; healthWhy: string;
  diagnostics: { errors: number; warnings: number }; elements: number | null; version: string | null;
  updatedAt: string | null; states: string[]; imports: string[]; importedBy: string[];
}
export interface Diag { level: "error" | "warning" | "info"; code?: string; message: string; fix?: string; line?: number; col?: number }
/** 钉在节点上的一条评论。
 *  ⚠️ `sentAt` 和 `resolved` 是**两个维度**（M8-32）：前者「交给 AI 了没」，后者「人说处理完了没」。
 *  发过 ≠ 处理完（AI 可能改错），处理完也不必发过（自己动手改的）。
 *  暂存区看的是 `!sentAt && !resolved`；画布上发过的钉变灰。 */
export interface Comment { id: string; file: string; node: string; tag?: string; text: string; createdAt: string; resolved: boolean; sentAt?: string | null; line?: number | null }
export interface ChangeRow { level?: string; at?: string; message: string }
export interface VersionMeta { src?: string; time?: string; summary?: string; note?: string }
export interface ChangesData { file: string; versions: string[]; versionMeta: Record<string, VersionMeta>; diff?: { changes: Array<{ level?: string; at?: string; message?: string; target?: string; kind?: string }> } }
export interface SourceData { file: string; source: string; lines: number; bytes: number }
export interface Picked { file: string; node: string; tag: string }
/** 带进会话的选择项（S9 第五轮：五种）。`node` 来自 S2 点选桥；其余四种随 M8 的类型接入。
 *  `ref` 是给后端的定位信息：node 走 selectedNodeFile / selectedNodeAddress，别的类型 M8 再定。 */
export type SelectionKind = "node" | "range" | "region" | "files" | "dir";
export interface Selection { kind: SelectionKind; label: string; detail: string; ref?: { file?: string; node?: string }; /** region 药丸：裁出来的那一块（data URL），通道支持图片时随消息发过去 */ image?: string }
export const SELECTION_ICON: Record<SelectionKind, string> = { node: "⌖", range: "≡", region: "▢", files: "⧉", dir: "▤" };

/** 泛型文件层（M8，server/src/files.ts 的返回形状） */
/** 后端返回的 kind。**和前端是同一个类型** —— 出处在 `@shared/kinds`。
 *  留 `FileKindS` 这个名字只是为了不改一堆 import；新代码直接用 `FileKind`。 */
export type { FileKind } from "@shared/kinds";
export type FileKindS = import("@shared/kinds").FileKind;
export interface FileEntry {
  path: string; name: string; kind: FileKindS; isDir: boolean; size: number; updatedAt: string;
  count?: number; width?: number; height?: number; excerpt?: string; snapshot?: string;
  /** **别人的基础设施目录**（`.git`）—— 列出来让人知道它在，但我们不碰、也不计入统计（Q77）。
   *  ⚠️ **这个标记由服务端给**（`files.ts` 的 `isOpaquePath`）—— 前端不照名字自己猜，
   *  否则「哪些算基础设施」就有了两份清单，而两份清单迟早对不上。 */
  opaque?: boolean;
  /** 指向项目外的符号链接（issue #140）：列出来、标出来，但打不开 */
  outsideLink?: boolean;
}
/** ⚠️⚠️ **这是服务端 `files.ts` 里同名结构的第二份定义，而它一直缺两个字段。**
 *  `total` / `truncated` 服务端从一开始就回（`LIST_PAGE` = 200 那道截断），
 *  而这份手抄的类型压根没有它们 —— 2026-10-23 接「转到文件」时要读 `truncated`，
 *  编译当场报 `Property 'truncated' does not exist`。
 *  > **两份手抄的类型，缺字段的那一份不会报错 —— 它只会让那个字段在前端「不存在」。**
 *  `FileEntry` 没出这个问题纯属运气：它的字段一直够用。
 *  ⏳ 本该住在 `server/src/shared/`（前后端共用的纯 TS，`FileKind` 就在那儿）——
 *  搬它是一次独立的重构，这里先把字段补齐并留下这段话。 */
export interface ListFilesResult {
  dir: string;
  entries: FileEntry[];
  /** ⚠️ `dc` 那一档 2026-10-23（C3）去掉了 —— 它恒为 0（见服务端 `files.ts` 的注释）。 */
  types: { md: number; image: number; other: number };
  /** 截断之前这一层有多少项。⚠️ **`recursive` 那条路上它等于 `entries.length`** ——
   *  那条路扫到上限就停，算不出项目里一共有多少（服务端那份注释写了全文）。 */
  total?: number;
  /** entries 被截断过（递归模式下 = 扫到 5000 的上限就停了） */
  truncated?: boolean;
}
export interface ReadFileResult {
  path: string; kind: FileKindS; size: number; updatedAt: string; sha256: string;
  content: string | null;
  /** ⚠️ **给了正文时它也可能有值**（截断了、或「看着不像文本但你坚持要看」）——
   *  别拿它的有无去判断有没有正文，判 `content === null`。 */
  why?: string;
  /** 正文只是开头一段（M14-11）。界面要说一句，不然用户以为这就是全文。 */
  truncated?: boolean;
  lines?: number; snapshot?: string; width?: number; height?: number;
}
export interface FileSnapshotMeta { version: string; src: string; at: string; bytes: number; note?: string }
export interface ShellState { selectOn: boolean; preset: number; zoom: number; draftTheme: "light" | "dark"; picked: boolean; busy: boolean; editHint: string | null; checkNote: string | null; apiErr: string | null }

export interface ToolCall { id: string; function?: { name?: string; arguments?: string } }
export interface ChatMessage { role: "user" | "assistant" | "tool" | "system"; content: string; timestamp?: string; toolCalls?: ToolCall[]; toolCallId?: string; toolName?: string }
export interface ChatSessionRow {
  id: string; updatedAt?: string; channel?: string; model?: string; msgCount?: number;
  /** 能看的名字：用户起的，或首条用户消息截出来的（服务端算好） */
  title: string;
  /** true = 用户起的；false = 我们猜的（界面可以显示得淡一点） */
  titled?: boolean;
  /** channel b 下具体哪个本机 CLI */
  tool?: string;
}
export interface ChatNote {
  kind: "change" | "err"; idx: number; path?: string; from?: string; to?: string; summary?: string; reverted?: boolean; text?: string;
  /** 出错行上的按钮（服务端 AI 的 402 分档：去充值 / 开会员 / 重置卡 / 加量包）。`url` 空 = 点了只提示 `hint`。 */
  action?: { label: string; url: string; hint: string };
}
/** `chat_send` 回包里的失败分档（服务端 `ai_fail.ts` 给的，界面不抄表）。 */
export interface ChatFail { kind: string; message: string; action: string; topupUrl: string; hint: string }
export interface ChatUsage { totalTokens?: number; totalCostUSD?: number }

export interface ProjectRow { name: string; title: string; dir: string; drafts?: number; lastOpened?: string | null; missing?: boolean; /** 盘没挂上（issue #183）：**不是「没了」**，说法和出路都不同 */ unreachable?: boolean; thumb?: string | null; current?: boolean; generatedAt?: string | null }
export interface DirInfo { dir: string; exists: boolean; isDir: boolean; isProject: boolean; draftCount: number; suggestedName: string }

export const baseName = (p: string) => (p ? p.split("/").pop()!.split("\\").pop()! : "");
export const draftTitle = (file: string) => baseName(file).replace(/\.dc\.html$/, "");
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "刚刚"; if (s < 3600) return `${Math.floor(s / 60)} 分钟前`; if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`; return new Date(iso).toLocaleDateString();
}
export const HEALTH_LABEL: Record<Health, string> = { ok: "通过", warn: "有提醒", error: "有错误", unchecked: "未体检" };

/** 这台机器上一个 AI CLI 的状态（M2-13，服务端 local_cli.ts 的 CliStatus）。
 *  `verified` 是「在真机上跑通过没有」—— 界面要照实标，别让没验过的看着像验过。 */
export interface CliStatus {
  id: "claude" | "cursor-agent" | "codex" | "gemini" | "opencode";
  label: string;
  bin: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  /** MCP 怎么接进去：命令行给（干净）/ 往项目写文件 / 要你自己配全局 */
  mcpVia: "flag" | "workspace-file" | "global-config";
  /** events 才看得见工具行，text 只有最后一段话 */
  output: "events" | "text";
  reportsUsage: boolean;
  verified: boolean;
  modelHint: string;
  loginHint: string;
  note: string;
  /** 有这个才问得出「有哪些模型可用」（cursor-agent 有，claude 没有） */
  listModelsArgs?: string[];
}

/** 字节数给人看。**放在这儿而不是某个视图里** —— 文件卡、图片视图、目录列表都要它，
 *  M8-15b 之前它住在 `DirView.tsx`，另外两处 import 过去，等于让「目录视图」成了公共依赖。 */
export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
