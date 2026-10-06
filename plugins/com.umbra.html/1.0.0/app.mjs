/** 非 dc 的 `.html` 预览 + 点选（M10-3，设计侧第十二轮 §二）。
 *
 *  **两层 iframe**：我们自己在插件的沙箱里，用户的页面在我们套的那一层里。
 *  ⚠️ 两层**不同源**（我们是不透明源，预览页是 `http://127.0.0.1:<port>`），
 *  所以点选做不到「我去读它的 DOM」——只能由**宿主往预览页注入的那段桥**发消息出来。
 *
 *  ⚠️ 这条路能走通，前提是宿主给插件开了 `frame-src`，而且**只开了 `/__preview/`**
 *  （不是 `'self'`）。给 `'self'` 的话插件就能嵌 `/__app/`，那是视觉欺骗的入口。
 */
/* ── 点选给 AI 的是**源码原文 + 行号**，不是活 DOM 的 outerHTML（issue #46，2026-10-06）──
 *
 *  原来发的是浏览器里那棵活 DOM 的 `outerHTML`，而它和盘上那份源码**不是同一段文字**：
 *  属性被浏览器规整过（引号、大小写、布尔属性、实体），脚本运行期改过的 DOM 也一起带上。
 *  于是 AI 拿到的那段**在文件里搜不到原文**，改回去只能靠猜。
 *  而且插件只知道一个选择器（`div:nth-of-type(2) > p`），**不知道它在第几行** ——
 *  所以做不出 `.json` / CSV 已经有的「在源码里看 L12–17」。
 *
 *  parse5 是**按 WHATWG 规范**建树的：`<tbody>` / `<html>/<head>/<body>` 这些
 *  **浏览器会补的隐式节点它也补**，所以两边的下标对得上。
 *  ⚠️ 这一点是选它而不是更轻的 htmlparser2 的全部理由 ——
 *  htmlparser2 不补这些，**表格类页面第一下就错位**（实测：`<table><tr>` 里
 *  parse5 补出了 `tbody`，而它没有源码位置）。 */
import { parse as parseHtml } from "./parse5.mjs";

const el = (id) => document.getElementById(id);
const fail = (t, b) => { el("err").hidden = false; el("err").innerHTML = `<b>${t}</b><br>${b}`; el("host").hidden = true; };

let curPath = null, picked = null, scope = "skeleton";
/** 盘上那份源码 + 它的 parse5 树（带源码位置）。`null` = 还没读到 */
let src = null, tree = null;
/** 这一次点中的元素在源码里的位置：`{ from, to, line, endLine, self }`。
 *  `null` = 对不上（脚本生成的、或隐式补出来的节点）。 */
let loc = null;

/** 按下标路径在 parse5 的树上走下去。
 *  ⚠️ 只数**元素**子节点 —— 桥那边数的是 `parentElement.children`（元素），
 *  而 parse5 的 `childNodes` 里有文本和注释。少过滤一步就整条错位。 */
function nodeAt(idx) {
  if (!tree || !Array.isArray(idx)) return null;
  let n = (tree.childNodes ?? []).find((c) => c.tagName === "html");
  for (const i of idx) {
    if (!n) return null;
    const kids = (n.childNodes ?? []).filter((c) => !!c.tagName);
    n = kids[i];
  }
  return n ?? null;
}

/** 把点中的元素对回源码。对不上就回 `null` —— **不猜**。 */
function locate(idx) {
  const n = nodeAt(idx);
  if (!n) return null;
  const L = n.sourceCodeLocation;
  /* ⚠️ **隐式节点没有源码位置**（`<table><tr>` 里 parse5 补出来的 `tbody` 就是这样）。
     那时 `L` 是 `null` —— 不能当成「对不上这整条路径」，但也**没有原文可切**。 */
  if (!L) return null;
  const st = L.startTag;
  return {
    from: L.startOffset, to: L.endOffset,
    line: L.startLine, endLine: L.endLine,
    self: st ? src.slice(st.startOffset, st.endOffset) : null,
    implicit: false,
  };
}

/** 「骨架」：这一层的开始标签 + 直接子元素，更深的收成一行（设计侧 §二.2）。
 *  ⚠️ **不是截断字符串**，是**按结构收** —— 截断会把标签切成半个，
 *  而 AI 拿到半个标签比拿到「12 个子元素」还难懂。 */
function skeleton(allHtml, selfHtml, kids) {
  if (allHtml.length <= 4096) return allHtml;
  const open = selfHtml.replace(/<\/[a-z-]+>$/i, "");
  const close = (selfHtml.match(/<\/[a-z-]+>$/i) ?? [""])[0];
  return `${open}\n  …${kids} 个子元素，共 ${(allHtml.length / 1024).toFixed(1)} KB（已收成骨架）\n${close}`;
}

