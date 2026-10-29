# S8 · 本机桥接宿主能力：接口契约

> **这一份是跨仓契约**：Studio 实现宿主侧，umbra-plugins 实现插件侧与 SketchUp 的 Ruby 扩展。
> 两边按这份写，不互相猜。
> 拍板：sam（做成 Studio 插件，PC 前期不参与）· geek-99（2026-10-30 定 (a)–(d)）。
> 参考：`UmbraPC/doc/SketchUp-AI-原型-技术方案.md` §1 / §1.3 / §2（帧协议与安全条款借用）。

⚠️ **PC 那份方案 §1.4 的结论被这一份推翻了。** 它写着「**不走 umbra-plugins**：那是 Studio 的
文件格式插件，规范写明 `net` 不许，连不了本机端口」—— sam 2026-10-30 改判，而这份契约开的
正是那一节排除掉的口子。**PC 那一节要跟着改**，不然下一个人读到的是旧结论。

---

## 〇、为什么要开这个口子

插件要和设计师本机开着的 SketchUp 通信，而照 PLUGIN-SPEC：B 面跑在 QuickJS 里没有 fetch
也没有 socket · `permissions.net` 第一期按「不许」处理 · 不许 `exec`。**插件自己连不上。**
所以宿主开一个窄口子：**只连 127.0.0.1，只连用户确认过的那一个端点，而插件永远看不到地址和令牌。**

## 一、三条决定了形状的原则

**① 插件永远拿不到端口和令牌。** 握手文件只有宿主读；插件在调用里只说一个 `endpoint` 名字。
> 令牌一旦进了插件的地址空间，「不打印、不落日志」就只是它的自觉。

**② 不给 `connect` / session 句柄，只有 `local.call`。** 宿主自己持连接（懒连、闲置关）。
B 面沙箱会被 `PluginSandbox.retire` 换池（改设置时）、会撞 `deadlineMs`、会崩；
A 面 iframe 切页签就拆。
> **插件手上的句柄会活得比它的持有者久。**

**③ 风险说明那句由宿主写死。** `label` 由插件给（宿主不懂 SketchUp 是什么，这是插件模型的前提），
而它**可以写「本机的记事本」**。所以市场详情页与配对确认里：宿主固定文案在上，
插件的 `label` 在下并标注「插件自己说的」。

---

## 二、`manifest.json`

```json
"permissions": {
  "files": ["read", "write"],
  "scope": "project",
  "net": [],
  "local": [
    { "id": "sketchup", "transport": "tcp-jsonrpc", "label": "本机的 SketchUp" }
  ]
}
```

| 字段 | 规则 |
| --- | --- |
| `id` | `^[a-z][a-z0-9_]{1,31}$`。插件在调用里用的**名字**，不是地址。也是握手文件名（`<id>.json`）|
| `transport` | 第一期只有 `"tcp-jsonrpc"`。留这个字段是为了以后加别的不改形状 |
| `label` | **必填**，给用户看的一句。宿主不信它（原则 ③）|
| `host` / `port` | **schema 里写成 `false`** —— 和现有 `exec: false` 同一个办法：**一个想改地址或写死端口的清单装不上，而不是被静默忽略** |

· 没有 `local` 的插件调 `local.*` → 走现有关② 拒。
· `net: []` **不变** —— `local` 是另一个槽位，不是放开联网。
· `local` 为空数组 = 和没写一样（拒）。

## 三、宿主 API：两件能力

做成**能力**（进 `server/src/plugin/host.ts` 的 `ALLOWED`），不是挂一个 `host.local` 对象 ——
这样自动吃到现成的四道关、信封、变更归属与 A 面那条 postMessage 通路，**零新管道**。
两面调法照旧：A 面 `await umbra.call(...)` · B 面 `await host.call(...)`，回的都是信封。

```js
await host.call("local.status", { endpoint: "sketchup" })
// data: { paired, connected, app?, version?, why? }

await host.call("local.call", { endpoint: "sketchup", method: "get_selection", params: {}, timeoutMs: 8000 })
// data: JSON-RPC 的 result（原样）
```

### 3.1 `local.status`

| 字段 | 含义 |
| --- | --- |
| `paired` | 握手文件在、而且**通过了权限核查**（§四）|
| `connected` | 宿主此刻持着一条到它的连接 |
| `app` / `version` | 握手文件里报的（`paired` 为真时才有）|
| `why` | 为什么不 `paired` / 不 `connected`，**一句给人看的话** |

⚠️ 它**不会**去连接 —— 只读握手文件。插件用它决定 UI 上说什么，而不是靠一次失败的 `local.call`。

### 3.2 `local.call`

