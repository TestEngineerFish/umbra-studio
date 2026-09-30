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

/** 改过的行的装饰集。**放 StateField 而不是每次重建 view** ——
 *  重建会丢掉光标、选区和撤销栈，而用户正在打字。 */
let changedField = null, setChangedEffect = null;
function ensureChangedField(cm) {
  if (changedField) return;
  setChangedEffect = cm.StateEffect.define();
  const lineDeco = cm.Decoration.line({ class: "ud-changed" });
  changedField = cm.StateField.define({
    create: () => cm.RangeSet.empty,
    update(set, tr) {
      for (const e of tr.effects) {
        if (!e.is(setChangedEffect)) continue;
        const b = new cm.RangeSetBuilder();
        for (const n of [...e.value].sort((x, y) => x - y)) {
          if (n <= tr.state.doc.lines) b.add(tr.state.doc.line(n).from, tr.state.doc.line(n).from, lineDeco);
        }
        return b.finish();
      }
      return set.map(tr.changes);
    },
    provide: (f) => cm.EditorView.decorations.from(f),
  });
}
/** 重算「哪几行改了」并推进编辑器。落盘之后 `disk` 换了新的，这里自然就空了。 */
function markChanged() {
  if (!view || !disk || !setChangedEffect) return;
  view.dispatch({ effects: setChangedEffect.of(changedLines(disk.content, view.state.doc.toString())) });
}
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
/** 现在在看哪一个历史版本（`null` = 看盘上当前那份）。M10-2b。
 *
 *  ⚠️ **不是这个插件自己的状态** —— 它由宿主经 `ctx.version` 推进来。
 *  版本列表那一面归宿主画（词汇小、所有格式共用），
 *  而「把那一版画出来」归这里，因为只有这里知道代码该长什么样。 */
let curVersion = null;
/** 这个页签解锁过没（S18 §一.4）。**只对这一个页签生效** —— 换文件就回到只读。
 *  解锁是「这一次我要改它」，不是「以后都别拦我」。 */
let unlocked = false;
/** 只读的原因（`null` = 可改）。标签和那句「没改：…」共用一份，免得两处写得不一样。 */
let roReason = null;

/** 该不该只读。**按文件名和大小，不问内容**（S18 §一.4 给的名单）。
 *
 *  ⚠️ 这不是「保护」，是**省去一次误会**：这些文件改了也没用（下次生成就覆盖），
 *  而用户要花几秒才意识到这一点。所以只读下**照样能选中、复制、给 AI** ——
 *  只读不等于「这个文件与你无关」。 */
function readOnlyReason(path, size, version) {
  /* ⚠️ **看历史版本时一律只读，而且这一条要排在最前面。**
     让人改一份历史快照没有任何意义 —— 改了往哪写？写回去就把当前版覆盖了，
     而他以为自己在改「当前」。这不是保护，是**消除一个不可能有正确结果的操作**。
     原因写出版号，因为「只读」而不说为什么最容易被当成界面坏了。 */
  if (version) return `在看 ${version}`;
  const name = (path.split("/").pop() || "").toLowerCase();
  if (/\.lock$/.test(name)) return "锁文件";
  if (/-lock\.(json|yaml|yml)$/.test(name)) return "锁文件";
  if (/\.min\.[a-z0-9]+$/.test(name)) return "压缩产物";
  if (/(^|\/)dist\//.test(path.toLowerCase())) return "构建产物";
  if (size > 1024 * 1024) return "超过 1 MB";
  return null;
}

/** 哪几行和盘上那一版不一样。**按行比，不做真 diff** ——
 *  真 diff（LCS）能认出「插入一行」让后面的行号整体平移，而按行比会把后面全标成改过。
 *  但这里只是**视觉提示**，标多了不误导人（用户看得见自己改了什么），
 *  而引入一个 diff 实现要多几百行、多一份出错的地方。**够用就停。** */
function changedLines(before, now) {
  const a = before.split("\n"), b = now.split("\n");
  const out = new Set();
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) out.add(i + 1);
  return out;
}
/** 盘上那一版：内容 + sha + 快照号。**改动判定靠它** —— 不留这一份的话
 *  没法回答「改过没」，只能靠一个 boolean，而那个 boolean 在「改了又改回来」时是错的。 */
let disk = null;
let busy = false;

/* ⚠️ **看历史版时永远不脏。** 那时编辑器里的内容确实和盘上不一样，
   但那不是「我改了没落盘」，而是「我在看以前那一版」——
   不加这一条的话横条会写「还没落盘 · 13 行 → 9 行」，
   而**那句话会让人以为自己的改动还在，其实一个字都没改过**。
   顺带也就不会拦关页签了（那张卡问的是「这些改动不要了吗」，这里没有改动）。 */
