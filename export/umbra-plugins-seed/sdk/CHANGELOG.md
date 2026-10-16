# SDK 变更记录

`sdk/umbra.js` 的 `umbra.sdk` 字段对应这里的版本号。宿主 API 大版本（`umbra.version` / manifest `hostApi`）另算：
它只在宿主改了 `host.*` 的形状且不向后兼容时才动。

## 1.1.0 — 2026-10-16 · 从 Studio 收口成一份（建仓）

### `umbra.js`：四份拷贝的差异与裁决

收口前 Studio 仓库里有四份桥，**没有任何机制让它们同步**（Studio `plugintest` 只钉了「都带超时」这一条不变量）。
逐对 diff 的结果是一条**严格的线性演进**，不是分叉 —— 每一份都是前一份的超集，没有两份在同一处做了不同的事：

| 份 | 行数 | 有什么 | 缺什么 |
| --- | --- | --- | --- |
| `runtime/umbra-plugin.js`（宿主侧参考实现） | 98 | 基础：`call` / `menu` / `toast` / `onContext` / `setChrome` / `share` / `onShare` / `setDirty` / `ask` / `onChanged` | **没有超时**（issue #97 之前的形态）；`menu` 的注释写着「点空关掉就一直不返回」 |
| `fixtures/插件/com.umbra.demo/umbra.js` | 139 | 上一份 + **超时**（`CALL_TIMEOUT` 20s 回失败信封、`MENU_TIMEOUT` 300s 回 `null`，#97） | `onKey` / `onSendSelection` / `pick` / `viewVersion` |
| `plugins/com.umbra.markdown` = `plugins/com.umbra.html`（md5 相同） | 156 | 上一份 + `onKey`（宿主转发 ⌘S/⌘Z/⌘Y/⌘F）+ `onSendSelection`（⌘L）+ `pick`（挂药丸不发送） | `viewVersion` |
| `plugins/com.umbra.code` | 160 | 上一份 + `viewVersion`（M10-2b，Esc 回到当前版） | — |

裁决：**取 `com.umbra.code` 那一份为基底**（它是并集），理由是宿主 `app/src/kinds/plugin/Surface.tsx` 实际处理的消息类型
正好是它发的全部（`view-version` / `key` / `send-selection` / `pick` 四条都在宿主那边有接收方）—— 不是「最新的就对」，是「宿主认的就对」。

| 判定 | 哪一处 | 结论 |
| --- | --- | --- |
| 演进 | 超时（#97）· `onKey` · `onSendSelection` · `pick` · `viewVersion` | 全部保留 |
| **写进契约的缺陷** | `runtime/umbra-plugin.js` 里 `menu` 的注释「点空关掉就一直不返回」 | 是 #97 修掉的那个缺陷的旧说法，**不是另一种设计**。SDK 用修后的契约：回 `null` |
| 过期的参考实现 | `runtime/umbra-plugin.js` 整份比最老的插件还旧两代 | 建议 Studio 侧按 `doc/23` §四.4 改成指向本文件（S4 会话做；本轮不改 Studio） |
| 手误 | `code` 那份 `u.pick` 一行多缩进了两格 | 修掉 |
| 措辞 | 超时信封里的 `fix` 说「这是我们的 bug」—— 「我们」在插件仓库里指代不清 | 改成「宿主的 bug」。**行为没变** |

新增两样，都是**只加不改**：

- `umbra.sdk`：这份文件自己的版本字符串（`"1.1.0"`），宿主不看，排查时用。
- 头注写明**唯一出处**与 vendor 时机。

⚠️ 没有做的：没有给 `setChrome` / `share` / `toast` 加超时（它们是单向 post，没有应答可等）；没有改任何消息的字段名（宿主那边一个字都没动，插件和老宿主照样能对上）。

### `theme.css`：三份的差异与裁决

三份**几乎不是同一个东西**：

| 份 | 字节 | 内容 |
| --- | --- | --- |
| `com.umbra.markdown` | 4 480 | token（`--text` / `--panel` / `--border` 命名）+ 未落盘横条 + frontmatter 折叠 + 源码档 + `.md-body` 渲染样式 |
| `com.umbra.code` | 12 637 | token（`--fg` / `--line` 命名，另有 `--gutter-bg` / `--sel` / `--active` / 警示四档）+ CodeMirror 外观 + 三条横条 + JSON 树档 + CSV 表档 |
| `com.umbra.html` | 1 839 | token（`--fg` / `--line` 命名）+ 点选条 |

