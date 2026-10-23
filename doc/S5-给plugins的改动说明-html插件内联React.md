# 给 plugins 的改动说明：`.dc.html` 预览里的 React 加载（html 插件）

**交办人**：geek-99 转交 · **写于** 2026-10-24 · **最终版**（§5 两件已由 geek-99 定） · **开发侧（Studio）** 写
**范围**：`com.umbra.html` 的 `preview.mjs`（srcdoc 拼装那一层）。Studio 这边配套做的见 §4。
⚠️ **Studio 不改 umbra-plugins 仓**，这份是说明不是补丁。

---

## 0. 一句话

`.dc.html` 预览里 React 加载不出来，而**原定的解法（把 CDN 地址映射到本地副本）在这条路上不成立**。
成立的解法是**把 UMD 的字节内联进 srcdoc**，而 `support.js` 自己已经留好了钩子，
所以**不用改 `support.js`，也不用动用户的文件**。

---

## 1. 症状与完整链条（都是源码核过的，不是推断）

`uitest` 一轮里控制台有 52 条 CSP 违规 + 22 声稿自己报的加载失败，原文：

```
Loading the script 'https://unpkg.com/react@18.3.1/umd/react.production.min.js'
violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline'"
[dc] failed to load React or boot: Error: failed to load https://unpkg.com/react@18.3.1/umd/react.production.min.js
```

链条：

| 步 | 发生了什么 | 出处 |
| --- | --- | --- |
| ① | `.dc.html` 在 Studio C3 之后落 `html` kind，由 html 插件预览 | Studio `shared/kinds.ts` |
| ② | 预览是 **srcdoc**，iframe 是 `sandbox="allow-scripts"`，**不给 `allow-same-origin`** → **不透明源** | 插件 `index.html:20` |
| ③ | srcdoc **继承宿主给插件页的 CSP**：`script-src 'self' 'unsafe-inline'`。而 `'self'` 对**不透明源匹配不到任何东西** → **只有内联脚本能跑** | Studio `serve.ts:203` |
| ④ | 稿里 `<script src="./support.js">` 是项目内文件 → 插件按现有逻辑**整个换成内联脚本** | `preview.mjs:146-153` |
| ⑤ | `support.js` 跑起来调 `loadReactUmd()` → `loadScript(url)` → `document.createElement("script"); s.src = …` | 存量 `support.js:1826-1846` |
| ⑥ | 那一次 `src` 加载撞上 ③ 的 CSP → 被拦 → 稿自己 `console.error("[dc] failed to load React or boot:", err)` | `support.js:1908` |

## 2. ⚠️ 为什么「映射到本地副本」不成立

**两条独立的理由，任何一条都足以否掉它：**

1. **那个 URL 压根不在静态 `src` 里。** 插件对 `isExternal(a.value)` 的处理是 `off()` ——
   把属性改名成 `data-umbra-src`，**什么都不请求**（`preview.mjs:131`）。
   也就是说静态外链本来就不会产生违规；违规来自 **`support.js` 运行期拼出来的那个 URL**，
   渲染层改写改不到它。
2. **即使改到了也没用。** 映射之后仍然是一次 `script.src = "./react.production.min.js"` ——
   而 ③ 那条 CSP **只放内联**，本地相对路径和 CDN 绝对地址**一样被拦**。
   > 「换一个 src」解不了「不许有 src」。

⚠️ 实测佐证：用户存量稿（如 `S3-诊断面板.dc.html`）**已经带着这个映射**
（`window.__resources` 把 unpkg 两个地址映射到 `./react*.min.js`，而那两个文件也真在稿旁边），
**而它照样加载失败** —— 因为失败的不是「找不到文件」，是「不许用 src」。

## 3. 成立的解法：把字节内联进 srcdoc

`support.js` 的 `loadReactUmd()` 第一行就是：

```js
function loadReactUmd() {
  const w = window;
  if (w.React && w.ReactDOM) return Promise.resolve();   // ← 钩子在这儿
  …
}
```

**只要在 `support.js` 跑之前 `window.React` / `window.ReactDOM` 已经在，它自己短路。**
于是：

> **不改 `support.js`，不改用户的文件，不放宽 CSP。**

### 3.1 落点：**复用已有的「一换一」替换**

插件现在把 `<script src="./support.js">` 整个换成一段内联脚本（`preview.mjs:146-153`）。
建议**在那段内联文本前面拼上 React + ReactDOM 的 UMD 源码**，仍然是**一个元素换一个元素**。

⚠️ 这一点是**硬约束**，插件自己的头注释写着：
> 「**只改属性和内容，不增删元素**：点选靠「元素下标路径」对回源码，多一个或少一个元素，整条路径就错开一位」

所以**不要另外插一个 `<script>`** —— 那会让点选整条路径错位。拼进现有那一段是唯一不破坏下标的做法。

### 3.2 判准：什么时候拼

只在**三个条件同时成立**时拼：

1. 这个 `<script src>` 指向的是稿自己的运行时 —— **按内容判，不按文件名判，也不按 CDN 域名判**
   （geek-99 2026-10-24 定：**「三个包 × 三个 CDN」那条白名单撤掉**）。
   判法建议：内联进来的文本里出现 `loadReactUmd` 或 `[dc] failed to load React`。
   理由：文件名用户可以改，域名是运行期才出现的，而我们要的是
   **「这段代码会去加载 React」**这件事本身。
2. 稿要的**大版本**和 Studio 提供的本地副本一致（见 §4 的 `major` 字段）；
   大版本对不上 → **不拼**，照拦；
3. 本地副本拿得到（§4）。

