#!/usr/bin/env node
/** Umbra Studio MCP server · 入口。契约见 doc/00-MCP 工具契约.md
 *
 * 第一批：检索类 + validate_draft。
 * 写入类（write_draft / patch_draft）、render_check、语义 diff 在后面几批。
 */
import { suggestedNameOf } from "./pathguard.js";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { envelope, toContent, ToolError, err, type Envelope } from "./envelope.js";
import { X } from "./codes.js";
import { createProject, loadProject, projectsRoot } from "./project.js";
import { getAiConfig, setAiConfig, mergeChannel, type AiConfig } from "./ai_config.js";
import { runChatSend } from "./chat_run.js";
import { invokeVerb, listVerbs, onVerbsChanged, watchVerbState, zodShapeOf } from "./plugin/verbs.js";
import { serveStart, serveStatus, serveStop } from "./serve.js";
import { isToolPage } from "./files.js";
import { touchProject } from "./workspace.js";
import { exportProject, importProject } from "./export.js";

import { capsFor, type CapCtx } from "./cap/index.js";
import { studioName } from "./shared/brand.js";

const VERSION = "0.1.0";

/** 把工具实现包成统一信封；ToolError 转成 errors，其它异常也不许漏成裸崩。 */
async function run<T>(fn: () => Promise<Envelope<T>>) {
  try {
    return toContent(await fn());
  } catch (e) {
    if (e instanceof ToolError) {
      return toContent(envelope(e.data, [e.diagnostic]));
    }
    const m = (e as Error)?.message ?? String(e);
    return toContent(envelope(null, [
      err(X.IO, "(server)", { kind: "key", name: "internal" }, `工具内部出错：${m}`),
    ]));
  }
}

const server = new McpServer(
  { name: "umbradesign", version: VERSION },
  {
    /* ⚠️⚠️ **这段说明 2026-10-23（M16-7c-2a / C3）整段重写过，因为它在说谎。**
       原来第一行写「本地**设计稿**工具（.dc.html 格式）」，而下面列的调用顺序
       1–8 里有四件已经不存在了（`get_syntax_guide` / `validate_draft` / `write_draft`
       是 7b 删的，`render_check` / `build_index` 是这一段删的）。
       > **一段给模型看的说明，过期之后不会报错 —— 它会让模型去调不存在的工具，
       > 而那看起来像模型在乱编。**
       现在这段是**照能力表量出来写的**（101 件，`list_capabilities` 能列全），不照记忆写。 */
    instructions: [
      `${studioName} —— 本地目录工作台：打开一个目录，按文件类型看和改里面的文件。`,
      "",
      "常用顺序：",
      "1. list_projects / list_recent_projects   有哪些项目 / 最近打开过什么",
      "2. get_project        拿到项目路径与限额",
      "3. list_files         列目录（`recursive: true` 递归列整个项目，上限 5000）",
      "4. read_file          读一个文件（大文件用 offset / limit 按行分页）",
      "5. write_file         **唯一写入口**（写前校验 / 快照 / 被别人改过就拒）",
      "6. list_file_versions / revert_file   版本与回退",
      "7. search_in_file / global_search     在一个文件里搜 / 全项目搜",
      "8. serve_start        起本地 http，人要在浏览器里看就走这条",
      "",
      "所有工具返回同一个信封：{ok, data, errors, warnings, stats}。",
      "errors 非空表示这次操作没做成（或不该做）。每条诊断都有 code、定位和 fix。",
      "⚠️ **写回去要带上读到的那个 sha256** —— 盘上被别人改过会被拒，而不是把改动盖掉。",
      "⚠️ 别的文件格式（Markdown / 代码 / CSV / 图片…）由插件提供能力：",
      "   `list_plugins` 看装了什么，`plugin_verbs` 看它们挂出来的动词，`who_handles` 问某个文件谁管。",
      "完整清单一律问 `list_capabilities`，不要照记忆猜工具名。",
    ].join("\n"),
  }
);

// ─────────────────────────── 项目 ───────────────────────────

// ─────────────────────── 工作区（M1-2）────────────────────────

// ─────────────────────── 引用图谱（M1-0）───────────────────────

// ─────────────────────── 项目创建（M1-1）───────────────────────

