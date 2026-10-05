/** CSV 的解析与位置（M10-5，S20 的地基）。
 *
 *  ### 它要回答的三件事，都来自 S20 的形制
 *  1. 「**行号就是源码行号，表头是 L1**」—— 每条记录在源码里占哪几行
 *  2. 「**一行坏不影响整张表**」—— 坏行照样给出来，带一句原因
 *  3. 「**编码没确定之前只读**」—— 按错的编码落盘会把原文写坏
 *
 *  ### ⚠️ 最硬的一条：表格的行号 ≠ 源码的行号
 *  CSV 的引号里**可以有换行**（Excel 导出的备注列天天这样）：
 *
 *      order_id,note
 *      1,"第一行
 *      第二行"
 *      2,ok
 *
 *  三条记录占了源码 5 行。所以每条记录记的是**行范围** `[line, endLine]`，
 *  不是一个数字。按 `\n` 粗暴切的话，第 3 行会变成孤立的 `第二行"` ——
 *  **而那一行看起来就像一条「列数不对」的坏行**，于是我们会报一个根本不存在的问题。
 */

/** 分隔符嗅探。**只在前几行上数**，因为整份几 MB 的文件数一遍不值得。
 *
 *  ⚠️ **数的是「引号外面的」分隔符** —— 一列备注里全是逗号的话，
 *  按出现次数选会选出逗号，而真正的分隔符可能是分号（欧洲的 CSV 常见）。
 */
export function sniffDelimiter(text) {
  const CANDIDATES = [",", ";", "\t", "|"];
  const head = text.slice(0, 64 * 1024);
  const counts = new Map(CANDIDATES.map((c) => [c, []]));
  let inQuote = false, line = 0;
  const perLine = new Map(CANDIDATES.map((c) => [c, 0]));
  const flush = () => {
    for (const c of CANDIDATES) { counts.get(c).push(perLine.get(c)); perLine.set(c, 0); }
    line++;
  };
  for (let i = 0; i < head.length && line < 20; i++) {
    const ch = head[i];
    if (ch === '"') {
      if (inQuote && head[i + 1] === '"') { i++; continue; }   // "" 是转义的引号
      inQuote = !inQuote; continue;
    }
    if (inQuote) continue;
    if (ch === "\n") { flush(); continue; }
    if (perLine.has(ch)) perLine.set(ch, perLine.get(ch) + 1);
  }
  if (perLine.size) flush();
  /* 选「每行出现次数最稳定且大于 0」的那个 ——
     稳定比多重要：真正的分隔符每行个数一样，而正文里的逗号忽多忽少。 */
  let best = ",", bestScore = -1;
  for (const c of CANDIDATES) {
    const rows = counts.get(c).filter((_, i) => i < 20);
    const nonZero = rows.filter((n) => n > 0);
    if (!nonZero.length) continue;
    const first = nonZero[0];
    const same = nonZero.filter((n) => n === first).length;
    const score = same * 100 + first;          // 一致的行数优先，其次才是个数
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** 编码嗅探。回 `{ encoding, confident, why }`。
 *
 *  ⚠️ **这一件的后果比看上去重**：S20 定的是「编码没确定之前只读 ——
 *  按错的编码落盘会把原文写坏」。所以拿不准时要说拿不准，
 *  **不要为了给一个答案而猜**。
 */
export function sniffEncoding(buf) {
  /* ⚠️ **浏览器里没有 `Buffer`。** 这个文件同时跑在两个环境里：
     判据在 node 里（有 Buffer），插件在 iframe 里（只有 Uint8Array / 字符串）。
     接线时当场撞上 —— 判据 30/30 全绿，而插件一跑就 `Buffer is not defined`。
     **「测试环境能跑」和「运行环境能跑」是两件事**，纯逻辑判据验不出这一条。
     所以接受三种输入：字符串（已按 UTF-8 解过）/ Uint8Array / Buffer。 */
  if (typeof buf === "string") return sniffDecodedText(buf);
  if (!buf || typeof buf.length !== "number") {
    return { encoding: "utf-8", confident: false, why: "拿不到原始字节，判不了编码" };
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { encoding: "utf-8", confident: true, why: "开头有 UTF-8 的 BOM" };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { encoding: "utf-16le", confident: true, why: "开头有 UTF-16LE 的 BOM" };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { encoding: "utf-16be", confident: true, why: "开头有 UTF-16BE 的 BOM" };
  }
  /* 没有 BOM：按 UTF-8 解一遍，看有没有替换字符。 */
  const asUtf8 = typeof buf.toString === "function" && buf.constructor && buf.constructor.name === "Buffer"
    ? buf.toString("utf8")
    : new TextDecoder("utf-8").decode(buf);
  return sniffDecodedText(asUtf8);
}

/** 已经按 UTF-8 解过的文本里有多少替换字符 —— 这就是「它不是 UTF-8」的证据。
 *
 *  ⚠️ 判据是**替换字符的密度**，不是「有没有抛异常」：
 *  按 UTF-8 解非法字节**不报错**，它把每个坏字节换成 U+FFFD 就过去了。
 *  这也正是为什么拿到的文本里一旦有替换字符，**照它落盘会把原文永久写坏** ——
 *  坏字节已经在解码那一步丢了，再写回去写的是问号。 */
function sniffDecodedText(text) {
  const bad = (text.match(/�/g) ?? []).length;
  if (bad === 0) return { encoding: "utf-8", confident: true, why: "按 UTF-8 解得干净" };
  const ratio = bad / Math.max(1, text.length);
  return {
    encoding: "utf-8",
    confident: false,
    why: `按 UTF-8 解出 ${bad} 个乱码字符（占 ${(ratio * 100).toFixed(1)}%）—— 多半不是 UTF-8`,
    /* 界面上那颗「按 X 重读」用它。**只列实测支持的**：
       gbk / gb18030 / big5 / shift_jis 在 Node 和浏览器的 TextDecoder 里都在。 */
    alternatives: ["gbk", "gb18030", "big5", "shift_jis"],
  };
}

/** 按指定编码把字节解成文本。**只换读法，不改文件**（S20 的原话）。 */
export function decodeAs(buf, encoding) {
  try { return new TextDecoder(encoding).decode(buf); }
  catch { return null; }                       // 不认识的编码：说不行，别静默回退成 UTF-8
}

/** 解析 CSV。回 `{ delimiter, header, rows, badCount }`。
 *
 *  `rows` 每项：
 *  - `cells`  这一行的各列
 *  - `line` / `endLine`  在**源码**里占的行范围（1-based，含）
 *  - `from` / `to`       在源码里的字符偏移（「给 AI」带原文用）
 *  - `bad`   `null` = 好的；否则是一句人话的原因
 *
 *  ⚠️ **坏行照样进 `rows`**（S20：「一行坏不影响整张表」）——
 *  过滤是界面的事，解析这一层不替它做决定。
 */
export function parseCsv(text, delimiter) {
  const delim = delimiter || sniffDelimiter(text);
  const rows = [];
  let i = 0, line = 1;
  const n = text.length;

  while (i < n) {
    const startOff = i, startLine = line;
    const cells = [];
    let cur = "", inQuote = false, closed = true;
    for (;;) {
      if (i >= n) break;
      const ch = text[i];
      if (inQuote) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }   // "" → 一个引号
          inQuote = false; i++; continue;
        }
        if (ch === "\n") line++;
        cur += ch; i++; continue;
      }
      if (ch === '"') { inQuote = true; closed = false; i++; continue; }
      if (ch === delim) { cells.push(cur); cur = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { i++; line++; break; }
      cur += ch; i++;
    }
    cells.push(cur);
    /* 末尾的空行不算一条记录 —— 几乎所有 CSV 都以换行结尾 */
    if (i >= n && cells.length === 1 && cells[0] === "" && rows.length) break;
    rows.push({
      cells,
      line: startLine,
      endLine: Math.max(startLine, line - (text[i - 1] === "\n" ? 1 : 0)),
      from: startOff,
      to: i,
      bad: inQuote && !closed ? "这一行的引号没有收尾 —— 后面的内容都被算进了这一格" : null,
    });
    if (inQuote) break;                        // 引号没闭合，后面没法再按行切了
  }

  const header = rows.length ? rows[0] : null;
  const want = header ? header.cells.length : 0;
  /* ⚠️ 列数对不齐只是**提示**，不是错误 —— CSV 没有规定每行必须一样长，
     而真实数据里少一列多半是「最后一列空着没写逗号」。
     所以话要说得中性：说出**差多少**，不说「这一行错了」。 */
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.bad) continue;
    const got = row.cells.length;
    if (got !== want) {
      row.bad = got < want
        ? `比表头少 ${want - got} 列（表头 ${want} 列，这一行 ${got} 列）`
        : `比表头多 ${got - want} 列（表头 ${want} 列，这一行 ${got} 列）`;
    }
  }
  return { delimiter: delim, header, rows, badCount: rows.filter((r) => r.bad).length };
}

