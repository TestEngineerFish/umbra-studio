/** 代码与文本的正文面（M10-2）。
 *
 *  **第一版只做「看」**：语法高亮 + 行号 + 选中行给 AI。改字面量那部分等形制定了再说。
 *  ⚠️ 清单里声明的是 `files: ["read"]` —— **能力只要到用得着的那一档**，
 *  将来真要改再加 write，那时权限提示也会照实变。
 *
 *  CodeMirror 从**宿主共享库**来（`/__shared/codemirror.js`），不打进这个包：
 *  插件的 CSP 是 `script-src 'self'`，而 `'self'` 匹配 scheme+host+port 不是路径
 *  （`00` §一一七，`uitest` 有判据钉着）。每个插件各打一份的话，
 *  用户装三个编辑器就下三份 900 KB。
 */
const CM = "/__shared/codemirror.js";

const el = (id) => document.getElementById(id);
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

/** 把当前选中的那几行带进会话。**带上文件名和行号** ——
 *  只发一段裸代码的话，AI 不知道它是哪个文件的第几行，改起来只能靠猜。 */
function askAboutSelection() {
  if (!view) return;
  const s = view.state.selection.main;
  const doc = view.state.doc;
  if (s.empty) { umbra.toast("先选中几行", "选中之后再按这颗钮", "warn"); return; }
  const from = doc.lineAt(s.from).number, to = doc.lineAt(s.to).number;
  const text = doc.sliceString(s.from, s.to);
  umbra.ask(`${curPath} 第 ${from}–${to} 行：\n\n\`\`\`\n${text}\n\`\`\`\n\n`);
  umbra.toast("已带进会话", `${curPath} 第 ${from}–${to} 行`, "ok");
}

/** chrome 全量覆盖（不是增量）——「这次没给 buttons」会被理解成「保持上次的」，
 *  切档之后旧钮还在是最难查的那种错。 */
function pushChrome() {
  umbra.setChrome(
    { buttons: [{ label: "选中行给 AI", hint: "把选中的那几行连同行号带进会话" }] },
    (kind, a) => { if (kind === "button" && a === 0) askAboutSelection(); },
  );
}

async function load(path, theme) {
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
  const lang = langFor(path, cm);
  const exts = [
    cm.lineNumbers(), cm.highlightActiveLine(), cm.highlightActiveLineGutter(),
    cm.drawSelection(), cm.rectangularSelection(), cm.crosshairCursor(),
    cm.syntaxHighlighting(cm.defaultHighlightStyle),
    cm.keymap.of([...cm.defaultKeymap, ...cm.searchKeymap]),
    cm.highlightSelectionMatches(),
    /* **只读**：第一版只做看。`EditorView.editable` 关掉编辑但**保留选中**，
       而 `EditorState.readOnly` 也一样 —— 两个都给，因为有些扩展只看其中一个。 */
    cm.EditorView.editable.of(false),
    cm.EditorState.readOnly.of(true),
  ];
  if (lang) exts.push(lang);

  if (view) view.destroy();
  view = new cm.EditorView({
    parent: el("host"),
    state: cm.EditorState.create({ doc: r.data?.content ?? "", extensions: exts }),
  });
  curPath = path;
  pushChrome();
}

umbra.onContext((ctx) => { if (ctx.path) void load(ctx.path, ctx.theme); });
/* 盘上变了就重读 —— 插件自己发现不了（没有文件系统也没有事件流）。 */
umbra.onChanged((p) => { if (p === curPath) void load(curPath, document.documentElement.dataset.theme); });
