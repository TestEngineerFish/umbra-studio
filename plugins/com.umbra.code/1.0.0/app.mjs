/** 代码与文本的正文面（M10-2）。
 *
 *  **看 + 改都做**。⚠️ M10-2 条目原来写的是「改字面量」——
 *  那个说法是从 `.dc.html` 的语境来的（改 token 取值）。对 `.ts` / `.py` 这种文件
 *  **限制成只能改字面量没有意义**：用户在别的编辑器里想改哪就改哪，
 *  在我们这儿只能改字面量只会让他觉得这个视图是残的。所以做**自由编辑**，
 *  安全靠的是写入口那一层（`write_file` 带 sha 校验 + 快照 + 可回退），不是靠限制光标。
 *
 *  CodeMirror 从**宿主共享库**来（`/__shared/codemirror.js`），不打进这个包：
 *  插件的 CSP 是 `script-src 'self'`，而 `'self'` 匹配 scheme+host+port 不是路径
 *  （`00` §一一七，`uitest` 有判据钉着）。每个插件各打一份的话，
 *  用户装三个编辑器就下三份 900 KB。
 */
const CM = "/__shared/codemirror.js";

const el = (id) => document.getElementById(id);
const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fail = (title, body) => {
  el("err").hidden = false;
  el("err").innerHTML = `<b>${title}</b><br>${body}`;
  el("host").hidden = true;
};

/** 按扩展名挑语言。**挑不到就不高亮**，不猜 —— 猜错的高亮比没有高亮更碍眼
 *  （整段标成字符串色那种）。 */
function langFor(path, cm) {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const js = ["js", "mjs", "cjs", "jsx"], ts = ["ts", "tsx", "mts", "cts"];
  if (js.includes(ext)) return cm.javascript();
  if (ts.includes(ext)) return cm.javascript({ typescript: true, jsx: ext === "tsx" });
  if (ext === "py") return cm.python();
  if (ext === "json" || ext === "jsonc") return cm.json();
  if (ext === "css") return cm.css();
  if (ext === "html" || ext === "htm") return cm.html();
  if (ext === "md" || ext === "markdown") return cm.markdown();
  return null;
}

let view = null, cm = null, curPath = null;
/** 盘上那一版：内容 + sha + 快照号。**改动判定靠它** —— 不留这一份的话
 *  没法回答「改过没」，只能靠一个 boolean，而那个 boolean 在「改了又改回来」时是错的。 */
let disk = null;
let busy = false;

const isDirty = () => !!disk && !!view && view.state.doc.toString() !== disk.content;

/** 横条 + chrome 的读数。**一处算、两处用** —— 分开算迟早对不上。 */
function paint() {
  const dirty = isDirty();
  document.body.classList.toggle("dirty", dirty);
  el("dirty").hidden = !dirty;
  if (dirty) {
    const a = (disk.content.match(/\n/g) ?? []).length + 1;
    const b = (view.state.doc.toString().match(/\n/g) ?? []).length + 1;
    el("note").textContent = `还没落盘 · ${a} 行 → ${b} 行`;
  }
  el("save").disabled = busy;
  el("save").textContent = busy ? "正在落盘…" : "落盘 ⌘S";
  /* **归宿主管**：关页签要拦、退出要拦，那些都发生在插件的矩形之外 */
  umbra.setDirty(dirty);
  umbra.setChrome(
    {
      buttons: [{ label: "选中行给 AI", hint: "把选中的那几行连同行号带进会话" }],
      /* ⚠️ **读数是行数 + 大小，不是「未改过」。**
         `read_file` 不返回快照号，第一版我照抄 md 插件写了 `disk.snapshot ?? "未改过"` ——
         那会永远显示「未改过」，而文件可能改过一百次，我们只是不知道。
         **一个我们答不出来的问题，不该给一个看着像答案的答案**（§一一四 同一条：
         读数该由格式自己定，「多少字」对图片没意义，「改过没」对我们这一层没数据）。 */
      status: `${disk?.lines ?? "?"} 行 · ${fmtSize(disk?.size ?? 0)}` + (dirty ? " · 未落盘" : ""),
    },
    (kind, a) => { if (kind === "button" && a === 0) askAboutSelection(); },
  );
}

/** 把当前选中的那几行带进会话。**带上文件名和行号** ——
 *  只发一段裸代码的话，AI 不知道它是哪个文件的第几行，改起来只能靠猜。 */