server.registerTool("create_project", {
  title: "新建一个设计项目",
  description: [
    "从一个空目录起步，创建一个设计项目。写入：",
    "  project.json         项目配置（名称、标题、设计系统路径、限额）",
    "  .gitignore           租户级忽略规则",
    "  <标题>.dc.html      第一份空白稿（含一个可编辑的 div）",
    "  .git/                默认初始化 git 仓库",
    "",
    "创建完立刻 get_project 能读、list_files 能列。",
    "dir 指定绝对路径；不给时默认在工具目录 projects/<name> 下。",
  ].join("\n"),
  inputSchema: {
    name: z.string().describe("项目名（也是目录名，除非另外传 dir）"),
    dir: z.string().optional().describe("项目目录绝对路径。不给时默认 projects/<name>"),
    title: z.string().optional().describe("项目显示标题，不给时等于 name"),
    designSystemDir: z.string().optional().describe("设计系统目录相对路径，如 _ds/umbra-studio-system-xxx"),
    designSystemAlias: z.string().optional().describe("设计系统别名，默认 @ds"),
    tokens: z.string().optional().describe("tokens 文件相对路径，如 umbra-tokens.json"),
    icons: z.string().optional().describe("icons 文件相对路径，如 umbra-icons.json"),
    elementsWarn: z.number().int().optional().describe("元素数 warning 阈值，默认 1200"),
    elementsHard: z.number().int().optional().describe("元素数 hard 上限，默认 1500"),
    initGit: z.boolean().optional().describe("是否初始化 .git，默认 true"),
  },
}, async ({ name, dir, title, designSystemDir, designSystemAlias, tokens, icons, elementsWarn, elementsHard, initGit }) => run(async () => {
  const limits: { elementsWarn?: number; elementsHard?: number } = {};
  if (elementsWarn) limits.elementsWarn = elementsWarn;
  if (elementsHard) limits.elementsHard = elementsHard;

  const r = await createProject(name, {
    dir, title, designSystemDir, designSystemAlias, tokens, icons,
    limits: Object.keys(limits).length ? limits : undefined,
    initGit,
  });
  // 自动记录到最近项目列表
  await touchProject(r.dir, r.name, r.title);
  return envelope(r, [], { created: r.created.length });
}));

// ─────────────────────── 稿件创建（M1-3）───────────────────────

// ─────────────────────── 目录探查（应用前端新建项目面板，UI-7）───────────────────────
server.registerTool("inspect_dir", {
  title: "探查一个目录能不能当项目",
  description: [
    "新建项目面板选完目录后调它：目录存不存在、是不是已经是项目（有 project.json）、里面有几份 .dc.html。",
    "面板据此提示「这个目录已是项目，直接打开」或「目录里已有 N 份稿，要不要直接接管」。只读，不写任何东西。",
  ].join("\n"),
  inputSchema: { dir: z.string().describe("目录绝对路径") },
}, async ({ dir }) => run(async () => {
  const { stat, readdir } = await import("node:fs/promises");
  let exists = false, isDir = false;
  try { const st = await stat(dir); exists = true; isDir = st.isDirectory(); } catch { /* 不存在 */ }
  if (!exists || !isDir) return envelope({ dir, exists, isDir, isProject: false, draftCount: 0, suggestedName: basename(dir) }, [], {});
  const isProject = existsSync(join(dir, "project.json"));
  let draftCount = 0;
  const walk = async (d: string, depth: number): Promise<void> => {
    if (depth > 6) return;
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const abs = join(d, e.name);
      if (e.isDirectory()) await walk(abs, depth + 1);
      else if (e.name.endsWith(".dc.html") && !isToolPage(e.name)) draftCount++;   // 工具自己的壳（S2…、index）不算稿
    }
  };
  await walk(dir, 0);
  const suggestedName = suggestedNameOf(dir);   // 和 HTTP 版同一份实现（issue #160）
  return envelope({ dir, exists, isDir, isProject, draftCount, suggestedName }, [], {});
}));

// ─────────────────────── 稿件改名（M1-4）───────────────────────

// ─────────────────────── 稿件复制（M1-5）───────────────────────

// ─────────────────────── 稿件移动（M1-6）───────────────────────

// ─────────────────────── 删除与回收站（M1-7）───────────────────────

// ─────────────────────── 文件夹（M1-8）─────────────────────────

// ─────────────────────── 项目设置（M1-9）───────────────────────

// ─────────────────────── 项目删除/归档（M1-10）───────────────────────

