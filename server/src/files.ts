/** 泛型文件层（M8-1 / M8-2，doc/01 §4.2）。
 *
 *  `.dc.html` 有自己那条唯一写入口（`write_draft`：归一化 → `@ds` 展开 → `__resources` →
 *  节点地址 → 语义快照 → changelog）。别的文件没有那套语义，但**同样不能裸写**：
 *  要有写前校验、要留得住上一版。所以这里给它们一条对应的路：
 *
 *      sha256 校验（Q8）→ 存一份原文快照 s<N> → 原子写 → 返回快照号
 *
 *  两条路的快照放在同一个目录（`.umbrastudio/snapshots/<路径>/`），靠前缀分开：
 *  稿是 `v<N>.json`（语义快照），别的文件是 `s<N>.json`（原文 + 元数据）。
 *  `listVersions` 只认 `v<N>`，互不干扰。
 *
 *  **不做的**：不归一化、不改编码、不动换行、不碰 frontmatter —— 写进去什么样，盘上就什么样（H5）。
 */
import { createHash } from "node:crypto";
import { BASE64_SAFE_MAX } from "./b64limit.js";
import { commitAfterWrite, commitExternalChanges } from "./gitkeep.js";
import { existsSync, statSync } from "node:fs";
import { mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, posix, relative, sep } from "node:path";
import { gzip as gzipCb, gunzip as gunzipCb } from "node:zlib";
import { promisify } from "node:util";
/** 异步解压（issue #48）—— 同步版会把整个服务进程停住 */
const gunzip = promisify(gunzipCb);
/* 写路径也走异步（issue #133）：图片比文本大一两个数量级，`gzipSync` 每存一次都在主线程上同步压一遍。 */
const gzip = promisify(gzipCb);
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";
import { type VersionOrigin, snapDir } from "./history.js";
import { isInside, isInsideReal, isOutsideLink } from "./pathguard.js";
import { writeAtomic } from "./normalize.js";
import { listDrafts, type Project } from "./project.js";

/* 类型联合也只有一份（`shared/kinds.ts`）。这儿曾经自己写了一遍，
   加 `json` 时它没跟上，编译器当场就抓出来了 —— 这正是统一的用处。 */
export type { FileKind };

/** 文本文件的上限：超过就只给元数据，不把整份塞进响应。
 *  ⚠️ 这是**模型 / MCP / HTTP / chat** 的上限，不进设置（大文件塞进模型上下文没有用）。
 *  插件来源的 `read_file` 用设置里的 `textReadMaxMB`（`plugin/limits.ts`，由 `cap/files.ts` 以 `opts.textMax` 传进来）。 */
export const TEXT_MAX = 2 * 1024 * 1024;

/* `BASE64_SAFE_MAX` 住在叶子模块 `b64limit.ts` 里（理由见那个文件），这里转一手 —— 
   原来它定义在本文件，而 `plugin/limits.ts` 静态 import 它会在模块求值期撞 TDZ。 */
export { BASE64_SAFE_MAX } from "./b64limit.js";

/** 读这个文件，**但最多读 `cap` 字节**（issue #181）。
 *
 *  ⚠️⚠️ 原来 `readAnyFile` 第一句就是 `await readFile(abs)` ——
 *  **先把整份读进内存，再判上限**。于是：
 *  · 超过 **2 GiB** 的文件直接撞 Node 的 `readFile` 上限 → 抛 → 包成 `E_IO`，
 *    **连「多大」和「可以按字节分段读」这两句都给不出来**；
 *  · 就算没到 2 GiB，一份 1 GB 的文件也会先占 1 GB 内存，**只为了之后告诉用户「超限了」**。
 *  > **判上限这件事只需要 `stat`，而我们却先读完了整份文件。**
 *
 *  回 `whole` 告诉调用方「这是不是整份」—— 它决定还能不能给 `sha256`
 *  （截断的内容配整份的摘要是**写回的假凭据**，M14-11 那条已经定过这个口径）。 */
async function readUpTo(abs: string, cap: number, size: number): Promise<{ buf: Buffer; whole: boolean }> {
  if (size <= cap) return { buf: await readFile(abs), whole: true };
  const fh = await open(abs, "r");
  try {
    const buf = Buffer.allocUnsafe(cap);
    const { bytesRead } = await fh.read(buf, 0, cap, 0);
    return { buf: buf.subarray(0, bytesRead), whole: false };
  } finally { await fh.close(); }
}
/** 二进制按字节给（base64）的上限 / 新建文件记快照的上限：**以设置为准**（`plugin/limits.ts` 的 `binaryReadMaxMB`，默认 100 MB）。
 *  原来是这里的常量 `BINARY_MAX = 100 MB`；2026-10-19 起插件读取改读设置，同一天把快照那条也改过去、删掉常量 ——
 *  留着它就会有一条路悄悄还按 100 MB 走，而设置页上写的是另一个数。
 *  ⚠️ **动态 import**：`plugin/limits.ts` 经 project → … 绕回本文件，静态引就成环（见那边 `LIMIT_RANGES` 的注）。 */
async function binaryMaxSetting(): Promise<number> {
  const { getPluginLimits } = await import("./plugin/limits.js");
  return (await getPluginLimits()).binaryReadMaxMB * 1048576;
}

/** 文件类型认定走 `shared/kinds.ts` 那一份唯一出处（M8-14）。
 *  以前这里有一份扩展名映射、前端 `layout.ts` 里还有一份，两份今天一致纯属运气 ——
 *  没有任何机制保证下次加扩展名时两边都会改。现在只有一处。 */
/* 文件类型的认定**只有一份**，在 `shared/kinds.ts` —— 前端 `app/` 也 import 同一份
   （`@shared/kinds`）。以前前后端各写一套 `kindOf`，两边迟早判不一样。
   注意是 import 进来再 re-export：`export {} from` 只转发，本模块内部还是取不到这个名字。 */
import { kindOf, isTextualPath, type FileKind, IMAGE_LIKE_KINDS } from "./shared/kinds.js";
import { assetDir, UD_DIRNAME } from "./statedirs.js";
import { isEditable } from "./records.js";   // M14-7 那道闸的判准
import { productName, studioName } from "./shared/brand.js";
export { kindOf };

/** 这个扩展名的内容能不能当文本读 */
/** 是不是文本 —— 走 shared 那一份。
 *  ⚠️ 这里原来的注释是「`.svg` 是图片但也是文本，**只看 kind 会误判**」——
 *  **2026-10-23（Q84）之后那句话不成立了**：`.svg` 是自己一种 kind 且 `textual: true`，
 *  所以看 kind 就够。这一层保留是因为它仍然是「别处别自己判」的唯一入口。 */
export function isTextual(rel: string): boolean { return isTextualPath(rel); }

export function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

/* ── 「这是谁的东西」：三条判准，各答一个问题（Q77，2026-10-21）─────────────────
 *
 * ⚠️ **原来只有一个 `isToolArtifact`**，最后一行是
 *    `rel.split("/").some((seg) => … || seg.startsWith("."))`
 * —— **一个谓词在回答两个不同的问题**，于是它在其中一个上必然是错的：
 *    · 「列表里显不显示」      → 点文件**该显示**（`.gitignore` / `.env` 是用户的文件）
 *    · 「能不能写 / 删 / 挪」   → `.git/HEAD` **绝不能写**
 *
 * **根因是判准的性质搞错了**：`startsWith(".")` 是一个**语法判准**（名字长什么样），
 * 而这里要答的是一个**归属判断**（这是谁的东西）。Unix 的点文件约定说的是
 * 「默认不列出来」，**从来不是「这是别人的东西」** —— 拿前者猜后者，
 * 在任何真实项目里都会错，因为 `.env` / `.gitignore` / `.eslintrc`
 * 全是用户最该改得动的文件。
 *
 * ⚠️ 实测（2026-10-21）用户三个项目各有 **2 / 6 / 6** 个点文件被隐藏，
 * 而**它们不是一类东西**：
 *   `.umbrastudio/` `.umbradesign/`         我们的产物 —— 改了下次重建就覆盖
 *   `.git/`                                 git 的 —— 写坏后果最重，且规模无界
 *   `.image-slots.state.json` `.thumbnail`  **ClaudeDesign 旧宿主**的产物
 *                                           （`project.ts` 的 `.gitignore` 模板里点着名）
 *   `.gitignore`                            **用户的** —— 我们只是建项目时拷一份模板
 *
 * **所以只拆成两条会得到一句错话**：`.gitignore` 在树里显示出来了 →
 * 用户点「删除」→ 报「**这是工具自己的文件，不能删**」，而它不是我们的文件。
 *
 * ⚠️ 这是 issue #75「**一道闸只守住一条路，等于没守**」的**反面** ——
 * 一道闸守了两条**不该用同一把尺子**的路。两种病的修法相反（前者合并到一处、
 * 后者拆开），而判断该合还是该拆的依据只有一条：
 * **这两个调用点问的是同一个问题吗。**
 *
 * ⚠️ **安全方向**：这是从**黑名单**（点开头全禁）改成**白名单**（点名哪些禁）。
 * 代价可控的依据是读数不是偏好 —— 真有破坏力的只有 `.git/` 与 `.umbrastudio/`
 * 两个，**都是固定名字**；其余（`_ds-tool` / `_runtime` / `index-data.js`）
 * 写坏了只是「下次重建覆盖」。
 * 这和 M14-3 purge 那条「安全线是白名单不是黑名单」同一个原理**而方向相反**：
 * purge 要白名单是因为「以后新加一种资产」默认该**被保护**；
 * 这里要白名单是因为「以后新出现一种点文件」默认该**归用户**。
 * **同一句口号用在相反的方向上 —— 所以它不是口号，是「默认值该站在哪一边」
 * 每次都要重新答一遍。**
 */

/** 工具自己产的文件名（索引页、运行时副本、系统垃圾）。 */
const TOOL_FILES = new Set(["index-data.js", "support.js", "react.production.min.js", "react-dom.production.min.js", ".DS_Store"]);
/** 我们自己产的**目录段**。改里面的东西没有意义 —— 下一次重建就覆盖掉了。 */
const OUR_SEGS = new Set([UD_DIRNAME, ".umbradesign", "_ds-tool", "_runtime"]);
/** 别人的基础设施：用户**该看得见它在**，但我们不碰、也不走进去。
 *  ⚠️ `.git` 为什么不递归：它的规模**与用户的稿无关而且无界增长**。
 *  2026-10-21 实测这两个项目只有 18 / 206 个文件（它们提交极少）——
 *  **那不是上限，所以不能拿它当理由**（「判据在没有样本的时候，测的是今天恰好没事」同族）。 */
const OPAQUE_SEGS = new Set([".git"]);

/** 工具自己部署过的壳页面。
 *
 *  ⚠️⚠️ **2026-10-23（M16-7c-2a / C3）从 `indexpage.ts` 搬过来的，而语义变了一半。**
 *  原来它有两个用处：① 索引与稿件清单要排掉它（否则工具界面出现在自己的稿件列表里）·
 *  ② 它是「我们自己产的」那条判准的一部分（隐藏 + 拒写）。
 *  **C3 之后 ① 没有了**（不再生成索引页，也没有「稿件清单」这个概念），
 *  而 **② 还在，并且正是它今天唯一的理由**：
 *  用户机器上**已经部署过**的那些壳还躺在他的项目里（硬约束：不删），
 *  认不出它们的话，它们就会以「用户的文件」的身份出现在目录树里、还能被写。
 *
 *  > **一个判定的两个用处里消失了一个，剩下那个会让它看起来「还在用着」——
 *  > 而它实际守的事已经换了。** 所以这段注释写的是**今天**的理由，不是它当初的理由。
 *
 *  ⚠️ **这张名单只增不减，而且不该再加新的**：它认的是**历史上部署过**的东西。
 *  删掉一个名字 = 那个壳在老用户的项目里突然变成「他的文件」。 */