const isDirty = () => !curVersion && !!disk && !!view && view.state.doc.toString() !== disk.content;

/** 横条 + chrome 的读数。**一处算、两处用** —— 分开算迟早对不上。 */
function paint() {
  const dirty = isDirty();
  const ro = !!roReason && !unlocked;
  document.body.classList.toggle("dirty", dirty);
  document.body.classList.toggle("ro", ro);
  el("dirty").hidden = !dirty;
  el("ro").hidden = !ro;
  if (ro) el("roText").textContent = `只读 · ${roReason}`;
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
      status: (curVersion
        ? `${(view?.state.doc.lines ?? 0)} 行 · 在看 ${curVersion}`
        : `${disk?.lines ?? "?"} 行 · ${fmtSize(disk?.size ?? 0)}`)
        + (ro && !curVersion ? ` · 只读（${roReason}）` : "") + (dirty ? " · 未落盘" : ""),
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
  await load(curPath, document.documentElement.dataset.theme, { keepCursor: true, version: curVersion });
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
  /* 看当前版走 `read_file`，看历史版走 `read_file_version`。
     ⚠️ 两条路都要读**当前版**：历史版要和当前比（差异标红），
     而落盘要用当前版的 sha 做写前校验。所以先读当前，再按需读历史。 */
  const r = await umbra.call("read_file", { path });
  if (!r || !r.ok) {
    fail("读不出这个文件", (r && r.errors && r.errors[0] && r.errors[0].message) || "宿主没给出原因");
    return;
  }
  let shown = null;
  if (opt.version) {
    const v = await umbra.call("read_file_version", { path, version: opt.version });
    if (!v || !v.ok) {
      /* ⚠️ 读不出那一版**不能静默回到当前版** —— 那样用户以为自己在看 s5，
         其实看的是当前，而两者长得一样。说清楚，并让他回去。 */
      fail(`读不出 ${opt.version}`, (v && v.errors && v.errors[0] && v.errors[0].message) || "这一版的原文可能已经不在了。按 Esc 回到当前。");
      return;
    }
    shown = v.data?.content ?? "";
  }
  el("err").hidden = true; el("host").hidden = false;
  ensureChangedField(cm);
  /* 换文件就回到只读（解锁只对一个页签生效，S18 §一.4） */
  if (path !== curPath) unlocked = false;
  /* `read_file` 给的是 path / kind / size / updatedAt / **sha256** / content / lines
     —— 字段名去 `server/src/cap/files.ts` 查过，不是猜的（猜错的话 sha 对不上，
     每次落盘都会被写前校验拦住，而错误信息只说「校验不过」，很难想到是字段名）。 */
  disk = { content: r.data?.content ?? "", sha: r.data?.sha256 ?? "", lines: r.data?.lines ?? null, size: r.data?.size ?? 0 };
  curVersion = opt.version ?? null;
  roReason = readOnlyReason(path, disk.size, curVersion);
  roHinted = false; el("roHint").hidden = true;
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
    cm.EditorView.updateListener.of((u) => { if (u.docChanged) { paint(); markChanged(); } }),
    changedField,
    /* 改过的行：行底 warn-soft + 行号边一道 warn 竖线（S18 §一.1，和 S13 源码视图同一套）。
       ⚠️ 颜色走 CSS 变量并**带兜底值** —— 插件的 iframe 拿不到宿主的 token 表。 */
    cm.EditorView.theme({
      ".cm-line.ud-changed": {
        background: "var(--warn-soft, rgba(210, 140, 40, .10))",
        /* 左边那道竖线：贴在行的最左侧，和稿里「行号右边一道 2px warn 竖线」等价 */
        boxShadow: "inset 2px 0 0 var(--warn, #c8821e)",
      },
    }),
    /* ⚠️ **行号那道竖线不走 `gutterLineClass`**（2026-09-29 实测）。
       它要的是 `GutterMarker` 的 RangeSet，而 `changedField` 里装的是 `Decoration` ——
       类型不匹配时**整个 extension 静默失效**（连行底色那一半也跟着没了），
       而控制台一个字都不报。最小复现证明 `Decoration.line` 本身是好的：
       同样的 field 单独用，3 行里 1 行带上了 class。

       所以行号那道线改成用**同一个 class 的 CSS 兄弟选择器**画 ——
       `.cm-line.ud-changed` 已经有了，gutter 那一侧用 `:has()` 对不上（它们是并列容器）。
       退一步：**只画行底色 + 左边一道内阴影**，视觉上和稿里的「行号边竖线」等价，
       而少一个会静默失效的 API。 */
  ];
  if (lang) exts.push(lang);
  /* 只读：**只给 `readOnly`，不给 `editable.of(false)`**（2026-09-29 实测更正）。
     我第一版两个都给，注释还写着「有些扩展只看其中一个」——**那个判断是错的**：
     `editable.of(false)` 把 contentDOM 的 `contenteditable` 关掉，
     于是**连焦点都拿不到** → 选不中、复制不了、keydown 也收不到，
     而设计侧明确要「只读下照样能选中、复制、给 AI」（S18 §一.4）。
     `EditorState.readOnly` 只挡改动，选区、光标、键盘导航全都还在 —— 这才是这里要的。 */
  if (roReason && !unlocked) exts.push(cm.EditorState.readOnly.of(true));

  if (view) view.destroy();
  view = new cm.EditorView({
    parent: el("host"),
    /* 看历史版时编辑器里放的是**那一版**的原文；`disk.content` 仍然是当前版，
       留着给「和当前比」和落盘时的写前校验用。 */
    state: cm.EditorState.create({ doc: shown ?? disk.content, extensions: exts }),
  });
  curPath = path;
  if (keep != null) {
    const max = view.state.doc.length;
    view.dispatch({ selection: { anchor: Math.min(keep, max) } });
  }
  paint();
}

