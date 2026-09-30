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

/* 位置感知 JSON 解析（M10-4）。**和插件一起发**，不走 `/__shared/` ——
   那里只放「多个插件都要」的大依赖，这一份是这个插件自己的逻辑，才几 KB。 */
import { parseWithPos, prettyPath, nodeAt } from "./jsonpos.mjs";

const el = (id) => document.getElementById(id);

/** 改过的行的装饰集。**放 StateField 而不是每次重建 view** ——
 *  重建会丢掉光标、选区和撤销栈，而用户正在打字。 */
let changedField = null, setChangedEffect = null;
/** 差异标记（看旧版时）。**和 `changedField` 分开** ——
 *  那个是「我改了还没落盘」（warn 色），这个是「这一版和当前不一样」（err / ok 色）。
 *  合成一个的话两种语义会互相覆盖，而**用户分不出「我改的」和「别人改的」是最坏的一种混淆**。
 *
 *  ⚠️ **标签不用 widget**：共享库没导出 `WidgetType`（查过，不是猜的 ——
 *  直接 `extends cm.WidgetType` 会抛 `Class extends value undefined`）。
 *  改成行装饰带 `data-diff` 属性、CSS `::after` 画出来，
 *  正好对上稿里「标签 `position:absolute; right:16px`」那一套，而且不用扩共享库的导出面。 */
let diffField = null, setDiffEffect = null;
function ensureDiffField(cm) {
  if (diffField) return;
  setDiffEffect = cm.StateEffect.define();
  diffField = cm.StateField.define({
    create: () => cm.RangeSet.empty,
    update(set, tr) {
      for (const e of tr.effects) {
        if (!e.is(setDiffEffect)) continue;
        const d = e.value;                       // null = 清空
        if (!d) return cm.RangeSet.empty;
        const b = new cm.RangeSetBuilder();
        /* RangeSetBuilder 要求按 from 升序 add，所以先把行号排好 */
        const lines = [...new Set([...d.changed.keys(), ...d.extra.keys()])].sort((x, y) => x - y);
        for (const n of lines) {
          if (n < 1 || n > tr.state.doc.lines) continue;
          const cls = [];
          const tags = [];
          if (d.changed.has(n)) {
            cls.push("ud-diff-changed");
            const now = d.changed.get(n);
            /* `errText` 在 = 这是「解析不了」那一档借用（S19 演示态 5），标签写原因；
               不在 = 看旧版的差异标红，标签写「当前是什么」。 */
            tags.push(d.errText ? d.errText : now == null ? "当前没有这一行" : `当前是 ${String(now).trim().slice(0, 44)}`);
          }
          if (d.extra.has(n)) {
            cls.push("ud-diff-extra");
            const x = d.extra.get(n);
            tags.push(`当前这之后多 ${x.n} 行：${String(x.first).trim().slice(0, 30)}`);
          }
          b.add(tr.state.doc.line(n).from, tr.state.doc.line(n).from,
            cm.Decoration.line({ class: cls.join(" "), attributes: { "data-diff": tags.join(" · ") } }));
        }
        return b.finish();
      }
      return set.map(tr.changes);
    },
    provide: (f) => cm.EditorView.decorations.from(f),
  });
}

/** 解析不了时，把出错那一行标出来并写一句原因（S19 演示态 5）。
 *
 *  ⚠️ **和差异标红共用 `diffField`** —— 它们不会同时出现：
 *  看旧版 / 看草稿时编辑器是只读的，那时用户改不出语法错；
 *  而解析不了只发生在当前档。共用一个 field 省掉一套状态，
 *  也省掉「两个 field 抢同一行」这种只在边角上出现的问题。 */
function markJsonError() {
  if (!view || !setDiffEffect) return;
  /* 看旧版 / 看草稿那两档由 `markDiff` 全权管 —— 那时编辑器只读，改不出语法错 */
  if (curVersion || draftPreview || !isJson()) return;
  /* ⚠️ **解析好了要把标记清掉。**
     第一版写的是「没错就 return」，理由写着「差异那边可能正用着」——
     可在当前档差异标红本来就是空的，于是上一次的红线**永远留着**：
     用户补好了逗号，红线还在，**他会以为自己没改对，回头再改一遍**。
     在当前档这个 field 归这里全权管：有错就标，没错就清。 */
  if (!jparsed || jparsed.ok) { view.dispatch({ effects: setDiffEffect.of(null) }); return; }
  const n = view.state.doc.lines;
  const line = Math.min(Math.max(1, jparsed.line || 1), n);
  const changed = new Map([[line, null]]);
  /* 借 `changed` 那一档的样式（err 底 + 左竖线 + 右侧标签），标签写原因 */
  view.dispatch({ effects: setDiffEffect.of({ changed, extra: new Map(), errText: jparsed.say }) });
}