const SHELLS = new Set([
  "S2-单稿预览壳.dc.html",
  "S3-诊断面板.dc.html",
  "S4-变更清单.dc.html",
  "S5-设计系统浏览器.dc.html",
  "S6-版本对比.dc.html",
  "S8-项目设置.dc.html",
  "S7-属性面板.dc.html",
  "IconGlyph.dc.html",
]);

/** 这是工具自己部署过的页面（不是用户的文件）—— 理由见 `SHELLS` 上面那段。 */
export function isToolPage(rel: string): boolean {
  return rel === "index.dc.html" || SHELLS.has(rel);
}

/** ① 这是**我们自己产的**吗 —— 隐藏 + 拒写。设置开关管不着它。 */
export function isOurArtifact(rel: string): boolean {
  const name = basename(rel);
  if (TOOL_FILES.has(name)) return true;
  if (isToolPage(name)) return true;
  return rel.split("/").some((seg) => OUR_SEGS.has(seg));
}

/** ② 这是**别人的基础设施**吗 —— 列得出来（用户该知道它在），但拒写、也不递归进去。 */
export function isOpaquePath(rel: string): boolean {
  return rel.split("/").some((seg) => OPAQUE_SEGS.has(seg));
}

/** 写入侧那道闸：**能不能写 / 删 / 挪 / 转**。
 *  ⚠️ 和改之前**不等价，它收窄了** —— 原来「任何以 `.` 开头的段」一律拒，
 *  现在只拒点名的那些。放行的那些正是用户自己的点文件（`.gitignore` / `.env` …），
 *  **而那本来就该是他改得动的**。 */
function isToolArtifact(rel: string): boolean {
  return isOurArtifact(rel) || isOpaquePath(rel);
}

/** ③ **列表里显不显示** —— 只管显示，受设置开关控制（`uiprefs.ts` 的 `showHiddenFiles`）。
 *  纯函数，**导出给判据**：`showHidden` 由调用方先读设置再传进来，
 *  这样「判准自己对」和「用对了设置」是两条各自能测的事（§170.3 同族）。 */
export function isHiddenFromList(rel: string, showHidden: boolean): boolean {
  if (isOurArtifact(rel)) return true;             // 我们的产物：开关管不着
  if (showHidden) return false;
  return rel.split("/").some((seg) => seg.startsWith("."));
}

/** 不许碰它的**话**：按**哪一条判准拦的**给，**一处定义**（Q77）。
 *
 *  ⚠️ **这是拆判准时自己踩到的坑**：判准拆成了三条，而四个调用点的话还是同一句
 *  「这是工具自己的文件」—— 于是 `.git/HEAD` 被拒时会说它是**我们的**文件，
 *  而它不是。更要紧的是 `.git` 这一轮**开始在文件树里显示了**（用户选的「显示但折叠」），
 *  所以用户**更容易点到它** —— 原来这句错话几乎没人看得见，现在看得见了。
 *
 *  > **拆了判准不跟着拆话，等于把一个判断错误换成一个表达错误。**
 *  > 而后者更难发现：代码行为是对的（确实拒了），只有话是错的。
 *
 *  返回 `null` = 这个路径可以碰。 */
export function denyReason(rel: string): { why: string; fix: string } | null {
  if (isOurArtifact(rel)) {
    return {
      why: `这是 ${studioName} 自己产的文件`,
      fix: "索引页、壳页面、运行时副本由 build_index 生成；改了也会被下一次重建覆盖。",
    };
  }
  if (isOpaquePath(rel)) {
    return {
      why: "这是 .git 里的东西 —— 版本控制自己的数据，不是项目内容",
      fix: "要动它请用 git 命令。Studio 写项目文件走自己的快照与 git 兜底，从不直接改 .git 里的内容。",
    };
  }
  return null;
}

export interface FileEntry {
  /** 相对项目根，始终用 / 分隔 */
  path: string;
  name: string;
  kind: FileKind;
  isDir: boolean;
  size: number;
  updatedAt: string;
  /** 目录：里面有几项；dc：元素数由索引给，这里不算 */
  count?: number;
  /** 图片的原始尺寸（读不出来就没有这一项） */
  width?: number;
  height?: number;
  /** 文本文件的第一行有效内容，给目录视图的第二行摘录用 */
  excerpt?: string;
  /** 最新快照号：稿是 v<N>，别的文件是 s<N> */
  snapshot?: string;
  /** **别人的基础设施目录**（`.git`）—— 列出来让用户知道它在，但我们不碰、也不递归进去。
   *  界面按这个标记把它折叠 / 置灰 / 排到末尾（Q77，用户选的 (b) 显示但默认折叠）。 */
  opaque?: boolean;
  /** **一条指向项目外面的符号链接**（issue #140，geek-99 2026-10-22 裁定）。
   *
   *  列出来、但读 / 写 / 删 / 预览一律拒。
   *  > **「列出来但打不开」比「不列出来」好** —— 用户看得见那个文件，
   *  > 才知道为什么它打不开，而不是以为软件丢了他的东西。
   *  ⚠️ 指向项目**内部**的链接**不带这个标记**，照常能用（别过度拦截）。 */
  outsideLink?: boolean;
}

export interface ListFilesResult {
  dir: string;
  entries: FileEntry[];
  /** 这一层里非目录文件的类型分布，给「自动网格」与 S1 的类型统计用 */
  /** 这一层里非目录文件的类型分布。
   *  ⚠️ **原来是四档，2026-10-23（M16-7c-2c / C3）去掉了 `dc` 那一档** ——
   *  `kindOf` 不再回 `"dc"`，那一档**恒为 0**。
   *  > **一个恒为 0 的读数比没有这个读数糟**：它看起来是「这个项目没有设计稿」，
   *  > 而真相是「没有设计稿这个概念了」。 */
  types: { md: number; image: number; other: number };
  /** 这一层实际有多少项（截断之前）。界面用它显示「还有 N 项」。
   *  ⚠️ **`recursive` 那条路上它等于 `entries.length`** —— 那条路扫到上限就停，
   *  压根不知道项目里一共有多少个文件。要说「还有多少」就得先走完全项目，
   *  而那正是上限要避免的事。所以**递归模式下界面读 `truncated` 说话，不读 `total`**。 */
  total: number;
  /** entries 是不是被截断过（递归模式下 = 扫到上限就停了，后面还有没扫的） */
  truncated: boolean;
}

/** 列一层目录（不递归）。目录在前，其余按更新时间倒序 —— 和 S12 定的顺序一致。 */
/** 一次最多返回多少条。超出的不传 —— 一个几千项的目录全传回去，
 *  光 JSON 就几 MB，而屏幕上一次也看不了那么多。设计侧第六轮定的口径：
 *  先给 200 条，末尾让界面显示「还有 N 项 · 全部显示」。 */
export const LIST_PAGE = 200;

/** 递归那条路一次最多给多少项（Q85 / geek-99 2026-10-23 定）。
 *
 *  ⚠️ **扫到这个数就停，不是「扫完再截前 5000」** —— 后者对一个十万文件的项目
 *  照样要走完整棵树，而上限要避免的正是那件事。
 *  代价是**不知道真实总数**，所以界面只能说「只搜了前 5000 个文件」，
 *  不能说「还有 N 个」。**照实说出自己量到哪儿，比给一个算不出来的数好。** */
export const WALK_MAX = 5000;

/** 递归列全项目的文件（Q85：「转到文件」要搜的那份名单）。
 *
 *  ⚠️⚠️ **它刻意不走 `listFiles` 那一层的逐项加工**：那条路对每个文件读图片尺寸
 *  （`imageSize`）、读首行摘要（`firstLine`）、查快照列表（`listSnapshots`）——
 *  对一层的两百项没问题，**对五千项是几千次 syscall 加上千次文件读**。
 *  搜索要的只有「名字、路径、什么时候改的」，所以这里只给那几样。
 *  > **同一件能力的两条路可以给不同详细度，但不能给不同形状** ——
 *  > 回的还是 `ListFilesResult`，界面和模型不用认第二种结构。
 *
 *  ⚠️ **广度优先，不是 readdir 顺序**。扫到上限就停意味着「哪些文件进得来」
 *  由遍历顺序决定，而 `readdir` 的顺序是任意的 —— 那样「搜不到某个文件」
 *  在一台机器上必现、换台机器就好了。按层走至少是**可解释**的：
 *  浅层先进来，而浅层文件更可能是人要找的那个。
 *
 *  ⚠️ 两道「不看」和树里完全同一把尺子：`isHiddenFromList`（显不显示，Q77）
 *  和 `isOpaquePath`（不走进 `.git` 这类 —— 它的规模与用户的文件无关而且无界增长，
 *  走进去等于拿 git 的 object 数量去填这 5000 个名额）。 */
async function walkAll(p: Project, limit: number): Promise<ListFilesResult> {
  const entries: FileEntry[] = [];
  const types = { md: 0, image: 0, other: 0 };
  const { showHiddenFiles } = await (await import("./uiprefs.js")).getUiPrefs();
  let truncated = false;
  const queue: string[] = [""];
  while (queue.length) {
    const dirRel = queue.shift()!;
    let list;
    try { list = await readdir(safeJoin(p, dirRel), { withFileTypes: true }); } catch { continue; }
    for (const e of list) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (isHiddenFromList(rel, showHiddenFiles)) continue;
      if (e.isDirectory()) { if (!isOpaquePath(rel)) queue.push(rel); continue; }
      if (entries.length >= limit) { truncated = true; break; }
      let st;
      try { st = statSync(join(safeJoin(p, dirRel), e.name)); } catch { continue; }
      const kind = kindOf(rel, false);
      entries.push({ path: rel, name: e.name, kind, isDir: false, size: st.size, updatedAt: st.mtime.toISOString() });
      bumpTypeCount(types, kind);
    }
    if (truncated) break;
  }
  /* ⚠️ `total` 在这条路上**就是 entries.length**（见 `ListFilesResult` 的注释）——
     给一个「扫到几个」而不是假装它是全项目的总数。 */
  return { dir: "", entries, types, total: entries.length, truncated };
}