// ─────────────────────── 设计系统检索 ───────────────────────

// ─────────────────────── 全局搜索 ───────────────────────

// ─────────────────────── 设计系统编辑 ─────────────────────

/* ⚠️⚠️ **稿件模板那三件（`list_templates` / `save_as_template` / `delete_template`）
   2026-10-24 退场**（M16-8 ⑥，geek-99 定）。
   模板是 `.dc.html` 模板，而它们的**唯一消费者是 `create_draft` 的 `template` 档** ——
   那一件同一批退场（四档里三档都是在造设计稿，C3 定的是「设计稿那一整套删掉」）。
   留着的话模板就是又一个「只被写、从不被读」的东西。

   ⚠️⚠️ **用户项目里已经存在的 `.umbrastudio/templates/` 文件不动、也不迁移**
   （geek-99 明确；纪律⑥：允许我们不管它，不是要我们删它）。
   盘上那些文件从此没有读者 —— 这件事写在这里，而不是让下一个人去推断。

   ⚠️ 顺带：`chat_run.ts` 和这个文件各有一行**只 import、从不使用**的死 import
   （`createDraft` · 三件模板函数）。TypeScript 对未使用的 import 不报错，所以
   「删掉让编译错误带路」在这条路上**带不到** —— MCP 面是**按名字注册**的，
   删 `cap/` 里那一件不会让这里报错。
   > **「让漏掉变成编译错误」只在调用方和被删的东西在同一条类型链上时成立。** */

// ─────────────────────── 项目导出/导入 ─────────────────────

server.registerTool("export_project", {
  title: "导出项目",
  description: [
    "把整个项目目录打包成 .tar.gz，含所有稿、快照、changelog 与 .umbrastudio/ 下的全部数据。",
    "导出的文件可以在另一台机器上用 import_project 导入。",
    "outputPath 指定导出文件的绝对路径。",
  ].join("\n"),
  inputSchema: {
    project: z.string(),
    outputPath: z.string().describe("导出文件绝对路径，如 /tmp/my-project.tar.gz"),
  },
}, async ({ project, outputPath }) => run(async () => {
  const p = await loadProject(project);
  const r = await exportProject(p.dir, outputPath);
  return envelope(r, [], { size: r.sizeBytes });
}));

server.registerTool("import_project", {
  title: "导入项目",
  description: [
    "从 .tar.gz 导入项目到指定目录。",
    "导入后项目包含完整的版本历史与快照。",
    "targetDir 是目标目录路径（会创建）。",
  ].join("\n"),
  inputSchema: {
    tarPath: z.string().describe("导出文件绝对路径"),
    targetDir: z.string().describe("导入目标目录（会创建）"),
  },
}, async ({ tarPath, targetDir }) => run(async () => {
  const r = await importProject(tarPath, targetDir);
  return envelope(r, [], { drafts: r.draftCount });
}));

// ───────────────────────── 组件契约 ─────────────────────────

// ───────────────────────── 写稿规则 ─────────────────────────

/* ⚠️⚠️ **`GUIDES` 2026-10-23（M16-7c-2b / C3）删了 —— 它是一处死代码，而它牵着两件事。**
 *  它是 `get_syntax_guide`（「拿到模板语义与写稿规则」）读哪份文档的映射表，
 *  而那件工具 7b 就删了 —— **常量留着，没有任何人读它**。
 *
 *  ⚠️ **而它是 `doc/` 进安装包的唯一理由**：`doc/00` §63.1 那一批（M9-4）
 *  逼出过「`doc/` 没进包」这条缺陷，当时加进 `extraResources` 就是为了这件工具。
 *  现在那个读者没了，所以 `doc/`（**2.0 MB · 48 份**）跟着从打包清单里撤出 ——
 *  > **这不是一个新决定，是把一个决定的理由消失之后它自己该有的样子。**
 *  `packtest` 那两条「`doc/06` / `doc/03` 进包」的判据跟着反过来。 */


// ───────────────────────── 静态校验 ─────────────────────────

// ───────────────────────── 写入（唯一写入口） ─────────────────────────
/* ⚠️ **`check_runtime` 2026-10-23（M16-7c-2a / C3）删了。**
   它回答的是「哪个放稿的目录缺 `support.js` 与两个 React UMD —— 缺了直接打开会白屏」，
   而那三个文件连**往哪拷**都没有了（`ensureRuntimeBeside` 一起删，见 `normalize.ts`）。
   > 一件「报告某个东西缺不缺」的工具，在那个东西不再需要存在之后，报告的是一个假问题。 */