/** 把差异推进编辑器。看当前版时清空。 */
function markDiff() {
  if (!view || !setDiffEffect) return;
  /* 两种情况要标差异：**看某个历史版本** 和 **看草稿**。
     两者问的是同一件事 ——「编辑区里这份和盘上那份差在哪」。 */
  const what = curVersion ? `在看 ${curVersion}` : draftPreview ? "在看草稿" : null;
  if (!what || !disk) { view.dispatch({ effects: setDiffEffect.of(null) }); return; }
  const d = diffVsCurrent(view.state.doc.toString(), disk.content);
  view.dispatch({ effects: setDiffEffect.of(d) });
  /* ⚠️ **算不出来要说出来**（行数超上限）。不说的话画面上一个标记都没有，
     而「没有差异」和「没算差异」长得一模一样 —— 后者会让人以为这一版和当前一样。 */
  el("roText").textContent = d ? `只读 · ${what}` : `只读 · ${what}（文件太大，差异没标）`;
}

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
function readOnlyReason(path, size, version, previewingDraft) {
  /* ⚠️ **看草稿差异时也一律只读**，理由和看历史版一样：
     编辑区里放的不是「当前这份文件」，让人改它得不出正确结果 ——
     改完算谁的？存回哪？按 ⌘S 会把草稿当成新内容盖掉盘上那份，
     而他以为自己在改的是「当前」。 */
  if (previewingDraft) return "在看草稿";
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
/* ════ JSON 的树档（M10-4，S19）════ */

/** 当前档：`"src"` 源码 · `"tree"` 树。**只有 `.json` 有树档。** */
let mode = "src";
/** 位置感知解析的结果（`jsonpos.mjs` 给的）。`null` = 还没解析 / 不是 json */
let jparsed = null;
/** 折叠起来的路径集合（存路径不存下标 —— 下标会随折叠变，路径不会） */
let jcollapsed = new Set();
/** 一次最多画多少个同级子项（S19 演示态 6）。
 *  ⚠️ **不是为了省内存，是为了不把树变成一条几万行的带子** ——
 *  一个 5000 项的数组全画出来，用户既滚不到底也找不到东西。 */
const PAGE = 100;
/** 哪些容器「再显示 100 项」点过几次：`路径 → 已放开到第几项` */
let jshown = new Map();
/** 树上选中的那一行 */
let jpick = null;

const isJson = () => /\.jsonc?$/i.test(curPath || "");

/** 这一行的祖先里有没有被折叠的。
 *  ⚠️ **按路径前缀判，不按行号** —— 行号会随展开收起变，而路径不会。 */
function jhidden(path) {
  if (jcollapsed.has("")) return path !== "";
  const segs = path.split(".");
  for (let i = 1; i <= segs.length - 1; i++) if (jcollapsed.has(segs.slice(0, i).join("."))) return true;
  return false;
}

const JVAL = {
  string: (v) => ({ cls: "jstr", text: JSON.stringify(v) }),
  number: (v) => ({ cls: "jnum", text: String(v) }),
  boolean: (v) => ({ cls: "jbool", text: String(v) }),
  null: () => ({ cls: "jnull", text: "null" }),
};

/** 从路径取值 —— 树上要显示叶子的值，而 `jsonpos` 只给位置不给值。 */
function jvalueAt(root, path) {
  if (!path) return root;
  let cur = root;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[Number(seg)] : cur[seg];
  }
  return cur;
}

