# 22 · 对外 MCP 与插件能力门需求

> 2026-10-11 用户提：「让 UmbraStudio 对外提供 MCP，给 Umbra 或其他 Agent 调用，主要是读、写文档、查询记录；
> 要不要按格式分方法；插件可买可到期，装了剪辑视频的插件对外就多一件剪辑能力，否则只有播放。」
> 本稿是**需求出处**。排期在 `12` M13，待拍板在 `11` Q54–Q58。**拍板前不要按它改代码。**

## 〇、判据

| | 说明 |
| --- | --- |
| **一份能力表，三个门面** | 对外 MCP 暴露的每一件能力都来自 `cap/` 注册表或插件清单，**不手写第二份工具表**（M11-7 搬完 72 件就是为了这个） |
| **列出来的就能用，用不了的不列** | 模型看到的工具列表 = 此刻真能调的。没授权的插件能力**不出现在列表里**，而不是列出来再回「没授权」—— 模型会反复撞 |
| **列表是快照，调用再验一次** | 许可证可能在列出之后过期（`20` §4.4 限时免费到期那天）。调用时过不了授权门 → 结构化错误 + 出路（去市场 / 续费） |
| **来源记进每一笔写** | 经 MCP 改的文件，变更记录的 `via` 是 `mcp`（已有 `originOf`），界面里看得出是谁改的 |
| **沙箱与写入口不变** | 对外 MCP 不开新的写路径：设计稿只能 `write_draft`，其他文件只能 `write_file`；插件 B 面照旧关在 QuickJS 里 |

## 一、为什么要做

`01` §4.8 把 UmbraStudio 定成「Umbra 秘书的文件面」，M10-1 一直悬着（要 UmbraPC 配合）。
今天的 MCP 是给 Claude Code / Codex 这类编码代理用的：能力齐，但三件事没想：
① **谁在调**（秘书 vs 外部 Agent 的权限不该一样）；② **格式**（`.dc.html` 有 20 多件专有能力，`.md` 只有读写）；
③ **插件**（买来的能力对外看不见 —— 市场卖的东西只在界面上存在，模型用不上，等于卖了一半）。

## 二、现状（2026-10-11 实测读数）

| 项 | 现状 |
| --- | --- |
| 传输 | stdio（`server/dist/index.js`）；HTTP 只给自己的前端（`/__ud/*`，要本地令牌） |
| 能力 | `cap/` 72 件，`faces: ["mcp","http","plugin"]` 决定暴露到哪一面；另有 `index.ts` 里早期直接 `registerTool` 的十几件（项目 / 模板 / 导出 / 体检 / 服务 / AI 配置 / 会话） |
| 通用文件层 | `list_files` / `read_file`（带 encoding）/ `write_file`（utf8 / base64）/ `move_file` / `trash_file` / `restore_trashed` / `global_search` / `list_file_versions` / `read_file_version` / `compare_file_versions` / `revert_file` / `list_file_refs` |
| 设计稿专有 | `read_draft` / `write_draft` / `patch_draft` / `validate_draft` / `set_prop` / `locate_node` / 组件 / 图标 / token / 评论 / 变更 / 快照 … |
| 记录 | `list_versions` / `list_changes` / `list_project_changes` / `list_comments` / `list_chats` / `get_chat` / `index_status` |
| 插件 B 面 | 清单可声明 `surfaces: ["tools"]` + `tools` 入口，沙箱会加载它（`UD_PLUGIN_ENTRY`），**但这些工具不进会话工具表（`chat_run.ts` 没有 plugin 一词）、不进 MCP（`index.ts` 同）**。唯一有 B 面的是内置 `com.umbra.markdown`。→ **2026-10-11 已接**（M13-1 / M13-2，`plugin/verbs.ts`，读数 `00` §一六八） |
| 授权 | `plugin_entitlement` 六种态只在界面（✎ 的过期 / 未授权标签）和 `list_plugins` 回包里；**调用插件能力的路上没有授权门** |
| Umbra 侧 | UmbraPC 没有 MCP 客户端；它有「检测本机 MCP / Skill 并归类上报」（服务端 `capabilities.py`），归的是编码 CLI 的 MCP 配置 |

## 三、对外面的形状

### 3.1 三类调用方，两档权限