function paint() {
  el("bar").hidden = !picked;
  if (!picked) return;
  /* ⚠️ **对上了就写行号，对不上就说原因** —— 不写的话「源码里没有这个元素」
     和「我们没去找」长得一模一样，而前者用户该知道（他点的是脚本生成的东西）。 */
  el("pill").textContent = picked.label + (loc ? `  L${loc.line}${loc.endLine > loc.line ? `–${loc.endLine}` : ""}` : "");
  el("pill").title = picked.path + (loc ? `\n源码 L${loc.line}–${loc.endLine}` : "\n源码里找不到它（脚本生成的，或解析时补出来的节点）");
  for (const b of el("scope").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.scope === scope);
  }
  /* 「整棵子树」时药丸后面写大小 —— 那一档可能很大，用户该看得见代价 */
  const size = scope === "all" ? ` · ${(picked.all.length / 1024).toFixed(1)} KB` : "";
  umbra.setChrome({
    status: picked
      ? `${picked.label}${size}` + (loc ? ` · 源码 L${loc.line}–${loc.endLine}` : " · 源码里没有它")
      : "",
    buttons: [],
  }, () => {});
}

/** 把选中的元素带进会话。**挂药丸不发送**（和代码插件同一条：用户还没想好要问什么）。 */
function send() {
  if (!picked) { umbra.pick("", ""); return; }
  /* ⚠️ **源码原文优先**（issue #46）：对得上就切盘上那份的原文，
     AI 拿到的那段**在文件里搜得到**，改回去不用猜。
     对不上才退回活 DOM 的 `outerHTML`，而且**明说一句**为什么 ——
     静默退回的话 AI 会拿着一段「文件里没有的 HTML」去改文件。 */
  const fromSrc = loc && src != null;
  const all = fromSrc ? src.slice(loc.from, loc.to) : picked.all;
  const self = fromSrc ? (loc.self ?? all) : picked.self;
  const body = scope === "self" ? self : scope === "all" ? all : skeleton(all, self, picked.kids);
  const where = fromSrc ? ` 第 ${loc.line}–${loc.endLine} 行` : "";
  umbra.pick(
    `${(curPath ?? "").split("/").pop()} › ${picked.label}${fromSrc ? ` › L${loc.line}–${loc.endLine}` : ""}`,
    `${curPath}${where} 里的 \`${picked.path}\`：\n\n\`\`\`html\n${body}\n\`\`\`\n`
      + (fromSrc
          ? ""
          : "\n⚠️ 这一段是**浏览器里那棵活 DOM** 的内容，不是文件里的原文"
            + "（这个元素是脚本生成的，或是解析时补出来的节点）—— 在文件里搜不到它，改之前先确认位置。\n")
      + (scope === "skeleton" && all.length > 4096 ? `\n（只带了骨架，完整的在 ${curPath} 里）\n` : ""),
  );
}

window.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.t !== "ud-pick") return;
  picked = m;
  loc = locate(m.idx);
  paint();
});

el("scope").addEventListener("click", (e) => {
  const s = e.target?.dataset?.scope;
  if (!s) return;
  scope = s;
  paint();
});
el("send").addEventListener("click", send);
/* ⌘L：焦点在我们这一层时自己收（键盘事件不跨 iframe，§121.4 同一条） */
window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "l") return;
  e.preventDefault(); send();
});
umbra.onSendSelection(send);

function load(path, theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  if (path === curPath) return;
  curPath = path;
  picked = null;
  paint();
  /* ⚠️ **走 `/__preview/` 这条专用路由**，不是 `read_file` 再塞进 srcdoc ——
     `srcdoc` 里的相对路径（它引的 css / 图片）解析不出来，页面会缺样式缺图。
     专用路由让它像正常网页一样被加载，相对路径自然就对了。 */
  /* 读一份源码并解析（issue #46）。⚠️ **读不到 / 解析不了不该挡住预览** ——
     那时点选照旧能用，只是给 AI 的退回活 DOM 并明说一句。 */
  src = null; tree = null; loc = null;
  void (async () => {
    try {
      const r = await umbra.call("read_file", { path });
      if (!r || !r.ok) return;
      src = String(r.data.content ?? "");
      tree = parseHtml(src, { sourceCodeLocationInfo: true });
    } catch { src = null; tree = null; }
  })();
  el("page").src = `/__preview/${path.split("/").map(encodeURIComponent).join("/")}`;
  el("err").hidden = true; el("host").hidden = false;
  umbra.setChrome({ status: "点一下页面里的元素，把它带给 AI", buttons: [] }, () => {});
}

umbra.onContext((ctx) => { if (ctx.path) load(ctx.path, ctx.theme); });
umbra.onChanged((p) => {
  if (p !== curPath) return;
  /* ⚠️ **源码也要重读**（issue #46）：只刷 iframe 的话 `src`/`tree` 还是旧的，
     于是行号指向**改之前**那一版 —— 而那种错比没有行号糟：
     它看着像个确切答案。 */
  void (async () => {
    try {
      const r = await umbra.call("read_file", { path: p });
      if (r && r.ok) { src = String(r.data.content ?? ""); tree = parseHtml(src, { sourceCodeLocationInfo: true }); }
    } catch { /* 读不到就保持原样，下面照旧刷预览 */ }
    loc = picked ? locate(picked.idx) : null;
    paint();
  })();
  const u = el("page").src; el("page").src = "about:blank"; setTimeout(() => { el("page").src = u; }, 30);
});