/** 画树。**每次全画** —— 摊平之后行数就是可见行数，几百行的重建比维护增量差异便宜得多。 */
function renderTree() {
  const host = el("tree");
  if (!jparsed || !jparsed.ok) { host.textContent = ""; return; }
  const frag = document.createDocumentFragment();
  /* 每个容器只放开前 N 个子项 —— 超出的用一行「还有 M 项」代替。
     ⚠️ 判断「第几个子项」看的是**路径最后一段**（数组是下标，对象是键名）：
     数组才截（对象的键名不是数字，一个对象有几百个键也不该截 ——
     那时候用户要找的多半就是某个键名，截掉等于把它藏起来）。 */
  const limitOf = (parent) => jshown.get(parent) ?? PAGE;
  const cutAt = new Map();          // 父路径 → 这个父下面被截掉了几项
  for (const n of jparsed.nodes) {
    if (!n.path) continue;
    const i = n.path.lastIndexOf(".");
    const parent = i < 0 ? "" : n.path.slice(0, i);
    const last = i < 0 ? n.path : n.path.slice(i + 1);
    if (!/^\d+$/.test(last)) continue;                     // 只截数组
    if (Number(last) >= limitOf(parent)) cutAt.set(parent, (cutAt.get(parent) ?? 0) + 1);
  }
  const overLimit = (path) => {
    if (!path) return false;
    const i = path.lastIndexOf(".");
    const parent = i < 0 ? "" : path.slice(0, i);
    const last = i < 0 ? path : path.slice(i + 1);
    return /^\d+$/.test(last) && Number(last) >= limitOf(parent);
  };

  for (const n of jparsed.nodes) {
    if (jhidden(n.path)) continue;
    if (overLimit(n.path)) continue;
    const row = document.createElement("div");
    row.className = "jrow" + (jpick === n.path ? " on" : "");
    row.setAttribute("role", "treeitem");
    row.dataset.path = n.path;
    row.style.paddingLeft = (8 + n.depth * 16) + "px";
    const canToggle = (n.kind === "object" || n.kind === "array") && n.count > 0;
    row.setAttribute("aria-expanded", canToggle ? String(!jcollapsed.has(n.path)) : "false");

    const tw = document.createElement("span");
    tw.className = "jtw";
    if (canToggle) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "展开或收起");
      b.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4.5 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      b.querySelector("svg").style.transform = jcollapsed.has(n.path) ? "rotate(0deg)" : "rotate(90deg)";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (jcollapsed.has(n.path)) jcollapsed.delete(n.path); else jcollapsed.add(n.path);
        renderTree();
      });
      tw.appendChild(b);
    }
    row.appendChild(tw);

    const k = document.createElement("span");
    k.className = "jkey" + (n.kind === "object" || n.kind === "array" ? " obj" : "");
    k.textContent = n.path === "" ? "根" : n.key;
    row.appendChild(k);

    if (n.kind === "object" || n.kind === "array") {
      const sum = document.createElement("span");
      sum.className = "jsum";
      sum.textContent = n.count ? `${n.kind === "array" ? "[" : "{"} ${n.count} 项 ${n.kind === "array" ? "]" : "}"}` : (n.kind === "array" ? "[ ]" : "{ }");
      row.appendChild(sum);
    } else {
      const c = document.createElement("span");
      c.className = "jcolon"; c.textContent = ": ";
      row.appendChild(c);
      const v = JVAL[n.kind](jvalueAt(jparsed.value, n.path));
      const vs = document.createElement("span");
      vs.className = v.cls;
      /* 值太长就截 —— 一行几千字符会把树撑成横向滚动条 */
      vs.textContent = v.text.length > 120 ? v.text.slice(0, 117) + "…" : v.text;
      row.appendChild(vs);
    }

    /* 选中那一行才挂两颗钮（稿里就是这样，不是每行都挂） */
    if (jpick === n.path) {
      const act = document.createElement("span");
      act.className = "jact";
      const jump = document.createElement("button");
      jump.type = "button"; jump.className = "jjump";
      jump.innerHTML = "在源码里看 <em></em>";
      jump.querySelector("em").textContent = n.line === n.endLine ? `L${n.line}` : `L${n.line}–${n.endLine}`;
      jump.addEventListener("click", (e) => { e.stopPropagation(); jumpToNode(n); });
      const ai = document.createElement("button");
      ai.type = "button"; ai.className = "jai";
      ai.innerHTML = '<span>给 AI</span><kbd style="font:400 10px ui-monospace,monospace;opacity:.7">⌘L</kbd>';
      ai.addEventListener("click", (e) => { e.stopPropagation(); sendNode(n); });
      act.appendChild(jump); act.appendChild(ai);
      row.appendChild(act);
    }

    row.addEventListener("click", () => { jpick = n.path; renderTree(); paint(); });
    frag.appendChild(row);

    /* 这个容器被截了就在它最后一个可见子项之后补一行（S19 演示态 6） */
    const cut = cutAt.get(n.path);
    if (cut && !jcollapsed.has(n.path)) {
      const shown = limitOf(n.path);
      const more = document.createElement("div");
      more.className = "jrow jmore";
      more.style.paddingLeft = (8 + (n.depth + 1) * 16 + 18) + "px";
      const t = document.createElement("span");
      t.className = "jsum";
      t.textContent = `已显示 ${shown} 项，还有 ${cut} 项`;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "jjump"; btn.textContent = `再显示 ${Math.min(PAGE, cut)} 项`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        jshown.set(n.path, shown + PAGE);
        renderTree();
      });
      more.appendChild(t); more.appendChild(btn);
      frag.appendChild(more);
    }
  }
  host.textContent = "";
  host.appendChild(frag);
}

/** 跳到解析出错的那一行（S19 演示态 5：工具条上那颗点一下跳过去）。 */
function jumpToError() {
  if (!jparsed || jparsed.ok) return;
  setMode("src");
  if (!view) return;
  const n = view.state.doc.lines;
  const line = Math.min(Math.max(1, jparsed.line || 1), n);
  const l = view.state.doc.line(line);
  /* 光标落在报错的**列**上，不是行首 —— 报错列多半就是要改的那个字符 */
  const at = Math.min(l.from + Math.max(0, (jparsed.col || 1) - 1), l.to);
  view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
  view.focus();
}