| 调用方 | 怎么连 | 权限 |
| --- | --- | --- |
| **Umbra 秘书**（UmbraPC 主进程） | 起 Studio 核心子进程走 stdio（和 Claude Code 一样），或壳已开着时连它的 HTTP（带本地令牌） | **全量**：读写、记录、插件能力 |
| **其他 Agent**（Claude Code / Codex / 用户自配） | stdio，现状 | 全量，**但每次写走写入口并记 `via: mcp`**；是否要一个「只读」档见 Q55 |
| **远端**（Web 版，不排期） | HTTP 传输 | 不做 |

### 3.2 工具分三层（都从一份表生成）

| 层 | 内容 | 变不变 |
| --- | --- | --- |
| **① 通用层** | 文件：列 / 读 / 写 / 移 / 删 / 搜；记录：版本 / 变更 / 评论 / 会话 / 索引状态；项目：列 / 打开 / 最近 | 固定，任何项目都有 |
| **② 格式层** | 一种格式的专有动词。`.dc.html` 的那一套已经有；`.md` 的「改一节」（markdown 插件 B 面已写了，只是没接出去）；`.json` 的「按路径改一个值」；`.csv` 的「按行列读 / 改」 | 随**装了哪些格式模块 / 插件**变 |
| **③ 插件层** | 插件清单声明的任意能力（例：剪辑视频） | 随**装了什么 + 授权态**变 |

**要不要按格式分方法 —— 结论：通用动词不分，专有动词按格式挂。**
`read_file` / `write_file` 对所有格式一个签名，回包里带 `kind`，模型靠它决定下一步；
**不**做 `read_md` / `read_json` 这种分裂（那会把「加一种格式」变成「改 MCP 面」，正是 `.md` 搬成插件要避免的）。
格式专有的事做成**该格式的插件 / 格式模块声明的动词**，名字带前缀（`md.patch_section`、`json.set_path`、`csv.set_cell`），
由 ③ 那条路统一挂出来 —— 格式层其实是插件层的特例（内置插件 = 永远有授权）。

### 3.3 插件能力门（这一稿的核心）

```
清单 surfaces: ["tools"]  ──►  tools.mjs 导出若干「动词」，每个带 { name, summary, input schema, free?: boolean }
                                        │
                     entitlementOf(id) ─┤  builtin / active   → 全部动词挂出
                                        │  expired / not-yet / unlicensed / bad-license
                                        │                     → 只挂 free: true 的动词（例：video.play）
                                        ▼
                 MCP tools/list（按当前授权态生成）+ 授权态变化时发 tools/list_changed
                                        │
                           调用时再验一次 entitlementOf ──► 过不了 → E_PLUGIN_UNLICENSED { plugin, state, market_url }
```

- **对外名字**（Q54 落地）：`<插件短名>__<动词>`，如 `markdown__replace_section`。用两个下划线不用点 —— OpenAI 函数名与 MCP 工具名只认 `[A-Za-z0-9_-]`；短名 = 插件 id 最后一段，两个插件撞了短名的退回整个 id（点换下划线），不让后装的那个静默消失。
- **「免费动词」由插件自己声明**（`free: true`），宿主不猜。剪辑视频插件：`video.play` 免费、`video.cut` 要授权。
  没装那个插件时连 `video.play` 都没有 —— 「播放」也是插件给的能力，不是宿主内置的。
- **过期 ≠ 卸载**：过期的插件仍装着，免费动词照常；买断 / 续费后 `fetch_license` 落盘那一刻 `tools/list_changed`，不用重启（同 M11-10「装后即生效」）。
- **调用走现有沙箱**（QuickJS B 面 + 宿主 API 白名单），对外 MCP 不给插件任何新权限；插件写文件仍经 `plugin_call` → 写入口，`via: plugin`。
- **错误带出路**：`market_url` 指向市场里该插件的详情（`umbrastudio://market/<id>`，壳认这个 scheme；浏览器模式回 `/__app/market/<id>`）。

### 3.4 秘书怎么接（Umbra 侧，另一仓）