入参 `{ endpoint, method, params?, timeoutMs? }`。`method` / `params` 原样进 JSON-RPC，
**宿主不看内容**（白名单在 Ruby 那一侧，见 PC §1.3）。

拒因**七种，分开**：

| code | 什么时候 |
| --- | --- |
| `E_LOCAL_NOT_DECLARED` | 清单里没声明这个 `endpoint` |
| `E_LOCAL_NOT_GRANTED` | 用户还没在 Studio 里允许过 |
| `E_LOCAL_NOT_PAIRED` | 没有握手文件 / 权限核查没过 / 连不上（`why` 说清是哪一种）|
| `E_LOCAL_TIMEOUT` | 这一次超时 |
| `E_LOCAL_DISCONNECTED` | 中途断了 |
| `E_LOCAL_FRAME_TOO_BIG` | 单帧超上限 |
| `E_LOCAL_REMOTE` | 对端回了 JSON-RPC error（原样带它的 `code` / `message`）|

> **三种「不能连」必须分开**（没声明 / 没授权 / 没在跑）—— 合成一句的话，
> 插件没法告诉用户该做什么，而那三件事用户要做的动作完全不同。

· 关② 按 `permissions.local` 核，**不借 `files`** —— 连本机程序和读写项目文件是两件事。
· 超时 = `min(timeoutMs ?? 15s, 30s 硬顶)`。B 面那一侧还有沙箱自己的 `deadlineMs` 管整次调用，
  **两者各管一段，不互相替代**。
· **单帧上限 8 MB**（两个方向都算），另立一个数，不借 `binaryReadMax` ——
  B 面拿到回包要整串 `JSON.parse`，而回包里一个非拉丁字符就让 QuickJS 按 UTF-16 存、内存翻倍
  （PLUGIN-SPEC §三 记着这条）。**对端一帧就能把解释器打爆。**
· 断线 / 超时判在**宿主的 socket timer** 上，不在 QuickJS 里等 —— 解释器不会被挂住。
· ⚠️ **超时之后宿主关掉这条连接**。理由：超时意味着**我们不知道流走到哪了**，
  下一帧可能是上一次那半截。
· ⚠️ **第一期没有推送。** SketchUp 那边「选中变了」靠插件轮询；间隔由插件定，
  宿主只保证轮询不卡（geek-99 2026-10-30 定）。要推送得给 A / B 面各开一条回调通路，那是另一批。

## 四、握手文件（跨仓契约里最要紧的一段）

**放中立位置，不放 Studio 的 STATE_ROOT**（geek-99 定）：

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/Umbra/local/<id>.json` |
| Windows | `%APPDATA%\Umbra\local\<id>.json` |

理由两条：① **Ruby 那边不用去推算 Studio 的 userData** —— 那个路径和身份名 / `CFBundleName`
绑着，而那个名字以后可能还会动（2026-10-24 刚因为它炸过一次：Electron 按 `CFBundleName`
拼 helper 路径，改名之后每个包都起不来）；② 以后 PC 想连同一个 SketchUp，可以共用这一份。

**扩展侧写**（目录 `0700`、文件 `0600`）：

```json
{ "app": "sketchup", "version": "2024.0.1", "pid": 4821,
  "port": 51234, "token": "<32 字节随机，base64url>",
  "startedAt": "2026-10-30T11:22:33Z" }