/** 从树跳回源码并选中那个节点占的几行 —— 「在源码里看 L12–17」。 */
function jumpToNode(n) {
  setMode("src");
  if (!view) return;
  const from = Math.min(n.from, view.state.doc.length);
  const to = Math.min(n.to, view.state.doc.length);
  view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
  view.focus();
}

/** 把一个节点带进会话。**带的是它的原文**（`from`/`to` 切出来的那一段）。
 *  太长照第十二轮 html 那条收骨架 —— 一份 3 MB 的 JSON 整个塞进会话没有意义。 */
function sendNode(n) {
  if (!jparsed || !disk) return;
  const raw = disk.content.slice(n.from, n.to);
  const p = prettyPath(n.path);
  const body = raw.length > 4000
    ? `${raw.slice(0, 3800)}\n… 这一段共 ${raw.length} 字符，${n.count} 个子项（已截断）`
    : raw;
  umbra.pick(
    `json · ${(curPath || "").split("/").pop()} · ${p}`,
    `${curPath} ${p}（L${n.line}${n.endLine !== n.line ? `–${n.endLine}` : ""}）：\n\n\`\`\`json\n${body}\n\`\`\`\n`,
  );
}

/** 切档。**只有 `.json` 有树档**；解析不了的时候树钮是灰的（见 `paint`）。 */
function setMode(m) {
  if (m === "tree" && (!isJson() || !jparsed || !jparsed.ok)) return;
  mode = m;
  el("host").hidden = m !== "src";
  el("tree").hidden = m !== "tree";
  if (m === "tree") renderTree();
  paint();
}

/* ════ 草稿暂存（M10-2c，S18 演示态 11/12）════ */

/** 打开时查到的草稿（`null` = 没有）。存的是 `get_staged_draft` 的信封内容。 */
let draft = null;
/** 正在看草稿和盘上那份的差异（「看差异」那一档）。 */
let draftPreview = false;
let stageTimer = null;

/** 把编辑器里的内容暂存起来。**防抖** —— 每敲一个字都发一次请求没必要。
 *
 *  ⚠️ **看旧版时什么都不做。** 那时 `isDirty()` 恒为 false（编辑器里是历史版内容），
 *  如果照「不脏就清掉草稿」走，用户会这样丢数据：
 *  改了几行（有草稿）→ 去看旧版 → 防抖触发 → 清掉 → **草稿没了**。
 *  两条各自正确的规则叠起来会丢数据，所以这里必须**先问「现在算不算在编辑」**。 */
function scheduleStage() {
  if (stageTimer) clearTimeout(stageTimer);
  if (curVersion || draftPreview) return;      // 看旧版 / 看草稿差异：不碰暂存
  stageTimer = setTimeout(async () => {
    stageTimer = null;
    if (curVersion || draftPreview || !view || !disk) return;
    const now = view.state.doc.toString();
    if (now === disk.content) { await umbra.call("clear_staged_draft", { path: curPath }); return; }
    await umbra.call("stage_draft", { path: curPath, content: now });
  }, 800);
}

/** 画草稿横条。三种样子：可直接恢复 / 底稿变过 / 正在看差异。 */
function paintDraft() {
  const on = !!draft && draft.has;
  document.body.classList.toggle("hasdraft", on);
  el("draft").hidden = !on;
  if (!on) return;
  const stale = !!draft.stale;
  el("draft").classList.toggle("stale", stale && !draftPreview);
  const ago = timeAgo(draft.at);
  el("draftText").textContent = draftPreview
    ? "正在看草稿和盘上那份的差异"
    : stale
      ? `有一份${ago}没落盘的草稿。草稿是在 ${draft.baseVersion ?? "更早一版"} 上改的，盘上已经变成 ${draft.currentVersion ?? "新的一版"} 了`
      : `有一份${ago}没落盘的草稿`;
  const d = draft.delta;
  el("draftDelta").textContent = draftPreview ? "" : d ? `草稿比盘上 +${d.plus} −${d.minus} 行` : "";
  /* 按钮按档露出。⚠️ **`stale` 不给「恢复」** —— 直接恢复会静默盖掉别人的改动（设计侧的裁决） */
  el("draftDiscard").hidden = draftPreview;
  el("draftOverwrite").hidden = draftPreview || !stale;
  el("draftDiff").hidden = draftPreview || !stale;
  el("draftRestore").hidden = draftPreview || stale;
  el("draftBack").hidden = !draftPreview;
}

/** 多久以前。**只到分钟** —— 「2 小时前」和「2 小时 13 分前」对这个决定没区别。 */
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

/* ════ 看旧版时的差异标红（S18 演示态 9）════ */

