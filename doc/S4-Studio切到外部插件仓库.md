# 云端会话 S4（仓库：TestEngineerFish/umbra-studio，分支 master）

## 背景（已经发生的事，别重做）

- 插件源码已迁到独立仓库 `TestEngineerFish/umbra-plugins`（S1 的种子 PR #162 已合并并推成了新仓库）。那边现在有 13 个插件：原来的三个内置（markdown / code / html）+ 十个新格式（yaml / toml / ini / xml / svg / mermaid / tex / xlsx / pdf / zip），CI 在打 `v*` tag 时把未签名的 `.umbraplugin` 挂到 GitHub Release（最新 tag 见 Release 页）。那边的 `scripts/sync-studio.mjs --studio <路径> --release <tag 或 dist 目录>` 能把三个内置插件解包到 Studio 的 `plugins/<id>/<version>/`。
- 服务端 `TestEngineerFish/umbra` 的 S2（PR #132）已合并：后台上传 `.umbraplugin` → 校验 → 用 ECS 私钥签名 → 存 OSS → 回填目录；`GET /plugins/{id}/package?v=` 代理下载、不要凭证。
- 方案文档：本仓库 `doc/23-插件仓库与发布链路.md`（§四是本任务的要求，§七是闭环验收）。

先读：`CLAUDE.md`、`doc/23`、`doc/20` §六、`server/src/plugin/`（`store.ts` 的 `BUNDLED_DIR`、`install.ts`、`acquire.ts`、`catalog.ts`、`pack.ts`）、`server/src/cap/plugins.ts`、`server/src/plugintest.ts`、`app/src/market/`、`start.sh`、`shell/afterPack.cjs`、`.gitignore`、`export/umbra-plugins-seed/README.md` 与 `scripts/sync-studio.mjs`（看它的参数和输出布局，**然后这个 export 目录整个要删**，见下）。

## 要做的四件事

### 1. `plugins/` 从源码变成构建产物

- 删掉 `plugins/com.umbra.markdown/`、`plugins/com.umbra.code/`、`plugins/com.umbra.html/` 的源码。`plugins/catalog.json`（出厂清单，离线兜底）保留；`plugins/catalog-cache.json` 如果是运行期写的缓存就一起进 `.gitignore`。
- `.gitignore` 加 `plugins/*/`（只留 `catalog.json`）。
- 新增 `npm --prefix server run sync-plugins`（或根目录一个脚本，放哪按仓库现有习惯）：把三个内置插件解到 `plugins/<id>/<version>/`。两条来源，**自动选**：
  - `UMBRA_PLUGINS_DIR` 指到本地 umbra-plugins 检出（缺省试 `../umbra-plugins`）：在那边跑 `node scripts/pack.mjs --all` 再 `node scripts/sync-studio.mjs --studio <本仓库> --release dist`。
  - 否则按 `UMBRA_PLUGINS_RELEASE`（tag，缺省 `latest`）从 GitHub Release 下载三个包。**仓库是私有的**，下载要带令牌：读 `GH_TOKEN` 环境变量，没有就读 `../.secrets/gh-token` 文件（Geek 根目录下，不进仓库）。拿不到令牌就明说「没有令牌，下不了私有 Release」而不是 404 糊过去。
  - 解包前**不验签**（Release 包本来就没签名，这是出厂件，TOOL_ROOT 是信任边界），但要校验清单与路径逃逸（复用 `install.ts` 已有的检查）。
- `start.sh` 和 Electron 打包（`shell/` 的 build / `afterPack.cjs` 哪个更合适按现状）**先跑 sync**；`plugins/` 下三个内置目录缺任何一个就**拒绝打包并明说**——没有内置插件的 Studio 打不开 `.md`，不能悄悄打出一个残废包。
- `README.md` §「目录」表和 §4.5 补一句「内置插件来自 umbra-plugins，`sync-plugins` 拉」。

### 2. 删掉 `export/umbra-plugins-seed/`，收口两处引用

