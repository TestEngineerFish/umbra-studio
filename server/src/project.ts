/** 租户（设计项目）解析。doc/00 §三
 *
 * 要点：
 *  - 项目根只是默认在 Umbra Studio/projects，可由 --projects-root / UMBRASTUDIO_PROJECTS_ROOT 指定。
 *    工具不追踪用户的项目，打包分发后 projects/ 甚至不在安装目录里。
 *  - 租户目录必须自包含：运行时副本与稿同层（不是 _runtime/ 子目录）。
 *  - git 自动探测租户目录下有没有 .git，不手填。
 */
import { readdir, readFile, stat, rename, cp, mkdir } from "node:fs/promises";
import { hasRepo } from "./gitkeep.js";
import { isInside, isInsideReal, plainNameProblem, resolveInside } from "./pathguard.js";
import { existsSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, relative, dirname, basename, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { X } from "./codes.js";
import { emit } from "./events.js";
import { err, ToolError } from "./envelope.js";
import { assetDir, UD_DIRNAME } from "./statedirs.js";
import { sweepTmpUnder } from "./tmpfiles.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 工具自身的根：server/dist/.. → server/.. → Umbra Studio/
 *  **只读资产**看这里：`runtime/`、`ui/`、`app/dist`、`doc/`。
 *  打包后它是 `<app>/Contents/Resources/core`，本来就该只读。 */
export const TOOL_ROOT = resolve(HERE, "..", "..");
export const RUNTIME_DIR = join(TOOL_ROOT, "runtime");

/** **可写状态**看这里：`ai_config.json`、`workspace.json`、`projects/`、`.archived/`。
 *
 *  开发时它等于 `TOOL_ROOT`，一切照旧。打包后必须分开，两条硬理由（M9-4 实测）：
 *  ① `identity: null` 打出来的是 ad-hoc 签名，**.app 内容被改过一次，下次启动就被 macOS 判「已损坏」** ——
 *     把用户的 key 写进 .app 等于写完就自毁；② 装在 `/Applications` 或 Windows 的 `Program Files`
 *     还要再叠一层写权限问题。壳在 `app.isPackaged` 时把这个环境变量指到 `userData`。
 */
/** 这个目录是**用户显式接管过的设计项目**吗（M14-4 B3，`doc/24` §8.4 的分档）。
 *
 *  ### 为什么要分这一档
 *  `.dc.html` 里写的是 `<script src="./support.js">` —— **相对引用**，而
 *  `support.js` / `react*.min.js` 就躺在那份稿旁边。这不是实现偷懒，是产品定位：
 *  **「一份文件同时是设计稿、规范出处和可运行原型」**，双击它要能自己跑起来。
 *  所以「运行时副本 + 壳页面」这一类（`doc/24` 的 ⓒ 档）**必须落在项目里**。
 *
 *  但它和「打开任意目录看一眼」完全不重叠：看一份 `.md`、一张图、一个文件夹，
 *  **一个字节的 ⓒ 都不需要**。而 2026-10-21 sam 用「新建项目」打开 `Geek/doc`，
 *  我们往他的文档目录部署了 780 KB 的设计工具脚手架 —— 他要的只是看一份 `.md`。
 *
 *  ### 判准：`project.json` 在不在
 *  它是**用户显式接管**留下的那一个标记（`create_project` / `adopt_project` 写它），
 *  而**打开一个目录不写它**。
 *  ⚠️ 别拿「`.dc.html` 多不多」之类的启发式判 —— 那会让「我只是想看一眼别人发来的稿」
 *  变成「我们在他的下载文件夹里铺了一摊」。**显式胜过聪明。** */
export const isDesignProject = (dir: string): boolean => existsSync(join(resolve(dir), "project.json"));

export const STATE_ROOT = process.env.UMBRASTUDIO_STATE_DIR
  ? resolve(process.env.UMBRASTUDIO_STATE_DIR)
  : TOOL_ROOT;

/** 项目 / 工具自己的配置目录名（M7-1 改名，`11` Q28）。旧名 `.umbradesign/` 的项目第一次打开时自动拷成新名，旧目录不删。 */
/** ⚠️ **定义搬去了 `statedirs.ts`**（M14-4 A 段）—— 本文件自己要用那边的 `assetDir`
 *  （模板那一处），定义留在这边就成环。这里再导出，所以
 *  所有 `import { UD_DIRNAME } from "./project.js"` 照旧能用。 */
export { UD_DIRNAME } from "./statedirs.js";
const LEGACY_UD_DIRNAME = ".umbra" + "design";

/** `.umbradesign/` 里**不是旧配置**的那些东西 —— 它们不该跟着改名搬走。
 *
 *  现在只有点选桥一件：`ensureRuntimeBeside` 把它放在 `.umbradesign/` 下，
 *  因为 S2 预览壳里写死的是 `./.umbradesign/select-bridge.js`，
 *  而**那个目录名是格式与协议级标识，改名那一轮刻意没动**（`00` §四十九）。 */
const PROTOCOL_IN_LEGACY = new Set(["select-bridge.js"]);

/** 旧配置目录里真正需要搬的那几项（也就是除了协议级标识以外的全部）。 */
function legacyPayload(oldDir: string): string[] {
  try { return readdirSync(oldDir).filter((n) => !PROTOCOL_IN_LEGACY.has(n)); } catch { return []; }
}

/** 把旧配置目录 `.umbradesign/` 搬成新名 `.umbrastudio/`（改名那一轮的兼容路，`00` §四十九）。
 *
 *  ⚠️⚠️ **2026-10-22 之前它在每一个写过稿的项目上都会触发，而它本该几乎永不触发。**
 *  两件事叠起来才成这样，单看任何一件都没问题：
 *
 *  | | |
 *  | --- | --- |
 *  | ① 前提被别处改了 | `.umbradesign/` 今天**不只是旧配置目录** —— 点选桥住在那里（见上）。于是「旧目录在不在」对**每个写过稿的目录**都成立 |
 *  | ② 守卫被别处翻面了 | 守卫是「新目录不在才搬」。**B1/B2 把项目里的 `.umbrastudio/` 搬空之后，它从几乎永假变成了永真** |
 *
 *  后果有两层，第二层才是要紧的：
 *  · 每个项目里多一个 `.umbrastudio/select-bridge.js`（19 KB，**读它的人是零个**）；
 *  · **这是 B3「打开普通目录零写入」的一个破口** —— 一个普通目录里只要有
 *    别人发来的、自带 `.umbradesign/` 的稿（现实里发一份稿就是连这个目录一起发），
 *    `buildProject()` 第一句就往他的目录里建一个 `.umbrastudio/`。实测确证过。
 *
 *  > **一个判准的前提被别处改掉了，而它自己不会报错。**
 *  > 而 B3 那条判据当时全绿 —— 它的样本里没有 `.umbradesign/`，
 *  > 也就是**判据在没有样本的时候，测的是「今天恰好没事」**（第四次）。
 *
 *  修法是让它只搬**真正是旧配置的那几项**：一个只剩协议级标识的 `.umbradesign/`
 *  现在是「没什么要搬的」，于是一个字节都不写。
 *  ⚠️ 这里刻意用**排除名单**而不是白名单，和「清除缓存」那边相反 ——
 *  两边的代价不对称：**清除缓存漏一项是删掉用户的东西，搬迁漏一项是静默失忆**
 *  （历史在盘上，新代码去新位置找不到就当「没有」）。搬多了只是几个字节。 */
export function migrateUdDirSync(dir: string): boolean {
  const oldDir = join(dir, LEGACY_UD_DIRNAME), newDir = join(dir, UD_DIRNAME);
  if (!existsSync(oldDir) || existsSync(newDir)) return false;
  const names = legacyPayload(oldDir);
  if (!names.length) return false;
  mkdirSync(newDir, { recursive: true });
  for (const n of names) cpSync(join(oldDir, n), join(newDir, n), { recursive: true });
  return true;
}
export async function migrateUdDir(dir: string): Promise<boolean> {
  const oldDir = join(dir, LEGACY_UD_DIRNAME), newDir = join(dir, UD_DIRNAME);
  if (!existsSync(oldDir) || existsSync(newDir)) return false;
  const names = legacyPayload(oldDir);
  if (!names.length) return false;
  await mkdir(newDir, { recursive: true });
  for (const n of names) await cp(join(oldDir, n), join(newDir, n), { recursive: true });
  return true;
}
migrateUdDirSync(STATE_ROOT);   // 工具自己的 ai_config / workspace 等（原注释还提了「outgoing 记录」，那条路 C3 删了）

/* ── 启动时扫一次我们自己的状态目录，清掉原子写留下的孤儿（M14-9，2026-10-22）──
 *
 * ⚠️ **为什么在这里**：每个入口（壳、`npm run ui`、外部客户端起的 MCP、通道 B 给 CLI 起的 MCP）
 * 都会 import 这个文件，而它们**没有一个共同的「启动」函数**。
 * 装在某一个入口里的话，另外三个入口上这件事就不发生 —— 而「有的入口清、有的不清」
 * 和「都不清」在用户那边几乎是同一个现象（§170 那一族：**一道闸只守住一条路等于没守**）。
 *
 * ⚠️ **不 await**：清垃圾慢了不该让启动等着。它内部一个异常都不往外抛。
 * ⚠️ 实测它要清的就是 `doc/24` §19.5 量到的那两个 `clock.json.*.tmp`。 */
void sweepTmpUnder(STATE_ROOT).catch(() => { /* 清垃圾失败不该挡住启动 */ });

export interface ProjectConfig {
  name: string;
  title?: string;
  designSystem?: { dir: string; alias?: string };
  tokens?: string;
  icons?: string;
  extraStyles?: string[];
  limits?: { elementsWarn?: number; elementsHard?: number };
}

export interface Project {
  /** project.json 里的 name，没有配置文件时用目录名 */
  name: string;
  title: string;
  /** 租户目录绝对路径 */
  dir: string;
  /** 相对仓库根（用于诊断的 file 字段） */
  rel: string;
  config: ProjectConfig;
  /** ds 的真实相对路径（相对租户根），没配就是 null */
  dsDir: string | null;
  dsAlias: string;
  tokensPath: string | null;
  iconsPath: string | null;
  limits: { elementsWarn: number; elementsHard: number };
  /** 自动探测：租户目录下有没有 .git */
  gitEnabled: boolean;
}

const DEFAULT_LIMITS = { elementsWarn: 1200, elementsHard: 1500 };

export function projectsRoot(): string {
  const flag = process.argv.indexOf("--projects-root");
  if (flag >= 0 && process.argv[flag + 1]) return resolve(process.argv[flag + 1] as string);
  if (process.env.UMBRASTUDIO_PROJECTS_ROOT) return resolve(process.env.UMBRASTUDIO_PROJECTS_ROOT);
  return join(STATE_ROOT, "projects");
}

/** 诊断里的 file 字段：相对项目根的路径，始终用 / 分隔 */
export function relFile(abs: string): string {
  const root = projectsRoot();
  const r = relative(root, abs);
  return (r.startsWith("..") ? abs : r).split(sep).join("/");
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

export async function listProjectDirs(): Promise<string[]> {
  const root = projectsRoot();
  if (!(await isDir(root))) return [];
  const out: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    out.push(join(root, e.name));
  }
  return out.sort();
}

export async function loadProject(nameOrDir: string): Promise<Project> {
  /* 绝对路径直接当项目目录（M1-2：项目可在任意路径）。以前只按 projects/ 下的名字找，
     参数叫 nameOrDir 却从没处理过 Dir —— Tauri 壳里打开 projects/ 之外的项目一律「找不到」【实测 2026-09-23】。 */
  if (isAbsolute(nameOrDir)) {
    if (!existsSync(join(nameOrDir, "project.json"))) {
      throw new ToolError(
        err(X.PROJECT_UNKNOWN, nameOrDir, { kind: "path", name: nameOrDir },
          `目录 "${nameOrDir}" 下没有 project.json，不是一个设计项目`,
          { fix: "用 create_project 在这个目录建项目（已有的稿会被接管，不改动）" }));
    }
    return await buildProject(nameOrDir);
  }
  const dirs = await listProjectDirs();
  let hit = dirs.find((d) => d.split(sep).pop() === nameOrDir) ?? null;
  if (!hit) {
    for (const d of dirs) {
      const c = await readConfig(d);
      if (c?.name === nameOrDir) { hit = d; break; }
    }
  }
  if (!hit) {
    const available = dirs.map((d) => d.split(sep).pop()).filter(Boolean) as string[];
    throw new ToolError(
      err(X.PROJECT_UNKNOWN, relFile(join(projectsRoot(), nameOrDir)),
        { kind: "path", name: nameOrDir },
        `找不到设计项目 "${nameOrDir}"`,
        { fix: `项目根是 ${projectsRoot()}，现有：${available.join(" / ") || "（空）"}` }),
      { projectsRoot: projectsRoot(), available }
    );
  }
  return await buildProject(hit);
}

async function readConfig(dir: string): Promise<ProjectConfig | null> {
  try {
    return JSON.parse(await readFile(join(dir, "project.json"), "utf8")) as ProjectConfig;
  } catch { return null; }
}

export async function buildProject(dir: string): Promise<Project> {
  await migrateUdDir(dir);
  const fallbackName = dir.split(sep).pop() as string;
  const config = (await readConfig(dir)) ?? { name: fallbackName };
  const dsDir = config.designSystem?.dir ?? null;
  return {
    name: config.name || fallbackName,
    title: config.title || config.name || fallbackName,
    dir,
    rel: relFile(dir),
    config,
    dsDir,
    dsAlias: config.designSystem?.alias ?? "@ds",
    tokensPath: config.tokens ? join(dir, config.tokens) : null,
    iconsPath: config.icons ? join(dir, config.icons) : null,
    limits: { ...DEFAULT_LIMITS, ...(config.limits ?? {}) },
    /* ⚠️ 「这个项目能不能按 git ref 取版本」= **兜底仓库**在不在
       （issue #87）—— 原来看的是项目里那个 `.git`，而我们从 #74 起
       根本不往那里提交。看错了仓库的后果是**两边都不对**：
       项目里有 `.git` 时说「能取」而实际取不到；没有时说「没有 git」
       而兜底明明在记。 */
    gitEnabled: hasRepo(dir),
  };
}

/** 递归列出租户下所有 .dc.html（跳过点目录） */
export async function listDrafts(p: Project): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const q = join(d, e.name);
      if (e.isDirectory()) await walk(q);
      else if (e.name.endsWith(".dc.html")) out.push(q);
    }
  }
  await walk(p.dir);
  return out.sort();
}