/** 掐头去尾之后中间还这么多行就不算了。
 *  ⚠️ **这个上限比 `+N −M` 那个小**（4000 → 1200），因为这里要**回溯**而不只要长度：
 *  长度可以滚动一维（两行数组），回溯要整张表 —— 1200×1200 的 Int32 表约 5.8 MB，
 *  4000×4000 就是 64 MB，在一个 iframe 里申请那么大一块是不负责的。
 *  算不出来就说「差异太大没标」，**给不出标记比让页面卡住好**。 */
const DIFF_MAX = 1200;

/** 旧版和当前版的行级差异，**映射到旧版的行号上**（编辑器里显示的正是旧版）。
 *
 *  回两张表：
 *  - `changed`：旧版这一行在当前版里不一样。值 = 当前是什么（`null` = 当前没有这一行）
 *  - `extra`：当前版在旧版这一行**之后**多出了几行。值 = `{ n, first }`
 *
 *  ⚠️ **必须做真 LCS，不能按行比。** 上面 `changedLines` 那个按行比是给
 *  「我刚改的几行」用的（改动少、位置也对得上）；这里比的是两个版本，
 *  中间可能插入过一整个函数 —— 按行比会把插入点之后的**每一行**都标成改过，
 *  满屏红色，而实际只动了一处。**标多了不只是难看，是在说谎。**
 */
