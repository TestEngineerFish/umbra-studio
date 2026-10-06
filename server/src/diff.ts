/** 语义 diff。doc/07
 *
 * 不 diff 文件，diff 语义 —— 对 inline-style HTML 做文本 diff 是没用的（07 §一）。
 * 分级的唯一目的是回答「要不要动代码」：
 *   L1 契约（必须改代码）· L2 取值（照抄新值）· L3 文案（改字符串）· L4 等价（无需处理）
 *
 * 节点配对不靠路径（07 §2.4）：路径在插入一个元素之后整段偏移，靠路径会把一次插入
 * 报成几十处变更。这里按 fp（内容指纹）序列做 LCS，剩下的用相似度贪心配对。
 */
import type { SnapNode, Snapshot } from "./snapshot.js";

export type Level = "L1" | "L2" | "L3" | "L4";

export interface Change {
  level: Level;
  kind: string;
  target: string;
  prop?: string;
  from?: string | null;
  to?: string | null;
  at?: string;
  message: string;
  /** L1 才有：对实现侧的影响 */
  impact?: string;
}

export interface DiffResult {
  file: string;
  from: string;
  to: string;
  counts: Record<Level, number>;
  changes: Change[];
  /** 跨版本合并时说明合了哪几版 */
  spans: string[];
}

const LEVEL_ORDER: Level[] = ["L1", "L2", "L3", "L4"];
const CALLABLE = /^on[A-Z]|Ref$/;
/* ⚠️ **写成转义序列，不要字面 NUL 字节**（2026-09-30）。
   原来这里是一个真 NUL，于是 `file` 把整份源码判成 `data`，
   而 ugrep / ripgrep 这类带「跳过二进制」的工具会整个跳掉这个文件 ——
   grep 它永远返回「什么都没有」而不是报错。**这是判据层面的缺陷，不是运行时的**。
   转义序列跑起来一模一样，而文件又是纯文本了。 */
const SEP = "\u0000";

const j = (v: unknown): string | null =>
  v === undefined || v === null ? null : typeof v === "string" ? v : JSON.stringify(v);

// ───────────────────────── 节点配对 ─────────────────────────

/** fp 序列的 LCS，返回匹配的下标对 */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length, m = b.length;
  if (!n || !m) return [];
  // 规模保护：超大稿退化成按 fp 首次出现顺序配对，避免 O(n·m) 把内存吃光
  if (n * m > 4_000_000) {
    const used = new Set<number>();
    const pos = new Map<string, number[]>();
    b.forEach((f, i) => { const l = pos.get(f) ?? []; l.push(i); pos.set(f, l); });
    const out: Array<[number, number]> = [];
    let lastJ = -1;
    for (let i = 0; i < n; i++) {
      const cand = (pos.get(a[i] as string) ?? []).find((x) => x > lastJ && !used.has(x));
      if (cand !== undefined) { used.add(cand); lastJ = cand; out.push([i, cand]); }
    }
    return out;
  }
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let k = m - 1; k >= 0; k--) {
      dp[i * w + k] = a[i] === b[k]
        ? (dp[(i + 1) * w + k + 1] as number) + 1
        : Math.max(dp[(i + 1) * w + k] as number, dp[i * w + k + 1] as number);
    }
  }
  const out: Array<[number, number]> = [];
  let i = 0, k = 0;
  while (i < n && k < m) {
    if (a[i] === b[k]) { out.push([i, k]); i++; k++; }
    else if ((dp[(i + 1) * w + k] as number) >= (dp[i * w + k + 1] as number)) i++;
    else k++;
  }
  return out;
}

function similarity(x: SnapNode, y: SnapNode): number {
  if (x.tag !== y.tag) return 0;
  const kx = Object.keys(x.style), ky = Object.keys(y.style);
  const inter = kx.filter((k) => k in y.style).length;
  const uni = new Set([...kx, ...ky]).size || 1;
  let s = 0.5 + 0.3 * (inter / uni);
  if ((x.text ?? "") === (y.text ?? "")) s += 0.1;
  if (x.holes.join(",") === y.holes.join(",")) s += 0.1;
  return s;
}