/** 稿的绝对路径。path 是相对租户根的。不存在就抛 E_DRAFT_NOT_FOUND。 */
export function draftPath(p: Project, path: string): string {
  const abs = resolve(p.dir, path);
  /* issue #19：`startsWith` 不带分隔符，兄弟目录 `<项目名>2` 会穿过去 */
  /* issue #140：解完符号链接再比 —— `isInsideReal` 内部经 realpath 规范化，字面那一半也覆盖了 */
  if (!isInsideReal(p.dir, abs)) {
    throw new ToolError(err(X.BAD_INPUT, path, { kind: "path", name: path },
      "稿的路径跨出了项目目录", { fix: "path 必须是相对项目根的路径，不能用 .. 跳出去" }));
  }
  if (!existsSync(abs)) {
    throw new ToolError(err(X.DRAFT_NOT_FOUND, relFile(abs), { kind: "file", name: path },
      `找不到稿 "${path}"`, { fix: "用 get_project 看现有的稿清单" }));
  }
  return abs;
}

/** @ds 别名 → 真实相对路径。落盘时用（00 §3.2）。 */
export function expandDsAlias(p: Project, src: string, relPath?: string): string {
  if (!p.dsDir) return src;
  const a = p.dsAlias;
  /* `dsDir` 是相对**项目根**的。稿在子目录时不能原样贴上去 —— 浏览器会按稿自己的位置解析，
     `PC 端/x.dc.html` 里的 `_ds/…` 会去要 `/PC 端/_ds/…`，404，token 全部失效【实测 2026-09-24】。
     所以按稿所在目录补 `../`。relPath 不给时退回旧行为（等于把稿当在根目录）。 */
  const depth = relPath ? relPath.split("/").length - 1 : 0;
  const prefix = "../".repeat(depth) + p.dsDir;
  // 只替换出现在 href/src 属性值开头的别名，避免动到正文里的字面量
  const out = src.replace(
    new RegExp(`((?:href|src)\\s*=\\s*["'])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "g"),
    (_m, pre: string) => `${pre}${prefix}/`
  );
  return out;   // 存量稿里已经展开过的错路径由 normalize 的 fixDsDepth 收拾，这里只管别名
}

/** 存量稿修正：上一版展开出的 `_ds/…` 没算子目录深度，盘上留着一批指向 `/<子目录>/_ds/…` 的死链。
 *  条件收得很窄 —— 只认「正好等于 dsDir 开头、且前面没有 ../」的那一种，也就是我们自己写出来的形状。
 *  经唯一写入口再落一次盘就修好；steps 里会记一句。 */
export function fixDsDepth(p: Project, src: string, depth: number): string {
  if (!p.dsDir || depth <= 0) return src;
  const up = "../".repeat(depth);
  return src.replace(
    new RegExp(`((?:href|src)\\s*=\\s*["'])${p.dsDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "g"),
    (_m, pre: string) => `${pre}${up}${p.dsDir}/`
  );
}

// ──────────────────────── M1-1: create_project ───────────────────────

import { writeAtomic } from "./normalize.js";   // mkdir 在文件头一起导入了（改名兼容路也要用）
import { studioName } from "./shared/brand.js";

export interface CreateProjectOpts {
  /** 项目目录绝对路径。不给时默认 projects/<name> */
  dir?: string;
  /** 项目显示名（project.json name），不给时用目录名 */
  name?: string;
  /** 项目标题 */
  title?: string;
  /** 设计系统目录。不给时不配设计系统 */
  designSystemDir?: string;
  /** 设计系统别名，默认 @ds */
  designSystemAlias?: string;
  /** tokens 文件相对路径 */
  tokens?: string;
  /** icons 文件相对路径 */
  icons?: string;
  /** 元素数阈值 */
  limits?: { elementsWarn?: number; elementsHard?: number };
  /** 是否初始化 .git */
  initGit?: boolean;
}

export interface CreateProjectResult {
  dir: string;
  name: string;
  title: string;
  firstDraft: string;
  gitEnabled: boolean;
  /** 写入了哪些文件 */
  created: string[];
}

/** 第一份空白稿的骨架。
 *  最小可渲染 .dc.html：doctype + helmet + 空 x-dc + support.js 引导。 */
function blankDraft(title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<!-- ${title} —— ${studioName} 空白稿，从这里开始画 -->
<div style="padding:80px 20px;text-align:center;color:var(--ink,#888);font-family:system-ui">
  <div style="font-size:16px;font-weight:600;margin-bottom:8px">${title}</div>
  <div style="font-size:13px">选中这个元素，改它的字号 / 颜色 / 文案</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{&quot;width&quot;:375,&quot;height&quot;:667}}">
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
}

/** .gitignore 模板。新建项目时拷一次，之后由 build_index 维护生成的那段。 */
function gitignoreTemplate(): string {
  return `# ── 设计项目（租户）的仓库 ────────────────────────────────────
# 每个设计项目各自一个 git 仓库。git 在 ${studioName} 里是【兜底手段】：
# 主路径是 .umbrastudio/snapshots/ 的语义快照 + CHANGELOG-设计侧.md，
# 只有要按任意 git ref 取历史版本时才用到 git（见 doc/07 §七）。

# 工具产物：快照、缩略图、索引缓存。可由稿件重算，不必进仓库。
# ⚠️ 若希望语义 diff 的历史随仓库一起走，把下面这行注释掉，
#    改为只忽略 shots/ 与 cache/ —— 见 doc/07 §七的两种取法。
.umbrastudio/
.umbradesign/

# 旧宿主（Claude Design）留下的产物，不是设计事实的出处
.image-slots.state.json
.thumbnail
uploads/
screenshots/

# 运行时副本：由 MCP 从工具的 runtime/ 拷进来并保持更新，不必进仓库
_runtime/

# 编辑器与系统
.DS_Store
Thumbs.db
*.swp
`;
}

/** 从空目录创建一个设计项目。
 *
 * 写入：
 *   <dir>/project.json        项目配置
 *   <dir>/.gitignore          租户级忽略规则
 *   <dir>/<name>.dc.html     第一份空白稿
 *   <dir>/.git/               可选，initGit=true 时
 */
export async function createProject(
  name: string,
  opts: CreateProjectOpts = {},
): Promise<CreateProjectResult> {
  const dir = opts.dir ?? join(projectsRoot(), name);

  // 目录已存在且已经有 project.json → 不是空目录
  const existingConfig = join(dir, "project.json");
  if (existsSync(existingConfig)) {
    throw new Error(
      `目录 "${dir}" 下已经有 project.json，这已经是一个设计项目。`
      + "用 get_project 查看，或用 update_project 修改。"
    );
  }

  // 目录存在但不是空的（有非隐藏文件）→ 警告但还是继续
  let isClean = true;
  if (existsSync(dir)) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      isClean = entries.every((e) => e.name.startsWith("."));
    } catch { /* 读不了就当不知道 */ }
  }

  await mkdir(dir, { recursive: true });

  const projName = opts.name ?? name;
  const projTitle = opts.title ?? projName;
  const dsAlias = opts.designSystemAlias ?? "@ds";
  const created: string[] = [];

  // 1. project.json
  const config: ProjectConfig = {
    name: projName,
    title: projTitle,
  };
  if (opts.designSystemDir) {
    config.designSystem = { dir: opts.designSystemDir, alias: dsAlias };
  }
  if (opts.tokens) config.tokens = opts.tokens;
  if (opts.icons) config.icons = opts.icons;
  if (opts.limits) config.limits = opts.limits;

  await writeAtomic(existingConfig, JSON.stringify(config, null, 2) + "\n");
  created.push("project.json");

  // 2. .gitignore
  const giPath = join(dir, ".gitignore");
  if (!existsSync(giPath)) {
    await writeAtomic(giPath, gitignoreTemplate());
    created.push(".gitignore");
  }

  /* 3. 第一份空白稿 —— ⚠️ **也走写入口**（issue #71）。
     原来是 `writeAtomic` 直写，于是**新建项目的第一份稿四样都没有**
     （当年最显眼的是没有 `__resources` → 断网白屏；那一套 2026-10-24 删了，
     现在剩下的是没有节点地址、没有 v1 快照）。
     这是三条绕过写入口的路里**最先被看到**的那一份。

     ⚠️ `project.json` 在上面第 1 步已经写好了，所以这里 `buildProject` 拿得到 ——
     顺序不能换（写入口要靠 `Project` 才知道 `@ds` 怎么展开、运行时放哪）。 */
  const firstDraftName = `${projTitle}.dc.html`;
  const freshProj = await buildProject(dir);
  await newDraftToDisk(freshProj, firstDraftName, blankDraft(projTitle));
  created.push(firstDraftName);

  /* 4. 版本兜底。
     ⚠️ **不再往项目目录里 `git init`**（issue #87，2026-10-06）。
     #74 之后我们提交到的是 `STATE_ROOT/.umbrastudio/git/<名>__<哈希>`，
     于是项目里那个 `.git` 从此**一次提交也不会收到** ——
     每个新项目都带一个 0 提交的空仓库，而 `created` 里还列着 `.git/`，
     让人以为「这个项目在用 git 记版本」。
     （`gitkeep.ts` 头注里说的「实测两个项目都 git init 过但 0 个提交」
     就是这个状态，而那时候它还是个症状；#74 之后它变成了**必然**。）

     ⚠️ 用户自己 `git init` 当然照旧 —— 我们不碰他的仓库，也不替他建。 */
  let gitEnabled = false;
  if (opts.initGit !== false) {
    const { ensureRepo } = await import("./gitkeep.js");
    gitEnabled = await ensureRepo(dir);
  }

  return {
    dir,
    name: projName,
    title: projTitle,
    firstDraft: firstDraftName,
    gitEnabled,
    created,
  };
}