### 3.3 拼不上的时候：预览里给一行可见提示

geek-99 定的：大版本对不上、或者是别的站外脚本，**一律照拦**，同时在预览里给一行可见提示，
**写明被拦的 URL**。文字和位置先用最朴素的做法（后面他再交给设计侧）。

建议最朴素的做法：插件自己那一层（**不是 srcdoc 里**）在预览区上方放一行文字。
**两种情况两句话**（geek-99 2026-10-24 定）：

| 情况 | 提示要说什么 |
| --- | --- |
| 站外脚本被拦（含大版本对不上的 React） | `这份稿要从网上取 <URL>，预览里不允许联网，所以没有取 —— 画面可能不完整。` **URL 拿得到就写，拿不到就写包名。** |
| 稿要 Babel（JSX） | **「这份稿需要 Babel 转译，预览不支持」这层意思** —— ⚠️ **不能只甩一个被拦的 URL**：用户看到一个 unpkg 地址不知道那是什么，而「用了 JSX 所以预览看不了」他一眼就懂。 |
⚠️ **不要放进 srcdoc** —— 那会增删元素，破坏点选下标（§3.1）。

## 4. Studio 这边配套做什么（我们的活）

本地副本**不能指望在稿旁边**：Studio 的 C3 已经不再往稿旁边拷运行时，新建的稿旁边什么都没有；
存量稿旁边有，但那是历史。所以由 **Studio vendor 一份**，插件按一条已经证明可用的路去取：

- 位置：`shared/`（宿主共享库，**产物进仓库**，前提是断网可用）；
- 取法：**`import("/__shared/…")`**。
  ⚠️ **不能用 `fetch`** —— 插件页的 CSP 是 `connect-src 'none'`（`serve.ts:206`）。
  而 `import()` 走 `script-src 'self'`，**匹配 scheme+host+port 不匹配路径**，所以拿得到
  （Studio `CLAUDE.md` 写着这条，`uitest` 有两条判据钉着）。
- 形状：导出**源码字符串**，而不是让它自己执行 ——
  因为我们要的是「把这段文本拼进 srcdoc」，不是「在插件页里跑 React」。

**Studio 已做好，这是最终的路径与形状**（实测 `GET /__shared/dc-umd.js` → 200 ·
145 852 字节 · `text/javascript; charset=utf-8`）：

```js
import { react, reactDom } from "/__shared/dc-umd.js";
// 或 import dcUmd from "/__shared/dc-umd.js";  →  { react, reactDom }

react     // { version: "18.3.1", major: 18, src: "<react.production.min.js 全文，10 751 字节>" }
reactDom  // { version: "18.3.1", major: 18, src: "<react-dom.production.min.js 全文，131 835 字节>" }
```

- **没有 `babel`**（§5 A 已定）。
- `major` 给 §3.2 条件 2 用（大版本对不上一律照拦）。它是从包自己的 `package.json`
  算出来的，**不手写** —— 手写的那一天它就会和依赖分叉。
- `src` 是**源码文本**，不是一个会自己执行的模块。
- 出处 `app/shared-src/dc-umd.build.mjs`，重新生成 `npm --prefix app run build:dc-umd`，
  **产物进仓库**（`shared/` 的老规矩，前提是断网可用）。字节读的是 `app` 已声明的依赖
  `react@^18.3.1` / `react-dom@^18.3.1` 自带的 `umd/`，所以**字节在仓库里只存一份**。
  ⚠️ 实测对拍过三份 md5 完全一致：`node_modules` 里的 · Studio 7c-2b 删掉的那份 `runtime/` vendor ·
  用户稿旁边那份存量（`e91b2616…` / `7d4842a9…`）。**同一份字节，三个出处。**

## 5. ✅ 两件已定（geek-99 2026-10-24）

**① Babel 不 vendor（已定）。** 只 vendor react + react-dom。实测体积：

| 包 | 体积 |
| --- | --- |
| `react.production.min.js` | **10.7 KB** |
| `react-dom.production.min.js` | **131.8 KB** |
| `@babel/standalone@7.29.0` | **约 2.9 MB** |

前两个加起来 143 KB，没什么可犹豫的。Babel 是另一个量级：它进仓库、进 `extraResources`、
而且**每次预览一份用 JSX 的稿都要把 2.9 MB 的字符串拼进 srcdoc**。
⚠️ 另外：`window.__resources` 那张映射表里**从来没有 Babel**（只有 react 与 react-dom）——
也就是说 Babel 一直是从 CDN 取的，断网时本来就不工作。
**裁决**：只 vendor react + react-dom。**JSX 稿照拦，并给那行可见提示**，
而且提示里**不能只给一个被拦的 URL** —— 要写明「**这份稿需要 Babel 转译，预览不支持**」这层意思。
等真有人撞到再议。

**② 白名单撤掉（已定）。** 原定「只认 react / react-dom / @babel/standalone 三个包 ×
unpkg / jsdelivr / cdnjs 三个 CDN」。在内联方案里**它没有落点** ——
插件判的是「这段代码会去加载 React」，不是「它从哪个域名加载」。

**裁决**：撤掉白名单，**按内容判**（§3.2 条件 1）。那行提示里的 URL
**拿得到就写，拿不到就写包名**。

## 6. 不做什么

- **不放宽 `script-src`**（geek-99 明确）。
- **不改写用户的文件**（映射只发生在渲染那一层 —— 内联方案天然满足：srcdoc 是拼出来的）。
- **不增删 srcdoc 里的元素**（点选下标，§3.1）。
- **不改 `support.js`** —— 它自己的短路钩子已经够用，而它是 ClaudeDesign 的东西（原样 vendor）。