interface Pairing { pairs: Array<[SnapNode, SnapNode]>; added: SnapNode[]; removed: SnapNode[] }

function pairNodes(from: SnapNode[], to: SnapNode[]): Pairing {
  const matched = lcsPairs(from.map((n) => n.fp), to.map((n) => n.fp));
  const usedA = new Set(matched.map(([i]) => i));
  const usedB = new Set(matched.map(([, k]) => k));
  const pairs: Array<[SnapNode, SnapNode]> = matched.map(([i, k]) => [from[i] as SnapNode, to[k] as SnapNode]);

  // 剩下的按相似度贪心配对：fp 变了但明显是同一个节点（比如加了一条 style 声明）
  const restA = from.map((n, i) => [n, i] as const).filter(([, i]) => !usedA.has(i));
  const restB = to.map((n, k) => [n, k] as const).filter(([, k]) => !usedB.has(k));
  const takenB = new Set<number>();
  const added: SnapNode[] = [], removed: SnapNode[] = [];
  for (const [na] of restA) {
    let best = -1, bestScore = 0.72;   // 阈值：低于这个就认定不是同一个节点
    for (const [nb, k] of restB) {
      if (takenB.has(k)) continue;
      const s = similarity(na, nb);
      if (s > bestScore) { bestScore = s; best = k; }
    }
    if (best >= 0) { takenB.add(best); pairs.push([na, to[best] as SnapNode]); }
    else removed.push(na);
  }
  for (const [nb, k] of restB) if (!takenB.has(k)) added.push(nb);
  return { pairs, added, removed };
}

// ───────────────────────── 分级判定 ─────────────────────────

const LITERAL_ATTRS = new Set(["title", "placeholder", "aria-label", "alt", "value", "label"]);

/** 节点标签里的文字要截短，但**不能截在洞中间** ——
 *  实测清单里出现过 `<div>「子件 · {{ label 」`，读起来像源码写坏了（doc/00 §20.4）。
 *  先把洞整个换成它的名字，再截。 */
function shortLabel(text: string, n: number): string {
  const flat = text.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (_, k) => `⟨${String(k).trim()}⟩`).trim();
  return flat.length > n ? flat.slice(0, n) + "…" : flat;
}