// ──────────────────────── M1-3: create_draft ───────────────────────

/** 新建稿的四种来源 */
export type DraftSource =
  | { kind: "blank"; title?: string }
  | { kind: "copy"; sourceFile: string }
  | { kind: "component"; componentName: string; title?: string }
  | { kind: "template"; templatePath: string };

export interface CreateDraftResult {
  /** 副本从源稿带过来的 error 级诊断条数（issue #92）。
   *  ⚠️ **不说的话用户以为复制出来是干净的** —— 而它带着原稿的毛病。 */
  carriedErrors?: number;
  path: string;
  source: string;
  elements: number;
}

/** 空白稿模板。和 createProject 用的类似但更精简。 */
function blankDraftContent(title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<!-- ${title} —— 新建稿 -->
<div style="padding:80px 20px;text-align:center;color:var(--ink,#888);font-family:system-ui">
  <div style="font-size:16px;font-weight:600;margin-bottom:8px">${title}</div>
  <div style="font-size:13px">选中这个元素，改它的字号 / 颜色 / 文案</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{&quot;width&quot;:375,&quot;height&quot;:667}}">
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
}

/** 组件包装稿：只含一个 dc-import。
 *  这样新稿就是一个页稿，引用了指定的组件，可以直接预览。 */
function componentWrapperDraft(componentName: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<!-- ${title} —— ${componentName} 的包装稿 -->
<dc-import name="${componentName}"></dc-import>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{&quot;width&quot;:375,&quot;height&quot;:667}}">
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
}

