# umbra-plugins

Umbra Studio 的插件仓库：**所有**插件的源码、插件 SDK（桥 + 设计 token + 清单 schema + 规范）、打包与校验脚本。
零运行依赖（只要 Node ≥ 20）。

一个插件 = 一个目录 = 一种（或几种）文件格式在 Umbra Studio 里「怎么看、怎么改、AI 怎么改」。
机制本身（沙箱、安装、许可证）在 Studio 里；这里只管**插件长什么样、怎么打成包、怎么发出去**。

```
sdk/
  umbra.js              插件侧的桥（A 面），唯一出处
  theme.css             设计 token + 底样式，唯一出处
  manifest.schema.json  清单的 JSON Schema
  PLUGIN-SPEC.md        写插件的规范 —— 开工前必读
  PACKAGE-FORMAT.md     .umbraplugin 容器与 canonical() 规则 + 测试向量（服务端 Python 对拍用）
  CHANGELOG.md          SDK 变更记录（含从 Studio 收口时四份 umbra.js / 三份 theme.css 的差异裁决）
  test-vectors/         最小插件 + canonical 字节 + sha256 + 测试签名 + 测试公钥
plugins/
  com.umbra.markdown/   一个插件一个目录，目录名 = manifest.id，版本写在 manifest 里（不嵌版本号子目录）
  com.umbra.code/
  com.umbra.html/
scripts/
  validate.mjs          校验一个 / 全部插件
  pack.mjs              打包（先 vendor SDK 再打；不签名）
  sync-studio.mjs       把三个内置插件的包解到 Studio 的 plugins/<id>/<version>/
  make-test-vectors.mjs / verify-test-vectors.mjs / test-validate.mjs
.github/workflows/ci.yml
```

## 一、新建一个插件（五步）

1. **读** `sdk/PLUGIN-SPEC.md`，再读 `plugins/com.umbra.markdown/`（两面都有，是模板）。
2. **建目录** `plugins/<反写域名 id>/`，写 `manifest.json`（照 schema；`hostApi: "^1"`，`permissions` 必填，只声明用得到的）。
   新格式先做调研、写 `RESEARCH.md`（规范 §七的五条），选定库再写代码。
3. **A 面**：`index.html`（先 `<script src="./umbra.js">` 再 `<script type="module" src="./app.mjs">`，样式只链 `./theme.css`）+ `app.mjs` + `plugin.css`。
   读文件 `umbra.call("read_file")`，改完 `umbra.setDirty(true)`，落盘 `umbra.call("write_file", { expectSha256 })`。
   **不要**往目录里提交 `umbra.js` / `theme.css`（`.gitignore` 已拦）。
4. **B 面**：`tools.mjs` 里 `export default function register(host) { host.defineCap({ name: "<id>.<动词>", … }) }`，至少两件：一件只读结构、一件局部改写。
   一个外部 import 都不写。
5. **验**：`node scripts/validate.mjs <id>` 零 error → `node scripts/pack.mjs <id>` 出包 → 本地 Studio 用 `UMBRASTUDIO_PLUGIN_DEV=1` 装 `dist/<id>-<version>.umbraplugin` 真开一次 → 提 PR。
   PR 描述里写：选了哪个库、为什么、体积、许可证、哪些事做不了。

## 二、validate / pack

```bash
node scripts/validate.mjs com.umbra.markdown      # 一个
node scripts/validate.mjs --all                   # 全部；有 error 退出码 1
node scripts/pack.mjs --all                       # → dist/<id>-<version>.umbraplugin（+ .sha256 旁件）
node scripts/verify-test-vectors.mjs              # 容器格式没悄悄变
node scripts/test-validate.mjs                    # 校验器自己的回归（故意写坏的样本要红在对的那条上）
npm test                                          # = validate --all + verify-test-vectors
```

`validate` 查什么、为什么是 error：规范 §六（V1–V10）。`pack` 先跑一遍 validate，有 error 不打。

## 三、vendor 时机：SDK 怎么进包

插件目录里**不提交** `umbra.js` / `theme.css`。`pack.mjs` 打包前：