function diffVsCurrent(oldText, newText) {
  const a = oldText.split("\n"), b = newText.split("\n");
  /* 掐头去尾：两头相同的行先剥掉，中间那段常小一两个数量级 */
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  if (x.length > DIFF_MAX || y.length > DIFF_MAX) return null;

  const n = x.length, m = y.length, W = m + 1;
  const T = new Int32Array((n + 1) * W);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      T[i * W + j] = x[i - 1] === y[j - 1]
        ? T[(i - 1) * W + j - 1] + 1
        : Math.max(T[(i - 1) * W + j], T[i * W + j - 1]);
    }
  }
  /* 回溯成 keep / del / ins 的序列 */
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && x[i - 1] === y[j - 1]) { ops.push({ t: "keep", i: i - 1 }); i--; j--; }
    else if (j > 0 && (i === 0 || T[i * W + j - 1] >= T[(i - 1) * W + j])) { ops.push({ t: "ins", j: j - 1 }); j--; }
    else { ops.push({ t: "del", i: i - 1 }); i--; }
  }
  ops.reverse();

  const changed = new Map(), extra = new Map();
  /* 旧版行号（1-based）= head + 段内下标 + 1 */
  const lineOf = (k) => head + k + 1;
  let lastKeptLine = head;   // 最近一个"两版都有"的旧版行号；插入挂在它之后
  for (let k = 0; k < ops.length; ) {
    const op = ops[k];
    if (op.t === "keep") { lastKeptLine = lineOf(op.i); k++; continue; }
    /* 把相邻的一段 del 和一段 ins 配成「替换」—— 逐行配对，多出来的各自单列。
       不配对的话「改了一行」会报成「删一行 + 加一行」，而用户看到的是一行变了。 */
    const dels = [], inss = [];
    while (k < ops.length && ops[k].t === "del") dels.push(ops[k++].i);
    while (k < ops.length && ops[k].t === "ins") inss.push(ops[k++].j);
    const pair = Math.min(dels.length, inss.length);
    for (let q = 0; q < pair; q++) changed.set(lineOf(dels[q]), y[inss[q]]);
    /* 旧版有、当前没有 → 标红并说「当前没有这一行」 */
    for (let q = pair; q < dels.length; q++) changed.set(lineOf(dels[q]), null);
    /* 当前多出来的 → 挂在「这一段之前最后一个共有行」之后 */
    if (inss.length > pair) {
      const anchor = dels.length ? lineOf(dels[dels.length - 1]) : lastKeptLine;
      extra.set(anchor, { n: inss.length - pair, first: y[inss[pair]] ?? "" });
    }
    if (dels.length) lastKeptLine = lineOf(dels[dels.length - 1]);
  }
  return { changed, extra };
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
const isDirty = () => !curVersion && !draftPreview && !!disk && !!view && view.state.doc.toString() !== disk.content;

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
  /* ── JSON 的两样（S19）：源码 / 树 切档 · 光标路径 ──
     ⚠️ **切档放 `toolbar` 段而不是 `buttons`**：它是「用哪种方式看」的开关，
     不是一个动作。放 buttons 里的话它会和「选中行给 AI」并排，
     而那两件事的性质完全不同。
     ⚠️ 解析不了时树钮 `disabled` 并说出原因 —— **不是藏起来**：
     藏起来的话用户不知道这种文件本来有树，只会以为我们没做。 */
  const jbad = isJson() && jparsed && !jparsed.ok;
  const segs = isJson() ? [{
    label: "怎么看",
    items: [
      { label: "源码", active: mode === "src", title: "改、落盘、给 AI 都在这一档" },
      { label: "树", active: mode === "tree", disabled: !!jbad,
        title: jbad ? `解析不了，树画不出来。先改好 L${jparsed.line}` : "按结构看；树上只看和挑，不改值" },
    ],
  }] : [];
  /* 光标路径：源码档看光标，树档看选中那一行。**算不出来就不写** ——
     写一个「$」在那里会让人以为光标真在根上。 */
  let crumb = "";
  if (isJson() && jparsed && jparsed.ok) {
    if (mode === "tree" && jpick !== null) crumb = prettyPath(jpick);
    else if (mode === "src" && view) {
      const n = nodeAt(jparsed.nodes, view.state.selection.main.head);
      if (n) crumb = prettyPath(n.path);
    }
  }
  umbra.setChrome(
    {
      toolbar: segs,
      buttons: [
        /* 解析不了那一颗**要能点**（稿里点它跳到出错的地方）——
           所以放 `buttons` 而不是写进 `status`：status 是读数，点不动。 */
        ...(jbad ? [{ label: `解析不了 L${jparsed.line}:${jparsed.col}`, title: `${jparsed.say} · 点一下跳过去` }] : []),
        { label: "选中行给 AI", hint: "把选中的那几行连同行号带进会话" },
      ],
      /* ⚠️ **读数是行数 + 大小，不是「未改过」。**
         `read_file` 不返回快照号，第一版我照抄 md 插件写了 `disk.snapshot ?? "未改过"` ——
         那会永远显示「未改过」，而文件可能改过一百次，我们只是不知道。
         **一个我们答不出来的问题，不该给一个看着像答案的答案**（§一一四 同一条：
         读数该由格式自己定，「多少字」对图片没意义，「改过没」对我们这一层没数据）。 */
      status: (curVersion
        ? `${(view?.state.doc.lines ?? 0)} 行 · 在看 ${curVersion}`
        : `${disk?.lines ?? "?"} 行 · ${fmtSize(disk?.size ?? 0)}`)
        + (ro && !curVersion ? ` · 只读（${roReason}）` : "") + (dirty ? " · 未落盘" : "")
        + (jbad ? ` · 解析不了 L${jparsed.line}:${jparsed.col}` : "")
        + (crumb ? ` · ${crumb}` : ""),
    },
    (kind, a, b) => {
      /* ⚠️ **下标会随「解析不了」那一颗的有无而移位** —— 写死 0 的话
         JSON 出错时点「选中行给 AI」会变成跳到出错行。按当下的按钮表算。 */
      const names = [...(jbad ? ["err"] : []), "ask"];
      if (kind === "button") {
        if (names[a] === "err") jumpToError();
        if (names[a] === "ask") askAboutSelection();
      }
      /* `seg` 回调给的是 (段下标, 项下标) —— 我们只有一段，所以只看第二个 */
      if (kind === "seg" && a === 0) setMode(b === 0 ? "src" : "tree");
    },
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
  if (stageTimer) { clearTimeout(stageTimer); stageTimer = null; }   // 别让防抖在落盘之后又存一份回去
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
  /* 落盘了，草稿的使命就结束了。⚠️ **要清** —— 不清的话下次打开还会弹
     「有一份没落盘的草稿」，而那份草稿的内容已经进盘了，
     用户看到的是一条**在说已经做完的事**的提示。 */
  await umbra.call("clear_staged_draft", { path: curPath });
  draft = null; paintDraft();
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
  if (opt.draftPreview && draft && draft.has) shown = draft.content;
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
  ensureDiffField(cm);
  /* 换文件就回到只读（解锁只对一个页签生效，S18 §一.4） */
  if (path !== curPath) unlocked = false;
  /* `read_file` 给的是 path / kind / size / updatedAt / **sha256** / content / lines
     —— 字段名去 `server/src/cap/files.ts` 查过，不是猜的（猜错的话 sha 对不上，
     每次落盘都会被写前校验拦住，而错误信息只说「校验不过」，很难想到是字段名）。 */
  disk = { content: r.data?.content ?? "", sha: r.data?.sha256 ?? "", lines: r.data?.lines ?? null, size: r.data?.size ?? 0 };
  curVersion = opt.version ?? null;
  draftPreview = !!opt.draftPreview;
  roReason = readOnlyReason(path, disk.size, curVersion, draftPreview);
  /* JSON：解析一次，树和光标路径都靠它。
     ⚠️ **换文件要把树的状态清掉** —— 折叠集和选中行是按路径存的，
     换了文件那些路径指的是别的东西了。 */
  const freshOpen = path !== curPath;
  if (freshOpen) { jcollapsed = new Set(); jpick = null; jshown = new Map(); mode = "src"; }
  opt = { ...opt, freshOpen };
  jparsed = /\.jsonc?$/i.test(path) ? parseWithPos(shown ?? disk.content) : null;
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
    /* ⚠️ **光标移动也要重画**（`selectionSet`）。
       原来只听 `docChanged` —— 那对横条读数够用，但 S19 的**光标路径**
       是跟着光标走的：不听选区变化的话它会一直停在上次打字的位置，
       **而那看起来就像它算错了**。
       改文档那一支照旧重算标记和暂存；只动光标那一支只重画读数（便宜）。 */
    cm.EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        /* ⚠️ JSON 边改边重新解析 —— 不重解的话「解析不了」那一行会**停在旧位置**，
           用户改好了它还红着，而那会让人以为自己没改对。
           几百 KB 的 JSON 解析一次是毫秒级，不值得为它上防抖。 */
        if (isJson()) { jparsed = parseWithPos(view.state.doc.toString()); if (mode === "tree") renderTree(); }
        paint(); markChanged(); scheduleStage(); markJsonError();
      }
      else if (u.selectionSet) paint();
    }),
    changedField,
    diffField,
    /* 改过的行：行底 warn-soft + 行号边一道 warn 竖线（S18 §一.1，和 S13 源码视图同一套）。
       ⚠️ 颜色走 CSS 变量并**带兜底值** —— 插件的 iframe 拿不到宿主的 token 表。 */
    cm.EditorView.theme({
      ".cm-line.ud-changed": {
        background: "var(--warn-soft, rgba(210, 140, 40, .10))",
        /* 左边那道竖线：贴在行的最左侧，和稿里「行号右边一道 2px warn 竖线」等价 */
        boxShadow: "inset 2px 0 0 var(--warn, #c8821e)",
      },
      /* ── 看旧版时的差异（S18 演示态 9）──
         `.cm-line` 默认是 static，标签要绝对定位，所以这一行必须先 relative。
         ⚠️ 只给**带差异的行**加 relative，不全局加 —— 全局改 `.cm-line` 的定位
         是在动 CodeMirror 的布局基座，出问题的地方会离这里很远。 */
      ".cm-line.ud-diff-changed, .cm-line.ud-diff-extra": { position: "relative" },
      /* 这一行在当前版里不一样：err 底 + 左侧一道 err 竖线 */
      ".cm-line.ud-diff-changed": {
        background: "var(--err-soft, rgba(190, 60, 60, .10))",
        boxShadow: "inset 2px 0 0 var(--err, #c0392b)",
      },
      /* 当前版在这一行之后多了几行：行底一道 ok 线（稿里 `inset 0 -2px 0 var(--tool-ok)`） */
      ".cm-line.ud-diff-extra": { boxShadow: "inset 0 -2px 0 var(--ok, #14795c)" },
      /* 两样都有的行：两道线都要（后面的规则会整体覆盖 boxShadow，所以显式写全） */
      ".cm-line.ud-diff-changed.ud-diff-extra": {
        boxShadow: "inset 2px 0 0 var(--err, #c0392b), inset 0 -2px 0 var(--ok, #14795c)",
      },
      /* 右侧那枚标签。`attr()` 只取得到纯文本，正好够 —— 稿里它也只有一行字。
         ⚠️ `pointer-events: none`：它盖在代码上，能点就会挡住选中。 */
      ".cm-line[data-diff]::after": {
        content: "attr(data-diff)",
        position: "absolute", right: "16px", top: "1px",
        font: "10px var(--mono, ui-monospace, monospace)",
        padding: "0 6px", height: "18px", lineHeight: "16px",
        borderRadius: "3px",
        border: "1px solid var(--err-border, rgba(190, 60, 60, .35))",
        background: "var(--panel, #fff)", color: "var(--err, #c0392b)",
        whiteSpace: "nowrap", pointerEvents: "none",
      },
      /* 只多出行、没改这一行时，标签跟着变成 ok 色 —— 颜色和那道线要一致，
         不然「绿线 + 红标签」会让人以为这一行也改过。 */
      ".cm-line.ud-diff-extra:not(.ud-diff-changed)[data-diff]::after": {
        border: "1px solid var(--ok-border, rgba(20, 121, 92, .35))",
        color: "var(--ok, #14795c)",
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
  /* ⚠️ 解析不了就回源码档并把树钮灰掉 —— 不回的话用户停在一个空白的树上，
     而「树是空的」和「这个文件没内容」长得一样。 */
  if (mode === "tree" && (!jparsed || !jparsed.ok)) mode = "src";
  /* 大文件**先给树**（S19 演示态 6）。理由是几 MB 的 JSON 铺成源码没法看 ——
     几万行里找一个键不如按结构点进去。**只在第一次打开时定**，
     之后用户切到源码就留在源码（切档是他的选择，不该每次重载又被拽回来）。 */
  if (opt.freshOpen && isJson() && jparsed && jparsed.ok && disk.size > 1024 * 1024) mode = "tree";
  el("host").hidden = mode !== "src";
  el("tree").hidden = mode !== "tree";
  if (mode === "tree") renderTree();

  paint();
  markDiff();   // 看旧版时把差异标出来；看当前版时它自己清空
  markJsonError();   // 解析不了：出错那一行标 err + 一句原因

  /* ⚠️ **只在「看当前版」时查草稿。** 看旧版 / 看草稿差异时编辑区放的不是当前内容，
     这时候弹一条「有一份没落盘的草稿」会让人不知道那条说的是哪一份。 */
  if (!opt.version && !opt.keepDraft) {
    draft = null;
    const q = await umbra.call("get_staged_draft", { path });
    if (q && q.ok && q.data && q.data.has) draft = q.data;
    paintDraft();
  } else if (opt.keepDraft) paintDraft();
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

/* ════ 草稿横条的四条出路 ════ */

/** 丢掉：清暂存、收横条。编辑器保持盘上那份 —— **不动内容**。 */
el("draftDiscard").addEventListener("click", async () => {
  await umbra.call("clear_staged_draft", { path: curPath });
  draft = null; paintDraft();
});

/** 恢复：草稿铺回编辑器，进「未落盘」，**不自动落盘**（设计侧的裁决）。
 *  ⚠️ **暂存不清掉** —— 铺回来之后如果用户又刷新一次，草稿还得在。
 *  它会被防抖继续维护（内容没变就是同一份）。 */
el("draftRestore").addEventListener("click", () => {
  if (!draft || !view) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: draft.content } });
  draft = null; paintDraft();
  paint(); markChanged();
  umbra.toast("草稿铺回来了", "还没落盘 —— 看一眼再按 ⌘S", "ok");
});