```

**宿主侧读的时候核四条**，一条不满足就 `paired: false` 并在 `why` 里写明是哪一条：

| 核 | 怎么核 |
| --- | --- |
| 不是符号链接 | `lstat().isSymbolicLink() === false` |
| 属于当前用户 | `stat.uid === process.getuid()` |
| 不是 group / other 可读 | `(stat.mode & 0o077) === 0` |
| 形状对 | `app` / `port` / `token` 都在，`port` 是 1–65535 的整数 |

⚠️⚠️ **后两条只在 POSIX 上核，Windows 上跳过并在 `why` 里说明。**
Node 在 Windows 上 `uid` 报 0、`mode` 报 `0666` —— 照 POSIX 那样核的话
**Windows 上永远 `paired: false`**，而这台开发机是 mac，**这个缺陷在这里恰好不出现**。
> 这正是 `doc/00` §119 那一族（硬编码 `"/"` 的三处「在 mac 上恰好正确」）。
> **一条只在另一个平台上才错的判准，要在写它的那一刻就标出来。**

## 五、配对流程

1. **扩展**绑 `127.0.0.1:0`（端口传 0，系统分配）→ 写握手文件。
   端口随机是为了不撞社区常用的 9876，也让同机多个 SketchUp 版本不互相冲突（PC §1.2）。
2. 插件调 `local.status` → `paired:true, connected:false, why:"还没授权"`。
   插件在自己 UI 里给一句「去设置里允许」—— **它弹不了权限**。
3. **用户确认一次**：Studio 设置 → 插件 → 「本机连接」一行「允许〈插件名〉连接 <label>」+ 开关。
   点开关弹一次确认，摆三样：
   · **宿主写死那句**：「它会连接你这台电脑上的一个本机程序，只能连 `127.0.0.1`，
     连不到互联网，也拿不到这个程序的端口和口令。」
   · 插件声明的 `label`，标注「插件自己说的」
   · 握手文件里的 `app` / `version` / `pid` —— 让用户核对「确实是我开着的那个」
4. 确认后写授权标记：`STATE_ROOT/.umbrastudio/local/grants/<pluginId>__<endpointId>.json`
   内容 `{ at, app, major }`（`major` = 确认那一刻 `version` 的主版本号）。
   ⚠️⚠️ **只有显式确认才写这个文件。**
   > **一个「存在性」判准，会被任何顺手建出那个东西的代码路径悄悄满足** ——
   > M14-7 / Q70 原判准是「`records/<key>/` 在不在」，而 `stage_draft` 顺手把那个目录建出来了，
   > **用户打几个字就把自己解锁了**。所以这里是一个只有那颗开关会写的文件。
5. **SketchUp 重启不重新确认**（geek-99 定）：授权按 `(plugin, endpoint)` 持久。
   只有握手文件里的 `app` 变了、或者 `version` 的**主版本号**变了，才重新问一次；小版本不问。
   > 理由是 M14-2 那条：`dev` 只记不比 —— **把每次都变的东西（端口、令牌）算进等号，只会误伤**。
   > 每次重启 SketchUp 都弹一次，用户会直接关掉这个功能。
6. **不按项目记**（geek-99 定）：在 A 项目里授权过，B 项目里也通。SketchUp 开着就是开着。
   ⚠️ 这是**有意的作用域错配**：插件是 `scope: "project"`，而这座桥是机器级的。

## 六、帧协议

4 字节**大端**长度前缀 + UTF-8 的 JSON 体，JSON-RPC 2.0（照 zinin/sketchup-mcp2 那套，MIT，
PC §1.1 核过协议）。

**令牌只在连接建立时发一次**，不是每帧都带：

```
宿主 → 扩展   {"jsonrpc":"2.0","id":1,"method":"hello","params":{"token":"…"}}
扩展 → 宿主   {"jsonrpc":"2.0","id":1,"result":{"ok":true,"app":"sketchup","version":"…"}}
              令牌不对 → 回 error 并**立刻断开**