/** 新建一份稿。
 *
 * 四种来源：
 *   blank       —— 空白骨架
 *   copy        —— 复制现有稿（不复制快照，新稿从 v1 起）
 *   component   —— 把组件包一层，创建只含 dc-import 的页稿
 *   template    —— 从模板文件复制
 *
 * path 相对项目根，必须以 .dc.html 结尾。
 * 如果文件已存在会抛出。
 */
export async function createDraft(
  p: Project,
  path: string,
  source: DraftSource,
): Promise<CreateDraftResult> {
  const abs = resolve(p.dir, path);
  if (!isInsideReal(p.dir, abs)) {           // issue #19 + #140（链接）
    throw new Error("稿的路径跨出了项目目录");
  }
  if (existsSync(abs)) {
    throw new Error(`文件 "${path}" 已经存在`);
  }
  if (!path.endsWith(".dc.html")) {
    throw new Error("稿的路径必须以 .dc.html 结尾");
  }

  let content: string;
  let sourceDesc: string;

  switch (source.kind) {
    case "blank": {
      const title = source.title ?? basename(path).replace(/\.dc\.html$/, "");
      content = blankDraftContent(title);
      sourceDesc = "空白骨架";
      break;
    }
    case "copy": {
      /* ⚠️ **来源也要守**（issue #69，p0，2026-10-05）。
         原来是裸的 `resolve(p.dir, sourceFile)` + `readFile` ——
         只有**目标** `path` 过了 `isInside`（#19 修的那一处），来源一点守卫都没有。
         于是 `create_draft({ source: { kind:"copy", sourceFile:"../../../../.umbrastudio/ai_config.json" } })`
         把**三条通道的明文 apiKey 读进一份新稿** —— 而那份稿接着就进了 AI 上下文。

         `draftPath()` 自带 `isInside` + 存在性检查（现成的，#63 给
         `saveAsTemplate` 用的也是它）。
         ⚠️ 顺带要求 `.dc.html`：复制一份稿就是复制稿，不是读任意文件。 */
      if (!/\.dc\.html$/i.test(source.sourceFile)) {
        throw new ToolError(err(X.BAD_INPUT, source.sourceFile, { kind: "path", name: source.sourceFile },
          "只能复制设计稿", { fix: "sourceFile 要指向一份 .dc.html" }));
      }
      const srcAbs = draftPath(p, source.sourceFile);
      content = await readFile(srcAbs, "utf8");
      sourceDesc = "复制自 " + source.sourceFile;
      break;
    }
    case "component": {
      const title = source.title ?? basename(path).replace(/\.dc\.html$/, "");
      content = componentWrapperDraft(source.componentName, title);
      sourceDesc = "组件 " + source.componentName + " 的包装稿";
      break;
    }
    case "template": {
      /* ⚠️ **模板路径必须在这个项目的模板目录里**（issue #69）。
         原来是 `readFile(source.templatePath)` —— schema 的描述就是「模板绝对路径」，
         于是**任意绝对路径**都读得到（`ai_config.json`、`~/.ssh/config`…）。
         而 `cap/drafts.ts` 的 `tplPath` 用 `join(..., name + ".dc.html")`，
         `join` 又折叠 `..` —— 两条路都通。

         这里设两道（和 #57 / #63 同一套）：结果必须在模板目录里 + 必须是 `.dc.html`。
         ⚠️ 用 `resolveInside(模板目录, …)` 而不是 `isInside(项目, …)` ——
         **闸的粒度要配需求的粒度**：套模板只需要读模板目录，
         给它整个项目的读权限是多给的（M10-3 那条 `frame-src` 同一条道理）。 */
      const tplDir = assetDir(p.dir, "templates");
      let tplAbs: string;
      try { tplAbs = resolveInside(tplDir, relative(tplDir, resolve(source.templatePath))); }
      catch {
        throw new ToolError(err(X.BAD_INPUT, source.templatePath, { kind: "path", name: source.templatePath },
          "模板只能来自这个项目的模板目录",
          { fix: "用 list_templates 看现有的模板，传它给出的那个路径。" }));
      }
      if (!/\.dc\.html$/i.test(tplAbs) || !existsSync(tplAbs)) {
        throw new ToolError(err(X.BAD_INPUT, source.templatePath, { kind: "path", name: source.templatePath },
          `找不到模板 "${basename(source.templatePath)}"`, { fix: "用 list_templates 看现有的模板。" }));
      }
      content = await readFile(tplAbs, "utf8");
      sourceDesc = "模板 " + basename(tplAbs);
      break;
    }
    default: {
      const _exhaustive: never = source;
      throw new Error("未知的稿来源类型");
    }
  }

  /* ⚠️ `copy` 和 `template` 都算 `"copy"` 这一档（issue #92）——
     判准是**内容是不是我们自己生成的**，而模板是用户用 `save_as_template`
     从自己的稿存下来的，所以它和 copy 同类。只有 `blank` 是我们生成的。 */
  const { errorDiags } = await newDraftToDisk(
    p, relative(p.dir, abs).split(sep).join("/"), content,
    source.kind === "blank" ? "blank" : "copy");

  return {
    path,
    source: sourceDesc,
    ...(errorDiags ? { carriedErrors: errorDiags } : {}),
    elements: 0,  // 由调用方校验后填入
  };
}