/* ⚠️⚠️ **`render_check` 与 `check_browser` 两件 MCP 工具 2026-10-23（M16-7c-2a / C3）删了。**
 *
 *  `render_check` 的描述自己写着「**这是唯一的验收证据** —— `validate_draft` 全绿不等于
 *  能渲染」，而它验收的对象是 `.dc.html` 设计稿：起一个本地静态服务 + headless Chromium
 *  把稿打开一次、断网查外部请求、数渲染后还剩几个洞。C3 之后没有那个对象了。
 *  `check_browser` 的全部用处是回答「`render_check` 会用哪个浏览器」，跟着走。
 *
 *  ⚠️ **它带走的不只是两件工具**：`rendertest`（15 条）和 `bridgetest`（7 条，点选桥几何）
 *  整套作废，`fixtures/渲染/` 那 18 份基准也一起删 —— 而**每份基准都钉着一条犯过的错**，
 *  所以删之前逐份核过它钉的那条错也随 dc 一起没了（都是 SVG 几何属性上的模板洞）。
 *
 *  ⚠️ 纪律②「**判活只认 1+1，不看截图**」是从这件工具里长出来的，
 *  而那条纪律本身**没有跟着删** —— 它讲的是「一张不对的截图和一个坏掉的页面长得一样」，
 *  对任何「拿截图当证据」的场合都成立。
 *  > **一条纪律的出处消失了，纪律本身不一定跟着消失。** */


// ───────────────────────── 变更交付（doc/07）─────────────────────────

// ───────────────────── 形态 A：入口页与静态服务（doc/01 §4.2）─────────────────────

server.registerTool("serve_start", {
  title: "起本地静态服务",
  description: [
    "把项目目录起成本地静态服务，浏览器里打开就能看。",
    "服务活在 MCP server 进程里，起一次就一直开着；不传 port 让系统分配。",
    "",
    "它还挂着一个本地 JSON API（/__ud/*），给应用界面用（`list_capabilities` 列得全）。",
  ].join("\n"),
  inputSchema: { project: z.string(), port: z.number().int().min(1024).max(65535).optional() },
}, async ({ project, port }) => run(async () => {
  const p = await loadProject(project);
  const s = await serveStart(p, port);
  /* ⚠️⚠️ **这里原来「没索引就顺手建」** —— 部署壳页面、点选桥、注入令牌。
     C3（M16-7c）之后没有索引页了，而**它顺带是「起个服务」这件事唯一会写盘的一步**。
     > 「起一个静态服务」和「往用户的项目里部署十几个文件」是两件事，
     > 而它们挤在一个工具里的理由（壳拿不到令牌就打不开）随壳一起没了。 */
  return envelope({ ...s, note: null }, []);
}));

server.registerTool("serve_stop", {
  title: "停掉本地静态服务",
  description: "停掉某个项目的静态服务。",
  inputSchema: { project: z.string() },
}, async ({ project }) => run(async () => {
  const p = await loadProject(project);
  return envelope({ project: p.name, ...serveStop(p.dir) });   // issue #20：按目录停
}));

server.registerTool("serve_status", {
  title: "看正在跑的静态服务",
  description: "列出当前进程里正在跑的静态服务：地址、端口、起来多久、被请求过几次。",
  inputSchema: {},
}, async () => run(async () => {
  const list = serveStatus();
  return envelope({ servers: list }, [], { count: list.length });
}));

// ───────────────────── 节点定位与属性级编辑（三层修改的地基） ─────────────────────

// ──────────────────────────── AI 会话（M2） ────────────────────────────