- UmbraPC 主进程以 MCP 客户端起 Studio 核心（stdio），把 `tools/list` 里的动词按 `capabilities.py` 的归类上报成 PC 能力（标签：读写文档 / 查记录 / 视频剪辑 …），服务端 AI 派任务时照 `device_skill` 那条路调。
- **授权态变了要重新上报**（`tools/list_changed` → PC 重拉 → 重新注册能力目录）。服务端那边不用改：能力目录本来就是设备上报的。
- 同一台机上 Studio 壳已开着时，不起第二个核心：连壳的 HTTP（要拿本地令牌，走 Q42 那条 preload 路）。**这一条待定**，见 Q57。

## 四、要补的通用能力（对照 72 件后的缺口）

| 缺 | 为什么要 |
| --- | --- |
| `list_projects` 带「最近打开 + 当前打开」 | 秘书第一句是「打开 X」，它得知道有哪些 |
| `read_file` 分页 / 范围（`offset` / `limit` 行） | 大文件整读会把模型上下文撑爆；`.csv` / 日志尤其 |
| `search_in_file`（单文件内找） | `global_search` 是跨文件的 |
| `list_changes` 按时间窗 + 按来源（人 / AI / 插件 / mcp）过滤 | 「今天 AI 改了什么」这一问现在答不了 |
| `list_comments` 带「未处理」过滤 | 秘书替人盯评论 |
| `capabilities`（一件：回当前能挂出的全部动词 + 每件的来源与授权态） | 秘书上报用；也给人看「为什么这件没了」 |
| `tools/list_changed` 通知 | 插件装卸 / 授权变化 |

## 五、安全边界（不新增，但要钉住）

- 项目根闸（`pathguard`）、写入口唯一、`isInside` —— 对 MCP 调用一视同仁，已有判据。
- **只读档**（Q55）如果要，做成 stdio 启动参数，不做运行期开关（开关会被模型自己关掉）。
- 插件动词的 input schema 由插件给，**宿主只做形状校验，不信它的语义**；路径参数一律过项目根闸。
- 令牌：stdio 不需要；HTTP 路要本地令牌（现状）。**登录令牌（Umbra 账号）绝不经这条面透出**。

## 六、第一期范围与验收

| # | 做什么 | 验收 |
| --- | --- | --- |
| 1 | 插件 B 面动词挂进 **会话工具表**（应用内 AI 先用上，这是最短的闭环） | markdown 插件的「改一节」在会话里能被模型调到；`plugintest` 加判据 |
| 2 | 同一份动词挂进 **MCP**，按授权态过滤 + 调用时再验 | 装一个带 `free` 动词的样本插件：未授权只见免费的；签一份许可证后 `tools/list_changed`、全部出现；许可证删掉后又收回 |
| 3 | §四的通用缺口补齐（分页读、变更过滤、`capabilities`） | `apitest` / `captest` 各加判据 |
| 4 | **秘书接入**（UmbraPC，M10-1）：起核心、拉动词、上报能力、授权变化重报 | `01` 第 34 条 + 「买了插件之后秘书能派剪辑任务」 |

**一期不做**：HTTP 远端传输（Web 版不排期）· 只读档（看 Q55）· 插件动词的计费（按次扣积分，Q58）。

## 七、待拍板（没定之前不要按这份改代码）

| # | 问题 | 我的建议 |
| --- | --- | --- |
| **Q54** | 插件动词的命名与归属：`<插件短名>.<动词>` 前缀制，还是扁平名由宿主查重？ | 前缀制。扁平名两个插件撞 `cut` 必然发生，而查重只能拒后装的那一个 |
| **Q55** | 要不要「只读档」给不信任的 Agent | 一期不做；要做就是启动参数 `--readonly`，不做运行期开关 |
| **Q56** | 未授权的动词**不列**（本稿）还是**列出来标灰**让模型知道「买了就有」 | 不列。模型知道「有但用不了」只会反复尝试；「买了就有」这件事由秘书 / 界面告诉人，不由工具表告诉模型 |
| **Q57** | 秘书连核心：每次起子进程（stdio）还是复用已开着的壳（HTTP） | 一期 stdio（和编码代理同一条路，零新代码）；壳开着时两份核心各自建索引会抢锁，**要实测** |
| **Q58** | 插件动词要不要按次计费（剪一次视频扣 N 积分） | 一期不做。许可证已经是「买断 / 限时」两种，再加按次是第三种货币语义，`20` §4.5 没拍过 |