// ──────────────────────── M1-5: duplicate_draft ───────────────────────

export interface DuplicateDraftResult {
  /** 副本从源稿带过来的 error 级诊断条数（issue #92） */
  carriedErrors?: number;
  originalPath: string;
  newPath: string;
  /** 新稿是否从 v1 开始（不复制快照） */
  startsAtV1: boolean;
}

/**
 * 复制一份稿。
 *
 * 新路径默认在原稿同目录下，名字是 `<原名> 副本.dc.html`。
 * 如果该名字冲突，自动加序号：`<原名> 副本 2.dc.html`。
 * 快照不跟着复制 —— 新稿从 v1 起（doc/12 M1-5 的建议）。
 */
/** 新建一份稿时怎么落盘 —— **走唯一写入口**（issue #71，2026-10-05）。
 *
 *  ### 原来的样子：三条新建路都 `writeAtomic` 直写
 *  而 `create_draft` 给 AI 的说明写的是
 *  「走的是唯一写入口（归一化 → @ds 展开 → `__resources` 注入 → 快照），
 *  所以断网也能打开」—— 实测**四样一个都没有**：
 *
 *  | | `__resources` | 节点地址 | 同目录 `support.js` | v1 快照 |
 *  | --- | --- | --- | --- | --- |
 *  | `create_draft`（三条路） | ✗ | ✗ | ✗ | ✗ |
 *  | **走写入口** | ✓ | ✓ | ✓ | ✓ |
 *
 *  后果都是实打实的：没有 `__resources` → `support.js` 去 unpkg 拉 React →
 *  **断网白屏**（`00` §十五 实测踩过）· 建到新子目录 → 那个目录没有运行时三件套 →
 *  **直接打开白屏** · 没有节点地址 → **点选不可用**（#31 同族）·
 *  没有 v1 快照 → `startsAtV1: true` 这个返回值**名不副实**。
 *
 *  ⚠️ **上面那张表是 2026-10-05 的实测，留档不改**（它解释「为什么这条路必须走写入口」）。
 *  而**左边两列今天已经没有了**：`support.js` + 两个 React UMD 在 C3 删了
 *  （没有读者），`__resources` 在 2026-10-24 删了（唯一读者就是 `support.js`）。
 *  今天写入口留下的是**节点地址 + v1 快照**两样，判据（`lifecycletest`）照这两样钉。
 *  > **一张记录「当年为什么」的表，和一张说明「今天是什么」的表，不该是同一张** ——
 *  > 留着它不更正，下一个人会拿它当现状去写判据。
 *
 *  ### ⚠️ 这是纪律① 的正面例子，而我们自己破了它
 *  CLAUDE.md 第一条就是「**唯一写入口**：界面编辑、AI 会话、生命周期操作、
 *  工具自己生成的入口页，**一个都不例外**」。而「新建一份稿」恰恰是
 *  最该走它的那一种，却是三条绕过它的路。
 *
 *  ### 为什么用动态 `import()`
 *  `write.ts` 依赖 `project.ts`（它要 `Project` 和 `draftPath`），
 *  静态 import 回去会成环。动态 import 在**调用时**才解析，环就断了。
 *  ⚠️ 代价是类型要手写一次 —— 写在这里，不扩散。
 */