```

⚠️ 这是对 PC §1.2「每个请求都要带令牌」的一处**收紧而不是放松**：
> **一个秘密出现的次数越多，它被记下来的机会就越多。**
一条 socket 是一次 accept 的单一流，认一次等价；而每帧都带，令牌就会出现在
对端每一条调试日志、每一次崩溃转储里。
⚠️ **扩展侧的契约**：`hello` 这一帧**不许进日志**。

之后每次 `local.call` 一帧请求、一帧响应，`id` 单调递增，宿主按 `id` 配响应。
闲置 60 秒宿主主动关。

## 七、市场与安装时摆给用户看

`app/src/market/types.ts` 的 `permRows` 加一行（设计侧第十轮定的两条不变：
**权限摆在购买按钮正上方** · **不允许的也要列出来**）：

| 有 `local` | 写 |
| --- | --- |
| 有 | 「连接本机程序 · 只连 `127.0.0.1`」+ note：宿主那句固定文案 + 「装好后要你在设置里单独允许一次」|
| 没有 | 「连接本机程序 · 不允许」+ note：「它连不到你电脑上的任何程序」|

⚠️ 「不允许」那一行**照样写**（和现有 `exec` 那一行同一条理由）：
> **列出来的空白比不列更让人安心。**

## 八、测试（`server/src/localbridgetest.ts`）

假的本机 TCP 服务（node `net.createServer`），不碰真 SketchUp。覆盖：

| # | 判据 |
| --- | --- |
| 1 | 配对：写好握手文件 + 授权 → `local.status` 回 `paired:true`，`local.call` 拿到 result |
| 2 | 收发：长度前缀切帧对（含一帧跨两个 TCP 包、两帧挤在一个包里）|
| 3 | 超时：对端不回 → `E_LOCAL_TIMEOUT`，**而且连接被关掉** |
| 4 | 断线：对端中途 destroy → `E_LOCAL_DISCONNECTED`，不挂住 |
| 5 | 没声明 `local` → `E_LOCAL_NOT_DECLARED` |
| 6 | 声明了但用户没授权 → `E_LOCAL_NOT_GRANTED`（和 5 分得开）|
| 7 | 帧超 8 MB → `E_LOCAL_FRAME_TOO_BIG`，两个方向各一条 |
| 8 | 握手文件 group 可读 / 是符号链接 → `paired:false` 且 `why` 说得出是哪一条（POSIX 才跑）|
| 9 | `app` 变了 / 主版本变了 → 授权失效要重新问；小版本变了 → 照旧通 |
| 10 | 令牌不对 → 扩展那一侧断开 → `E_LOCAL_NOT_PAIRED`，而**令牌不出现在任何日志里** |

⚠️ 第 10 条那后半句是**反面判据**：抓一遍这一轮写的日志，`token` 的值一次都不许出现。

## 九、落点

| 仓 | 改哪 |
| --- | --- |
| **Studio** | 新 `server/src/plugin/localbridge.ts`（帧编解码 + 连接池 + 超时 + 握手核查）· `plugin/host.ts` 的 `ALLOWED` 加两条 + 关② 认 `local` · `plugin/grants.ts`（授权标记）· `market/types.ts` 的 `permRows` · 设置页「本机连接」那一块 · 新 `localbridgetest.ts` |
| **umbra-plugins** | `sdk/PLUGIN-SPEC.md`（§二 权限表 · §三 白名单表 · 新 §3.2）· `sdk/manifest.schema.json` 的 `$defs/permissions` |
| **UmbraPC** | ⏳ §1.4 那条「不走 umbra-plugins」要跟着改（不是这一批做）|

---

## 十、宿主侧落地读数（2026-10-30 实测）

能力数 **97 → 102**（两件桥 + 三件管授权）· `localbridgetest` **34/34**（新建）·
`plugintest` 101/101 · `captest` **321/321**（311 → 321）· `apitest` 219/221 ·
`kindtest` 85/85 · `verbtest` 27/27 · `tsc` 两侧 0 错。按口径没跑全套、没打包。

umbra-plugins 侧（`a34ff20`，**本地提交，没推** —— 推那个仓没拿到授权）：
`sdk/manifest.schema.json` + `sdk/PLUGIN-SPEC.md` + `HOST_ALLOWED` 镜像 + V8，
校验器回归 **104 → 110**。

### 10.1 落地时自己造出来又修掉的两处

**① `CapCtx` 里没有 `pluginId`。** 许可按 `(插件, 端点)` 发，而 `hostCall` 原来只传
`{ project, via: "plugin" }` —— 第一版我就那么写了，`pluginId` 取到的是空字符串，
于是**那张按身份发的许可核的是一个空身份**。这一次落在「偏严」那一边（谁都核不过），
而方向反过来同样容易。
> **一张按身份发的许可，必须有一条能把身份带到核许可那一刻的路。**

**② `dropGrantsOf` 写出来时没有调用方。** 那正是上一批刚清过的那一类，
而它守着一条真的安全性质：卸掉再装回同一个 id，不该继承上一次的许可 ——
而重装的那一份可以是另一个作者的同名包。已接进 `store.ts` 的 `uninstall`，
并有两条判据（清掉它自己那张 / 不连带清别人的）。
> **一张按 id 发的许可，在那个 id 可以被别人重新占用时，不能比它的持有者活得更久。**

### 10.2 判据层量到的两条

**① `rmSync(path, { force: true })` 对一条悬空符号链接什么都不做。**
它按 `existsSync` 判，而那一件**跟随链接**、于是说「不存在」，在 `force` 模式下直接返回；
而 `lstatSync` 说链接还在。第一版栽在这里：下一条判据的 `writeFileSync` 顺着那条链接
写到了别处，于是读数是「握手文件是一条符号链接」—— **而那是上一条判据的样本**。
> **`existsSync` 跟随链接，`lstatSync` 不跟随 —— 一个「它不存在」的读数，在悬空链接上是假的。**
改用 `unlinkSync`，并加了一条「那条链接真的删掉了」的样本有效性判据。

**② 崩了也要清。** 第一次跑崩在一个 `require()` 上（这个文件是 ESM + 顶层 await），
收尾那几行压根没跑，临时目录留在盘上。补 `uncaughtException` 兜底，
反向验证（故意抛）读数：紧急清理跑了、残留 0 个。
> **「清理必须跑」这条纪律，正常收尾只覆盖了「我跑完了」那一半。**
（`packtest` 2026-10-24 为同一件事加过一次，`doc/24` §40.4 ③ —— 这是第二次。）
