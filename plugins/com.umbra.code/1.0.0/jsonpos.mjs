/** 位置感知的 JSON 解析（M10-4，S19「在源码里看 L12–17」和「光标路径」的地基）。
 *
 *  ### 为什么要它
 *  `JSON.parse` **不给任何位置信息**。而 S19 要的两件事都离不开位置：
 *  - 树上点一行 → 「在源码里看 **L12–17**」
 *  - 源码里光标动 → 工具条上写出**光标所在的路径**
 *
 *  ### ⚠️ 分工：正确性归 `JSON.parse`，位置归这里
 *  自己写的解析器和 `JSON.parse` 的严格程度**不可能保证一致** ——
 *  它可能接受 `JSON.parse` 拒绝的东西（那样用户会看到「树画出来了但落盘时报错」），
 *  也可能反过来。所以：
 *  1. 先 `JSON.parse` 验一遍 —— **它是权威**，能不能解析以它为准
 *  2. 过了才走这里取位置
 *  3. 没过就走 `whereFailed`（那一份在 M8-14 踩过坑、调过三条路）
 *
 *  **不这么分的话，这个文件就成了第二个「什么是合法 JSON」的定义** ——
 *  而两个定义迟早会不一致，症状是「这里说没问题，那里说有问题」。
 */

/** 把连续空白折成一个空格，并记下折叠后每个字符的原始下标 —— 给 `whereFailed` 的第三条路用 */
function squeeze(text) {
  let flat = "", ws = false;
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { if (!ws) { flat += " "; map.push(i); ws = true; } continue; }
    ws = false; flat += c; map.push(i);
  }
  return { flat, map };
}

/** `JSON.parse` 失败在文件的哪一行。**从 `app/src/kinds/json.tsx` 原样搬过来**（M10-4）。
 *
 *  ⚠️ **不能只认 `position N`** —— 这是实测栽的一次（M8-14）：
 *  V8 报 `Unexpected token ']', ..." [1, 2, 3,] } " is not valid JSON`，
 *  整条消息里**一个数字都没有**，于是回退到「第 1 行第 1 列」，
 *  而真正的错在第 3 行。**报错位置指错地方比不报更坏** —— 人会照着去看那一行。
 *
 *  所以三条路依次试：
 *  ① 新引擎直接给 `line L column C`
 *  ② 老格式给字节偏移 `position N`
 *  ③ 两样都没有时，消息里带着出错处**周围的一段原文**。
 *     它被压掉了换行（`]\n}` 变成 `] }`），所以两边都把空白折平了再找。
 */
export function whereFailed(text, err) {
  const why = err instanceof Error ? err.message : String(err);
  const at = (i) => {
    const before = text.slice(0, i);
    const nl = before.lastIndexOf("\n");
    return { line: before.split("\n").length, col: i - nl, why };
  };
  const lc = /line (\d+) column (\d+)/.exec(why);
  if (lc) return { line: Number(lc[1]), col: Number(lc[2]), why };
  const pos = /position (\d+)/.exec(why);
  if (pos) return at(Number(pos[1]));
  const frag = /\.\.\."(.+?)"(?:\.\.\.)? is not valid JSON/s.exec(why) ?? /^(?:.*?)"(.+?)" is not valid JSON/s.exec(why);
  const piece = (frag?.[1] ?? "").trim();
  if (piece) {
    const { flat, map } = squeeze(text);
    const j = flat.indexOf(squeeze(piece).flat);
    if (j >= 0 && map[j] !== undefined) return at(map[j]);
  }
  return { line: 1, col: 1, why };
}

/** 把 `JSON.parse` 的英文消息说成人话（S19 演示态 5 要「下面一句原因」）。
 *
 *  ⚠️ **说不出就给原文，不编。** 稿里那句「这里少了一个逗号」是它举的例子 ——
 *  而我们只有 V8 给的消息，它并不总能推出那么具体的结论。
 *  猜错一个原因比给一句英文糟得多：**人会照着我们说的去改，改错地方再回来**，
 *  那时他连「是不是我理解错了」都判断不了。
 *
 *  所以：认得出的几种说人话，认不出的**原样给 V8 的消息**
 *  （有些用户看得懂，而且能拿去搜）。
 */