/** 新建一份稿落盘 —— 走唯一写入口（issue #71）。
 *
 *  `why` 决定**内容的来源**，而来源决定「有 error 级诊断」该怎么办（issue #92）：
 *  - `"blank"`：空白稿 / 模板 / 组件包装 / 新建项目首稿 —— 内容是**我们自己生成的**，
 *    带 error 就真是我们的 bug，**抛**。
 *  - `"copy"`：复制 / 套用用户现有的稿 —— 内容是**用户的**，带 error 照样要能复制。
 *    走 `allowErrors`（只跳过那一道，归一化 / 节点地址 / 快照全走），
 *    并把诊断条数回给调用方，让它能照实说一句。
 *
 *  ⚠️ #71 刚把这条路接上写入口时只有一档，于是**复制一份带 error 的稿变成做不到了**，
 *  报错还说「这多半是我们模板的问题，请报一条 issue」—— 而内容是用户自己的稿。
 *  项目里现成就有这种稿（`selftest` 钉着 `PC 端/任务.dc.html` 的 2 条 `E_HOLE_UNRESOLVED`，
 *  而 `PC 端/Pages/任务.dc.html` 正是它的副本 —— **用户真做过这个动作**）。
 *  `doc/00` §143.7 里我写过「#71 那一条没有这两个顾虑」—— **顾虑① 对 copy 恰好成立**，
 *  当时没想到。 */
