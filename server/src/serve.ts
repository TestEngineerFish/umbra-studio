/** 形态 A 的静态服务。doc/01 §4.2
 *
 * 为什么必须有：`dc-import` 用 fetch 取兄弟稿，Chrome 不允许对 file:// 发 fetch
 * （doc/05 §4.2）。所以带 dc-import 的稿只能走 http，双击打不开。
 *
 * 服务活在 MCP server 进程里，跨工具调用保持运行 —— 起一次，浏览器里一直能开。
 */
import { createReadStream, existsSync, statSync, readFileSync, watch, type FSWatcher } from "node:fs";
import { createServer, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { extname, normalize, resolve, relative, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { emit, subscribe } from "./events.js";
import { X } from "./codes.js";
import { err, ToolError } from "./envelope.js";
import { TOOL_ROOT, type Project } from "./project.js";
import { isToolPage } from "./indexpage.js";
import { API_PREFIX, handleApi, newToken, type ApiCtx } from "./api.js";
import { pluginDirOf, registerPluginKinds } from "./plugin/store.js";
import { BUILTIN, kindOf } from "./shared/kinds.js";
import { resolveInside } from "./pathguard.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ttf": "font/ttf", ".map": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  /* ⚠️ `.mjs` 少了会让**模块脚本**加载失败（M11-9b 实测）：浏览器对
     `<script type="module">` 的 MIME 检查是硬性的，回 `application/octet-stream`
     就报「Expected a JavaScript-or-Wasm module script」。插件包里全是 `.mjs`。 */
  ".mjs": "text/javascript; charset=utf-8",
};

interface Running { server: Server; port: number; dir: string; startedAt: string; hits: number; token: string; project: Project; wss: WebSocketServer | null; watcher: FSWatcher | null; unsubscribe: (() => void) | null }

/** 前端构建产物（`app/`，M7-2；M7-8 起是唯一的前端）。没 build 过就只能提示去 build。 */
const APP_DIST = resolve(TOOL_ROOT, "app", "dist");
export function appDistReady(): boolean { return existsSync(resolve(APP_DIST, "index.html")); }
const NO_BUILD_PAGE = `<!doctype html><meta charset="utf-8"><title>Umbra Studio</title>`
  + `<body style="margin:0;display:grid;place-items:center;height:100vh;font:13px/1.7 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:#f6f7f9;color:#191c21">`
  + `<div style="text-align:center"><p style="font-weight:620">前端还没构建</p>`
  + `<p style="color:#79818d">在仓库根跑一次：<code style="font-family:ui-monospace,Menlo,monospace">npm --prefix app install &amp;&amp; npm --prefix app run build</code></p></div>`;

function serveStatic(root: string, rel: string, reply: import("node:http").ServerResponse, extra?: Record<string, string>): boolean {
  const f = resolve(root, "." + normalize(rel));
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) return false;
  reply.writeHead(200, { "content-type": MIME[extname(f).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store", ...extra });
  createReadStream(f).pipe(reply);
  return true;
}

/** 插件 UI（A 面）的 CSP（M11-4，`doc/20` §三）。
 *
 *  ⚠️ **CSP 必须下在响应头上，不能只靠页面里的 `<meta>`。**
 *  `<meta>` 版插件虽然也解不开（CSP 只能收紧不能放松），但响应头它**连碰都碰不到** ——
 *  差别在于：插件如果能控制自己那张 HTML 的首字节（它本来就能），
 *  `<meta>` 得排在它之前才生效，而这一点要靠我们检查它的 HTML，
 *  等于把安全建在「插件写得规矩」上。
 *
 *  实测过的一条（`doc/20` §3.3）：**`iframe sandbox` 单独用不挡网络** ——
 *  `fetch` / `<img src>` / `sendBeacon` / `WebSocket` 全都能把项目内容偷传出去。
 *  `default-src 'none'` 把这四条全堵上。 */
/** 宿主共享库的根（M10-2）。**只读资产 → `TOOL_ROOT`**（打包后在 `.app` 里）。 */
const SHARED_DIR = resolve(TOOL_ROOT, "shared");

/** 注进预览页的桥（M10-3）。**只做描边、选中、发消息三件事。**
 *
 *  ⚠️ 写成一个立即执行函数并且**不留全局变量** —— 这是用户的页面，
 *  我们多留一个名字就多一分和它自己的代码撞名的可能。
 *
 *  ⚠️ `click` 用 **capture 阶段**并 `preventDefault` —— 否则点一个 `<a>` 会导航走，
 *  而这个视图的用途就是点选。代价是这个预览里链接点不动，
 *  那是**这个模式本来的含义**（要正常浏览就在浏览器里开）。 */
const PREVIEW_BRIDGE = `<script>(function(){
  var last=null, box=document.createElement('div');
  box.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #3a6df0;border-radius:2px;display:none';
  document.documentElement.appendChild(box);
  function label(el){
    var t=el.tagName.toLowerCase();
    if(el.id) return '<'+t+'#'+el.id+'>';
    var c=(el.className&&typeof el.className==='string')?el.className.trim().split(/\\s+/)[0]:'';
    if(c) return '<'+t+'.'+c+'>';
    var sib=el.parentElement?[].slice.call(el.parentElement.children).filter(function(x){return x.tagName===el.tagName}):[];
    return sib.length>1 ? '<'+t+'> '+(sib.indexOf(el)+1)+'/'+sib.length : '<'+t+'>';
  }
  function path(el){
    var out=[];
    while(el&&el.nodeType===1&&el!==document.documentElement){
      var t=el.tagName.toLowerCase();
      if(el.id){ out.unshift(t+'#'+el.id); break; }
      var sib=el.parentElement?[].slice.call(el.parentElement.children).filter(function(x){return x.tagName===el.tagName}):[];
      out.unshift(sib.length>1 ? t+':nth-of-type('+(sib.indexOf(el)+1)+')' : t);
      el=el.parentElement;
    }
    return out.join(' > ');
  }
  addEventListener('mousemove',function(e){
    var el=e.target; if(!el||el.nodeType!==1||el===box) return;
    var r=el.getBoundingClientRect();
    box.style.cssText=box.style.cssText.replace('display:none','display:block');
    box.style.left=r.left+'px'; box.style.top=r.top+'px'; box.style.width=r.width+'px'; box.style.height=r.height+'px';
    box.style.display='block';
  },true);
  addEventListener('mouseleave',function(){box.style.display='none'},true);
  addEventListener('click',function(e){
    var el=e.target; if(!el||el.nodeType!==1) return;
    e.preventDefault(); e.stopPropagation();
    last=el;
    parent.postMessage({t:'ud-pick',label:label(el),path:path(el),
      self:el.cloneNode(false).outerHTML,
      all:el.outerHTML,
      kids:el.children.length},'*');
  },true);
})();</script>`;

/** 插件页面的 CSP。**按端口拼** —— `frame-src` 里要写完整 origin + 路径前缀，
 *  而端口是运行期才知道的。 */
const pluginCsp = (port: number): string => PLUGIN_CSP_BASE
  .concat([`frame-src http://127.0.0.1:${port}/__preview/`])
  .join("; ");

const PLUGIN_CSP_BASE = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",     // 插件自己的脚本
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",            // 只看得到自己目录下的图
  "font-src 'self'",
  "connect-src 'none'",                    // 不许外联 —— 要数据就走 postMessage 问宿主
  /* ⚠️ **`frame-src` 只放 `/__preview/`，不给 `'self'`**（M10-3，用户 2026-09-29 定）。
     `'self'` 匹配的是 scheme+host+port **不是路径** —— 给了它，插件就能嵌
     **本机服务上的任何东西**，包括 `/__app/`（我们自己的界面）。那是视觉欺骗的入口。
     而 M10-3 只需要「嵌用户项目里的一个 html」，**闸的粒度该配需求的粒度**。
     ⚠️ CSP 的源表达式允许带路径前缀，但**必须是完整 origin + 路径**才有意义 ——
     这里用 `'self'` 做不到「只放一条路径」，所以写成通配的 http 源加路径。
     ⚠️ 端口是运行期才知道的，所以这一条**在 `makeServer` 里按端口拼**，不是常量。 */
  "form-action 'none'",
  "base-uri 'none'",
];

/** 进程级注册表：项目名 → 正在跑的服务 */
/** 一条服务的键：**规范化的绝对目录**（issue #20）。
 *  用目录而不是项目名，因为 `project.json` 的 name 不唯一。 */
const keyOf = (dir: string): string => resolve(dir);
const running = new Map<string, Running>();

function makeServer(dir: string | null, onHit: () => void, api: () => ApiCtx | null): Server {
  return createServer((req, reply) => {
    onHit();

    // CORS：允许 Tauri webview（tauri://localhost 或 http://127.0.0.1:*）跨域访问
    const origin = req.headers.origin;
    const allowOrigin = origin?.startsWith('http://127.0.0.1:') || origin?.startsWith('http://localhost:') || origin === 'tauri://localhost'
      ? origin
      : null;

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      if (allowOrigin) {
        reply.writeHead(204, {
          'access-control-allow-origin': allowOrigin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, x-ud-token',
        });
      } else {
        reply.writeHead(403);
      }
      reply.end();
      return;
    }

    // /__ud/* 交给本地 JSON API（doc/00 §二十）。壳要的诊断 / 变更 / slots
    // 每改一次稿就变，注入解决不了，所以走接口。
    const ctx = api();
    if (ctx && (req.url ?? "").startsWith(API_PREFIX)) {
      // 设置 CORS 头
      if (allowOrigin) {
        reply.setHeader('access-control-allow-origin', allowOrigin);
      }
      void handleApi(req, reply, ctx).catch(() => {
        reply.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        reply.end(JSON.stringify({ ok: false, errors: [{ code: "E_API", message: "接口内部出错" }] }));
      });
      return;
    }
    let raw: string;
    try { raw = decodeURIComponent((req.url ?? "/").split("?")[0] as string); }
    catch { raw = "/"; }
    /* /__app/ —— 应用前端本体由本服务托管：和稿同源。
     *
     * ⚠️ **令牌不再无条件注入**（issue #30 / `11` Q42，用户 2026-09-28 定 (a)+(c)）。
     * 原来这里不要任何凭据就把真令牌写进返回的 HTML —— 于是**本机任何能发 HTTP 请求的
     * 进程**扫到端口就能拿走它，拿着它可以调 `/__ud/*` 的全部能力，
     * `plugin/host.ts` 那九件白名单和插件清单里的权限声明**被整体绕过**（实测确证）。
     *
     * 现在分两条路拿令牌，**都不经过这个响应**：
     * - 桌面壳（用户真正用的）：主进程把 boot 经 `preload` 挂进 `window.__UD_APP`，
     *   令牌从不出现在任何 HTTP 响应里；
     * - 浏览器模式（开发调试）：地址里带 `?token=`，对上了才注入。
     *   `npm run ui` 本来就自动打开浏览器，所以用户无感 —— 代价只是
     *   「手敲 127.0.0.1:端口/__app/」不再能直接用。
     *
     * 拿不到令牌时**照常回页面**（不是 403）：前端会显示「这个页面要从 Umbra Studio
     * 或带令牌的链接打开」。403 会让 SPA 的子路由（/__app/home）也打不开，
     * 而且一个白屏说不清原因。 */
    const c = api();
    const useApp = appDistReady();
    if (raw === "/__app" || raw === "/__app/" || raw === "/__app/index.html" || (useApp && raw.startsWith("/__app/") && !existsSync(resolve(APP_DIST, "." + normalize(raw.slice("/__app".length)))))) {
      reply.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      if (!useApp) { reply.end(NO_BUILD_PAGE); return; }
      /* 查询串里的 token 对不对。⚠️ 用**定长比较**而不是 `===`：这是个凭据比较，
         早退的字符串比较会泄露前缀信息。本机 loopback 上时序攻击不现实，
         但「凭据用常数时间比」是那种写一次就一直对的事。 */
      const q = (req.url ?? "").split("?")[1] ?? "";
      const given = new URLSearchParams(q).get("token") ?? "";
      const okToken = !!c && given.length === c.token.length && timingSafeEqual(Buffer.from(given), Buffer.from(c.token));
      // SPA：/__app/ 下任何不是静态文件的路径都回 index.html（前端自己按路径分页）
      const boot = c && okToken
        ? `<script>window.__UD_APP=${JSON.stringify({ url: `http://127.0.0.1:${c.port}/`, token: c.token, name: c.project?.name ?? null, title: c.project?.title ?? null, dir: c.project?.dir ?? null, ws: `ws://127.0.0.1:${c.port}${API_PREFIX}ws`, hub: !c.project })};</script>`
        : "";
      reply.end(readFileSync(resolve(APP_DIST, "index.html"), "utf8").replace(/<head>/i, "<head>" + boot));
      return;
    }
    if (raw.startsWith("/__app/") && serveStatic(APP_DIST, raw.slice("/__app".length), reply)) return;
    /* ═══ 宿主共享库（M10-2）═══ `/__shared/<文件>`
       给插件用的大依赖放这里**一份**，而不是每个插件各自打包一份
       （`markdown-it` 在 md 插件里就占 138 KB，CodeMirror 更大 ——
       用户每装一个编辑器插件就再下一份，那是纯浪费）。

       能这么做是因为 CSP 的 `script-src 'self'` 匹配的是 **scheme+host+port，不是路径**：
       插件页面和这条路由在同一个本地服务上，所以它 import 得到。

       ⚠️ **`access-control-allow-origin` 不能省**（和 `/__plugin/` 同一条实测教训）：
       插件在不透明源的 iframe 里（`origin: null`），而 `<script type="module">` 走
       **CORS 模式**取 —— 不回这个头，模块脚本直接被拦，控制台报「blocked by CORS policy」。

       ⚠️ **不放任何秘密**：这里的东西对每个插件都可见，而插件是第三方写的。
       放的只能是我们发出去的公共依赖（CodeMirror 这一类），
       **不放令牌、不放用户数据、不放项目路径**。 */
    if (raw.startsWith("/__shared/")) {
      if (serveStatic(SHARED_DIR, raw.slice("/__shared".length), reply, {
        "access-control-allow-origin": "*",
        /* 版本化的依赖可以长缓存；探针阶段先不缓存，免得改了看不到 */
        "cache-control": "no-cache",
      })) return;
      /* ⚠️ **找不到就 404，不往下走**（2026-09-28 实测栽过）。
         原来写成 `if (… && serveStatic(…)) return;`，取不到时**继续往下**，
         最后落到 SPA 兜底页 —— **回的是 200 + 一段 HTML**。
         于是「文件在不在」这件事在外面**完全看不出来**：
         packtest 那条判据拿 200 当成功，一条只会说「是」的判据等于没有判据。
         诊断信息也一并回出去 —— 这条路由的使用者是插件作者，
         「404」告诉不了他是路径写错了还是这个依赖没发，而 `SHARED_DIR` 能。 */
      reply.writeHead(404, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
      reply.end(`共享库里没有这个文件。\n查的是：${resolve(SHARED_DIR, "." + normalize(raw.slice("/__shared".length)))}\n共享库根：${SHARED_DIR}`);
      return;
    }
    /* ═══ 预览用户项目里的网页（M10-3）═══ `/__preview/<项目内相对路径>`
       给非 `.dc.html` 的普通 `.html` 用：插件把它装进 iframe 渲染、点选元素。

       ⚠️ **为什么要一条专用路由，而不是给插件 `frame-src 'self'`**（用户 2026-09-29 定）：
       `'self'` 匹配的是 **scheme+host+port，不是路径** —— 给了它，插件就能嵌
       **本机服务上的任何东西**，包括 `/__app/`（我们自己的界面）。
       那是视觉欺骗的入口：插件在自己的矩形里嵌一份像真的界面，诱导用户在里面输入。
       （缓解事实是那份界面拿不到令牌、会显示「拿不到访问令牌」——
       但「骗不了多久」不等于「骗不了」。）

       **闸的粒度该配需求的粒度**：M10-3 只需要「嵌用户项目里的一个 html」，
       所以只开这一条路由，`frame-src` 只放它。
       这和 §一一七.7 那条「认领闸挡错东西」是同一个判断方式 ——
       那次是闸太紧挡了正当用法，这次是闸太松放了不需要的。

       三道闸：
       ① **只服务当前项目里的文件**（`c.project` 为空时直接 404 —— hub 没有项目）
       ② `resolveInProject` 守住不许跨出项目目录（`pathguard.ts` 那一份，issue #19）
       ③ **只放 `.html` / `.htm`**：这条路由的用途就是渲染网页，
          放开成「任意文件」等于多一条读项目内容的路，而读文件本来就有 `read_file`（带权限） */
    if (raw.startsWith("/__preview/")) {
      const c = api();
      if (!c?.project) { reply.writeHead(404); reply.end("预览只在项目里可用"); return; }
      const rel = decodeURIComponent(raw.slice("/__preview/".length));
      if (!/\.html?$/i.test(rel)) { reply.writeHead(415); reply.end("这条路由只渲染 .html"); return; }
      let abs: string;
      try { abs = resolveInside(c.project.dir, rel); }
      catch { reply.writeHead(403); reply.end("路径跨出了项目目录"); return; }
      if (!existsSync(abs) || statSync(abs).isDirectory()) { reply.writeHead(404); reply.end("没有这个文件"); return; }
      /* ⚠️ **不给这一页加 CSP**：它是用户自己的网页，我们不是它的作者，
         收紧了反而让它显示不出来（外链的 CSS / 图片全被挡）。
         它的隔离靠的是**装它的那个 iframe**（插件那一层已经 sandbox 过）。
         ⚠️ 但 `X-Frame-Options` 不能设 —— 设了插件就嵌不进来了，那正是这条路由的用途。 */
      /* ⚠️ **往用户的页面里注入一小段桥**（M10-3）。
         为什么非注入不可：插件在**不透明源**的 iframe 里（origin 是 `null`），
         而这个预览页的 origin 是 `http://127.0.0.1:<port>` —— **两者不同源**，
         插件读不到它的 `contentDocument`，也就点不了它里面的元素。
         所以点选这件事只能**在页面自己这一侧**做，再 `postMessage` 出来。

         ⚠️ 这**改变了用户的页面**（多了一段脚本）。两条自律：
         ① 只在**预览**这条路由上注入 —— 盘上那份文件一个字节都没动；
         ② 脚本只做三件事：描边、选中、往外发消息。**不读 cookie、不发网络、不改 DOM 内容**。 */
      const html = readFileSync(abs, "utf8");
      const injected = html.includes("</body>")
        ? html.replace(/<\/body>/i, PREVIEW_BRIDGE + "</body>")
        : html + PREVIEW_BRIDGE;
      reply.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      reply.end(injected);
      return;
    }
    /* ═══ 插件 UI（M11-4）═══ `/__plugin/<id>/<路径>`
       每个插件的静态文件从它自己的目录出，**带 CSP 响应头**。
       前端把它装进 `<iframe sandbox="allow-scripts">`（不给 allow-same-origin）——
       两样合起来才是边界：sandbox 管 DOM 和存储，CSP 管网络。 */
    if (raw.startsWith("/__plugin/")) {
      const rest = raw.slice("/__plugin/".length);
      const slash = rest.indexOf("/");
      const id = slash < 0 ? rest : rest.slice(0, slash);
      const inner = slash < 0 ? "/index.html" : rest.slice(slash);
      /* id 只许这个字符集 —— 放行点和横杠之外的东西，`resolve` 就能被绕出插件目录 */
      if (!/^[a-z0-9]+(\.[a-z0-9-]+){1,4}$/.test(id)) { reply.writeHead(404); reply.end("bad plugin id"); return; }
      const base = pluginDirOf(id);
      /* ⚠️ **`access-control-allow-origin` 不能省**（M11-9b 实测）：
         插件在不透明源的 iframe 里（`origin: null`），而 `<script type="module">`
         是用 **CORS 模式**取的 —— 不回这个头，模块脚本直接被拦，
         控制台报「blocked by CORS policy」。经典 `<script src>` 是 no-cors，所以之前没踩到。

         放开安全吗：这些文件就是我们发出去的插件代码和资源，**没有秘密**；
         而插件**往外**发请求仍被 CSP 的 `connect-src 'none'` 挡着，这一头不影响那一边。 */
      if (base && serveStatic(base, inner, reply, {
        "content-security-policy": pluginCsp(c?.port ?? 0),
        "access-control-allow-origin": "*",
      })) return;
      reply.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      reply.end(`404 plugin ${id}${inner}`);
      return;
    }
    if (raw === "/" || raw.endsWith("/")) raw += "index.dc.html";
    if (dir === null) {   // hub：没有项目目录，只有 /__app/ 与全局 API
      reply.writeHead(302, { location: "/__app/home" }); reply.end(); return;
    }
    const abs = resolve(dir, "." + normalize(raw));
    if (!abs.startsWith(dir) || !existsSync(abs) || statSync(abs).isDirectory()) {
      reply.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      reply.end(`404 ${raw}`);
      return;
    }
    const head = {
      "content-type": MIME[extname(abs).toLowerCase()] ?? "application/octet-stream",
      // 设计稿改一下就要能刷出来，所以一律不缓存
      "cache-control": "no-store, must-revalidate",
      // CORS 头
      ...(allowOrigin && { "access-control-allow-origin": allowOrigin }),
    };

    /* 工具页（S1–S15 那些我们部署进项目的界面稿）的 `__UD_API` **在这里现给**，不读盘上那份。
     *
     * 盘上那份是 `build_index` 当时写的，钉着**那一刻**的端口和令牌 —— 而端口每次起服务都重随机、
     * 令牌也重新生成。于是隔一次启动再打开 S8 就是「接口读不到: Failed to fetch」：
     * 它拿着一个早就没人监听的端口在敲门（2026-09-24 用户实测，`00` §六十六）。
     *
     * 顺带解决一个更隐蔽的问题：令牌本来被写进了稿件文件，那份稿被拷走令牌就跟着走。
     * 现在盘上只留 `null`，令牌只活在这一次响应里 —— 这也才真的符合「令牌只出现在壳页面里」（§20.2）。
     */
    if (isToolPage(relFromDir(dir, abs)) && abs.endsWith(".dc.html")) {
      const api = { base: `${API_PREFIX}`, token: c?.token ?? "" };   // base 用相对路径：跟着页面自己的源走，换端口也不会错
      const src = readFileSync(abs, "utf8").replace(
        /window\.__UD_API\s*=\s*(?:\{[\s\S]*?\}|null)\s*;/,
        `window.__UD_API = ${JSON.stringify(api)};`);
      reply.writeHead(200, head);
      reply.end(src);
      return;
    }
    reply.writeHead(200, head);
    createReadStream(abs).pipe(reply);
  });
}

/** abs → 相对项目根、用 / 分隔 —— isToolPage 认的是这种形状 */
function relFromDir(dir: string, abs: string): string {
  return abs.slice(dir.length).replace(/^[/\\]/, "").split(sep).join("/");
}

export interface ServeInfo {
  project: string;
  url: string;
  port: number;
  dir: string;
  startedAt: string;
  hits: number;
  indexExists: boolean;
  /** 本地 API 的令牌 —— 壳页面靠它调 /__ud/*（doc/00 §二十） */
  token: string;
}

function info(name: string, r: Running): ServeInfo {
  return {
    project: name,
    url: `http://127.0.0.1:${r.port}/`,
    port: r.port,
    dir: r.dir,
    startedAt: r.startedAt,
    hits: r.hits,
    indexExists: existsSync(resolve(r.dir, "index.dc.html")),
    token: r.token,
  };
}

/** 插件加的文件类型只需注册一次（进程级）。
 *  放在起服务这一步而不是模块顶层：模块顶层是同步的，而读插件目录是异步的。 */
let kindsReady: Promise<unknown> | null = null;

export async function serveStart(p: Project, wantPort?: number): Promise<ServeInfo> {
  /* ⚠️ **服务端也要认插件加的类型**（M11-5 漏过一次）：目录列的类型列和图标
     是服务端 `list_files` 算好给的 —— 只在前端注册的话，详情区认得出这种文件，
     列表里却还是「其他」，看着像「插件装上了但没反应」。 */
  kindsReady ??= registerPluginKinds().catch(() => []);
  await kindsReady;
  /* ⚠️ **按目录索引，不按项目名**（issue #20）：`p.name` 来自 `project.json`，
     **它不唯一** —— 首页确实会出现不同目录的同名项目。
     原来 `running.get(p.name)` 命中之后原样返回**另一个项目**的服务：
     用户看到的、编辑的、让 AI 改的都是第一个项目的文件，而界面标题写的是第二个。
     改动落在错的项目上，而且界面一句话都不说。 */
  const cur = running.get(keyOf(p.dir));
  if (cur) return info(p.name, cur);

  const rec: Running = { server: null as unknown as Server, port: 0, dir: p.dir,
    startedAt: new Date().toISOString(), hits: 0, token: newToken(), project: p, wss: null, watcher: null, unsubscribe: null };
  rec.server = makeServer(p.dir, () => { rec.hits++; },
    () => (rec.port ? { project: rec.project, token: rec.token, port: rec.port } : null));
  attachWs(rec);

  await new Promise<void>((res, rej) => {
    rec.server.on("error", (e: NodeJS.ErrnoException) => {
      rej(new ToolError(err(X.IO, p.rel, { kind: "key", name: String(wantPort ?? 0) },
        e.code === "EADDRINUSE" ? `端口 ${wantPort} 被占用` : `静态服务起不来：${e.message}`,
        { fix: e.code === "EADDRINUSE" ? "换一个端口，或不传 port 让系统分配" : undefined })));
    });
    rec.server.listen(wantPort ?? 0, "127.0.0.1", () => {
      const a = rec.server.address();
      if (a && typeof a === "object") { rec.port = a.port; res(); }
      else rej(new Error("拿不到端口"));
    });
  });

  /* MCP 进程的生命由客户端的 stdio 决定，静态服务不该挡住它退出 —— 所以 unref。
     ⚠️ 但**前台用法正好相反**：`npm run ui` 里这个服务就是唯一的存活理由，
     unref 之后进程打印完地址就退了，只留一个没人监听的 URL。
     实测踩到（curl 全 000），所以补了下面这个 serveHold()。 */
  rec.server.unref();
  running.set(keyOf(p.dir), rec);
  return info(p.name, rec);
}

/** 前台用法：把服务重新 ref 回来，让它撑住进程。
 *  只有 `ui` 这类自己就是服务的入口才调它 —— MCP 不调。 */
/** ⚠️ 参数是**项目目录**，不是项目名（issue #20）。 */
export function serveHold(dir: string): boolean {
  const r = running.get(keyOf(dir));
  if (!r) return false;
  r.server.ref();
  return true;
}

/** hub（M9-2）：桌面壳的入口服务 —— 不属于任何项目，只托管 /__app/ 与全局路由（projects / open_project / …）。
 *  首页要在没打开项目时就能列项目，所以壳一起来就起它；项目各自的服务仍由 open_project 按需起。 */
const HUB_KEY = "__hub__";
export async function hubStart(wantPort?: number): Promise<{ url: string; port: number; token: string }> {
  const cur = running.get(HUB_KEY);
  if (cur) return { url: `http://127.0.0.1:${cur.port}/`, port: cur.port, token: cur.token };
  const rec: Running = { server: null as unknown as Server, port: 0, dir: "", startedAt: new Date().toISOString(), hits: 0, token: newToken(),
    project: null as unknown as Project, wss: null, watcher: null, unsubscribe: null };
  rec.server = makeServer(null, () => { rec.hits++; }, () => (rec.port ? { project: null, token: rec.token, port: rec.port } : null));
  attachWs(rec, true);
  await new Promise<void>((res, rej) => {
    rec.server.on("error", (e) => rej(e));
    rec.server.listen(wantPort ?? 0, "127.0.0.1", () => { const a = rec.server.address(); if (a && typeof a === "object") { rec.port = a.port; res(); } else rej(new Error("拿不到端口")); });
  });
  rec.server.unref();
  running.set(HUB_KEY, rec);
  return { url: `http://127.0.0.1:${rec.port}/`, port: rec.port, token: rec.token };
}

/** ⚠️ 参数是**项目目录**，不是项目名（issue #20）——
 *  按名字停会停掉另一个同名项目的服务，那个项目的窗口随即断连。 */
export function serveStop(dir: string): { stopped: boolean } {
  const key = keyOf(dir);
  const r = running.get(key);
  if (!r) return { stopped: false };
  r.unsubscribe?.(); r.watcher?.close(); r.wss?.close();
  r.server.close();
  running.delete(key);
  return { stopped: true };
}

/** 这个项目当前的服务信息（没起就是 null）—— build_index 要拿令牌注入壳页面 */
/** ⚠️ 参数是**项目目录**，不是项目名（issue #20）。 */
export function serveOf(dir: string): ServeInfo | null {
  const r = running.get(keyOf(dir));
  return r ? info(r.project?.name ?? "(hub)", r) : null;
}

export function serveStatus(): ServeInfo[] {
  /* 键现在是目录，而对外报的仍是项目名 —— 名字从那条服务自己记着的 `project` 取
     （hub 没有项目，写 `(hub)`）。 */
  return [...running.values()].map((r) => info(r.project?.name ?? "(hub)", r));
}

/* ── WebSocket（M7-4）：/__ud/ws?token=<令牌>。令牌与 Origin 的门槛和 HTTP 一样。
   连接上先回 hello；之后把事件总线里属于本项目（或全局）的事件原样推过去；
   同时监听项目目录，磁盘上文件变了（外部编辑器、git checkout）推一条 fs。 ── */
function attachWs(rec: Running, hub = false): void {
  const wss = new WebSocketServer({ noServer: true });
  rec.wss = wss;
  rec.server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${rec.port}`);
    const o = req.headers.origin;
    const originOk = !o || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o) || o === "null";
    if (url.pathname !== API_PREFIX + "ws" || url.searchParams.get("token") !== rec.token || !originOk) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "hello", projectDir: hub ? null : rec.dir, payload: { project: hub ? null : rec.project.name, port: rec.port }, at: new Date().toISOString() }));
  });
  rec.unsubscribe = subscribe((e) => {
    if (!hub && e.projectDir && e.projectDir !== rec.dir) return;   // hub 收全部事件（首页要知道哪个项目动了）
    const line = JSON.stringify(e);
    for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(line);
  });
  if (hub) return;
  // 磁盘监听：只报稿与文档一类，工具自己的产物（.umbrastudio/、快照）不报；200ms 合并一次
  try {
    let pending = new Set<string>(); let timer: NodeJS.Timeout | null = null;
    rec.watcher = watch(rec.dir, { recursive: true }, (_ev, name) => {
      if (!name) return;
      const rel = String(name).split(sep).join("/");
      if (rel.startsWith(".") || rel.includes("/.") || rel.includes("node_modules")) return;
      /* ⚠️ **问类型表，不要在这里硬写扩展名**（M11-5 修）。
         原来这里是一串写死的后缀，和 `shared/kinds.ts` 是同一件知识的两份拷贝 ——
         `.csv` / `.ts` / `.py` / `.txt` 都不在那串里，于是**在别的编辑器里改了它们，
         目录树永远不刷新**。这个缺陷今天之前就是真的，只是没人踩到。

         插件会把它从「少数格式不刷」放大成「**买来的格式永远不刷**」：
         用户装了视频插件，在别处改了视频，应用毫无反应。
         （`CLAUDE.md` 记着「硬编码名单过时」在通道 A / B 上各犯过一次，这是第三次。）

         判据换成「**这是不是一种我们认得的文件**」—— 内置和插件加的都自动算数。 */
      /* ⚠️ **不按类型过滤**（M11-6 修）。M11-5 把这里从「一串硬编码扩展名」改成了
         `kindOf(rel) !== "other"`，修掉了「别的编辑器改 .ts 树不刷新」那条真缺陷。
         但那个判据**选错了维度**：「认不认得这种文件」决定的是**怎么显示**，
         不该决定**要不要告诉界面它出现了**。
         症状：新建一个 `.mp4`（落到 other），目录树不刷新 —— 而用户明明刚建了它。

         现在只滤工具自己的产物（上面那一行），别的一律报。
         代价是二进制大文件改动也会发事件 —— 200ms 已经合并过一次，不心疼。 */
      pending.add(rel);
      if (!timer) timer = setTimeout(() => { const changes = [...pending]; pending = new Set(); timer = null; emit("fs", rec.dir, { changes }); }, 200);
    });
    rec.watcher.unref?.();
  } catch { rec.watcher = null; /* 平台不支持 recursive 就不监听，事件其它三种照推 */ }
}