真正重合的只有 **token 块和三四条底样式**，其余是各自的组件样式。所以 SDK 这份 = **token + 底样式**，
各插件的组件样式留在各自目录的 `plugin.css` 里，打包时拼成 `theme.css`（README §三）。

token 本身的三处不一致，逐条裁决：

| token | md | code / html | 取 | 为什么 |
| --- | --- | --- | --- | --- |
| 命名 | `--text` / `--border` / `--panel2` | `--fg` / `--line` / `--panel-2` | **两套名字都留**，`--fg` 等做成别名 `var(--text)` | 三个插件的源码一字不改；新插件用 `--text` 一族 |
| `--accent` | `#4a5bd4` / 暗 `#8b97f0` | `#3a6df0` / 暗 `#6f9bff` | code / html 的 | 2 : 1，而且 code 的 `.btn.primary` / `.jbool` / 选中行都把 `#3a6df0` 写死了 —— md 那个值在任何地方都没有第二处引用 |
| 警示四档 `--warn*` | `#8a5a00` / `#fff6e0` / `#f0dcae`；暗 `#e0b869` / `#2e2716` / `#4a3d1c` | `#8c5a00` / `#fcf1da` / `#e6cd9a`；暗 `#e6b555` / `#332714` / `#5a451d` | code 的 | code 那份的注释写明「取值对齐 `app/src/tokens.css`」，核过宿主 `tokens.css`：**逐字相同**。md 的是更早的一版 |
| 暗色 `--border` / `--text` / `--muted` | `#2e323b` / `#e6e8ee` / `#868da0` | `#2a2e37` / `#dfe3ea` / `#8b91a1` | code / html 的 | 2 : 1，且 code / html 是后写的两个 |
| 浅色 `--bg` / `--text` / `--border` / `--muted` | 相同 | 相同 | — | 没有分叉 |

**可见的后果**（照实写）：md 插件的强调色、警示横条底色、暗色边框会**变到和另外两个插件一致**，差别在几个色阶内。这是收口的本意。

底样式里有一条值得单独记：`[hidden] { display: none !important }`。md 和 code 各写了一遍（各自踩过一次才加的，注释里有读数），
**html 那份没有** —— 而它的 `.bar { display: flex }` 配 `<div id="bar" hidden>`，按 CSS 优先级那条点选条在没选中时也是显示的
（0-1-0 的类选择器压过 UA 样式表 0-0-1 的 `[hidden]`）。这是从样式推出来的，**没有在浏览器里量过**；收进 SDK 之后三个插件都带这一条。

### `manifest.schema.json`：哪些规则是从代码里推出来的

全部来自 Studio `server/src/plugin/manifest.ts` 的 `checkManifest` 和 `plugin/paths.ts` 的两条正则，
每条在 `PLUGIN-SPEC.md` §二 的表里对得上一行。比 Studio **严**的两处（有意的）：

- `kinds[].priority` 要 `integer` 且 `≤ 95`。Studio 运行期是「`number` 且有限，超过 95 **夹到** 95」—— 不拒。schema 拒是因为 ① 浮点会让跨语言 canonical 分叉 ② 写 96 的人多半以为能生效，静默夹掉比报错更糟。
- `panels[].entry` 也禁反斜杠。Studio 只对 `ui` / `tools` 禁 `\`、对 `entry` 只禁 `/` 开头和 `..`。统一成同一条 `relpath`。

schema 表达不了、放在 `validate.mjs` 里补的：定义新类型时 `ext` 至少一个（认领内置类型可空）；`dc` 不可认领。

### 顺带发现、记下不改

- Studio `plugintest` 第 546 行那组判据（「四份 umbra.js 都带超时」）在 S4 会话把 Studio 的插件源码删掉后要跟着改 —— 那时四份只剩 `runtime/` 和 `fixtures/` 两份，而前者本来就没有超时。
- `com.umbra.code/app.mjs` 第 1290 行 `await import("/__shared/codemirror.js")`：A 面从宿主共享库取 CodeMirror。`validate.mjs` 对 A 面放行 `/__shared/` 前缀，但这条依赖意味着 code 插件**只能在 Studio 宿主里跑** —— 换一个不托管 `/__shared/` 的宿主就少一个编辑器。记在 PLUGIN-SPEC §四.5。