function askAboutSelection() {
  if (!view) return;
  const s = view.state.selection.main;
  const doc = view.state.doc;
  if (s.empty) { umbra.toast("先选中几行", "选中之后再按这颗钮", "warn"); return; }
  const from = doc.lineAt(s.from).number, to = doc.lineAt(s.to).number;
  /* ⚠️ **挂药丸，不直接发**（设计侧第十二轮 §一.3）。
     第一版用的是 `umbra.ask`，那条路是 `chat.send` —— **当场就发给 AI 了**，
     而用户按 ⌘L 的那一刻**还没想好要问什么**。替他发出去是越权。
     药丸的形状照 `json.tsx` 那套（`range` · 文件名 › 范围）。 */
  umbra.pick(
    `${curPath.split("/").pop()} › L${from}–${to}`,
    `${curPath} 第 ${from}–${to} 行：\n\n\`\`\`\n${doc.sliceString(s.from, s.to)}\n\`\`\`\n`,
  );
}

/** 落盘。**带 `expectSha256`** —— 这是第二条写入口的核心：
 *  我们读到的那一版和盘上现在那一版不是同一份时，**它拒绝落盘**而不是覆盖。
 *  （AI 或别的编辑器在我们编辑期间改过它，就是这种情况。） */
async function save() {
  if (!isDirty() || busy) return;
  busy = true; paint();
  const r = await umbra.call("write_file", { path: curPath, content: view.state.doc.toString(), expectSha256: disk.sha });
  busy = false;
  if (!r || !r.ok) {
    const e = (r && r.errors && r.errors[0]) || {};
    /* ⚠️ 把 `fix` 优先显示出来 —— sha 不匹配那一条的 `fix` 写的是「先看一眼盘上那一版」，
       而 `message` 只说「校验不过」，后者对用户没用。 */
    umbra.toast("没落下去", e.fix || e.message || "宿主没给出原因", "error");
    paint();
    return;
  }
  umbra.toast("已落盘 · 快照 " + r.data.snapshot,
    r.data.previous ? `上一版 ${r.data.previous} 还在，可以退回` : undefined, "ok");
  /* 重读盘上那一版（拿到新 sha 与快照号）。**不能只把 disk.content 改成当前文本** ——
     写入口会做归一化，盘上那一版和我们发过去的未必逐字节相同，
     sha 也只有它能给。猜一个的话下一次落盘就会被 sha 拦住。 */
  await load(curPath, document.documentElement.dataset.theme, { keepCursor: true });
}

async function load(path, theme, opt = {}) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  if (!cm) {
    try { cm = await import(CM); }
    catch (e) {
      /* ⚠️ 说清是**共享库**没到，不是这个文件打不开 —— 两者的修法完全不同。 */
      fail("代码高亮没能加载", `宿主共享库取不到（${CM}）。<br>它随程序一起发，正常情况下一定在；如果你是从源码跑的，先 <code>npm --prefix app run build:shared</code>。<br><small>${String(e).slice(0, 120)}</small>`);
      return;
    }
  }
  const r = await umbra.call("read_file", { path });
  if (!r || !r.ok) {
    fail("读不出这个文件", (r && r.errors && r.errors[0] && r.errors[0].message) || "宿主没给出原因");
    return;
  }
  el("err").hidden = true; el("host").hidden = false;
  /* `read_file` 给的是 path / kind / size / updatedAt / **sha256** / content / lines
     —— 字段名去 `server/src/cap/files.ts` 查过，不是猜的（猜错的话 sha 对不上，
     每次落盘都会被写前校验拦住，而错误信息只说「校验不过」，很难想到是字段名）。 */
  disk = { content: r.data?.content ?? "", sha: r.data?.sha256 ?? "", lines: r.data?.lines ?? null, size: r.data?.size ?? 0 };
  const keep = opt.keepCursor && view ? view.state.selection.main.head : null;

  const lang = langFor(path, cm);
  const exts = [
    cm.lineNumbers(), cm.highlightActiveLine(), cm.highlightActiveLineGutter(),
    cm.drawSelection(), cm.rectangularSelection(), cm.crosshairCursor(),
    cm.syntaxHighlighting(cm.defaultHighlightStyle),
    cm.bracketMatching(), cm.closeBrackets(),
    cm.history(),
    /* ⚠️ `indentWithTab` 要排在 `defaultKeymap` **前面**：
       默认 keymap 里 Tab 是「插入缩进或移动焦点」，排后面会被前面那条吃掉。 */
    cm.keymap.of([cm.indentWithTab, ...cm.closeBracketsKeymap, ...cm.defaultKeymap, ...cm.historyKeymap, ...cm.searchKeymap]),
    cm.highlightSelectionMatches(),
    /* 每一次改动都重画横条与读数。**不用 debounce** —— 只是几个 DOM 文本，
       而延迟会让「改了一个字横条还没出来」这种半秒的不一致被看见。 */
    cm.EditorView.updateListener.of((u) => { if (u.docChanged) paint(); }),
  ];
  if (lang) exts.push(lang);

  if (view) view.destroy();
  view = new cm.EditorView({
    parent: el("host"),
    state: cm.EditorState.create({ doc: disk.content, extensions: exts }),
  });
  curPath = path;
  if (keep != null) {
    const max = view.state.doc.length;
    view.dispatch({ selection: { anchor: Math.min(keep, max) } });
  }
  paint();
}

