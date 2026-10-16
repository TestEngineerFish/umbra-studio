# 写一个 Umbra 插件 · 规范

> 给人和给 AI 的。开工前读完，约 10 分钟。
> 机制为什么长这样，在 Umbra Studio 的 `doc/20`（需求）、`doc/00` §85–88 / §96 / §150（实测）；这份只说**怎么写才跑得起来**。
> 模板：`plugins/com.umbra.markdown/` —— 两面都有，先读它。

## 〇、一句话模型

一个插件 = `manifest.json` + 最多两面：

| 面 | 是什么 | 跑在哪 | 怎么和宿主说话 |
| --- | --- | --- | --- |
| **A 面 `ui`** | 预览页：人看、人改 | `<iframe sandbox="allow-scripts">`（不透明源）+ 响应头 CSP `default-src 'none'` | `postMessage`，包装成 `umbra.*`（`sdk/umbra.js`） |
| **B 面 `tools`** | 给大模型调的能力 | 独立进程里的 **QuickJS-WASM** 上下文 | 只有一个注入对象 `host`：`host.call` / `host.defineCap` |

两面都**没有任何环境权限**：没有文件系统、没有网络、没有子进程。要读写文件只能回调宿主，宿主按清单核权限（在宿主进程里核，不在沙箱里核）。
**写盘一律走宿主的 `write_file`**：快照、变更清单、一键回退都挂在那条路上，绕过去的话「AI 改错了能退回来」就没了。

## 一、硬约束（AI 不知道这些会写出跑不了的插件）

1. **B 面在 QuickJS 里跑**：没有 `WebAssembly`、`fetch`、`fs`、`require`、`process`、`Buffer`、`setTimeout`、`console` 以外的宿主对象；`globalThis` 上只有 `__host`（经 `register(host)` 递给你）。无 JIT，纯计算比 V8 **慢一个数量级**；一次调用 10 秒内要返回（到点被解释器打断），内存上限 128 MB。重计算放 A 面，或拆成多次调用。
2. **不许起子进程**：manifest 没有 `exec` 槽位，写了当场拒装。要 ffmpeg 这类外部程序，由宿主提供受限能力，插件碰不到命令行。
3. **读写文件只能 `host.call("read_file" | "write_file" | …)`**（B 面）/ `umbra.call(…)`（A 面），能力在 §三 的白名单里；**能力名必须以插件 id 为前缀**（`com.umbra.markdown.outline`）。
4. **A 面是 `sandbox="allow-scripts"` 的 iframe + CSP `default-src 'none'`**：画不到自己矩形外；菜单 / toast / 编辑栏 / 状态行 / `⋯` 由宿主代画（`umbra.menu` / `umbra.toast` / `umbra.setChrome`）；**不能外联**（`fetch` / `<img src=http…>` / WebSocket 全被 CSP 拦）；`localStorage` 不可用（不透明源）。
5. **`kinds[].priority` 封顶 95**；`.dc.html`（`dc`）谁都认领不了；认领 Studio 内置类型（`md` / `json` / `code` / `html` / `image`）时扩展名以 Studio 为准。
6. **包内二进制走 base64（+33%），单包上限 50 MB**（下载侧硬限）。vendor 的第三方库要算进去；超过 10 MB 要在 `RESEARCH.md` 里说明。
7. **宿主 API 以 `hostApi: "^1"` 对版本**；新插件一律写 `"^1"`。对不上就不装。
8. B 面**只能 `import` 自己目录下的文件**（相对路径），没有 npm、没有 `node:*`。第三方库要 vendor 成单文件 ESM 放进插件目录。
9. **A 面的 `<script type="module">` 可以 `import("/__shared/…")`** 取宿主共享的大依赖（现在有 CodeMirror 6），但这让插件**只能在 Studio 宿主里跑**；能不依赖就不依赖。
10. 插件目录里**不提交 `umbra.js` / `theme.css`**：打包时从 `sdk/` 拷入；自己的样式写 `plugin.css`。