export function sayWhy(msg) {
  const m = String(msg);
  /* 位置那一段（`in JSON at position 13 (line 3 column 3)`）对人没用，先剥掉 ——
     行列我们已经单独给了，重复一遍只是噪声。 */
  const core = m.replace(/\s*in JSON at position \d+.*$/, "").replace(/\s*at position \d+.*$/, "").trim();
  if (/Expected ',' or '}'/.test(core)) return "上一个值后面少了逗号，或者这里该用 `}` 收尾";
  if (/Expected ',' or ']'/.test(core)) return "上一个值后面少了逗号，或者这里该用 `]` 收尾";
  if (/Expected property name or '}'/.test(core)) return "这里该是一个键名（要用双引号包起来），或者 `}`";
  if (/Expected double-quoted property name/.test(core)) return "键名要用双引号包起来（JSON 不认单引号）";
  if (/Unexpected non-whitespace character after JSON/.test(core)) return "JSON 已经结束了，后面还有多余的东西";
  if (/Unexpected end of JSON input/.test(core)) return "文件到这里就结束了 —— 有括号没闭上";
  if (/Unterminated string/.test(core)) return "字符串没有收尾的引号";
  if (/Bad escaped character|Bad control character/.test(core)) return "字符串里有不能直接写的字符（换行、制表符要写成 \\n \\t）";
  if (/Expected ':' after property name/.test(core)) return "键名后面少了冒号";
  const tok = /Unexpected token '?(.)'?/.exec(core);
  if (tok) return `这里多了一个 \`${tok[1]}\``;
  return core || m;
}

/** 每一行换行符的偏移，用来把偏移换成行号。二分查。 */
function lineIndex(text) {
  const nl = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") nl.push(i);
  return nl;
}
/** 偏移 → 1-based 行号 */
function lineAt(nl, off) {
  let lo = 0, hi = nl.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < off) lo = mid + 1; else hi = mid; }
  return lo + 1;
}

const WS = " \t\n\r";

/** 走一遍源码，记下每个值的起止偏移。
 *
 *  ⚠️ **只求位置，不求校验。** 走到看不懂的地方就抛 —— 但那时候
 *  `JSON.parse` 早就先报错了（调用方保证先验过），所以这里抛出来
 *  只可能是**我和 `JSON.parse` 不一致**，那是 bug 不是用户的错。
 *  抛出的消息里写清这一点，免得下一个人以为是用户的文件坏了。
 */