el("save").addEventListener("click", () => void save());
/* 放弃 = 回到盘上那一版。**不问一句** —— 和 md 插件同口径：
   撤销栈还在（`cm.history()`），按 ⌘Z 就能拿回来，所以这一步不需要确认框。 */
el("discard").addEventListener("click", () => {
  if (!view || !disk) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: disk.content } });
  paint();
});
/* ⚠️ **⌘S 挂在 window 上而不是 CM 的 keymap 里**：CM 的 keymap 只在编辑器有焦点时生效，
   而用户可能刚点了横条上的钮再按 ⌘S。 */
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
});
/* ⚠️ **焦点不在插件里时，上面那个监听器收不到** —— 键盘事件不跨 iframe 边界。
   用户点了 `⋯` 看一眼读数再按 ⌘S 就是这种情况，改动看着像被无声丢掉了。
   宿主替我们转发（`Surface.tsx` 的 `onKey`），这里接住。 */
umbra.onKey((k) => { if (k.key === "s" && (k.meta || k.ctrl)) void save(); });
/* ⌘L：工作台的键，插件有话要说 —— 有选区就带上（`00` §121.3 · S18 §一.3）。
   ⚠️ **没选区时什么都不做，不要 toast**：那一下用户的意图是「聚焦输入框」，
   工作台已经在做了；这时候弹一句「先选中几行」是在怪他没做一件他没打算做的事。 */
umbra.onSendSelection(() => { if (view && !view.state.selection.main.empty) askAboutSelection(); });
/* ⚠️ **⌘L 也要在插件自己这边听一次**（2026-09-29 实测）：
   焦点在这个 iframe 里时，**工作台顶层的监听器收不到** —— 键盘事件不跨 iframe 边界。
   和 ⌘S 是同一条病、相反的方向：⌘S 是工作台转给插件，⌘L 是插件自己先收到。
   没选区时**什么都不做**，宿主那边照样会聚焦输入框（`pick` 不发就不挂药丸）。 */
window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "l") return;
  e.preventDefault();
  if (view && !view.state.selection.main.empty) askAboutSelection();
  else umbra.pick("", "");        // 空的 pick = 只聚焦，不挂药丸
});
/* ⚠️ **失焦不自动落盘**（这一条和 md 插件不同，是有意的）：
   `.md` 是文档，写到哪存到哪很自然；代码改一半失焦就落盘，
   会把一个语法不完整的中间状态写进快照历史。代码要显式 ⌘S。 */

umbra.onContext((ctx) => { if (ctx.path && ctx.path !== curPath) void load(ctx.path, ctx.theme); });
/* 盘上变了就重读 —— 插件自己发现不了（没有文件系统也没有事件流）。
   ⚠️ **有未落盘改动时不覆盖**：那会把用户正在改的东西冲掉。
   横条上提示一句，让他自己决定。 */
umbra.onChanged((p) => {
  if (p !== curPath) return;
  if (isDirty()) {
    umbra.toast("这个文件在别处被改过", "你这边还有没落盘的改动 —— 落盘会被拒（sha 对不上），先放弃或另存", "warn");
    return;
  }
  void load(curPath, document.documentElement.dataset.theme, { keepCursor: true });
});