- 整个目录删除（它的内容已是 umbra-plugins 仓库的 `main`，留着就是两份正本）。
- `CLAUDE.md` §9 和 `doc/23` §六里 S1 的状态改成「已迁出，正本在 umbra-plugins」，并把 umbra-plugins 的仓库地址写进 `doc/23` §二·1 开头。
- `runtime/umbra-plugin.js`：让 `sync-plugins` 顺手从 umbra-plugins 的 `sdk/umbra.js` 覆盖它（这样本仓库里这份永远等于 SDK 正本），文件头加一行「由 sync-plugins 从 umbra-plugins/sdk/umbra.js 拷来，别手改」。`fixtures/插件/com.umbra.demo/` 的 `umbra.js` 同样由 sync 覆盖。`plugintest.ts` 第 546 行附近「四份 umbra.js 都带超时」那组判据按新现状改（现在只有 runtime 一份 + demo 一份，都来自 SDK）。

### 3. 内置插件要能被市场升级（D2 的目的，现在**不能**）

现状（`PACKAGE-FORMAT.md` §三第 4 步、`install.ts`）：包的 id 是内置插件（`TOOL_ROOT/plugins/<id>` 存在）→ 一律拒「不能用装包的方式覆盖内置插件」。这是 M11-6 五路攻击里「覆盖内置」那一道，**不能简单拆掉**。改成：

- 允许装一个 id 为内置的包，**当且仅当**：① 验签通过（**dev 模式的未签名包也行，但照常标 `unsigned`**）② 包的 `version` 严格高于 TOOL_ROOT 里那份的 version ③ 清单的 `kinds` 认领范围是 TOOL_ROOT 那份的子集或相等（升级不能顺便多抢格式——这一条是我的判断，你核一下 `kinds.ts` 的「认领 vs 定义」逻辑后决定要不要留，PR 里写理由）。装到 `STATE_ROOT/plugins/<id>/<version>/`。
- 加载顺序：同一个 id，STATE_ROOT 里有**更高版本**就用它，否则用 TOOL_ROOT 的。`builtin: true` 的语义**不变**（免费、不能卸到没有、能认领内置类型）——「卸载」一个升级过的内置插件 = 删 STATE_ROOT 那份、退回 TOOL_ROOT 那份，界面文案写「退回出厂版本」而不是「卸载」。
- 版本低于或等于 TOOL_ROOT 的包、未签名且非 dev 模式的包：仍然拒，**原来那条攻击测试保留并改成这两种情形**，再加一条正向测试「签过名的更高版本能装上、生效、能退回」。
- `acquire.ts` 的 `planAcquire` 和市场界面：内置条目当目录里 `version` 高于本机生效版本时显示「可更新」并能走 `install_plugin_from_url`；`catalog.ts` 的三级回落不动。
- `plugintest` 全过，`captest` / `uitest` 全过。

### 4. 闭环验收（能跑的都在本会话跑，跑不了的写清楚怎么跑）

按 `doc/23` §七。本会话能做的：① `sync-plugins` 两条来源各跑一次（Release 那条没令牌就跳过并说明）；② 用 Release 里的 `com.umbra.yaml` 等新格式包在 dev 模式装进临时 STATE_ROOT，打开对应文件由插件画、B 面能力在 `plugin_call` 里能调；③ 第 3 节的升级 / 退回。本会话做不了的（要线上服务端）：后台真上传 → 市场看到 → 非 dev 模式验签安装；把这几步写成一份 `doc/23` §七的勾选清单，留给人跑。

## 不要做

- 不改 umbra-plugins 和 umbra 两个仓库（发现那边的问题写进 PR 描述）。
- 不改沙箱、宿主 API、许可证逻辑；第 3 节只动「内置 id 的安装准入 + 加载优先级 + 退回」。
- 不把任何令牌写进仓库或日志。

完成后提 PR，描述里写：删了什么、sync 两条来源的实测、第 3 节的准入规则最终是哪几条及为什么、新增 / 改动的测试条数、留给人跑的验收清单。