/** 解锁。**只对这一个页签** —— 换文件回到只读（`load` 里重置）。
 *  重建 view 是必要的：`editable` / `readOnly` 是建 state 时定的。
 *  ⚠️ **带上当前光标**，否则解锁之后光标跳回开头，用户要重新找位置。 */
function doUnlock() {
  unlocked = true;
  el("roHint").hidden = true;
  void load(curPath, document.documentElement.dataset.theme, { keepCursor: true, version: curVersion });
}
el("unlock").addEventListener("click", doUnlock);
el("unlock2").addEventListener("click", doUnlock);

/* 只读下按了字键：标签抖一下 + 光标下方说原因（S18 §一.4）。
   ⚠️ **只出第一次**：每按一个键弹一次会变成噪音，而他第一次就已经知道了。
   ⚠️ 判据是「这个键会不会改内容」——方向键、⌘C、Esc 都不算。 */
let roHinted = false;
el("host").addEventListener("keydown", (e) => {
  if (!roReason || unlocked) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;                    // ⌘C / ⌘A 这些照常
  if (e.key.length !== 1 && !["Enter", "Backspace", "Delete", "Tab"].includes(e.key)) return;
  const tag = el("roLabel");
  tag.classList.remove("nudge");
  void tag.offsetWidth;                                              // 重排一次，让动画能重放
  tag.classList.add("nudge");
  if (roHinted) return;
  roHinted = true;
  const h = el("roHint");
  el("roWhy").textContent = `没改：这份是${roReason}，只读`;
  /* 贴到光标那一行下面 —— 用 CM 报的坐标，不自己算行高 */
  const c = view && view.coordsAtPos(view.state.selection.main.head);
  const box = el("host").getBoundingClientRect();
  h.style.top = c ? `${c.bottom - box.top + 4}px` : "48px";
  h.hidden = false;
}, true);

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
/** Esc 回到当前版。**挂在这个 document 上**，因为焦点多半就在编辑器里，
 *  而键盘事件不跨 iframe —— 宿主那边也挂了一份，两边都要有（§八十一）。
 *  ⚠️ 只在**真的在看旧版**时才接管 Esc：不加这个判断的话，
 *  以后谁在编辑器里用 Esc 关个什么东西都会被我们吃掉。 */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && curVersion) { e.preventDefault(); umbra.viewVersion(null); }
});
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

umbra.onContext((ctx) => {
  /* ⚠️ **不能只看 path**。原来这里是 `ctx.path !== curPath`，
     于是宿主在版本列表里点一行（path 没变、version 变了）**什么都不会发生** ——
     标准的「点了没反应」。M10-2b 接线时当场撞上。 */
  const v = ctx.version ?? null;
  if (ctx.path && (ctx.path !== curPath || v !== curVersion)) {
    void load(ctx.path, ctx.theme, { version: v });
  }
});
/* 盘上变了就重读 —— 插件自己发现不了（没有文件系统也没有事件流）。
   ⚠️ **有未落盘改动时不覆盖**：那会把用户正在改的东西冲掉。
   横条上提示一句，让他自己决定。 */
umbra.onChanged((p) => {
  if (p !== curPath) return;
  if (isDirty()) {
    umbra.toast("这个文件在别处被改过", "你这边还有没落盘的改动 —— 落盘会被拒（sha 对不上），先放弃或另存", "warn");
    return;
  }
  void load(curPath, document.documentElement.dataset.theme, { keepCursor: true, version: curVersion });
});