async function newDraftToDisk(
  p: Project, rel: string, content: string, why: "blank" | "copy" = "blank",
): Promise<{ errorDiags: number }> {
  const { writeDraft } = await import("./write.js");
  const { parseDraft, draftKindOf } = await import("./draft.js");
  /* ⚠️ `kind` 按内容算（issue #92 顺带）—— 原来写死 `"page"`，
     于是复制一份**组件**稿时 `stats.kind` 是错的。
     同一批里 `draftKindOf()` 的注释正是为这件事写的：
     **「只是个读数」不是「可以随便写」。** */
  const kind = draftKindOf(parseDraft(content, rel));
  const r = await writeDraft(p, rel, content, kind, "新建",
    { origin: "新建", ...(why === "copy" ? { allowErrors: true } : {}) });
  if (!r.outcome.written) {
    throw new ToolError(err(X.BAD_INPUT, rel, { kind: "path", name: rel },
      `新建没能落盘：${r.outcome.refused ?? "写入口拒绝了"}`,
      { fix: why === "copy"
          ? "源稿本身可能有问题，或者并发写入撞上了 —— 把这句话附上报一条 issue。"
          : "这多半是我们模板的问题，请报一条 issue 并附上这句话。" }));
  }
  return { errorDiags: r.diags.filter((d) => d.level === "error").length };
}

export async function duplicateDraft(
  p: Project,
  path: string,
  opts: { newName?: string } = {},
): Promise<DuplicateDraftResult> {
  const srcAbs = draftPath(p, path);
  const srcDir = dirname(srcAbs);
  const srcBase = basename(path).replace(/\.dc\.html$/, "");

  /* ⚠️ **新名字要守**（issue #70，2026-10-05）。原来 `newName` 原样进 `resolve` ——
     `duplicate_draft({ newName: "../../x" })` 把副本写到**项目目录外面**，
     而返回的 `newPath` 还是用 `slice(p.dir.length + 1)` 算的，
     于是那个字符串也是错的（指向一个项目内不存在的路径）。

     这里走 `plainNameProblem()` —— **全项目唯一一份「这是名字不是路径」的判定**
     （`pathguard.ts`，我在 #23 / #57 / #63 各写过一遍之后抽出来的）。
     ⚠️ 名字里的 `.dc.html` 后缀**在校验之后再补** ——
     先补的话 `"../x"` 会变成 `"../x.dc.html"`，形状判定看到的还是一段路径，
     但报错文案里会多出一个用户没写的后缀，让人看不懂。 */
  const want = opts.newName ?? srcBase + " 副本";
  const bad = plainNameProblem(want.replace(/\.dc\.html$/i, ""));
  if (bad) {
    throw new ToolError(err(X.BAD_INPUT, path, { kind: "key", name: "newName" },
      `副本名不合法：${bad}`, { fix: "newName 是一个名字（副本会建在原稿同一个目录里），不是路径。" }));
  }
  let newBase = want;
  if (!newBase.endsWith(".dc.html")) newBase += ".dc.html";

  // 如果名字冲突，加序号
  let newAbs = resolve(srcDir, newBase);
  if (existsSync(newAbs)) {
    let i = 2;
    const baseWithoutExt = newBase.replace(/\.dc\.html$/, "");
    do {
      newBase = `${baseWithoutExt} ${i}.dc.html`;
      newAbs = resolve(srcDir, newBase);
      i++;
    } while (existsSync(newAbs) && i < 100);
  }

  /* 第二道：算出来的路径必须还在项目里。
     ⚠️ 形状那一道已经把分隔符挡掉了，这一道**不依赖我对形状想得全不全** ——
     和 #57 / #63 同一套做法（`00` §140.1 的「为什么设两道」）。 */
  if (!isInsideReal(p.dir, newAbs)) {   // #140
    throw new ToolError(err(X.BAD_INPUT, path, { kind: "key", name: "newName" },
      "副本的路径跨出了项目目录", { fix: "这是我们的 bug，不是你的输入问题 —— 请报一条 issue。" }));
  }

  // 复制内容
  const content = await readFile(srcAbs, "utf8");
  const { errorDiags } = await newDraftToDisk(p, relative(p.dir, newAbs).split(sep).join("/"), content, "copy");

  /* ⚠️ `relative()` 而不是 `slice(p.dir.length + 1)`（issue #70 第 3 点）——
     后者假设 `newAbs` 一定以 `p.dir` 开头，而那正是上面两道闸要保证的事；
     闸漏了的时候它会算出一个**看起来像项目内路径的错字符串**，
     而调用方拿它去读会得到「文件不存在」这种对不上的错误。 */
  const newRel = relative(p.dir, newAbs).split(sep).join("/");
  return {
    originalPath: path,
    newPath: newRel,
    startsAtV1: true,
    /* 照实说一句：副本带着原稿的 N 条 error。**不说的话用户以为复制出来是干净的。** */
    ...(errorDiags ? { carriedErrors: errorDiags } : {}),
  };
}

// ──────────────────────── M1-8: create_folder ───────────────────────

export interface CreateFolderResult {
  path: string;
  /** 目录下已有的稿数 */
  draftsInFolder: number;
}