export function diffSnapshots(a: Snapshot, b: Snapshot): DiffResult {
  const ch: Change[] = [];

  // 语义完全没变就直接短路 —— 省掉整套配对，也保证"没变"这件事是确定的
  if (a.semanticSha256 && a.semanticSha256 === b.semanticSha256) {
    if (a.sourceSha256 !== b.sourceSha256) {
      ch.push({ level: "L4", kind: "bytes_only", target: "整份", at: "-",
        message: "字节变了但语义快照完全相同（只动了空白或注释）" });
    }
    return { file: b.file, from: a.version, to: b.version, counts: countBy(ch), changes: ch, spans: [b.version] };
  }

  // ── L1 props ──
  const pa = a.props ?? {}, pb = b.props ?? {};
  for (const k of Object.keys(pb)) {
    if (k.startsWith("$")) continue;
    const oa = pa[k] as Record<string, unknown> | undefined;
    const ob = (pb[k] ?? {}) as Record<string, unknown>;
    if (!oa) {
      ch.push({ level: "L1", kind: "prop_added", target: k, to: j(ob.tsType), at: "props",
        message: `新增 props ${k}: ${ob.tsType ?? "?"}`,
        impact: CALLABLE.test(k) ? "实现侧需要接这个回调" : "实现侧需要传这个 prop" });
      continue;
    }
    if (j(oa.tsType) !== j(ob.tsType)) {
      ch.push({ level: "L1", kind: "prop_type_changed", target: k, prop: "tsType",
        from: j(oa.tsType), to: j(ob.tsType), at: "props",
        message: `props ${k} 的类型改了：${oa.tsType} → ${ob.tsType}`,
        impact: "实现侧的类型签名要跟着改" });
    }
    const wasNull = oa.editor === null, isNull = ob.editor === null;
    if (wasNull !== isNull) {
      ch.push({ level: "L1", kind: "prop_editor_changed", target: k, prop: "editor",
        from: j(oa.editor), to: j(ob.editor), at: "props",
        message: `props ${k} 从${wasNull ? "回调/节点变成可调项" : "可调项变成回调/节点"}`,
        impact: "这个 prop 的性质变了，接法不一样" });
    }
  }
  for (const k of Object.keys(pa)) {
    if (k.startsWith("$") || k in pb) continue;
    ch.push({ level: "L1", kind: "prop_removed", target: k,
      from: j((pa[k] as Record<string, unknown> | undefined)?.tsType), at: "props",
      message: `删掉了 props ${k}`, impact: "实现侧传了就是多余的，可以去掉" });
  }

  // ── L1 状态分支 ──
  const ba = new Map(a.branches.map((x) => [x.cond ?? "(无条件)", x.at]));
  const bb = new Map(b.branches.map((x) => [x.cond ?? "(无条件)", x.at]));
  for (const [cond, at] of bb) if (!ba.has(cond)) {
    ch.push({ level: "L1", kind: "branch_added", target: cond, at,
      message: `新增状态分支 ${cond}`, impact: "状态清单多了一种，空态与文案要跟着分叉" });
  }
  for (const [cond, at] of ba) if (!bb.has(cond)) {
    ch.push({ level: "L1", kind: "branch_removed", target: cond, at,
      message: `删掉状态分支 ${cond}`, impact: "这一态不再需要实现" });
  }

  // ── L1 事件 / ref 键 ──
  const va = new Set(a.valKeys), vb = new Set(b.valKeys);
  for (const k of vb) if (!va.has(k) && CALLABLE.test(k)) {
    ch.push({ level: "L1", kind: "callback_added", target: k, at: "renderVals",
      message: `新增事件/ref 键 ${k}`, impact: "实现侧需要接这个回调" });
  }
  for (const k of va) if (!vb.has(k) && CALLABLE.test(k)) {
    ch.push({ level: "L1", kind: "callback_removed", target: k, at: "renderVals",
      message: `删掉事件/ref 键 ${k}`, impact: "这个回调不再被调用" });
  }

  // ── L1 列表 ──
  const la = new Map(a.lists.map((x) => [x.list ?? "?", x]));
  const lb = new Map(b.lists.map((x) => [x.list ?? "?", x]));
  for (const [key, x] of lb) {
    const y = la.get(key);
    if (!y) {
      ch.push({ level: "L1", kind: "list_added", target: key, at: x.at,
        message: `新增列表 ${key}`, impact: "多了一处列表渲染" });
      continue;
    }
    if (y.as !== x.as) {
      ch.push({ level: "L1", kind: "list_alias_changed", target: key, prop: "as",
        from: y.as, to: x.as, at: x.at,
        message: `列表 ${key} 的别名 ${y.as} → ${x.as}`, impact: "循环体里的字段引用要跟着改" });
    }
  }
  for (const [key, x] of la) if (!lb.has(key)) {
    ch.push({ level: "L1", kind: "list_removed", target: key, at: x.at,
      message: `删掉列表 ${key}`, impact: "少了一处列表渲染" });
  }

  // ── L1 子组件引用 ──
  const ia = new Map(a.imports.map((x) => [x.name, x]));
  const ib = new Map(b.imports.map((x) => [x.name, x]));
  for (const [name, x] of ib) {
    const y = ia.get(name);
    if (!y) {
      ch.push({ level: "L1", kind: "import_added", target: name, at: x.at,
        message: `新引用子组件 ${name}`, impact: "多了一个组件依赖" });
      continue;
    }
    const addP = x.props.filter((k) => !y.props.includes(k));
    const delP = y.props.filter((k) => !x.props.includes(k));
    if (addP.length || delP.length) {
      ch.push({ level: "L1", kind: "import_props_changed", target: name, at: x.at,
        from: y.props.join(","), to: x.props.join(","),
        message: `传给 ${name} 的 props 变了${addP.length ? `，新增 ${addP.join("、")}` : ""}${delP.length ? `，去掉 ${delP.join("、")}` : ""}`,
        impact: "子组件的入参契约变了" });
    }
  }
  for (const [name, x] of ia) if (!ib.has(name)) {
    ch.push({ level: "L1", kind: "import_removed", target: name, at: x.at,
      message: `不再引用子组件 ${name}`, impact: "少了一个组件依赖" });
  }

  // ── L1 初始 state ──
  for (const k of Object.keys(b.state)) if (!(k in a.state)) {
    ch.push({ level: "L1", kind: "state_added", target: k, at: "state",
      message: `state 新增 ${k}`, impact: "多一个初始状态" });
  }
  for (const k of Object.keys(a.state)) if (!(k in b.state)) {
    ch.push({ level: "L1", kind: "state_removed", target: k, at: "state",
      message: `state 删掉 ${k}`, impact: "少一个初始状态" });
  }

  // ── 节点配对 → L2 / L3 / L4 ──
  const { pairs, added, removed } = pairNodes(a.nodes, b.nodes);
  let equivalent = 0;

  for (const [x, y] of pairs) {
    let touched = false;
    const label = nodeLabel(y);
    // L2 取值
    for (const k of new Set([...Object.keys(x.style), ...Object.keys(y.style)])) {
      const ov = x.style[k], nv = y.style[k];
      if (ov === nv) continue;
      touched = true;
      const isToken = /var\(--/.test(ov ?? "") || /var\(--/.test(nv ?? "");
      ch.push({
        level: "L2", kind: isToken ? "token_changed" : "style_changed",
        target: label, prop: k, from: ov ?? null, to: nv ?? null, at: y.at,
        message: ov === undefined ? `${label} 新增 ${k}: ${nv}`
          : nv === undefined ? `${label} 去掉了 ${k}（原 ${ov}）`
          : `${label} 的 ${k} 从 ${ov} 改到 ${nv}`,
      });
    }
    // L3 文案
    if ((x.text ?? "") !== (y.text ?? "")) {
      touched = true;
      ch.push({ level: "L3", kind: "text_changed", target: label,
        from: x.text ?? null, to: y.text ?? null, at: y.at,
        message: `「${x.text ?? "(空)"}」→「${y.text ?? "(空)"}」` });
    }
    // 字面量属性算 L3，其它属性算 L2
    for (const k of new Set([...Object.keys(x.attrs), ...Object.keys(y.attrs)])) {
      const ov = x.attrs[k], nv = y.attrs[k];
      if (ov === nv) continue;
      touched = true;
      const lit = LITERAL_ATTRS.has(k);
      ch.push({ level: lit ? "L3" : "L2", kind: "attr_changed", target: label, prop: k,
        from: ov ?? null, to: nv ?? null, at: y.at,
        message: `${label} 的 ${k} 从 ${ov ?? "(无)"} 改到 ${nv ?? "(无)"}` });
    }
    if (!touched) equivalent++;
  }

  for (const n of added) {
    ch.push({ level: "L2", kind: "node_added", target: nodeLabel(n), at: n.at,
      message: `新增节点 <${n.tag}>${n.text ? `「${shortLabel(n.text, 20)}」` : ""}` });
  }
  for (const n of removed) {
    ch.push({ level: "L2", kind: "node_removed", target: nodeLabel(n), at: n.at,
      message: `删除节点 <${n.tag}>${n.text ? `「${shortLabel(n.text, 20)}」` : ""}` });
  }

  // ── 用到的 token ──
  const tokA = new Set(a.tokensUsed), tokB = new Set(b.tokensUsed);
  const tokAdd = [...tokB].filter((t) => !tokA.has(t));
  const tokDel = [...tokA].filter((t) => !tokB.has(t));
  if (tokAdd.length || tokDel.length) {
    ch.push({ level: "L2", kind: "tokens_changed", target: "用到的 token",
      from: tokDel.join("、") || null, to: tokAdd.join("、") || null, at: "-",
      message: `用到的 token 变了${tokAdd.length ? `，新增 ${tokAdd.join("、")}` : ""}${tokDel.length ? `，不再用 ${tokDel.join("、")}` : ""}` });
  }

  // ── L4 等价 ──
  if (equivalent && a.nodes.length !== b.nodes.length) {
    ch.push({ level: "L4", kind: "reordered", target: `${equivalent} 个节点`, at: "-",
      message: `${equivalent} 处节点归一化后完全相同（重排或包裹层增删）` });
  }
  if (a.sourceSha256 !== b.sourceSha256 && ch.length === 0) {
    ch.push({ level: "L4", kind: "bytes_only", target: "整份", at: "-",
      message: "字节变了但语义快照完全相同（只动了空白或注释）" });
  }

  ch.sort((p, q) => LEVEL_ORDER.indexOf(p.level) - LEVEL_ORDER.indexOf(q.level));
  return { file: b.file, from: a.version, to: b.version, counts: countBy(ch), changes: ch, spans: [b.version] };
}

function nodeLabel(n: SnapNode): string {
  if (n.text) return `<${n.tag}>「${shortLabel(n.text, 14)}」`;
  if (n.holes.length) return `<${n.tag}> {{ ${n.holes[0]} }}`;
  const k = Object.keys(n.style)[0];
  return k ? `<${n.tag}> (${k})` : `<${n.tag}>`;
}

function countBy(ch: Change[]): Record<Level, number> {
  const c: Record<Level, number> = { L1: 0, L2: 0, L3: 0, L4: 0 };
  for (const x of ch) c[x.level]++;
  return c;
}

// ─────────────────── 跨版本净变更（07 §六）───────────────────

/* ⚠️ **`mergeDiffs` 删掉了**（issue #91，2026-10-06）。
   它把 v(k)→v(k+1) 的几份 diff 按 `nodeLabel` 分组再合并，而标签不是身份：
   文案一改标签就变、没文字的节点大量共用同一个标签。
   净变更改成**首尾直接对比**之后它就没有调用方了（见 `history.ts` 的 `changesSince`）。
   **留着一个没人调的合并层，下一个人会以为净变更是拼出来的。**（§9.1.7 那条
   「写了而没接上比没写更坏」的反面用法：接不上了就删掉。） */

// ───────────────────── Markdown 投影（07 §4.2）─────────────────────

const HEAD: Record<Level, string> = {
  L1: "[契约 · 必须改代码]", L2: "[取值 · 照抄新值]", L3: "[文案]", L4: "[等价 · 无需处理]",
};

export function toMarkdown(d: DiffResult): string {
  const L: string[] = [];
  L.push(`《${d.file}》  ${d.from} → ${d.to}${d.spans.length > 1 ? `（跨 ${d.spans.length} 版）` : ""}`);
  L.push("");
  L.push(conclusion(d));
  for (const lv of LEVEL_ORDER) {
    const rows = d.changes.filter((c) => c.level === lv);
    if (!rows.length) continue;
    L.push("");
    L.push(HEAD[lv]);
    if (lv === "L4") {
      L.push(`  · ${rows.map((r) => r.message).join("；")}`);
      continue;
    }
    for (const r of rows) {
      L.push(`  · ${r.message}${r.at && r.at !== "-" ? `  (${r.at})` : ""}`);
      if (r.impact) L.push(`      → ${r.impact}`);
    }
  }
  return L.join("\n");
}

/** 一句结论：回答「要不要动代码」 */
export function conclusion(d: DiffResult): string {
  const { L1, L2, L3, L4 } = d.counts;
  if (!L1 && !L2 && !L3) return L4 ? `${L4} 处等价变更，不用管。` : "两版完全相同。";
  const bits: string[] = [];
  if (L1) bits.push(`${L1} 条契约变更必须改代码`);
  if (L2 + L3) bits.push(`${L2 + L3} 条照抄新值和字符串`);
  if (L4) bits.push(`${L4} 条不用管`);
  return bits.join("，") + "。";
}