/** 源码偏移落在第几条记录上 —— 源码档里光标动时，状态行要说出行和列名。 */
export function rowAt(rows, off) {
  /* ⚠️ **左闭右开**（issue #56，2026-10-05）。
     原来是 `off >= from && off <= to` —— 而一条记录的 `to` 就是**下一条的 `from`**
     （`to` 指到换行符之后），于是**行首的光标会被算成上一行**：
     用户把光标放在第 3 行开头，状态行说「第 2 行 · 最后一列」。
     左闭右开之后每个偏移只属于一条记录。 */
  for (let i = 0; i < rows.length; i++) {
    if (off >= rows[i].from && off < rows[i].to) return i;
  }
  /* 文件末尾那一个偏移（`off === 最后一条的 to`）左闭右开会落空 ——
     而光标确实可以停在那里（按 ⌘↓ 就到了）。单独放行，算最后一条。 */
  const last = rows.length - 1;
  if (last >= 0 && off === rows[last].to) return last;
  return -1;
}

/** 源码偏移落在第几列 —— 和 `rowAt` 配一对，状态行要的是「第 3 行 · 金额」。 */
export function colAt(text, row, off, delim) {
  if (!row || off < row.from) return -1;
  let col = 0, inQuote = false;
  for (let i = row.from; i < Math.min(off, row.to); i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { i++; continue; }
      inQuote = !inQuote; continue;
    }
    if (!inQuote && ch === delim) col++;
  }
  return col;
}