/** 用草稿覆盖（只在底稿变过时出现）：**它就是一次写** ——
 *  走 `write_file`，盘上那一版会先存成一版，覆盖错了还能退回来。 */
el("draftOverwrite").addEventListener("click", async () => {
  if (!draft || busy) return;
  busy = true; paint();
  const r = await umbra.call("write_file", { path: curPath, content: draft.content, expectSha256: disk.sha });
  busy = false;
  if (!r || !r.ok) {
    const e = (r && r.errors && r.errors[0]) || {};
    umbra.toast("没覆盖成", e.fix || e.message || "宿主没给出原因", "error");
    paint();
    return;
  }
  await umbra.call("clear_staged_draft", { path: curPath });
  draft = null;
  umbra.toast("已用草稿覆盖 · 快照 " + r.data.snapshot,
    r.data.previous ? `覆盖前那一版是 ${r.data.previous}，可以退回` : undefined, "ok");
  await load(curPath, document.documentElement.dataset.theme, {});
});

/** 看差异（只在底稿变过时出现）。
 *
 *  ⚠️ **这一处偏离了设计侧的形制，理由要说清。**
 *  它写的是「看差异 → 进 S6 版本对比」，但 **S6 是 `.dc.html` 的语义对比**
 *  （比的是节点和属性），代码文件没有那套语义，进去什么都看不到。
 *  所以改成**复用「看那一版」那一套**：把草稿铺进编辑区、只读、
 *  和盘上那份的差异逐行标出来，Esc / 「回到盘上那份」退出。
 *  收获是用户不用学第二套东西 —— 他刚在版本历史里学过这一模一样的动作。 */