export async function listFiles(p: Project, dirRel = "", limit?: number, opts?: { recursive?: boolean }): Promise<ListFilesResult> {
  /* ⚠️⚠️ **两条路的默认 `limit` 不同，而那个决定必须住在这里。**
     第一版我把它写在 `cap/files.ts`（`limit ?? (recursive ? WALK_MAX : LIST_PAGE)`），
     而签名上是 `limit = LIST_PAGE` —— 于是**直接调这个函数的人拿到 200 条**，
     第一次真量就撞到了：`listFiles(p, "", undefined, { recursive: true })` 回 200 项 + `truncated: true`。
     > **一个默认值在两个地方各有一个答案，就有一个是错的。**
     而它的症状恰好是我在 cap 层注释里自己写下的那一句（「少了但不报错」），
     —— 我写了那个担心，然后在下一步造出了它。闸和默认值都要装在**真正动手的那一层**（#75 同族）。 */
  const cap = limit ?? (opts?.recursive ? WALK_MAX : LIST_PAGE);
  /* 递归那条路**一进来就岔开**，底下那一层的逐项加工一个字节都不动（零回归面）。
     上限硬性 clamp 到 `WALK_MAX` —— 调用方给更大的数不算数，那是一道闸不是默认值。 */
  if (opts?.recursive) return walkAll(p, Math.min(Math.max(1, cap), WALK_MAX));
  const abs = safeJoin(p, dirRel);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new ToolError(err(X.IO, dirRel || ".", { kind: "path", name: dirRel },
      `${dirRel || "项目根"} 不是一个目录`, { fix: "先用 list_files 看看上一层有什么" }));
  }
  const entries: FileEntry[] = [];
  const types = { md: 0, image: 0, other: 0 };
  /* ⚠️ **动态 import**：`uiprefs.ts` 要 `STATE_ROOT`（在 `project.ts`），静态引会绕回本文件成环 ——
     和上面读 `plugin/limits.ts` 完全同一条路。 */
  const { showHiddenFiles } = await (await import("./uiprefs.js")).getUiPrefs();
  for (const e of await readdir(abs, { withFileTypes: true })) {
    const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
    /* ⚠️ 这里问的是「**显不显示**」，不是「能不能写」（Q77）——
       换成 `isToolArtifact` 的话用户的 `.gitignore` 又会在树里消失。 */
    if (isHiddenFromList(rel, showHiddenFiles)) continue;
    const full = join(abs, e.name);
    let st;
    try { st = statSync(full); } catch { continue; }   // 刚被删掉的，跳过
    const entry: FileEntry = {
      path: rel, name: e.name, kind: kindOf(rel, e.isDirectory()), isDir: e.isDirectory(),
      size: e.isDirectory() ? 0 : st.size, updatedAt: st.mtime.toISOString(),
    };
    /* ⚠️ **只对真的是链接的那几项做 realpath**（issue #140）——
       对每一项都解一次的话，一个几千文件的目录要多几千次 syscall，
       而**绝大多数文件压根不是链接**。`isSymbolicLink()` 来自 `withFileTypes`，
       是 `readdir` 顺手给的，不额外花钱。 */
    if (e.isSymbolicLink() && isOutsideLink(p.dir, full)) entry.outsideLink = true;
    if (e.isDirectory()) {
      /* 项数要和**这个用户看到的那个列表**一致，所以用同一把尺子（同一个 `showHiddenFiles`）——
         否则会出现「写着 3 项、点进去 5 个」。 */
      if (isOpaquePath(rel)) entry.opaque = true;
      try { entry.count = (await readdir(full)).filter((x) => !isHiddenFromList(`${rel}/${x}`, showHiddenFiles)).length; } catch { entry.count = 0; }
    } else {
      bumpTypeCount(types, entry.kind);
      if (IMAGE_LIKE_KINDS.includes(entry.kind)) Object.assign(entry, await imageSize(full));
      if (isTextual(rel) && entry.kind !== "dc" && st.size <= TEXT_MAX) entry.excerpt = await firstLine(full);
      const snaps = await listSnapshots(p, rel);
      if (snaps.length) entry.snapshot = snaps[snaps.length - 1];
    }
    entries.push(entry);
  }
  entries.sort((a, b) => (a.isDir === b.isDir ? b.updatedAt.localeCompare(a.updatedAt) : a.isDir ? -1 : 1));
  /* 截断**在排序之后** —— 先截再排的话，给出去的 200 条就不是「最该先看的 200 条」，
     而是 readdir 碰巧先读到的那些。 */
  const total = entries.length;
  const page = cap > 0 && total > cap ? entries.slice(0, cap) : entries;
  return { dir: dirRel, entries: page, types, total, truncated: page.length < total };
}

/** 把一个 kind 记到那四档粗分类里（稿 / 文档 / 图 / 其他）。
 *
 *  ⚠️⚠️ **这个函数的全部存在理由是「原来有两份一模一样的」**：
 *  `listFiles`（当前目录）和 `countTypes`（整个项目）各写了一遍同样的四档 if 链，
 *  而 2026-10-23 拆出 `svg` kind 那一下**两份一起过期了** ——
 *  矢量图静默落进 `other`，用户问「有几张图」时少算一张。
 *  只有 `countTypes` 那一份被 `filetest` 钉着，所以另一份是**悄悄坏的**。
 *  > **两份相同的判断，就是两个会一起过期、而只有一个会被发现的地方。**
 *
 *  ⚠️ **最后那个 `else` 是一个黑洞**：这四档是粗分类，不是 kind 的完整枚举 ——
 *  **每加一种 kind，它都会默默落进 `other`**，而没有任何东西会报警。
 *  这和「安全线是白名单不是黑名单」（M14-3）是同一个形状：
 *  那次的后果是「会被误删」，这次是「会被误归类」。**加新 kind 的人请回来看一眼。** */
function bumpTypeCount(types: { md: number; image: number; other: number }, kind: string): void {
  if (kind === "md") types.md++;
  else if (IMAGE_LIKE_KINDS.includes(kind)) types.image++;
  else types.other++;
}

/** 整个项目的类型统计（S1 的 `project.types`）。 */
export async function countTypes(p: Project): Promise<{ md: number; image: number; other: number }> {
  const t = { md: 0, image: 0, other: 0 };
  const { showHiddenFiles } = await (await import("./uiprefs.js")).getUiPrefs();
  const walk = async (dirRel: string): Promise<void> => {
    for (const e of await readdir(safeJoin(p, dirRel), { withFileTypes: true })) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (isHiddenFromList(rel, showHiddenFiles)) continue;
      /* ⚠️ **不走进 `.git`**（Q77）。它的规模与用户的稿无关而且无界增长，
         而这个函数是**整个项目递归**的 —— 走进去等于拿 git 的 object 数量
         去算「这个项目有几份稿」，既慢又错。 */
      if (e.isDirectory()) { if (!isOpaquePath(rel)) await walk(rel); continue; }
      bumpTypeCount(t, kindOf(rel));
    }
  };
  await walk("");
  return t;
}

/** 按**行**分页读的那一页（`read_file` 的 `offset` / `limit`，M13-3）。行号 1 起算。 */
export interface LineRange { from: number; to: number; total: number; more: boolean }
/** 按**字节**读的那一段（`read_file` 的 `byteOffset` / `byteLength`，只对插件开放）。
 *  `byteLength` 是**实际读到的**字节数（末段会比要的少），`more` = 这一段后面还有没有。 */
export interface ByteRange { byteOffset: number; byteLength: number; size: number; more: boolean }

export interface ReadFileResult {
  path: string; kind: FileKind; size: number; updatedAt: string;
  /** 整份字节的摘要。**截断时不给**（`truncated: true` 那种）——
   *  不是算不出，是**不想让它被当成写回的凭据**：拿整份的 sha + 截断的 content 去写回，
   *  写前校验会通过，然后静默把文件截短。同 `ReadFileBytesResult` 的口径。 */
  sha256?: string;
  /** 文本文件的正文；二进制或超限时为 null */
  content: string | null;
  /** 没给正文的原因。
   *  ⚠️ **给了正文时它也可能有值**（M14-11）：截断了、或者「看着不像文本但你坚持要看」——
   *  所以**不能拿 `why` 的有无去判断有没有正文**，判 `content === null`。 */
  why?: string;
  /** 正文**只是开头一段**（未知类型超过文本上限时给前 N KB，M14-11）。
   *  界面要据此说一句，不然用户会以为这就是全文。 */
  truncated?: boolean;
  lines?: number;
  snapshot?: string;
  /** 图片：原始尺寸 */
  width?: number; height?: number;
  /** 按哪种编码读出来的（只在不是 utf-8 时给）。二进制按字节给时是 `"base64"`。
   *  ⚠️ 它是**读法**不是文件属性 —— 盘上那份一个字节都没动。 */
  encoding?: string;
  /** 二进制文件的原始字节（base64）。**只在 `binary: true` 时给**（插件读 PDF / xlsx / zip 用，`read_file` 按 `via === "plugin"` 打开） */
  base64?: string;
  /** 按行分页时才有（`cap/files.ts` 补上）。按字节读的回包是另一个类型（`ReadFileBytesResult`），两种 `range` 不混 */
  range?: LineRange;
}

/** 按字节范围读的回包。**没有 `sha256`**：只读了一段，算不出整份的摘要 ——
 *  要写回请整份读（拿整份的 sha256 去做写前校验）。字段名和 umbra-plugins 那边定死了。 */
export interface ReadFileBytesResult {
  path: string; kind: FileKind; size: number; updatedAt: string;
  content: null; encoding: "base64"; base64: string;
  range: ByteRange;
}

/** 允许按哪些编码读。**白名单，不是「随便传什么都试」** ——
 *  `TextDecoder` 认得几十种，而我们只为「中文 CSV 被当成 UTF-8」这一类真实需求开口子。
 *  实测过这几种在 Node 和浏览器里都在（M10-5）。 */
const READ_ENCODINGS = new Set(["utf-8", "gbk", "gb18030", "big5", "shift_jis", "utf-16le", "windows-1252"]);

/** `opts.binary`：二进制文件也把原始字节按 base64 给（插件的约定：`content: null` + `encoding: "base64"` + `base64`，
 *  umbra-plugins `sdk/PLUGIN-SPEC.md` / pdf · xlsx · zip 三个插件都按它写）。**缺省不给** —— 模型 / MCP 调 `read_file`
 *  拿到一份 PDF 的 base64 只会把上下文撑爆，它们照旧拿「不是文本文件」。 */
/*  `opts.binaryMax`：按字节给的上限（字节）。不传就现读设置（`binaryMaxSetting`）。
 *  `opts.textMax`：文本整份给的上限（字节）。插件那条路传设置里的 `textReadMaxMB`，不传就是 `TEXT_MAX`（别的来源一律这个）。 */
/** 这堆字节**看着像不像文本**（M14-11 / Q76，给未知扩展名兜底用）。
 *
 *  ⚠️ **它只在 `kind === "other"` 这一档用** —— 已知类型按类型表说了算，
 *  不让嗅探去推翻「`.png` 不是文本」这种确定的事。
 *
 *  判准两条，都抄 git 的 `buffer_is_binary` 那一套，但第二条更严一点：
 *  ① **前 8 KB 里有 NUL（0x00）就不是文本** —— 这一条几乎不误判：
 *     文本编码里没有哪个合法字符会编出单个 0 字节（UTF-16 会，但它开头有 BOM，
 *     而带 BOM 的 UTF-16 我们本来也读不了，当二进制是对的）。
 *  ② 非 fatal 解码之后 **U+FFFD（替换字符）占比超过 10% 就不是文本** ——
 *     这一条抓的是「没有 NUL 但也不是 UTF-8」的那些（GBK 文本、某些压缩格式）。
 *
 *  ⚠️ **为什么不用 `TextDecoder(..., { fatal: true })` 一刀切**：
 *  样本是**截断**的（只取前 8 KB），而截断点很可能落在一个多字节字符中间 ——
 *  fatal 模式会因此判一份完全正常的中文文件是二进制。
 *  **「样本是截断的」这件事本身会改判准**，这是这个函数最容易写错的地方。
 *
 *  ⚠️ 空文件**算文本**：它没有任何二进制特征，而「打开一个空文件看到空」
 *  比「打开一个空文件被告知它是二进制」合理。
 *
 *  **导出给判据** —— 判准自己对，和用对了它，是两件各自要测的事。 */
export function looksTextual(buf: Buffer): boolean {
  if (buf.length === 0) return true;
  const head = buf.subarray(0, 8192);
  if (head.includes(0)) return false;
  const text = new TextDecoder("utf-8").decode(head);
  if (!text.length) return true;
  let bad = 0;
  for (const ch of text) if (ch === "\uFFFD") bad++;
  return bad / text.length <= 0.1;
}

/** 按**字符边界**截断，并把末尾那个可能被切坏的替换字符去掉。
 *  ⚠️ 直接 `decode(subarray(0, n))` 会在末尾留一个 `U+FFFD`（切在多字节中间），
 *  而那个字符会**原样画到界面上**变成一个黑问号 —— 看着像文件坏了。 */
