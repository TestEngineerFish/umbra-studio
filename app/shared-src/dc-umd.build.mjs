/** 生成 `shared/dc-umd.js`：把 React / ReactDOM 的 **UMD 源码当字符串**导出。
 *
 *  ## 为什么要有它（2026-10-24，geek-99 定）
 *  `.dc.html` 预览是 **srcdoc + `sandbox="allow-scripts"`**（不给 `allow-same-origin`）→ 不透明源，
 *  继承插件页的 CSP `script-src 'self' 'unsafe-inline'`，而 `'self'` 对不透明源**匹配不到任何东西**
 *  → **只有内联脚本能跑**。于是稿里 `support.js` 运行期那句
 *  `createElement("script"); s.src = …` 一定被拦 —— **换成本地相对路径也一样被拦**。
 *  > **「换一个 src」解不了「不许有 src」。**
 *  唯一成立的做法是把 UMD 的**字节内联进 srcdoc**，所以这里导出的是**源码文本**，
 *  不是一个会自己执行的模块：我们要的是「把这段文本拼进别处」，不是「在插件页里跑 React」。
 *  全文与给 plugins 的改动说明在 `doc/S5-给plugins的改动说明-html插件内联React.md`。
 *
 *  ## 为什么从 `node_modules` 读，而不是 vendor 两个文件进仓库
 *  `react@^18.3.1` / `react-dom@^18.3.1` 本来就是 `app` 的依赖，它们的 npm 包里自带 `umd/`。
 *  从那儿读的好处是**字节在仓库里只存一份**（生成出来的这个产物），
 *  而版本由 `package.json` 钉住、`npm ls` 查得出来。
 *  ⚠️ 实测对拍过三份 md5 完全一致：`node_modules` 里的 · 7c-2b 删掉的那份 `runtime/` vendor ·
 *  用户稿旁边那份存量（`e91b2616…` / `7d4842a9…`）。**同一份字节，三个出处。**
 *
 *  ## ⚠️ Babel 不 vendor（geek-99 2026-10-24 定）
 *  `@babel/standalone@7.29.0` 约 **2.9 MB**，而且每预览一份 JSX 稿就要整段拼进 srcdoc；
 *  而 `window.__resources` 那张映射表里**从来没有 Babel** —— 它一直从 CDN 取，**断网时本来就不工作**。
 *  所以 JSX 稿照拦，由插件给一行可见提示，**提示要说「这份稿需要 Babel 转译，预览不支持」**，
 *  不能只甩一个被拦的 URL。等真有人撞到再议。
 *
 *  ## 怎么跑
 *  `npm --prefix app run build:dc-umd`。**产物进仓库**（`shared/` 的老规矩，前提是断网可用）。
 *  改了依赖版本才要重跑 —— 跑完 `git diff` 应该只有 `version` 和那两段字符串变。 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const out = join(appRoot, "..", "shared", "dc-umd.js");

/** 一个包：从它自己的 `package.json` 读版本（**不写死**），从 `umd/` 读产物。 */
const pick = (pkg, file) => {
  const base = join(appRoot, "node_modules", pkg);
  const version = JSON.parse(readFileSync(join(base, "package.json"), "utf8")).version;
  const src = readFileSync(join(base, "umd", file), "utf8");
  /* ⚠️ `major` 是给插件判「大版本对不对得上」用的（geek-99 定：大版本对不上一律照拦）。
     从 version 算出来，不手写 —— 手写的那一天它就会和 `package.json` 分叉。 */
  const major = Number(version.split(".")[0]);
  if (!Number.isInteger(major)) throw new Error(`${pkg} 的版本读不出大版本：${version}`);
  /* ⚠️ **生成器自己要有一道闸**：`shared/` 的产物进仓库，一次错的生成会被提交上去，
     而症状要到「有人预览一份 JSX 稿」才出现。判准认**真代码里的标记**
     （`__SECRET_INTERNALS`），不只认许可证注释 —— 一段只有注释的空壳也能过注释那一关。 */
  for (const must of ["@license React", file, "__SECRET_INTERNALS"]) {
    if (!src.includes(must)) throw new Error(`${pkg}/umd/${file} 看着不像 React 的 UMD：少了 ${must}`);
  }
  return { version, major, src };
};

const react = pick("react", "react.production.min.js");
const reactDom = pick("react-dom", "react-dom.production.min.js");

/* ⚠️ 用 `JSON.stringify` 做转义，**不要手写引号拼接** ——
   UMD 里有反引号、`${`、`</script>`、各种引号，手拼一定会漏一种，
   而漏掉的那一种的症状是「预览页白屏而控制台一句语法错误」。 */
const mod = `/** 自动生成，别手改 —— 出处 \`app/shared-src/dc-umd.build.mjs\`（那里写了为什么要有它）。
 *  重新生成：\`npm --prefix app run build:dc-umd\`
 *
 *  导出的是 **UMD 源码文本**，不是一个会自己执行的模块 —— 用处是拼进 \`.dc.html\` 预览的
 *  srcdoc（那里只放内联脚本）。\`major\` 给调用方判大版本对不对得上。
 *  ⚠️ 没有 Babel：它约 2.9 MB，而且一直是从 CDN 取的、断网本来就不工作（见生成器头部）。 */
export const react = { version: ${JSON.stringify(react.version)}, major: ${react.major}, src: ${JSON.stringify(react.src)} };
export const reactDom = { version: ${JSON.stringify(reactDom.version)}, major: ${reactDom.major}, src: ${JSON.stringify(reactDom.src)} };
export default { react, reactDom };
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, mod, "utf8");
console.log(`写好 shared/dc-umd.js —— react ${react.version}（${react.src.length} 字节源码）· `
  + `react-dom ${reactDom.version}（${reactDom.src.length} 字节源码）· 模块共 ${mod.length} 字节`);