## 二、`manifest.json`

schema：`sdk/manifest.schema.json`（`validate.mjs` 用它）。每条规则的来由：

| 字段 | 规则 | 来由（Studio 代码） |
| --- | --- | --- |
| `id` | `^[a-z0-9]+(\.[a-z0-9-]+){1,4}$`，反写域名式小写 | `paths.ts` `PLUGIN_ID_RE`：id 兼做能力名前缀和**安装目录名**，字符集卡死防路径逃逸 |
| `name` | 非空 | 装的时候给用户看 |
| `version` | `^[0-9]+(\.[0-9]+){0,2}(-[0-9a-z.]+)?$` | `paths.ts` `PLUGIN_VERSION_RE`：也兼做目录名（issue #23：`"../../.."` 曾能删掉状态目录） |
| `hostApi` | 以 `^1` 或 `1` 开头 | `manifest.ts` `HOST_API_MAJOR = 1` |
| `surfaces` | `["ui"]` / `["tools"]` / 两个都有；至少一个 | 没声明的面不加载；只有 tools 的插件根本不起 iframe |
| `ui` | `surfaces` 含 `ui` 时必填；插件目录内相对路径，不许 `/` 开头、`..`、`\` | 入口逃出目录 = 让宿主加载别的文件 |
| `tools` | `surfaces` 含 `tools` 时必填；同上 | 同上 |
| `kinds[]` | `id` `^[a-z0-9_-]+$`；`label` / `icon` 非空；`ext` 小写带点（`.mp4`），只给扩展名不给正则；`textual` 布尔；`priority` 整数 ≤ 95，不给 = 50 | 正则能写出灾难性回溯；priority 100 是 `.dc.html` 的，95 封顶保证抢不走 |
| `kinds[].ext` 为空 | 只有认领内置类型时允许 | 认领时扩展名由 `shared/kinds.ts` 说了算，写了也不生效 |
| `panels[]` | `id` `^[a-z0-9_-]+$`（宿主会加 `<插件 id>.` 前缀）；`label` 非空；`entry` 相对路径 | 每个面板是插件自己的一张网页，各占一个 iframe |
| `permissions` | **必填**（不声明 = 拒装，不是全给）。`files`: `read` / `write` 的子集；`scope`: 只有 `"project"`；`net`: 域名数组，**空 = 不许**，第一期非空也按不许处理；**`exec` 不许出现** | `host.ts` 四道关按它核 |

一份两面都有的清单（markdown 插件的）：

```json
{
  "id": "com.umbra.markdown",
  "name": "Markdown 编辑",
  "version": "1.0.0",
  "hostApi": "^1",
  "surfaces": ["ui", "tools"],
  "kinds": [{ "id": "md", "label": "Markdown", "icon": "≡", "ext": [".md", ".markdown"], "textual": true, "priority": 90 }],
  "panels": [{ "id": "outline", "label": "大纲", "entry": "outline.html" }],
  "permissions": { "files": ["read", "write"], "scope": "project", "net": [] },
  "ui": "index.html",
  "tools": "tools.mjs"
}
```

清单里**别写浮点数**（`50.0`）：跨语言 canonical 会分叉（PACKAGE-FORMAT §四），`validate.mjs` 直接拒。

## 三、宿主 API v1：插件能调哪些能力

来源：Studio `server/src/plugin/host.ts` 的 `ALLOWED`（**白名单，不是黑名单** —— 没列的一律调不到，包括将来新加的）。
两面调法一样：A 面 `await umbra.call(name, input)`，B 面 `await host.call(name, input)`。返回的都是**信封**：

```js
{ ok: boolean, data: any, errors: [{ level, code, where, message, fix? }], warnings: [...], stats: {...} }
```

权限不够、文件被人改过、路径不在项目里，都走 `ok: false`，**别只看 `data`**。

| 能力 | 要声明 `files` 里的 | 做什么 |
| --- | --- | --- |
| `list_files` | `read` | 列项目里的文件 |
| `read_file` | `read` | 读一个文件：`{ path }` → `data.content` / `data.sha256` / 分页用 `offset` / `limit` |
| `read_file_version` | `read` | 读某一版的原文（「点一行看那一版」） |
| `list_file_versions` | `read` | 这个文件有哪些版本（快照） |
| `compare_file_versions` | `read` | 两版差多少（插件要在编辑区标差异行时省一趟自己 diff） |
| `list_file_refs` | `read` | 谁引用了它 |
| `count_file_types` | `read` | 项目里各类型文件数 |
| `get_staged_draft` | `read` | 读草稿暂存 |
| `stage_draft` | `write` | 存草稿暂存（往盘上写东西，所以是 write） |
| `clear_staged_draft` | `write` | 清草稿暂存 |
| `write_file` | `write` | **唯一的写入口**：`{ path, content, expectSha256?, note?, encoding?: "utf8" \| "base64" }`。带 `expectSha256` 时被人改过就拒（并发闸）；`note` 进变更清单 |
| `move_file` | `write` | 改名 / 移动 |
| `trash_file` | `write` | 进回收站 |
| `revert_file` | `write` | 退回上一版 |

四道关，顺序不能换：① 在不在白名单 → ② 清单里声明过对应的 `read` / `write` 没有 → ③ `scope` 是 `project` → ④ 能力真的存在。
插件改的每一处在变更清单里记成「插件」改的（不是 AI、不是人手），用户能一键回退。

⚠️ `write_file` 的 `content` 按 utf8 走；二进制要 `encoding: "base64"`，否则是**静默损坏**（文件还在、还能打开、只是花了）。

## 四、A 面：`umbra.js` 的用法

`index.html` 里**先**经典脚本 `umbra.js`、**再**模块脚本 `app.mjs`（模块自带 defer，反过来写 `umbra` 还没就位）：

```html
<link rel="stylesheet" href="./theme.css">
…
<script src="./umbra.js"></script>
<script type="module" src="./app.mjs"></script>
```

### 4.1 生命周期

```js
umbra.onContext(async (ctx) => {
  // ctx = { t: "ctx", path, kind, version, theme }
  //   path    当前文件（项目内相对路径）
  //   kind    类型 id
  //   version 要看哪一版；null = 当前那份（M10-2b：状态在工作台，画面在插件）
  //   theme   "dark" | "light" | null → document.documentElement.dataset.theme = ctx.theme
  const r = await umbra.call("read_file", { path: ctx.path });
  if (!r.ok) { umbra.toast("读不到", r.errors[0]?.message, "error"); return; }
  render(r.data.content);
});
umbra.onChanged((path) => { /* 文件在盘上变了（AI 改的、别的编辑器改的）：重读。插件自己发现不了 */ });
```

`umbra.js` 加载完会自己发 `ready`，宿主收到才推第一帧 ctx（`postMessage` 不排队，所以要握手）。
注册 `onContext` 时若已收到过一帧会立刻回调一次，不会错过首帧。

### 4.2 调能力、菜单、提示

```js
const out = await umbra.call("write_file", { path, content, expectSha256: sha, note: "改了标题" });
//   → 信封。宿主 20 秒不应答会回 { ok:false, errors:[{ code:"E_BRIDGE_TIMEOUT" }] }，不会 reject
const i = await umbra.menu(x, y, [{ label: "改名" }, { label: "—" }, { label: "删除", danger: true }]);
//   → 下标；点空关掉回 null。{ label:"—" } 是分隔线；项可带 hint / disabled
umbra.toast("存好了");                       // (title, body?, level?: "ok" | "error")
```

### 4.3 chrome：编辑栏 / 状态 / `⋯` 由宿主画

```js
umbra.setChrome({
  toolbar: [{ label: "视图", items: [{ label: "源码", active: true, title: "…" }, { label: "渲染" }] }],
  buttons: [{ label: "选中这段给 AI", primary: false, warn: false, pressed: false, disabled: false }],
  status: "s3 · 未落盘",
  menu: [{ label: "版本历史" }, { label: "删除", danger: true }],
}, (kind, a, b) => {
  // kind: "seg" | "button" | "menu"；a = 下标；seg 的 b = 档位下标
});
```

**全量覆盖不是增量**：这次没给 `buttons` 就是没有按钮。换文件 / 卸载时宿主自己收掉。

### 4.4 剩下几件

| 调用 | 做什么 |
| --- | --- |
| `umbra.setDirty(on)` | 有没有没落盘的改动。关页签要拦、退出要拦 —— 归宿主管 |
| `umbra.pick(label, detail)` | 把一段选区**挂成药丸**（不发送）并聚焦输入框。⌘L 的那一刻用户还没想好要问什么 |
| `umbra.ask(text)` | 把一段文字带进会话并**直接发给 AI**。多数时候你要的是 `pick` |
| `umbra.onSendSelection(cb)` | 用户按了 ⌘L：有选区就 `pick`，没有就什么都不做 |
| `umbra.onKey(cb)` | 宿主转发的快捷键 `{ key, meta, ctrl, shift, alt }`（只转 ⌘S/⌘Z/⌘Y/⌘F）。**焦点不在插件里时才会收到**；焦点在自己身上时走本地 keydown，两边都要接 |
| `umbra.viewVersion(v \| null)` | 请求宿主换一版看 / 回到当前。Esc 多半在 iframe 里按，所以这条非它不可 |
| `umbra.share(key, value)` / `umbra.onShare(key, cb)` | 同一个插件的正文 ⇄ 面板互通。宿主只转发、不看内容、只转给同一插件的 frame |

### 4.5 A 面能依赖什么

- 自己目录下的文件（`./x.mjs`、`./lib/…`）—— 模块脚本是 CORS 模式取的，宿主已配好响应头。
- `/__shared/…`：宿主共享库（CodeMirror 6 在 `/__shared/codemirror.js`，916 KB）。**只放公共依赖，不放数据**。用它的插件只能在 Studio 里跑。
- `/__preview/<路径>`：项目文件的预览地址（网页预览插件用它装 `<iframe>`）。
- 其余一概不能：没有 `fetch` 外网、没有 `localStorage`、没有 `top` / 父页面 DOM。

### 4.6 样式

`theme.css`（打包生成）= `sdk/theme.css`（token + `[hidden]` + 底样式）+ 你的 `plugin.css`。
用 token（`--bg` / `--text` / `--text2` / `--muted` / `--border` / `--panel` / `--panel2` / `--accent` / `--accent-soft` / `--warn` / `--warn-soft` / `--warn-border` / `--gutter-bg` / `--sel` / `--active`），
深浅两套跟着 `:root[data-theme="dark"]` 走，**别自己判断 `prefers-color-scheme`**。

## 五、B 面：`register(host)` 与 `host.defineCap`

入口是标准 ESM，`export default` 一个 `register(host)`：

```js
export default function register(host) {
  // host.version === 1
  host.defineCap({
    name: "com.umbra.markdown.outline",          // 必须以插件 id 为前缀
    title: "列出一份 Markdown 的章节",             // 给人看
    summary: "返回每个标题的层级、文字、起止行号。改某一节之前先用它定位。",   // 给模型看：什么时候该用它
    input: { path: "string" },                   // 「名 → 类型名」：string / number / boolean / object / array；尾巴 ? = 可选
    free: false,                                 // true = 没授权（过期 / 没买）也能用的动词；不标就是要授权
    async run({ path }) {
      const r = await host.call("read_file", { path });
      if (!r.ok) throw new Error(r.errors?.[0]?.message ?? "读不到");
      return { path, sections: parse(r.data.content) };   // 返回值要能过 JSON（函数 / Proxy 过不去）
    },
  });
}
```

规则：

- **一个 import 都不写**（除了自己目录下的文件）。全部能力从 `host` 这一个对象拿。
- `run` 可以是 `async`；入参、返回值、`host.call` 的进出全部**经 JSON 过值**：两边的对象图不连在一起（同 VM 隔离被反复逃逸就是因为连在一起）。
- 一次 `run` 10 秒内返回；不等 `host.call` 就返回、把活挂在 `.then()` 上也一样受限。
- 抛出的 `Error.message` 会原样带给模型；别吞错误。
- 对外名字：`<插件短名>__<动词>`（`markdown__replace_section`）；短名撞了退回整个 id。动词只用小写字母数字下划线，别的字符会被换成 `_`。
- **按需上工具表**：你的能力只在当前上下文里有你认领的那种文件时才进模型的工具表（省 token）。
- 改一节只动一节：`read_file` 拿 `sha256` → 算新内容 → `write_file` 带 `expectSha256`。整篇读进上下文再整篇写回去正是 B 面要消灭的用法。

## 六、`validate.mjs` 查什么（规则编号对应报错前缀）

| # | 查什么 | 为什么是 error |
| --- | --- | --- |
| V1 | `manifest.json` 合 schema；没有浮点字面量 | Studio 装的时候同一套规则会拒；浮点让签名分叉 |
| V2 | 目录名 == `manifest.id` | Studio 按目录名找插件、按 id 注册能力，不一致会卸不干净 |
| V3 | 文件名只用可见 ASCII、无空格、路径段不是纯数字、不含 `\` | `files` 键排序跨语言一致（PACKAGE-FORMAT §四） |
| V4 | 目录里有过期的 `umbra.js` 副本 → warning | pack 会覆盖，但有人可能在看它 |
| V5 | `ui` / `panels[].entry` 存在；HTML 里 `src` / `href` 指向的本地文件存在（`umbra.js` / `theme.css` 由 SDK 提供）；有 `ui` 没 `kinds` → warning | 入口不在 = 白屏；有 ui 没 kinds 宿主不会给它任何文件 |
| V6 | B 面：入口存在；沿 import 图只 import 自己目录下的文件；没有 `require`；用到 `fetch` / `process` / `Buffer` / `WebAssembly` / `setTimeout` 等 → warning | QuickJS 里这些是 undefined；loader 只认插件目录 |
| V7 | `defineCap` 的 `name` 以 `<id>.` 开头 | 宿主按前缀归属能力 |
| V8 | 源码里 `*.call("<能力>")` 的能力在白名单里，且清单声明了对应的 `read` / `write` | 运行时会被宿主第 ①/② 关拒，而症状是「点了没反应」 |
| V9 | 认领 `dc` → error；认领其他内置类型 → info | `dc` 是 `claimable: false` |
| V10 | 体积估算（base64 后，含 vendor 进来的两份）> 50 MB → error；> 10 MB → warning | 下载侧硬限 |

静态扫描有边界：能力名、`host.call` 的能力只认**字符串字面量**；用变量拼的查不到，也不会误报。

## 七、调研门（新格式开工前，写进 `plugins/<id>/RESEARCH.md`）

1. 库是不是纯 JS、不依赖 Node 内置模块 / WASM / Worker（A 面要确认 CSP 下能跑，B 面要确认 QuickJS 能跑）
2. 许可证：MIT / Apache-2 / BSD 可以；GPL / AGPL **不要**（插件要卖）
3. vendor 后体积（base64 后 ×1.33）< 10 MB；超了要说明
4. 维护状态：最近一年有发版
5. 和现有三个插件的做法对齐：先读 `plugins/com.umbra.markdown/`

## 八、最低交付

manifest + A 面（看 + 改 + 落盘走 `write_file` + `setDirty`）+ B 面至少两件能力（一件「只读结构」、一件「局部改写」，仿 markdown 的 `outline` / `replace_section`）
+ `RESEARCH.md` + `node scripts/validate.mjs <id>` 零 error + `node scripts/pack.mjs <id>` 能出包 + 一份最小样例文件。