function decodeHead(buf: Buffer, maxBytes: number): string {
  const out = new TextDecoder("utf-8").decode(buf.subarray(0, maxBytes));
  return out.endsWith("\uFFFD") ? out.slice(0, -1) : out;
}

export async function readAnyFile(p: Project, rel: string, encoding?: string, opts: { binary?: boolean; binaryMax?: number; textMax?: number; asText?: boolean } = {}): Promise<ReadFileResult> {
  const abs = mustFile(p, rel);
  const st = statSync(abs);
  /* ⚠️ **先算「这一次最多可能用到多少字节」，再决定读多少**（issue #181）。
     原来是先 `readFile` 整份、再判上限 —— 见 `readUpTo` 上面那段。
     上限取三者最大：文本上限（可能要给开头一段）· 二进制上限（要转 base64）·
     嗅探窗口（未知扩展名判不判是文本，只看前 8 KB）。 */
  const textMaxEarly = opts.textMax ?? TEXT_MAX;
  const binMaxEarly = opts.binary ? (opts.binaryMax ?? await binaryMaxSetting()) : 0;
  const cap = Math.max(textMaxEarly, binMaxEarly, 8192);
  const { buf, whole } = await readUpTo(abs, cap, st.size);
  const out: ReadFileResult = {
    path: rel, kind: kindOf(rel), size: st.size, updatedAt: st.mtime.toISOString(),
    content: null,
  };
  /* ⚠️ **只有整份读到了才给 `sha256`**（和 M14-11 截断那条同一个口径）：
     摘要是**写回的凭据**，而拿着一份算不全的摘要去 `write_file`，
     写前校验会**通过**，然后静默把文件截短而回执说「写成功」。
     **删掉凭据比多说一句话管用。** */
  if (whole) out.sha256 = sha256(buf);
  const snaps = await listSnapshots(p, rel);
  if (snaps.length) out.snapshot = snaps[snaps.length - 1];
  if (IMAGE_LIKE_KINDS.includes(out.kind)) Object.assign(out, await imageSize(abs));
  /* ⚠️ 复用上面那两个值，**不要再算一遍** —— 再算一遍就有两个来源，
     而「按哪个读」和「按哪个判」一旦分叉，症状是「它说超限却给了内容」。 */
  const textMax = textMaxEarly;
  if (!isTextual(rel)) {
    /* ── 未知扩展名的纯文本兜底（M14-11 / Q76，用户 2026-10-21 定的「任何文件都要能看」）──
       `kind === "other"` = 类型表不认得它。**不认得不等于看不了** ——
       `.log` / `.conf` / `.env.example` / `.ini.bak` 这些全落在这一档，
       而在这之前它们打开后**一个字都看不到**（通用文件卡只有元数据和四个动作）。

       ⚠️ **只对 `other` 嗅探**：`.png` 的「不是文本」是类型表说的确定的事，
       不该让一份碰巧没有 NUL 的图片把它推翻。
       ⚠️ `asText` 是**用户显式要求**那条路（「用纯文本打开」那颗钮）——
       嗅探必然有误判，而**没有出路的误判就是「这个文件打不开」**，
       正是这一条要消除的症状。所以显式那条**跳过嗅探**，只保留上限。 */
    if (out.kind === "other" && (opts.asText || looksTextual(buf))) {
      if (st.size > textMax) {
        /* 超限**不再整个拒绝，而是给前面一段** —— 对未知文件「看个开头」
           通常就够判断它是什么了（日志尤其）。已知文本类型照旧拒，不动它们的行为。 */
        out.content = decodeHead(buf, textMax);
        out.truncated = true;
        out.why = `文件 ${Math.round(st.size / 1024)} KB，只给了前 ${Math.round(textMax / 1024)} KB`;
        /* ⚠️ **截断了就不给 sha256** —— 和按字节范围读同一个口径（`ReadFileBytesResult`
           那句「只读了一段，算不出整份的摘要，要写回请整份读」）。
           理由不是「算不出」（整份的摘要在上面已经算过了），是**不想让它被当成写回的凭据**：
           拿着整份的 sha256 + 截断的 content 去 `write_file`，写前校验会**通过**，
           然后把文件截短 —— 而那是一次静默的数据丢失，回执还会说「写成功」。
           `umbra-plugins` 会话 2026-10-21 问的正是这件事。
           **删掉凭据比多说一句话管用**：少一个字段，那条路就走不通。 */
        delete (out as { sha256?: string }).sha256;
      } else {
        out.content = buf.toString("utf8");
      }
      out.lines = out.content.length ? out.content.split("\n").length : 0;
      if (opts.asText && !looksTextual(buf)) {
        /* 用户坚持要按文本看一份嗅探认为是二进制的文件 —— 给他，**但说一句**。
           不说的话他会以为这份文件本来就长这样。 */
        out.why = `${out.why ? out.why + "；" : ""}这份文件看着不像文本（按你的要求照样按文本读了）`;
      }
      return out;
    }
    out.why = out.kind === "other" ? "看着不是文本文件（二进制）" : "不是文本文件";
    if (opts.binary) {
      const max = binMaxEarly;
      if (st.size > max) out.why = `文件 ${(st.size / 1048576).toFixed(1)} MB，超过二进制读取上限 ${Math.round(max / 1048576)} MB${RANGE_HINT}`;
      /* ⚠️ **转 base64 之前再判一次运行时的硬上限**（issue #180）：设置页的上限
         可能被设到比 V8 能转的还大（原来 `max: 1024` MB，而 base64 在 ~384 MB 就抛）。
         判在这里而不是只改设置的 max，是因为**上限有两个来源**（设置、调用方的
         `opts.binaryMax`），而**运行时的硬限制对两者都成立**。 */
      else if (st.size > BASE64_SAFE_MAX) out.why = `文件 ${(st.size / 1048576).toFixed(1)} MB，超过单次能转成 base64 的上限 ${Math.round(BASE64_SAFE_MAX / 1048576)} MB${RANGE_HINT}`;
      else { out.encoding = "base64"; out.base64 = buf.toString("base64"); }
    }
    return out;
  }
  if (st.size > textMax) { out.why = `文件 ${Math.round(st.size / 1024)} KB，超过 ${Math.round(textMax / 1048576)} MB 上限${opts.binary ? RANGE_HINT : ""}`; return out; }
  /* ⚠️ **`sha256` 算的是原始字节，不随编码变**（上面 `sha256(buf)`）——
     所以按 GBK 读出来的文本，拿这个 sha 回去做写前校验仍然是对的。
     这一点不成立的话「按别的编码读」就会把写入口的那道闸绕过去。 */
  if (encoding && encoding !== "utf-8") {
    if (!READ_ENCODINGS.has(encoding)) {
      out.why = `不支持按 ${encoding} 读（能用的：${[...READ_ENCODINGS].join(" / ")}）`;
      return out;
    }
    try {
      out.content = new TextDecoder(encoding).decode(buf);
      out.encoding = encoding;
    } catch (e) {
      out.why = `按 ${encoding} 读不出来：${e instanceof Error ? e.message : String(e)}`;
      return out;
    }
  } else {
    out.content = buf.toString("utf8");
  }
  out.lines = out.content.length ? out.content.split("\n").length : 0;
  return out;
}

/** 超限时给插件的那半句：它有路可走，别让它以为这份文件就是读不了 */
const RANGE_HINT = "；可以用 byteOffset / byteLength 按字节分段读";

/** 按字节范围读一段（插件读大文件用：大 .gltf / .obj / 视频…）。
 *
 *  ⚠️ **只读那一段**：`open` + `read(pos, len)`，不整份读、不算 sha256 —— 整份读进来正是这条路要绕开的事
 *  （一份 2 GB 的文件分段读，每段都整份读一遍就是 2 GB × 段数）。所以回包**没有 `sha256`**。
 *  对**任何文件**都按原始字节读，包括文本类 kind（不解码、不管编码）。
 *
 *  入参在调用方核过（`cap/files.ts`：非负整数、`byteLength` 1..上限、`byteOffset` ≤ size）；
 *  这里只按文件实际大小截：`byteOffset === size` 回空段。 */
export async function readFileRange(p: Project, rel: string, byteOffset: number, byteLength: number): Promise<ReadFileBytesResult> {
  const abs = mustFile(p, rel);
  const fh = await open(abs, "r");
  try {
    const st = await fh.stat();
    const want = Math.max(0, Math.min(byteLength, st.size - byteOffset));
    const buf = Buffer.alloc(want);
    let got = 0;
    /* `read` 一次不保证读满（大段、网络盘），读到够或读到头为止 */
    while (got < want) {
      const { bytesRead } = await fh.read(buf, got, want - got, byteOffset + got);
      if (bytesRead === 0) break;
      got += bytesRead;
    }
    return {
      path: rel, kind: kindOf(rel), size: st.size, updatedAt: st.mtime.toISOString(),
      content: null, encoding: "base64", base64: buf.subarray(0, got).toString("base64"),
      range: { byteOffset, byteLength: got, size: st.size, more: byteOffset + got < st.size },
    };
  } finally { await fh.close(); }
}

/** 文件大小（字节）。范围读要先拿它核 `byteOffset` */
export function fileSizeOf(p: Project, rel: string): number {
  return statSync(mustFile(p, rel)).size;
}

export interface WriteFileOptions {
  /** 写前校验：盘上现在的 sha256 必须等于它，否则拒绝（Q8）。新建文件传 "0" 或不传 */
  expectSha256?: string;
  /** 记在快照元数据里，给版本历史那一列看 */
  origin?: VersionOrigin;
  note?: string;
}

export interface WriteFileResult {
  path: string; written: boolean; snapshot: string | null; previous: string | null;
  bytes: number; sha256: string; steps: string[];
}

/** 泛型落盘。`.dc.html` 在这里被拒 —— 它要走 `write_draft` 那条路。 */
/** 第二条写入口。
 *
 *  ⚠️ **`content` 可以是字节**（#108，2026-10-07）：图片编辑要把一张 PNG 写回盘。
 *  原来这条路从头到尾按 utf8 走（`writeAtomic` / `byteLength` / `Buffer.from(content,"utf8")` /
 *  末尾的 `sha256`），**二进制进来会被静默损坏** —— 文件还在、还能打开、只是花了。
 *  现在一进来就归一成 Buffer，后面全按字节算；文本那条路**行为一个字没变**
 *  （`Buffer.from(s,"utf8")` 再 `byteLength` 和原来是同一个数）。 */