server.registerTool("set_ai_config", {
  title: "设置 AI 配置",
  description: [
    "设置某一条通道的端点、API 密钥和模型名。密钥只存本地，不进任何日志或项目文件。",
    "channel=a：OpenAI 兼容端点（DeepSeek / 智谱通用 API / 其他兼容端点）；",
    "channel=b：本地 CLI（Claude Code / cursor-agent / codex …），走它们自己的登录态；",
    "channel=c：订阅制的 OpenAI 兼容端点（火山方舟 Agent Plan），和 a 同形。三条通道各自一套，不共用。",
    "只改你点名的那一条，别的通道原样保留。",
  ].join("\n"),
  inputSchema: {
    channel: z.enum(["a", "b", "c"]).optional().describe("设哪条通道，默认 a"),
    baseUrl: z.string().optional().describe("端点：a 如 https://api.deepseek.com/v1；c 如 https://ark.cn-beijing.volces.com/api/plan/v1；b 只对 cli=claude 有意义"),
    apiKey: z.string().optional().describe("API 密钥（存本地不进日志）"),
    model: z.string().optional().describe("模型名，不硬编码"),
    defaultChannel: z.enum(["a", "b", "c"]).optional().describe("默认通道"),
  },
}, async ({ channel, baseUrl, apiKey, model, defaultChannel }) => run(async () => {
  const current = await getAiConfig();
  const ch = channel ?? "a";
  /* ⚠️ 合并交给 `mergeChannel` 一处做（issue #34）。原来这里手工拼整份 `AiConfig`，
     写在通道 C（`11` Q33）加进来**之前**，之后没人跟上 ——
     **外部模型客户端调一次 `set_ai_config` 就把通道 C 整条清空了**：
     `defaultChannel` 还是 `"c"`，但 `getChannelC()` 抛「通道 C 未配置」，默认通道直接不可用。
     顺带还抹掉同一条通道上没传的字段（B 的 `cli` 被打回 `claude`、A 的 `supportsImage`）。
     同一件事的另外两条写路径本来就是合并写 —— **只有 MCP 这一条是手工拼的**，
     正是「一件能力两处实现」必然长出来的分叉（M11-7 那一整批的主题）。 */
  const updated: AiConfig = {
    ...mergeChannel(current, ch, { baseUrl, apiKey, model }),
    defaultChannel: defaultChannel ?? current.defaultChannel,
  };
  await setAiConfig(updated);
  return envelope({ ok: true, channel: ch }, [], {});
}));

server.registerTool("chat_send", {
  title: "发送 AI 会话消息",
  description: [
    "向 AI 发送一条用户消息，自动跑 agent 循环（通道 A）。",
    "返回模型的回复和所有工具调用结果。",
    "不指定 sessionId 时自动新建；指定了则追加到已有会话。",
    "",
    "选中节点参数（编辑方式 ②）：当用户在预览中选中了一个元素并发送消息时，",
    "带上该元素的地址和所在稿名，模型能针对这个元素做精确修改。",
  ].join("\n"),
  inputSchema: {
    message: z.string().describe("用户消息"),
    sessionId: z.string().optional().describe("会话 ID，不填自动新建"),
    project: z.string().describe("项目名"),
    channel: z.enum(["a", "b"]).optional().describe("通道，默认 a"),
    selectedNodeFile: z.string().optional().describe("选中节点所在稿的相对路径（data-sc-name）"),
    selectedNodeAddress: z.string().optional().describe("选中节点的 data-ud-node 值"),
  },
}, async ({ message, sessionId, project, channel, selectedNodeFile, selectedNodeAddress }) => run(async () => {
  const p = await loadProject(project);
  return runChatSend(p, { message, sessionId, channel, selectedNodeFile, selectedNodeAddress });
}));

// ──────────────────────── M8-2：泛型文件工具 ────────────────────────
/* 设计稿之外的文件（`.md`、图片、json、zip…）也要能列、能读、能改、能挪。
   ⚠️ **第二句（2026-10-24 更正）**：原来写着「`.dc.html` 在 write_file / move_file 里
   被显式拒绝并指回 write_draft / move_draft」—— 两头都不成立了。
   两道拒的条件都是 `kindOf(...) === "dc"`，而 C3（M16-7）删掉了 `FileKind` 表里的 `dc`
   那一条，于是**两道一起变成恒假**；而 `move_draft` 本人 M16-8 ① 已经并进 `move_file`。
   现在：`.dc.html` 的改名 / 移动走 `move_file`（它会把两种引用都改对），
   内容还是走 `write_draft`（那条路的归一化、`@ds` 展开、节点地址、语义快照，这条路不做）。
   > **一句描述两道闸的注释，在闸被别处撤掉时不会报错，只会开始骗人。** */

// ──────────────────────────── 启动 ────────────────────────────