el("draftDiff").addEventListener("click", async () => {
  if (!draft || !view) return;
  /* ⚠️ **走 `load` 而不是 `dispatch` 铺内容。**
     第一版我直接 dispatch 把草稿塞进编辑器 —— 内容对了，但**编辑器还是可改的**，
     于是用户能改这份草稿预览，而 `isDirty` 会说「未落盘」，按 ⌘S 会把草稿
     当成新内容盖掉盘上那份 —— 他以为自己在改的是「当前」。
     只读是建 state 时定的，所以必须重新 load。这一来它和「看旧版」完全同构。 */
  await load(curPath, document.documentElement.dataset.theme, { draftPreview: true, keepDraft: true });
  paintDraft();
});

/** 从「看差异」回来：重新读盘上那份，草稿横条回到原来那一档。 */
el("draftBack").addEventListener("click", async () => {
  await load(curPath, document.documentElement.dataset.theme, { keepDraft: true });
  paintDraft();
});
/* Esc 也退出「看差异」—— 和看旧版那一档同一个键，用户只学一次。
   ⚠️ 挂在这个 document 上：焦点就在编辑器里，而键盘事件不跨 iframe（§八十一）。 */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && draftPreview) {
    e.preventDefault();
    el("draftBack").click();
  }
});
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