export async function writeAnyFile(p: Project, rel: string, content: string | Buffer, opts: WriteFileOptions = {}): Promise<WriteFileResult> {
  /* M14-7（Q70）：这个目录还没解锁 → 一个字节都不写。
     **和 `write.ts` 那一道是同一件事的两条路** —— 两条写入口各装一道，
     装一条等于没装（#75）。拒因里的出路也要一样，不然两条路上说的话不一致。 */
  if (!isEditable(p.dir)) {
    throw new ToolError(err(X.NOT_EDITABLE, normalizeRel(p, rel), { kind: "path", name: p.dir },
      "这个目录还是只读预览",
      { fix: `这个文件不在你的项目里，所以我们默认不动它（右键打开一个随手的文件时，多半只是想看一眼）。要改的话点工作台顶部那条横条上的「开始编辑」，或者调 \`start_editing\`。版本历史记在${productName}自己的目录里，原文件夹不会多出任何文件。` }));
  }
  /** 一进来就归一成字节 —— 后面每一处都用它，免得「有的地方按字符有的地方按字节」 */
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const clean = normalizeRel(p, rel);
  if (kindOf(clean) === "dc") {
    throw new ToolError(err(X.IO, clean, { kind: "file", name: basename(clean) },
      "`.dc.html` 不走这条路",
      { fix: "设计稿用 write_draft：它会归一化、展开 @ds、注入 __resources、打节点地址、存语义快照、写 changelog。这条路一样都不做。" }));
  }
  const noWrite = denyReason(clean);
  if (noWrite) {
    throw new ToolError(err(X.IO, clean, { kind: "file", name: basename(clean) },
      `${noWrite.why}，不该手写`, { fix: noWrite.fix }));
  }
  /* 落盘前先把别处改的那一版留住（M9-7）。**第二条写入口也要有** ——
     `.md` / 代码 / 文本这些文件比设计稿更常在别的编辑器里改，
     只给设计稿装这道保险等于装了一半。 */
  const rescued = await commitExternalChanges(p.dir, clean);
  /* ⚠️⚠️ **走 `safeJoin` 而不是自己 `join`**（issue #140）。原来这一行是
     `join(p.dir, …)` —— 于是**根约束那两道闸整条路都绕过了**：
     `write_file("指向外面的链接.md", …)` 会跟随链接写到项目外，
     而 `rename` 还会把那条链接**替换成一个普通文件**。
     > 读那条路走 `mustFile` → `safeJoin`，有闸；写这条路自己拼，没闸 ——
     > **一道闸只守住一条路等于没守**（#75 同族，这次是同一个文件里的两条路）。
     ⚠️ 判据顺带暴露出第二件事：写成功之后链接被换成普通文件，于是
     紧跟着的「删被拒」「树里标 outsideLink」**全都在测一个已经不存在的样本**
     （`doc/00` §143.6「样本互相毁夹具」）。 */
  const abs = safeJoin(p, clean);
  const exists = existsSync(abs);
  const steps: string[] = [];

  // ① 写前校验（Q8）：盘上是不是还是调用方看到的那一版
  const before = exists ? await readFile(abs) : null;
  const nowSha = before ? sha256(before) : "0";
  if (opts.expectSha256 !== undefined && opts.expectSha256 !== nowSha) {
    throw new ToolError(err(X.IO, clean, { kind: "file", name: basename(clean) },
      exists ? "这个文件在你读到之后被改过了" : "这个文件已经不在了",
      { fix: `盘上现在是 ${nowSha.slice(0, 12)}…，你带来的是 ${String(opts.expectSha256).slice(0, 12)}…。重新读一次再写，别把别人的改动盖掉。` }));
  }
  steps.push(exists ? `写前校验通过（${nowSha.slice(0, 8)}）` : "新建文件");

  /* ② 存上一版：先留住旧的，再写新的 —— 顺序反了就没得退。
   *
   *  ⚠️ **但盘上这份和我们最近存的那一版一样时就不用再存一遍**（2026-09-30）。
   *  原来无条件存，于是**每次写都产生一个完全重复的快照**：
   *  上一次写的 ③ 已经把这份内容存过了，② 又存一遍。
   *  后果不在磁盘上（gzip 过，很小），在**版本列表上** ——
   *  设计侧第十三轮定了「每行写 `+N −M`」，而一半的行会是 `+0 −0`，
   *  用户看到的是一串没有意义的条目。
   *
   *  这一步**不能删**：盘上内容和我们最近一版**不同**时，它救的正是
   *  「别人在 VS Code 里改的那一版」。而且这条兜底**不受 `.gitignore` 影响**，
   *  比 git 那条可靠（git 那条对被忽略的文件会静默失效，§126.1）。
   *  所以答案是「先比一下」，不是「别存了」。 */
  let previous: string | null = null;
  if (before !== null) {
    const latest = (await listSnapshots(p, clean)).at(-1) ?? null;
    let same = false;
    if (latest) {
      /* ⚠️ **按字节比**（#108）：原来是 `readSnapshotContent(...) === before.toString("utf8")`，
         而二进制经 utf8 往返之后几乎必然不等 —— 于是每写一次图片都多存一版重复快照。
         那不是正确性问题（多一版而已），但版本列表上会多出一串没意义的行，
         和 2026-09-30 那条「每次写都产生一个完全重复的快照」是同一个症状。 */
      try { same = (await readSnapshotBytes(p, clean, latest)).equals(before); }
      catch { same = false; }   // 读不出来就当不一样，宁可多存一版
    }
    if (same) { previous = latest; steps.push(`上一版已经是 ${latest}，没重复存`); }
    else {
      /* ⚠️ **这一版打标「外部改动」，不是调用方的 `origin`。**
         能走到这一支只有两种情况，两种都不是调用方写的：
         ① 我们有快照，但盘上那份和最近一版**不同** → 别人在外面改过
         ② 我们一份快照都没有 → 这份文件的内容我们从来没经手过
         原来这里填 `opts.origin ?? "人手改"` —— 于是版本历史里那一行说「人手改」，
         而它恰恰是**别人改的那一版**。设计侧第十三轮一眼看出来的：
         「『外部改动』这个来源值后端有没有打标？没打的话这一行会显示成『人手改』。」 */
      previous = await saveSnapshot(p, clean, before, "外部改动",
        opts.note ?? "盘上内容和上一版不同，落盘前先存下的");
      steps.push(latest ? `盘上这份不是我们最近存的那版，先存下来 ${previous}` : `存快照 ${previous}`);
    }
  }

  await mkdir(dirname(abs), { recursive: true });
  await writeAtomic(abs, buf);
  steps.push(`写入 ${buf.length} 字节`);

  // ③ 新内容也留一份 —— 「回到这一版」要有得回
  const snapshot = await saveSnapshot(p, clean, buf, opts.origin ?? "人手改", opts.note);
  steps.push(`当前版 ${snapshot}`);
  if (rescued) steps.unshift(`先记下了别处改的内容（git ${rescued}）`);
  void commitAfterWrite(p.dir, clean, snapshot ?? null, null);
  return { path: clean, written: true, snapshot, previous, bytes: buf.length, sha256: sha256(buf), steps };
}

/** 工具自己产的东西 / 工具状态目录里的路径（给不走 `writeAnyFile` 却要守同一条线的地方用，比如格式转换）。 */
export function isToolArtifactPath(rel: string): boolean { return isToolArtifact(rel); }

/** 一份**别的路已经落了盘的新文件**，补上写入口落盘之后那两件事：存第一版快照、记一次 git。
 *
 *  ⚠️ **为什么不直接走 `writeAnyFile`**（格式转换，2026-10-18）：转换引擎的成品规矩是「先用 `wx` 占一个空位、
 *  转好了再挪过去、永不覆盖」—— 两个任务同时要「报告.pdf」时只有一个占得到，另一个顺延到「报告 (1).pdf」。
 *  走 `writeAnyFile` 的话要么先把整份成品读进内存（视频动辄几个 GB），要么在占位之后再写一遍 ——
 *  而那一遍会把空占位当成「盘上被别人改过的一版」先存一个 0 字节的「外部改动」快照。
 *  所以成品照引擎的规矩落盘，落完在这里补记 —— 版本历史里它和 `write_file` 新建出来的文件长得一样。
 *
 *  ⚠️ **太大的不存快照**（超过设置里的二进制读取上限，默认 100 MB；和插件 `read_file` 整份读的上限是同一个值）：快照是整份 gzip 进 `.umbrastudio/`，一部转出来的电影
 *  会让状态目录翻倍；git 那一版同理不记。回 `null` + 一句原因，调用方照实转告。 */
export async function recordCreatedFile(p: Project, rel: string, origin: VersionOrigin, note?: string): Promise<{ snapshot: string | null; why?: string }> {
  const clean = normalizeRel(p, rel);
  const abs = join(p.dir, clean.split("/").join(sep));
  const st = statSync(abs);
  const max = await binaryMaxSetting();
  if (st.size > max) {
    return { snapshot: null, why: `文件 ${(st.size / 1048576).toFixed(1)} MB，超过快照上限 ${Math.round(max / 1048576)} MB（设置 → 插件沙箱 → 二进制读取上限），没存版本` };
  }
  const snapshot = await saveSnapshot(p, clean, await readFile(abs), origin, note);
  void commitAfterWrite(p.dir, clean, snapshot, null);
  return { snapshot };
}

export interface FileSnapshotMeta {
  version: string; src: string; at: string; bytes: number; note?: string;
  /** 和**上一版**比，增了几行 / 删了几行。第一版没有上一版，所以是「全新增」。
   *
   *  三态，**而且三态都有用**（issue #48）：
   *  | 值 | 意思 | 谁会看到 |
   *  | --- | --- | --- |
   *  | `{plus,minus}` | 算好了 | 正常情况（**写快照时就算了**，不是读的时候算） |
   *  | `null` | **算过了但给不出数** —— 文件超过 `DELTA_MAX_LINES`、原文丢了、或者这次补算超了上限 | 界面显示「没算」 |
   *  | `undefined` | **还没算过** —— issue #48 之前写下的旧快照 | `listSnapshotMeta` 会限量补算并回写 |
   *
   *  ⚠️ `null` 和 `undefined` 不能混：混了的话「算不出来的那一版」会被
   *  每次调用都重算一遍，而它每次都算不出来 —— 这正是 #48 那条慢的一半。
   *
   *  ⚠️ **后端算，不让界面算**（设计侧第十三轮问过这一条）：
   *  快照全在我们手里，算一次就够；界面现算的话，5 个版本要拉 6 份原文下来。 */
  delta?: { plus: number; minus: number } | null;
}

/** 两段文本之间增删了几行。**只回个数，不回 diff** —— 下拉里那行 `+3 −1` 要的就是这个。
 *
 *  ⚠️ **有上限**：LCS 是 O(n×m)，两份三万行的文件能把主线程卡死几秒。
 *  超了就回 `null`，让界面说「没算」而不是让人等 —— 给不出数比卡住好。
 *  完整的差异不走这条路（设计侧的裁决是「去编辑区里看那一版」）。 */
const DELTA_MAX_LINES = 4000;
export function lineDelta(from: string, to: string): { plus: number; minus: number } | null {
  const a = from.split("\n"), b = to.split("\n");
  if (a.length > DELTA_MAX_LINES || b.length > DELTA_MAX_LINES) return null;
  /* 掐头去尾：真实的改动多半集中在中间，先把两头相同的行剥掉，LCS 的规模常降一两个数量级 */
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  if (!x.length || !y.length) return { plus: y.length, minus: x.length };
  /* 滚动一维的 LCS 长度（只要长度，不要回溯路径） */
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) {
      cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    prev = cur;
  }
  const lcs = prev[y.length]!;
  return { plus: y.length - lcs, minus: x.length - lcs };
}

/** 这个文件的快照号，升序。只认 `s<N>` —— `v<N>` 是稿的语义快照，两套不混。 */
export async function listSnapshots(p: Project, rel: string): Promise<string[]> {
  const dir = snapDir(p, rel);
  if (!existsSync(dir)) return [];
  const ns: number[] = [];
  for (const f of await readdir(dir)) {
    const m = /^s(\d+)\.json$/.exec(f);
    if (m) ns.push(Number(m[1]));
  }
  return ns.sort((a, b) => a - b).map((n) => `s${n}`);
}