/* ═══════════════════ 能力注册表 → MCP 面（M11-1，Q36）═══════════════════
   以前每件能力在这里手写一个 `registerTool`，在 `api.ts` 里再手写一条路由 ——
   **没有任何机制保证两边一致**，M8 那批就补过五条 MCP 侧早有、本地侧漏掉的能力。
   现在一件能力在 `cap/` 里声明一次，两个门面各自遍历生成。

   上面那些还没搬过来的 `registerTool` 照旧 —— 一次全搬 66 个风险太大，
   分批搬，`captest` 钉着「声明了就必须两面都有」。 */
for (const cap of capsFor("mcp")) {
  /* `scope: "project"` 的能力入参里**没有** `project`（见 `Cap.input` 的告诫），
     这里统一注入 —— MCP 的调用方是外部客户端，它没有「当前打开了哪个项目」这回事。 */
  const inputSchema = cap.scope === "project"
    ? { project: z.string().describe("项目名，或项目目录名"), ...cap.input }
    : cap.input;
  server.registerTool(cap.name, { title: cap.title, description: cap.summary, inputSchema },
    async (args: Record<string, unknown>) => run(async () => {
      const { project, ...rest } = args as { project?: string };
      const ctx: CapCtx = { project: cap.scope === "project" ? await loadProject(project!) : null, via: "mcp" };
      return cap.run(rest as never, ctx);
    }));
}

/* ═══════════════════ 插件动词 → MCP 面（M13-2，`doc/22` §3.3）═══════════════════
   装了什么插件、授权到哪，这张表就长什么样。没授权的只挂插件标了 `free` 的那几件 —— **不列、不标灰**（Q56）。
   装 / 卸 / 切版本 / 许可证变了 → 重挂一遍并发 `tools/list_changed`，客户端不用重连。 */
/* ⚠️ 「挂过没有」按**名字 + 内容指纹**判，不只按名字（issue #146）。
   对外名只由「插件短名 + 能力名」决定、不含版本 —— 插件升级 / 切版本后同名动词的入参、描述都可能变了，
   只按名字判的话 MCP 上挂着的还是旧 inputSchema：新参数被 zod 剥掉、删掉的参数仍是必填、描述是旧的。 */
const verbTools = new Map<string, { reg: RegisteredTool; sig: string }>();
let verbSync: Promise<void> = Promise.resolve();
/** 串行跑：两次同步并发的话会对同一个名字 `registerTool` 两次（SDK 直接抛）。 */
function syncVerbTools(): Promise<void> {
  verbSync = verbSync.then(syncVerbToolsOnce, syncVerbToolsOnce);
  return verbSync;
}
async function syncVerbToolsOnce(): Promise<void> {
  const verbs = await listVerbs().catch(() => []);
  const want = new Set(verbs.map((v) => v.tool));
  for (const [name, t] of verbTools) if (!want.has(name)) { t.reg.remove(); verbTools.delete(name); }
  for (const v of verbs) {
    const sig = JSON.stringify([v.title, v.summary, v.input, v.pluginName, v.cap]);
    const have = verbTools.get(v.tool);
    if (have && have.sig === sig) continue;
    if (have) { have.reg.remove(); verbTools.delete(v.tool); }
    verbTools.set(v.tool, { sig, reg: server.registerTool(v.tool,
      { title: `${v.pluginName} · ${v.title}`, description: v.summary,
        inputSchema: { project: z.string().describe("项目名，或项目目录名"), ...zodShapeOf(v.input) } },
      async (args: Record<string, unknown>) => run(async () => {
        const { project, ...rest } = args as { project?: string };
        const r = await invokeVerb(v.tool, rest, await loadProject(project!));
        if (r.ok) return envelope(r.data);
        return envelope(null, [err(X.BAD_INPUT, "(plugin)", { kind: "key", name: v.plugin }, r.message,
          r.market_url ? { fix: `去插件市场购买或续费：${r.market_url}` } : undefined)]);
      })) });
  }
}
await syncVerbTools();
onVerbsChanged(() => { void syncVerbTools(); });
/* ⚠️ 这个 stdio 进程和 Studio 窗口的核心不是同一个进程（秘书 / 编码 CLI 各自 spawn 一个），
   在窗口里买 / 装 / 卸插件只改了磁盘、事件传不过来（issue #144）。定时比盘上指纹，变了就重扫 → 上面那条重挂并发 list_changed。 */
watchVerbState();

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[umbrastudio] v${VERSION} 已启动 · 项目根 ${projectsRoot()}\n`);