- `umbra.js` ← `sdk/umbra.js` 原样拷入
- `theme.css` ← `sdk/theme.css`（token + 底样式）**+** 插件目录里的 `plugin.css`（它自己的组件样式）拼成一份
- `plugin.css` 本身**不进包**（内容已在 theme.css 里）

所以 Studio 侧宿主契约升级时，改 `sdk/` 一处、全部重打；三份分叉的问题从结构上消失。
每个插件目录下有一份 `.gitignore` 忽略这两个生成物。

## 四、发 Release

包**不签名**：签名在服务端上传时做，私钥只在 ECS（Studio `doc/23` D3）。CI 产出的是未签名包，
只能在 `UMBRASTUDIO_PLUGIN_DEV=1` 的机器上直接装；进市场要经后台「上传新版本」签过。

1. 改版本：`plugins/<id>/manifest.json` 的 `version`（schema 形状：`1.2.0` / `1.2.0-beta.1`）
2. PR 过 CI（validate + pack + 测试向量 + 校验器回归，产物挂在 Actions artifact 上可以先下来试）
3. 合并后打 tag：`git tag v0.2.0 && git push origin v0.2.0` → `release` job 把 `dist/*.umbraplugin` 和 `.sha256` 挂到 GitHub Release
4. 后台「上传新版本」传那个包 → 服务端解包、核 id、核版本更高、签名、存 OSS、回填目录 → Studio 市场看到可更新

## 五、和 Studio / 服务端的关系

```
umbra-plugins（这里）           Umbra 服务端 + 后台                Umbra Studio
──────────────────             ──────────────────────           ─────────────────────
写插件 · validate · pack  ──►  后台上传 .umbraplugin      ──►   市场 GET /plugins/catalog
Release 挂未签名包              ① 解包 ② id 对上 ③ 版本更高      install_plugin_from_url（只认 https、50 MB）
                               ④ 用 ECS 私钥对 canonical 签名     → 验签（keys/publisher.pub）→ 校验清单
                               ⑤ 存 OSS ⑥ 回填目录               → 查路径逃逸 → 落盘 → 装完即生效
                               GET /plugins/{id}/package 代理下载
三个内置插件 ──── scripts/sync-studio.mjs ──────────────────────►  plugins/<id>/<version>/（随 Studio 一起发，TOOL_ROOT，卸不掉）
```

- **签名签的是 `canonical()` 的字节**（PACKAGE-FORMAT §二）。服务端 Python 实现要先过 `sdk/test-vectors/` 再碰真包；
  已知的跨语言差异点（浮点、astral 字符排序、整数样的键）都在 §四，`validate.mjs` 把会踩到的输入拒在源头。
- 包签名与许可证签名是同一对钥匙；Studio 验包和验许可证用的都是 `keys/publisher.pub`，服务端那边签包不用新钥匙。
- **内置插件**（md / code / html）也住在这里。Studio 打包前跑
  `node scripts/sync-studio.mjs --studio <Studio 路径> --release v0.2.0`（或 `--release dist`）把包解到 `plugins/<id>/<version>/`；
  内置语义（`builtin: true`、免费、卸不掉、能认领内置类型）是 Studio 运行期按目录位置决定的，和源码住哪无关。
- 一个插件对 Studio 的全部依赖只有两样：`umbra.js` 这条 postMessage 契约（`hostApi: "^1"`）和 `host.call` 白名单（规范 §三）。
  Studio 改了这两样之一才需要动 `sdk/`。

## 六、纪律

- **写盘只走 `write_file`**。绕过去的改动没有快照、没有变更清单、不能回退。
- **B 面不许 import 外部模块、A 面不许外联**。不是「建议」，是沙箱里根本没有。
- **不提交任何私钥**（`.gitignore` 拦 `*.pem` / `*.key`，CI 也查）。测试向量的签名用临时钥匙，签完就删。
- 改 `sdk/` 要同时改 `sdk/CHANGELOG.md`，并跑 `verify-test-vectors.mjs`；改容器格式先改 `PACKAGE-FORMAT.md`。
- 每个插件的 PR 只动自己的目录；不动 `sdk/` 和别的插件。