export async function listSnapshotMeta(p: Project, rel: string, withDelta = true): Promise<FileSnapshotMeta[]> {
  const dir = snapDir(p, rel);
  const out: FileSnapshotMeta[] = [];
  for (const v of await listSnapshots(p, rel)) {
    try { out.push(JSON.parse(await readFile(join(dir, `${v}.json`), "utf8")) as FileSnapshotMeta); } catch { /* 坏了就跳过 */ }
  }
  if (!withDelta) return out;

  /* ⚠️ **delta 在写快照时就算好存进 `s<N>.json` 了**（issue #48，2026-10-02）。
     原来每次调用都把这个文件的**全部**快照逐个解压、再对相邻两版各跑一次 LCS。
     实测（3000 行的文件、61 版）：
     | 这一趟 | 耗时 |
     | --- | --- |
     | `list_file_versions` 第 1 / 2 / 3 次 | 10473 / 10660 / 10198 ms（**完全没缓存**） |
     | 同一份，不要 delta | **13 ms** |
     而它跑在服务进程主线程上 —— 同一个进程还在接 MCP、WS 和别的 HTTP 请求，
     **那 10 秒整个工作台不响应**。用户每打开一个文件、每按一次 ⌘S 都付一次，
     200 版就是 ~35 秒。随使用时长单调变差，而开发时的测试项目快照少，**撞不上**。

     快照一旦写下就不变，所以这个值**完全可缓存**。现在只有旧快照
     （json 里没有 `delta` 字段）才现算，算完**回写**，下次就不用再算。 */
  const need = out.filter((m) => m.delta === undefined);
  if (!need.length) return out;
  /* 二进制的旧快照不补算行差（#133，同 `saveSnapshot`）：直接记「没算」 */
  if (!isTextual(rel)) {
    for (const m of need) m.delta = null;
    for (const m of need) { try { await writeFile(join(dir, `${m.version}.json`), JSON.stringify(m, null, 1)); } catch { /* 同下 */ } }
    return out;
  }

  /* ⚠️ 补算要有**总量上限**：一个存了几百版的旧文件第一次打开时，
     不加上限就又回到 10 秒那条路上了。超出的给 `null`（「没算」），
     下一次调用会接着补 —— 几次之后就全齐了。
     `null` 和 `undefined` 的区别是**有意的**：`undefined` = 还没算过（下次补），
     `null` = 算过了但算不出来（上限之外 / 原文丢了），界面显示「没算」。 */
  const BACKFILL_MAX = 20;
  let budget = BACKFILL_MAX;
  let prevSrc: string | null = null;
  let prevVer: string | null = null;
  const dirty: FileSnapshotMeta[] = [];
  for (const m of out) {
    if (m.delta !== undefined) { prevSrc = null; prevVer = m.version; continue; }
    if (budget <= 0) { m.delta = null; continue; }
    budget--;
    /* ⚠️ 一版读不出来不能毁掉整个列表（§九十二 那条「一个坏数据毁掉整个列表」）——
       读不出来就这一行没有 delta，别的照给。 */
    let cur: string | null = null;
    try { cur = await readSnapshotContent(p, rel, m.version); } catch { cur = null; }
    if (prevSrc === null && prevVer !== null) {
      try { prevSrc = await readSnapshotContent(p, rel, prevVer); } catch { prevSrc = null; }
    }
    m.delta = cur === null ? null : prevSrc === null
      ? { plus: cur.split("\n").length, minus: 0 }   // 第一版：全是新增
      : lineDelta(prevSrc, cur);
    dirty.push(m);
    prevSrc = cur ?? prevSrc;
    prevVer = m.version;
  }
  /* 把补算的结果写回去。**写失败不影响这次的返回值** ——
     盘只读、权限不够都不该让版本列表打不开。 */
  for (const m of dirty) {
    try { await writeFile(join(dir, `${m.version}.json`), JSON.stringify(m, null, 1)); }
    catch { /* 回写只是省下次的力气，不是正确性的一部分 */ }
  }
  return out;
}

async function saveSnapshot(p: Project, rel: string, buf: Buffer, src: string, note?: string): Promise<string> {
  const dir = snapDir(p, rel);
  await mkdir(dir, { recursive: true });
  const have = await listSnapshots(p, rel);
  const n = have.length ? Number(have[have.length - 1]!.slice(1)) + 1 : 1;
  const version = `s${n}`;
  /* ⚠️ **delta 在这里算一次，不留给读的时候算**（issue #48）。
     这一刻我们手上已经有新内容（`src` 的原文就是 `buf`），上一版只要解压一次 ——
     和「每次列版本就把全部快照重算一遍」比，这是 O(1) 对 O(版本数)。
     算不出来（第一版 / 上一版原文丢了）就记 `null`（「没算」），
     **不留 `undefined`** —— 那会让读的时候以为「还没算过」又去补算一遍。 */
  let delta: { plus: number; minus: number } | null = null;
  const prevVer = have.length ? have[have.length - 1]! : null;
  /* ⚠️ **二进制不算行差**（issue #133）：把 PNG 字节按 `\n` 切行算出来的「+N −M 行」是假读数，
     而一张 1 MB 的图约有 4000 个 `\n` 字节，正好落在 LCS 上限之内 —— 约 1600 万次比较的同步循环跑在主线程上。
     记 `null`（「没算」），版本列表本来就认这一态。 */
  const textual = isTextual(rel);
  const curText = textual ? buf.toString("utf8") : "";
  if (!textual) delta = null;
  else if (prevVer === null) delta = { plus: curText.split("\n").length, minus: 0 };
  else {
    try { delta = lineDelta(await readSnapshotContent(p, rel, prevVer), curText); }
    catch { delta = null; }
  }
  const meta: FileSnapshotMeta = { version, src, at: new Date().toISOString(), bytes: buf.length, delta, ...(note ? { note } : {}) };
  await writeFile(join(dir, `${version}.json`), JSON.stringify(meta, null, 1));
  await writeFile(join(dir, `${version}.src.gz`), await gzip(buf));
  return version;
}

/** 读回某一版的原文 */
/** 取某一版的**字节**（#108）。
 *
 *  ⚠️ 快照存的一直是完整字节（`saveSnapshot` 收的是 Buffer），**只有读的那一步转了 utf8** ——
 *  于是 `revertFile` 对任何二进制文件都是**静默损坏**：
 *  退回一张图之后文件还在、大小变了、打不开。
 *  这条路在 #108 之前就存在（被「外部改动」兜底存下来的图片也退不回来），
 *  **只是没人退过图片，所以没人发现。** */
export async function readSnapshotBytes(p: Project, rel: string, version: string): Promise<Buffer> {
  /* ⚠️ **版本号是外部输入，先过形状再进 join**（issue #156）。
     `read_file_version` / `compare_file_versions` / `revert_file` 都把调用方给的版本号原样传到这里，
     而 `path.join` 会把 `..` 归一化掉 —— `version: "../../../../别的项目/.umbrastudio/snapshots/<key>/s3"`
     原来能读到**别的项目**某一版的原文，`revert_file` 还会把它写进本项目。
     这里是三个能力唯一的读口，一处守住全覆盖。稿那一侧（`history.ts` `resolveSnapshot` 的 `/^v\d+$/`）早就这么守了。
     两道闸：形状（`s<N>`）+ 结果（拼出来的路径必须还在这个文件的快照目录里），和 `chat.ts` `sessionFile` 同一套。 */
  const dir = snapDir(p, rel);
  const f = join(dir, `${version}.src.gz`);
  if (!/^s\d+$/.test(version) || !isInside(dir, f)) {
    const shown = String(version).slice(0, 40);
    throw new ToolError(err(X.SNAPSHOT_MISSING, rel, { kind: "key", name: shown },
      `版本号形状不对：${JSON.stringify(shown)}`,
      { fix: "版本号形如 s3，用 list_file_versions 给的那个" }));
  }
  if (!existsSync(f)) {
    const have = await listSnapshots(p, rel);
    throw new ToolError(err(X.SNAPSHOT_MISSING, rel, { kind: "key", name: version },
      `没有 ${version} 的快照`,
      { fix: have.length ? `现有：${have.join(" / ")}` : "这个文件还没有经 write_file 落过盘" }));
  }
  /* ⚠️ **异步解压**（issue #48）：`gunzipSync` 在主线程上解一个几百 KB 的 gz
     会把整个服务停住，而这个进程同时在接 MCP、WS 和别的 HTTP 请求。
     异步版把活交给 zlib 的线程池。 */
  return await gunzip(await readFile(f));
}

/** 取某一版的**文本**。二进制请用 `readSnapshotBytes` —— utf8 往返会毁掉它。 */
export async function readSnapshotContent(p: Project, rel: string, version: string): Promise<string> {
  return (await readSnapshotBytes(p, rel, version)).toString("utf8");
}

/** 回到某一版：把那一版的原文当新内容写一遍（历史不删，回退本身也留一版）。 */
/** 把一个文件退回某一版。
 *
 *  ⚠️⚠️ **`origin` 2026-10-23（M16-7b）从写死改成参数。**
 *  原来这里是 `{ origin: "人手改" }` —— 而那是 M11-7（四）那一批
 *  「把『谁改的』从写死的 `"人手改"` 改成 `originOf(via)`」时**漏掉的一处**。
 *  它今天没暴露，是因为**只有界面在调它**（界面上点回退确实是人手改）。
 *  而 7b 把「回退」交给了 AI（chat 工具表换上通用版），
 *  于是那个写死立刻变成一条**假记录**：AI 回退的那一版会写「人手改」。
 *  > **一个写死的值，在只有一个调用者的时候看不出错。**
 *  不给就还是「人手改」（界面那条路一个字不用改）。 */
export async function revertFile(p: Project, rel: string, version: string, origin: VersionOrigin = "人手改"): Promise<WriteFileResult> {
  /* ⚠️ **按字节取**（#108）：原来走 `readSnapshotContent`（utf8），
     于是「退回上一版」对任何二进制文件都是静默损坏 —— 退完文件还在、打不开。
     这是 #108 之前就有的缺陷，只是没人退过图片。 */
  const old = await readSnapshotBytes(p, rel, version);
  const r = await writeAnyFile(p, rel, old, { origin, note: `回到 ${version}` });
  r.steps.unshift(`取 ${version} 的原文`);
  return r;
}

/** 删除（回收站语义，和稿一样）：移进 `.umbrastudio/trash/<时间戳>/`，不是真删 */
export async function trashFile(p: Project, rel: string): Promise<{ path: string; trashPath: string }> {
  /* ⚠️ 和 `moveFile` 同一道闸（issue #75）：`trash_file(".git/HEAD")` 原来照做。 */
  const noTrash = denyReason(rel);
  if (noTrash) {
    throw new ToolError(err(X.IO, rel, { kind: "file", name: basename(rel) },
      `${noTrash.why}，不能删`, { fix: noTrash.fix }));
  }
  const abs = mustFile(p, rel);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const to = join(assetDir(p.dir, "trash"), stamp, clean(rel));
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, await readFile(abs));
  await rm(abs);
  /* ⚠️ 相对**回收站根**，不相对项目根（M14-4 B1；理由写在 `refs.ts` 的同一处）。
     两条删除路径的回收站布局必须同一套 —— `listTrash` 只按一种读。 */
  return { path: rel, trashPath: relative(assetDir(p.dir, "trash"), to).split(sep).join("/") };
}

export interface MoveFileResult {
  from: string; to: string;
  /** 一并改写了引用的稿：{ file, count } */
  rewrote: Array<{ file: string; count: number }>;
  steps: string[];
  /** 名字对得上、但路径解不出来所以没动的写法（外链 / 根相对）。**不静默**（issue #76 第 3 点） */
  unresolved?: Array<{ file: string; line: number; value: string }>;
  /** 引用该改而**没改成**的稿（写入口拒了：那份稿本身有 error 级诊断）。issue #92 */
  refused?: Array<{ file: string; reason: string }>;
}

/** 改名 / 移动一个普通文件，并把稿里指向它的 href / src / url() 一起改掉。
 *  S15 对用户的承诺就是这一句「改名或移动会一并改写引用」—— 不做的话那句话是假的。
 *  稿的改写走 `write_draft`（唯一写入口），所以引用改完照样有语义快照可退。 */