function scan(text) {
  let i = 0;
  const nodes = [];
  const fail = (why) => {
    throw new Error(`jsonpos 和 JSON.parse 不一致（${why} @${i}）—— 这是我们的 bug，不是文件的问题`);
  };
  const ws = () => { while (i < text.length && WS.includes(text[i])) i++; };

  /** 解析一个值，push 一条记录，返回它的记录 */
  const value = (key, path, depth) => {
    ws();
    const from = i;
    const c = text[i];
    let kind, count = 0;
    if (c === "{") {
      kind = "object";
      i++;
      const kids = [];
      ws();
      if (text[i] === "}") i++;
      else {
        for (;;) {
          ws();
          if (text[i] !== '"') fail("对象的键不是字符串");
          const k = str();
          ws();
          if (text[i] !== ":") fail("键后面没有冒号");
          i++;
          kids.push(value(k, path ? `${path}.${k}` : k, depth + 1));
          ws();
          if (text[i] === ",") { i++; continue; }
          if (text[i] === "}") { i++; break; }
          fail("对象里既不是逗号也不是右花括号");
        }
      }
      count = kids.length;
    } else if (c === "[") {
      kind = "array";
      i++;
      const kids = [];
      ws();
      if (text[i] === "]") i++;
      else {
        for (;;) {
          const k = String(kids.length);
          kids.push(value(k, path ? `${path}.${k}` : k, depth + 1));
          ws();
          if (text[i] === ",") { i++; continue; }
          if (text[i] === "]") { i++; break; }
          fail("数组里既不是逗号也不是右方括号");
        }
      }
      count = kids.length;
    } else if (c === '"') { kind = "string"; str(); }
    else if (text.startsWith("true", i)) { kind = "boolean"; i += 4; }
    else if (text.startsWith("false", i)) { kind = "boolean"; i += 5; }
    else if (text.startsWith("null", i)) { kind = "null"; i += 4; }
    else {
      kind = "number";
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) fail("既不是字面量也不是数字");
      i += m[0].length;
    }
    const rec = { key, path, depth, kind, count, from, to: i };
    /* ⚠️ **父节点要排在子节点前面**（树是按这个顺序画的），
       而递归是先算完子节点才回到这里 —— 所以按 `from` 排一次，不要按 push 顺序。
       不排的话对象的第一个子节点会跑到对象自己前面。 */
    nodes.push(rec);
    return rec;
  };

  /** 跳过一个字符串字面量（含转义），只挪 `i` */
  const str = () => {
    const start = i;
    i++;                                   // 开头的引号
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") { i += 2; continue; }   // 转义：连同下一个字符一起跳
      if (c === '"') { i++; return JSON.parse(text.slice(start, i)); }
      i++;
    }
    fail("字符串没有收尾的引号");
  };

  value("", "", 0);
  ws();
  if (i < text.length) fail("末尾还有多余的东西");
  /* 按起始偏移排 —— 父在子前，兄弟按出现顺序。深度相同的按 from，
     父子 from 相同时（不可能，父的 `{` 在子之前）不用管。 */
  nodes.sort((a, b) => a.from - b.from || a.depth - b.depth);
  return nodes;
}

/** 解析并给出每个节点的位置。
 *
 *  回 `{ ok: true, value, nodes }` 或 `{ ok: false, why }`。
 *  `nodes` 每项：`{ key, path, depth, kind, count, from, to, line, endLine }`（行号 1-based）。
 */
export function parseWithPos(text) {
  let value;
  try { value = JSON.parse(text); }
  catch (e) {
    /* ⚠️ **失败时要给出行列，不只是一句话。** S19 的「解析不了 L12:5」那枚标签
       点一下要跳到出错的地方 —— 没有行列就跳不了，而一句
       「Unexpected token」对用户等于没说。 */
    const w = whereFailed(text, e);
    return { ok: false, why: w.why, say: sayWhy(w.why), line: w.line, col: w.col };
  }
  const nl = lineIndex(text);
  let nodes;
  try { nodes = scan(text); }
  catch (e) {
    /* ⚠️ `JSON.parse` 过了而我们没走通 —— **这是我们的 bug**。
       不能因此让整个视图打不开：回一个空的位置表，树照样画得出来
       （树只需要 `JSON.parse` 的结果），少的只是行号。**降级，不是崩掉。** */
    return { ok: true, value, nodes: [], posBroken: e instanceof Error ? e.message : String(e) };
  }
  for (const n of nodes) { n.line = lineAt(nl, n.from); n.endLine = lineAt(nl, Math.max(n.from, n.to - 1)); }
  return { ok: true, value, nodes };
}

/** 偏移落在哪个节点里 —— 取**最深的那一个**（光标路径要的是最具体的那条）。
 *  没有任何节点包住它就回 `null`（比如光标在两个值之间的逗号上）。 */
export function nodeAt(nodes, off) {
  let best = null;
  for (const n of nodes) {
    if (off < n.from || off > n.to) continue;
    if (!best || n.depth > best.depth) best = n;
  }
  return best;
}

/** 路径写成给人看的样子：根是 `$`，数组下标用 `[i]`。
 *  `a.0.b` → `$.a[0].b` —— 这是 JSON Path 的通用写法，用户多半见过。 */
export function prettyPath(path) {
  if (!path) return "$";
  return "$" + path.split(".").map((seg) => (/^\d+$/.test(seg) ? `[${seg}]` : `.${seg}`)).join("");
}
