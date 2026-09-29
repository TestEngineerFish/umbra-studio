/** 非 dc 的 `.html` 预览 + 点选（M10-3，设计侧第十二轮 §二）。
 *
 *  **两层 iframe**：我们自己在插件的沙箱里，用户的页面在我们套的那一层里。
 *  ⚠️ 两层**不同源**（我们是不透明源，预览页是 `http://127.0.0.1:<port>`），
 *  所以点选做不到「我去读它的 DOM」——只能由**宿主往预览页注入的那段桥**发消息出来。
 *
 *  ⚠️ 这条路能走通，前提是宿主给插件开了 `frame-src`，而且**只开了 `/__preview/`**
 *  （不是 `'self'`）。给 `'self'` 的话插件就能嵌 `/__app/`，那是视觉欺骗的入口。
 */
const el = (id) => document.getElementById(id);
const fail = (t, b) => { el("err").hidden = false; el("err").innerHTML = `<b>${t}</b><br>${b}`; el("host").hidden = true; };

let curPath = null, picked = null, scope = "skeleton";

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
  el("pill").textContent = picked.label;
  el("pill").title = picked.path;          // 完整选择器路径放悬停提示（设计侧 §二.1）
  for (const b of el("scope").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.scope === scope);
  }
  /* 「整棵子树」时药丸后面写大小 —— 那一档可能很大，用户该看得见代价 */
  const size = scope === "all" ? ` · ${(picked.all.length / 1024).toFixed(1)} KB` : "";
  umbra.setChrome({ status: picked ? `${picked.label}${size}` : "", buttons: [] }, () => {});
}

/** 把选中的元素带进会话。**挂药丸不发送**（和代码插件同一条：用户还没想好要问什么）。 */
function send() {
  if (!picked) { umbra.pick("", ""); return; }
  const body = scope === "self" ? picked.self : scope === "all" ? picked.all : skeleton(picked.all, picked.self, picked.kids);
  umbra.pick(
    `${(curPath ?? "").split("/").pop()} › ${picked.label}`,
    `${curPath} 里的 \`${picked.path}\`：\n\n\`\`\`html\n${body}\n\`\`\`\n`
      + (scope === "skeleton" && picked.all.length > 4096 ? `\n（只带了骨架，完整的在 ${curPath} 里）\n` : ""),
  );
}

window.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.t !== "ud-pick") return;
  picked = m;
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
  el("page").src = `/__preview/${path.split("/").map(encodeURIComponent).join("/")}`;
  el("err").hidden = true; el("host").hidden = false;
  umbra.setChrome({ status: "点一下页面里的元素，把它带给 AI", buttons: [] }, () => {});
}

umbra.onContext((ctx) => { if (ctx.path) load(ctx.path, ctx.theme); });
umbra.onChanged((p) => { if (p === curPath) { const s = el("page").src; el("page").src = "about:blank"; setTimeout(() => { el("page").src = s; }, 30); } });