export async function moveFile(p: Project, fromRel: string, toRel: string): Promise<MoveFileResult> {
  const from = normalizeRel(p, fromRel), to = normalizeRel(p, toRel);
  if (kindOf(from) === "dc" || kindOf(to) === "dc") {
    throw new ToolError(err(X.IO, from, { kind: "file", name: basename(from) },
      "`.dc.html` 不走这条路", { fix: "稿的改名 / 移动用 rename_draft / move_draft，它们会跟着改 dc-import 的引用。" }));
  }
  /* ⚠️ **两头都查「这是工具自己的东西吗」**（issue #75，2026-10-05）。
     `writeAnyFile` 对 `isToolArtifact` 拒写（`.git/`、`.umbrastudio/`、
     `index-data.js`、壳页…），而 `moveFile` 原来**一头都不查** ——
     于是那道闸换条路两步就绕过去：
       write_file("tmp.txt", …)      → 普通路径，放行
       move_file("tmp.txt", ".gitattributes")  → 没守卫，放行
     单独成立的后果也够重：`move_file(".git/HEAD", "x")` 直接把用户仓库弄坏
     （`.git` 里的文件不进回收站、不留快照），挪走 `comments.json` / 快照目录
     在界面上表现为「评论和版本历史全没了」。
     **一道闸只守住一条路，等于没守。** */
  for (const r of [from, to]) {
    const noMove = denyReason(r);
    if (noMove) {
      throw new ToolError(err(X.IO, r, { kind: "file", name: basename(r) },
        `${noMove.why}，不能挪进挪出`, { fix: noMove.fix }));
    }
  }
  const absFrom = mustFile(p, from);
  const absTo = join(p.dir, to.split("/").join(sep));
  if (existsSync(absTo)) {
    throw new ToolError(err(X.IO, to, { kind: "file", name: basename(to) }, `${to} 已经存在`,
      { fix: "换一个名字，或者先把那一个挪开。" }));
  }
  const refs = await referencesOf(p, from);
  const steps: string[] = [];
  await mkdir(dirname(absTo), { recursive: true });
  await writeFile(absTo, await readFile(absFrom));
  await rm(absFrom);
  steps.push(`${from} → ${to}`);

  /* 引用改写：每份文件里写的是相对它自己的路径，所以按它的位置重算。
     ⚠️⚠️ **2026-10-23（M16-7c-2d）改走第二条写入口 `writeAnyFile`**（geek-99 定）。
     原来走 `writeDraft` —— 那是**设计稿**那条写入口，它会做归一化 / `@ds` 展开 /
     `__resources` 注入 / 节点地址。C3 之后引用方是 `.md` / `.html` / `.css`，
     那一套加工对它们**全是错的**（它甚至会按 dc 的规矩校验这份文件）。
     第二条写入口给的是同样要紧的那几样：**写前校验 · 快照 · 并发闸**。
     > 「唯一写入口」从来是两条：稿走第一条，别的文件走第二条 ——
     > 而这里的引用方已经全是「别的文件」了。 */
  const byFile = new Map<string, number>();
  for (const r of refs.refs) byFile.set(r.file, (byFile.get(r.file) ?? 0) + 1);
  const rewrote: Array<{ file: string; count: number }> = [];
  /** 解不出来的那些（外链 / 根相对 / 指到项目外）—— **不静默**，列出来让人自己看一眼 */
  const unresolved: Array<{ file: string; line: number; value: string }> = [];
  /** 写入口拒了的那些（稿里有 error 级诊断）—— 引用**没改成**，必须说（issue #92） */
  const refused: Array<{ file: string; reason: string }> = [];
  for (const [srcRel, count] of byFile) {
    const abs = join(p.dir, srcRel.split("/").join(sep));
    let src: string;
    try { src = await readFile(abs, "utf8"); } catch { continue; }
    const { out: next, changed } = mapFileRefs(src, srcRel, (value) =>
      resolveRefTarget(srcRel, value) === from ? refValueFor(srcRel, to, value) : null);
    if (changed === 0 || next === src) continue;
    /* ⚠️ **看一眼写入口到底写没写**（issue #92，2026-10-06）。
       原来不看返回就 `rewrote.push` —— 而写入口对校验不过的文件不写。
       文件已经挪走了（上面几行），引用没改，而回执说「改写引用 N 处」。
       **假回执比没有回执糟**（#35 那条同一句话）—— 用户按回执相信引用是好的。
       ⚠️ 这一条在换成 `writeAnyFile` 之后**更要紧**：它会因为并发闸、
       只读、`isToolArtifact` 等好几种理由拒，而每一种都该照实说出来。 */
    let wrote = false, why = "";
    try {
      /* ⚠️ **带上我们刚读到的那一份的 sha** —— 并发闸照常生效（geek-99 定）：
         在我们读完和写回之间别人改过这个文件，就该拒，而不是把他的改动盖掉。
         > 一个「顺带帮你改一下」的动作，不该比用户自己改更有特权。 */
      const r = await writeAnyFile(p, srcRel, next, {
        expectSha256: sha256(Buffer.from(src, "utf8")),
        origin: "人手改",
        note: `引用跟着 ${basename(from)} 的移动改了`,
      });
      /* ⚠️ `writeAnyFile` **拒的时候是抛 `ToolError`**，不是回 `written: false`
         （它唯一的 return 写着 `written: true`）—— 所以这里真正接住拒绝的是下面那个 catch。
         这一句留着是**为了以后**：哪天它改成回 false，这里不会静默把「没写」算成「写了」。
         > 一个只有一条成功返回路径的函数，判断「成不成」要看它抛不抛，
         > 而**把两种都接住**比赌它是哪一种可靠。 */
      wrote = r.written !== false;
      if (!wrote) why = "写入口回了 written: false";
    } catch (e) {
      why = (e as Error)?.message ?? String(e);
    }
    if (!wrote) {
      refused.push({ file: srcRel, reason: why });
      steps.push(`⚠️ ${srcRel} 的引用**没改成**：${why}`);
      continue;
    }
    rewrote.push({ file: srcRel, count: changed });
    steps.push(`改写引用 ${srcRel}（${changed} 处）`);
    if (changed !== count) {
      steps.push(`⚠️ ${srcRel} 里还有 ${count - changed} 处提到 ${basename(from)} 但解不出路径，没动`);
    }
  }
  /* 改完再扫一遍：名字对得上、但解不出路径的写法（`https://…/img.png`、`/img.png`），
     以及**正文里提到文件名**的地方。它们本来就不该被改 —— 但也不该一声不吭。 */
  for (const srcRel of (await listRefSources(p)).files) {
    let src: string;
    try { src = await readFile(join(p.dir, srcRel.split("/").join(sep)), "utf8"); } catch { continue; }
    if (!src.includes(basename(from))) continue;
    mapFileRefs(src, srcRel, (value, line) => {
      const t = resolveRefTarget(srcRel, value);
      if (t === null && value.includes(basename(from))) unresolved.push({ file: srcRel, line, value });
      return null;
    });
  }
  /* ⚠️ `truncated` 要跟着回出去：到了 5000 的上限时「没有别的引用」这句话说不了。 */
  return { from, to, rewrote, steps, ...(refs.truncated ? { truncated: true } : {}),
    ...(unresolved.length ? { unresolved } : {}), ...(refused.length ? { refused } : {}) };
}

/* ── 稿里的「引用」是**有结构的东西**，不是一段文字（issue #76，2026-10-05）──
   原来改写引用是 `src.split(oldHref).join(newHref)` —— 对整篇稿做**子串**替换。
   它不知道边界，于是两个方向都错：

   ① **改坏别的引用**：`"data.png".split("a.png")` = `["dat", ""]`，
      `move_file("a.png","b/a.png")` 把 `src="data.png"` 改成 **`datb/a.png`**；
      `icons/logo.png` 变成 `icons/old/logo.png`；连正文里「见 logo.png」这句话也改。
   ② **该改的静默不改**：子目录的稿 `pages/a.dc.html` 按自然写法写 `src="img.png"`，
      而 `oldHref` 算出来是 `../pages/img.png` —— 稿里没这个串，`continue`，
      回执里一个字都不提。而 `referencesOf` 按 basename **算到了**这份稿：
      **找到了却没改，是最差的组合。**

   现在：取出**属性值** → 解成根相对路径 → **等于 from 才换** → 用 `posix.relative` 重算。
   `referencesOf` 用同一个判定（原来它比 basename，于是「找到的」和「改的」对不上）。 */