/** 在项目目录下创建一个子目录。 */
export async function createFolder(
  p: Project,
  folderPath: string,
): Promise<CreateFolderResult> {
  const abs = resolve(p.dir, folderPath);
  if (!isInsideReal(p.dir, abs)) {           // issue #19 + #140（链接）
    throw new Error("目录路径跨出了项目目录");
  }

  await mkdir(abs, { recursive: true });

  // 统计目录下的稿数
  const { listDrafts } = await import("./project.js");
  const allDrafts = await listDrafts(p);
  const draftsInFolder = allDrafts.filter((a) => a.startsWith(abs + "/") || a.startsWith(abs + sep)).length;

  return {
    path: folderPath,
    draftsInFolder,
  };
}

// ──────────────────────── M1-9: update_project ───────────────────────

export interface UpdateProjectOpts {
  title?: string;
  designSystemDir?: string | null;   // null 表示清除
  designSystemAlias?: string;
  tokens?: string | null;
  icons?: string | null;
  elementsWarn?: number;
  elementsHard?: number;
}

export interface UpdateProjectResult {
  name: string;
  title: string;
  /** 更新了哪些字段 */
  updated: string[];
}

/** 更新项目配置。 */
export async function updateProject(
  p: Project,
  opts: UpdateProjectOpts,
): Promise<UpdateProjectResult> {
  const config = { ...p.config };
  const updated: string[] = [];

  if (opts.title !== undefined) {
    config.title = opts.title;
    updated.push("title");
  }
  if (opts.designSystemDir !== undefined) {
    if (opts.designSystemDir === null) {
      delete config.designSystem;
    } else {
      config.designSystem = {
        dir: opts.designSystemDir,
        alias: opts.designSystemAlias || config.designSystem?.alias || "@ds",
      };
    }
    updated.push("designSystem");
  } else if (opts.designSystemAlias !== undefined) {
    if (config.designSystem) {
      config.designSystem.alias = opts.designSystemAlias;
      updated.push("designSystem.alias");
    }
  }
  if (opts.tokens !== undefined) {
    if (opts.tokens === null) delete config.tokens;
    else config.tokens = opts.tokens;
    updated.push("tokens");
  }
  if (opts.icons !== undefined) {
    if (opts.icons === null) delete config.icons;
    else config.icons = opts.icons;
    updated.push("icons");
  }
  if (opts.elementsWarn !== undefined || opts.elementsHard !== undefined) {
    config.limits = {
      elementsWarn: opts.elementsWarn ?? p.limits.elementsWarn,
      elementsHard: opts.elementsHard ?? p.limits.elementsHard,
    };
    updated.push("limits");
  }

  // 写回 project.json
  const configPath = join(p.dir, "project.json");
  await writeAtomic(configPath, JSON.stringify(config, null, 2) + "\n");

  /* ⚠️⚠️ **写完盘还要把新值回写进内存里这个 `Project` 对象**（2026-10-23，M16-6 实测抓到）。
   *
   *  `api.ts:158` 的 `const p = ctx.project` 是**服务启动时建的一份快照**，
   *  而这个函数原来只写盘、不动它。于是：
   *  · 写入 ✅ 真的到盘上了；
   *  · 紧接着 `get_project` ❌ 读的是那份旧快照。
   *  症状是**假成功**：界面 toast 说「标题存好了」（那是真的 —— 写入确实成功了），
   *  而读回来还是旧标题。在原来那份稿的时代这个缺陷也在，只是长相不同 ——
   *  「改完标题，关掉设置再打开，又变回去了」，而**盘上其实是新的**。
   *  那比「改不了」更难查：用户会以为自己没点保存。
   *  > **一个写入口改了盘，而读入口读的是内存里的快照 ——
   *  > 两边都「成功」，而它们说的不是同一件事。**
   *
   *  ⚠️ 回写**全部派生字段**，不只 `title`：`buildProject` 从 config 算出
   *  `dsDir` / `dsAlias` / `tokensPath` / `iconsPath` / `limits`，
   *  只回写一个的话下一个人改设计系统时会再踩一遍同一个坑。
   *  ⚠️ 回写的是**同一个对象**（不是换一个新的）—— 服务表、会话、插件沙箱都持有它的引用，
   *  换一个新对象只会让「有的地方看到新值、有的地方看到旧值」。 */
  p.config = config;
  p.title = config.title || p.name;
  p.dsDir = config.designSystem?.dir ?? null;
  p.dsAlias = config.designSystem?.alias ?? "@ds";
  p.tokensPath = config.tokens ?? null;
  p.iconsPath = config.icons ?? null;
  p.limits = { ...DEFAULT_LIMITS, ...(config.limits ?? {}) };

  return {
    name: config.name || p.name,
    title: config.title || p.title,
    updated,
  };
}

// ──────────────────────── M1-10: archive/delete_project ───────────────────────

export interface ArchiveProjectResult {
  name: string;
  archivePath: string;
  /** 是否从 projectsRoot 下移走了 */
  movedFromRoot: boolean;
}

/**
 * 归档项目：把项目目录打包/移到指定位置。
 * archiveDir 是归档目录，项目会被移到这里。
 * 不给 archiveDir 时默认 projectsRoot 同级下的 `.archived` 目录。
 */
export async function archiveProject(
  p: Project,
  archiveDir?: string,
): Promise<ArchiveProjectResult> {
  const { mkdir } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");

  const dest = archiveDir ?? join(STATE_ROOT, ".archived");
  await mkdir(dest, { recursive: true });

  const destPath = join(dest, basename(p.dir));
  if (existsSync(destPath)) {
    throw new Error(`归档目录已有同名项目 "${destPath}"`);
  }

  await rename(p.dir, destPath);

  return {
    name: p.name,
    archivePath: destPath,
    movedFromRoot: p.dir.startsWith(projectsRoot()),
  };
}

/** 删除项目：移到归档目录（二次确认由调用方处理）。 */
export async function deleteProject(
  p: Project,
): Promise<ArchiveProjectResult> {
  return await archiveProject(p);
}