/** href / src 的值，或 url(…) 里的值。七个捕获组，顺序别动（下面按下标取）。 */
const REF_VALUE_RE = /(\b(?:href|src)\s*=\s*)(["'])([^"']*)\2|(\burl\(\s*)(["']?)([^"')]*)\5(\s*\))/gi;

/** Markdown 的行内链接与图片：`![alt](path)` / `[text](path)`，可带 `"title"`。
 *
 *  ⚠️ **三个捕获组，第 2 组是值**（和 `REF_VALUE_RE` 的取法不同，所以两者各走一条分支）。
 *  ⚠️ `<img src="…">` **不用这个正则** —— md 里写 HTML 是合法的，而那种写法
 *  `REF_VALUE_RE` 本来就认得。所以 md 文件两个正则**都跑**。
 *  ⚠️ 不认引用式链接（`[a][ref]` + 底部 `[ref]: path`）：那要两段关联，
 *  而**认一半比不认更糟** —— 改写时会漏掉定义那一行，留下一个指向旧路径的 `[ref]:`。
 *  > **一个只认得一半语法的改写器，比一个明说「这种写法我不碰」的更危险。**
 *  解不出来的写法会进 `unresolved` 被列出来，所以用户看得见。 */
const MD_REF_RE = /(!?\[[^\]]*\]\(\s*)(<?[^)\s>]+>?)((?:\s+"[^"]*")?\s*\))/g;

/** 哪些文件里会有「引用」—— geek-99 2026-10-23 定的六种。
 *
 *  ⚠️⚠️ **这张清单取代了原来的 `listDrafts(p)`**，而那是这一整件事的全部病根：
 *  `referencesOf` / `mapDraftRefs` 对外叫「谁引用了这个文件」/「改写引用」，
 *  而数据源只有**设计稿**。C3 删掉 dc 之后它们**恒回空** ——
 *  能力的名字还在、而它回答的那个问题已经不存在。
 *  > **一件能力的名字还在、而它回答的那个问题已经不存在，比删掉它更坏。**
 *
 *  ⚠️ **为什么不是「所有文本文件」**：`.ts` 里的 `import "./x"`、`.json` 里的路径字符串
 *  都不是这两个正则认得的形状，扫它们只会增加耗时而找不到东西 ——
 *  而「扫了但找不到」和「没扫」在读数上长得一样。要加格式就连它的语法一起加。 */
const REF_SOURCE_EXTS = new Set(["html", "htm", "css", "svg", "md", "markdown"]);

/** 这份文件里的引用该用哪几个正则取。md 两个都跑（它可以内嵌 HTML）。 */
function refRegexesFor(rel: string): RegExp[] {
  const ext = (rel.split(".").pop() ?? "").toLowerCase();
  if (ext === "md" || ext === "markdown") return [REF_VALUE_RE, MD_REF_RE];
  return [REF_VALUE_RE];
}

/** 一处引用在源文件里的位置与值 —— 两个正则的捕获组形状不同，这里统一成一种。 */
interface RefHit { value: string; offset: number; end: number }

/** 把一份文件里的引用全取出来，**按出现顺序**（替换要按区间来，顺序错了偏移就乱）。 */
function refHitsOf(src: string, rel: string): RefHit[] {
  const hits: RefHit[] = [];
  for (const re of refRegexesFor(rel)) {
    for (const m of src.matchAll(re)) {
      const at = m.index ?? 0;
      if (re === MD_REF_RE) {
        const raw = m[2];
        if (raw === undefined) continue;
        /* `<path>` 这种尖括号包法要把括号排除在值之外，否则改写会把它们一起换掉 */
        const lt = raw.startsWith("<") ? 1 : 0;
        const gt = raw.endsWith(">") ? 1 : 0;
        const value = raw.slice(lt, raw.length - gt);
        if (!value) continue;
        const off = at + (m[1]?.length ?? 0) + lt;
        hits.push({ value, offset: off, end: off + value.length });
      } else {
        const isAttr = m[3] !== undefined;
        const value = isAttr ? m[3] : m[6];
        if (value === undefined) continue;
        const off = at + (isAttr ? (m[1]?.length ?? 0) + (m[2]?.length ?? 0)
                                 : (m[4]?.length ?? 0) + (m[5]?.length ?? 0));
        hits.push({ value, offset: off, end: off + value.length });
      }
    }
  }
  /* ⚠️ **两个正则各自扫一遍，命中是交错的** —— 必须按偏移排序，
     否则下面按区间替换时 `last` 会往回走，产出一份乱掉的文件。
     （md 里 `<img src>` 和 `![](…)` 同时存在时就会撞到这一条。） */
  return hits.sort((a, b) => a.offset - b.offset);
}

/** 一处引用解成「相对项目根的路径」；解不出来（外链 / 根相对 / 锚点 / 指到项目外）回 null。 */
function resolveRefTarget(draftRel: string, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) || v.startsWith("//") || v.startsWith("#")) return null;
  if (v.startsWith("/")) return null;                       // 根相对：不是项目内的相对引用
  const pathPart = v.split(/[?#]/)[0] ?? "";
  if (!pathPart) return null;
  const joined = posix.normalize(posix.join(posix.dirname(draftRel), decodeRefPath(pathPart)));
  if (joined === "." || joined.startsWith("../")) return null;   // 指到项目外
  return joined;
}

/** 地址里可能写着 `%E4%B8%AD`。⚠️ 解不开就原样用 —— **别让一个坏编码把整件事炸掉**（#85 同族）。 */
function decodeRefPath(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** 遍历一份文件里所有引用的**值**：回调回新值就替换，回 null 就不动。
 *  ⚠️ 按**匹配到的区间**替换，不是 `split/join` —— 同一个值在正文里出现也不碰
 *  （上面那段 issue #76 的注释写了两个方向的错法）。
 *
 *  ⚠️ **2026-10-23（M16-7c-2d）改名 `mapDraftRefs` → `mapFileRefs`，而不只是改名**：
 *  它原来只认 html 的 `href`/`src`/`url()`，现在按文件类型取（md 多一套语法），
 *  命中统一从 `refHitsOf` 来。
 *  > **一个叫 `*Draft*` 的函数在为所有文本文件服务时，名字会继续教下一个人错的事。** */
function mapFileRefs(
  src: string,
  rel: string,
  fn: (value: string, line: number) => string | null,
): { out: string; changed: number } {
  let out = "", last = 0, changed = 0, cursor = 0, line = 1;
  for (const hit of refHitsOf(src, rel)) {
    while (cursor < hit.offset) { if (src.charCodeAt(cursor) === 10) line++; cursor++; }
    const next = fn(hit.value, line);
    if (next === null || next === hit.value) continue;
    out += src.slice(last, hit.offset) + next;
    last = hit.end;
    changed++;
  }
  return { out: out + src.slice(last), changed };
}

/** 项目里**哪些文件可能含引用** —— 扫全项目、按扩展名筛（`REF_SOURCE_EXTS`）。
 *
 *  ⚠️ 上限复用 `WALK_MAX`（5000，geek-99 2026-10-23 定），而 **`truncated` 要一路带到界面**：
 *  「只查了前 N 个文件」和「这个文件没人引用」是两件完全不同的事，
 *  而它们在一个空列表上长得一模一样。
 *  > **一个有上限的查询，必须能说出自己是不是到上限了。** */
async function listRefSources(p: Project): Promise<{ files: string[]; truncated: boolean }> {
  const all = await walkAll(p, WALK_MAX);
  const files = all.entries
    .map((e) => e.path)
    .filter((rel) => REF_SOURCE_EXTS.has((rel.split(".").pop() ?? "").toLowerCase()))
    /* 工具自己部署进项目的壳页面不算「引用方」—— 它们引 support.js 是当年
       `build_index` 干的，跟用户的文件组织没关系（那些文件今天还躺在用户项目里） */
    .filter((rel) => !isToolArtifact(rel));
  return { files, truncated: all.truncated };
}

/** 稿里该怎么写这个文件的路径：相对稿自己的位置。
 *  保住原来的写法 —— 本来写 `./x.png` 的就还是 `./`，本来带 `?v=2` 的把后缀带回去。 */
function refValueFor(draftRel: string, targetRel: string, oldValue: string): string {
  const suffix = oldValue.match(/[?#].*$/)?.[0] ?? "";
  let next = posix.relative(posix.dirname(draftRel), targetRel);
  if (oldValue.trim().startsWith("./") && !next.startsWith(".")) next = "./" + next;
  return next + suffix;
}

/** 谁引用了这个文件：扫 `REF_SOURCE_EXTS` 那几种文件的引用，返回 { file, line }。
 *
 *  ⚠️ **按解出来的路径比，不按 basename**（issue #76）—— 原来 `icons/logo.png` 和
 *  根目录的 `logo.png` 是同一个 basename，于是「谁引用了我」把别人的引用也算进来，
 *  而改写那一步按真实路径算 → **找到的和改的对不上**。两处现在共用 `resolveRefTarget`。
 *
 *  ⚠️⚠️ **2026-10-23（M16-7c-2d）换了数据源**：原来是 `listDrafts(p)`（只有设计稿），
 *  C3 之后它恒回空 —— 而这件能力对外叫「谁引用了这个文件」。
 *  > **一件能力的名字还在、而它回答的那个问题已经不存在，比删掉它更坏**
 *  > —— 因为「没人引用」和「这个功能坏了」在界面上长得一模一样。
 *
 *  ⚠️ `truncated` 跟着回出去：到了 5000 的上限就说出来，别让空列表冒充「没人引用」。 */
export async function referencesOf(p: Project, rel: string): Promise<{ refs: Array<{ file: string; line: number }>; truncated: boolean }> {
  const target = basename(rel);
  const out: Array<{ file: string; line: number }> = [];
  const { files, truncated } = await listRefSources(p);
  for (const srcRel of files) {
    if (srcRel === rel) continue;                  // 自己引自己不算
    let src: string;
    try { src = await readFile(join(p.dir, srcRel.split("/").join(sep)), "utf8"); } catch { continue; }
    if (!src.includes(target)) continue;           // 先粗筛，避免每份都逐行
    mapFileRefs(src, srcRel, (value, line) => {
      if (resolveRefTarget(srcRel, value) === rel) out.push({ file: srcRel, line });
      return null;                                 // 只看不改
    });
  }
  return { refs: out, truncated };
}

// ──────────────────────── 内部 ────────────────────────

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (rel: string) => rel.split(/[\\/]/).filter((x) => x && x !== "." && x !== "..").join("/");

/** 把调用方给的路径规范成「相对项目根的干净路径」。
 *  ⚠️ **导出它是有意的**（M10-2c）：草稿暂存要用**同一套**规范化 ——
 *  两处各写一份的话，同一个文件在快照那边叫 `a/b.ts`、在草稿那边叫 `./a/b.ts`，
 *  于是「有没有草稿」永远查不到。 */
export function normalizeRel(p: Project, rel: string): string {
  const c = clean(rel);
  if (!c) {
    throw new ToolError(err(X.IO, rel, { kind: "path", name: rel }, "路径是空的",
      { fix: "给一个相对项目根的路径，比如 需求.md 或 docs/需求.md" }));
  }
  void p;
  return c;
}

function safeJoin(p: Project, rel: string): string {
  const c = clean(rel);
  const abs = c ? join(p.dir, c.split("/").join(sep)) : p.dir;
  /* ⚠️ **两道闸，问的不是同一个问题**（issue #140）：
     ① `isInside` 比字面 —— 拦 `..` 和同前缀兄弟目录（#19）；
     ② `isInsideReal` 解完符号链接再比 —— 拦「项目里放一个指向外面的链接」。
     原来只有一道，而且是 `startsWith(p.dir)`（连 #19 那一半都是旧写法）。
     ⚠️ **拒因要分开说**：两种情况用户该做的事不同
     （前者改路径，后者那个文件压根不该从这里碰）。 */
  if (!isInside(p.dir, abs)) {
    throw new ToolError(err(X.IO, rel, { kind: "path", name: rel }, "路径跑到项目外面去了",
      { fix: "只能读写项目目录里的文件。" }));
  }
  if (!isInsideReal(p.dir, abs)) {
    throw new ToolError(err(X.IO, rel, { kind: "path", name: rel }, "这是一条指向项目外面的链接",
      { fix: "它在文件树里标着「指向项目外」。链接本身可以留着，但从这里读写它等于读写项目外的文件，所以不放行。要改那个文件，请直接打开它所在的那个目录。" }));
  }
  return abs;
}

function mustFile(p: Project, rel: string): string {
  const abs = safeJoin(p, rel);
  if (!existsSync(abs) || statSync(abs).isDirectory()) {
    throw new ToolError(err(X.DRAFT_NOT_FOUND, rel, { kind: "file", name: rel },
      `项目里没有文件 ${rel}`, { fix: "先用 list_files 看看这一层有什么" }));
  }
  return abs;
}

async function firstLine(abs: string): Promise<string> {
  try {
    const head = (await readFile(abs, "utf8")).slice(0, 4000);
    const body = head.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");   // 跳过 frontmatter
    const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
    return line ? line.slice(0, 120) : "";
  } catch { return ""; }
}

/** 从文件头读图片尺寸。只认这几种，读不出来就不给 —— 宁可没有，不可以给错的。 */
async function imageSize(abs: string): Promise<{ width?: number; height?: number }> {
  try {
    const ext = extname(abs).toLowerCase();
    if (ext === ".svg") {
      const s = (await readFile(abs, "utf8")).slice(0, 4000);
      const w = /\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)/.exec(s), h = /\bheight\s*=\s*["']?(\d+(?:\.\d+)?)/.exec(s);
      if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
      const vb = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(s);
      return vb ? { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) } : {};
    }
    const b = await readFile(abs);
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };   // PNG
    if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };   // GIF
    if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const fmt = b.toString("ascii", 12, 16);
      if (fmt === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (fmt === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (fmt === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
      return {};
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {   // JPEG：按段走到 SOFn
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1] as number;
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    return {};
  } catch { return {}; }
}

/** 递归列项目里的文件（相对路径，`/` 分隔），给「全项目扫一遍」这类事用（M13-3 的 `list_activity`）。
 *  跳过 `.umbrastudio` / `.git` / `node_modules` 和所有以 `.` 开头的目录 —— 那些不是用户的稿。
 *  `max` 到了就停：一个几万文件的目录不该让一次问话扫完。 */
export async function walkProjectFiles(p: Project, max = 5000): Promise<{ files: string[]; truncated: boolean }> {
  const out: string[] = [];
  const skip = new Set([UD_DIRNAME, ".git", "node_modules"]);
  const stack: string[] = [""];
  while (stack.length && out.length < max) {
    const rel = stack.pop()!;
    let names: string[] = [];
    try { names = (await readdir(join(p.dir, rel))).sort(); } catch { continue; }
    for (const n of names) {
      if (out.length >= max) break;
      const r = rel ? `${rel}/${n}` : n;
      let st; try { st = statSync(join(p.dir, r)); } catch { continue; }
      if (st.isDirectory()) { if (!skip.has(n) && !n.startsWith(".")) stack.push(r); continue; }
      if (st.isFile()) out.push(r);
    }
  }
  return { files: out, truncated: out.length >= max };
}
