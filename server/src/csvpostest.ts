/** CSV 解析与位置的回归（M10-5，S20 的地基）。
 *
 *  ⚠️ 纯逻辑、不开浏览器 —— 和 `jsonpostest` 同一条理由：
 *  地基错了上面全是错的，而界面判据看不出是哪一层的错。
 *
 *  跑：`npm --prefix server run csvpostest`
 */
const MOD = new URL("../../plugins/com.umbra.code/1.0.0/csvpos.mjs", import.meta.url).href;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { parseCsv, sniffDelimiter, sniffEncoding, decodeAs, rowAt, colAt, widthOf } = (await import(MOD)) as any;

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`); }
  else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`); }
};

console.log("\nCSV 解析与位置（M10-5）");

/* ── ⚠️ 这一段是全文最要紧的：表格行号 ≠ 源码行号 ──
   CSV 的引号里可以有换行（Excel 导出的备注列天天这样）。
   按 `\n` 粗暴切的话第 3 行会变成孤立的 `第二行"` ——
   **而那看起来就像一条「列数不对」的坏行**，于是我们会报一个根本不存在的问题。 */
{
  const src = 'order_id,note\n1,"第一行\n第二行"\n2,ok\n';
  const r = parseCsv(src) as any;
  ok("**引号里的换行不切断记录**（粗暴按 \\n 切会多出一条假的坏行）",
     r.rows.length === 3, `${r.rows.length} 条记录`);
  ok("带换行的那一格内容是完整的", r.rows[1].cells[1] === "第一行\n第二行", JSON.stringify(r.rows[1].cells[1]));
  /* S20：「行号就是源码行号，表头是 L1」 */
  ok("表头是 L1", r.rows[0].line === 1 && r.rows[0].endLine === 1);
  ok("**跨行的那条记录给的是行范围 L2–L3**（不是一个数字）",
     r.rows[1].line === 2 && r.rows[1].endLine === 3, `L${r.rows[1].line}–${r.rows[1].endLine}`);
  ok("它后面那条回到 L4（行号没被带偏）", r.rows[2].line === 4, `L${r.rows[2].line}`);
  ok("**一条坏行都没有**（这份是合法 CSV）", r.badCount === 0, r.rows.map((x: any) => x.bad).filter(Boolean));
}

/* ── 坏行：一行坏不影响整张表（S20 演示态 5）── */
{
  const src = "a,b,c\n1,2,3\n4,5\n6,7,8,9\n";
  const r = parseCsv(src) as any;
  ok("**坏行照样进结果**（过滤是界面的事，解析不替它做决定）", r.rows.length === 4);
  ok("少一列说得出差多少", /少 1 列/.test(r.rows[2].bad ?? ""), r.rows[2].bad);
  ok("多一列也说得出", /多 1 列/.test(r.rows[3].bad ?? ""), r.rows[3].bad);
  ok("好行的 bad 是 null（不是空字符串）", r.rows[1].bad === null);
  ok("坏行计数对得上", r.badCount === 2, r.badCount);
  /* ⚠️ 行号不能因为有坏行就乱 —— S20：「只看坏行时行号不重排，改的时候对得上源码」 */
  ok("**坏行的行号仍然是源码行号**（过滤之后要对得上源码）",
     r.rows[2].line === 3 && r.rows[3].line === 4, r.rows.map((x: any) => x.line));
}

/* ── 引号没收尾 ── */
{
  const r = parseCsv('a,b\n1,"没收尾\n') as any;
  ok("引号没收尾说得出来", /引号没有收尾/.test(r.rows[1]?.bad ?? ""), r.rows[1]?.bad);
}

/* ── 转义的引号 ── */
{
  const r = parseCsv('a,b\n1,"他说""你好"""\n') as any;
  ok("**`\"\"` 解成一个引号**（不是两个，也不是把记录切断）",
     r.rows[1].cells[1] === '他说"你好"', JSON.stringify(r.rows[1].cells[1]));
}

/* ── 分隔符嗅探 ── */
{
  ok("认得出分号（欧洲常见）", sniffDelimiter("a;b;c\n1;2;3\n") === ";");
  ok("认得出制表符", sniffDelimiter("a\tb\tc\n1\t2\t3\n") === "\t");
  ok("默认逗号", sniffDelimiter("a,b,c\n1,2,3\n") === ",");
  /* ⚠️ **这个样本是专门挑出来分开两种实现的。**
     第一版我用的是 `a;b\n1;"张三, 李四"\n…` —— 它**通过了却什么都没验到**：
     那份里逗号第一行是 0、后面是 2，「按一致性打分」这条规则自己就挡住了误判，
     跳不跳引号结果一样。反向验证（把跳引号那一句删掉）照样绿，才发现判据是空的。

     要分开两种实现，就得让逗号**每行出现次数也一致** ——
     所以表头那一格也带一个引号里的逗号：
       分号每行 1 次，逗号每行也 1 次，一致性打平；
       这时候「数的是不是引号外面的」才决定胜负。 */
  const tricky = 'a;"x, y"\n1;"甲, 乙"\n2;"丙, 丁"\n';
  ok("**引号里的逗号不算数**（一致性打平时，只有跳引号才选得对）",
     sniffDelimiter(tricky) === ";", sniffDelimiter(tricky));
}

/* ── 编码嗅探：拿不准就说拿不准 ── */
{
  const utf8 = Buffer.from("订单,金额\n1,100\n", "utf8");
  const e1 = sniffEncoding(utf8) as any;
  ok("干净的 UTF-8 认得出来且有把握", e1.encoding === "utf-8" && e1.confident === true, e1.why);

  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]);
  ok("有 BOM 时直接认定", (sniffEncoding(bom) as any).confident === true, (sniffEncoding(bom) as any).why);

  /* GBK 的「订单,金额」 */
  const gbk = Buffer.from([0xb6, 0xa9, 0xb5, 0xa5, 0x2c, 0xbd, 0xf0, 0xb6, 0xee, 0x0a]);
  const e2 = sniffEncoding(gbk) as any;
  ok("**不像 UTF-8 时说没把握**（S20：编码没确定之前只读）", e2.confident === false, e2.why);
  ok("而且给得出可以试的几种", Array.isArray(e2.alternatives) && e2.alternatives.includes("gbk"), e2.alternatives);
  /* ⚠️ 这一条钉的是「为什么能做」：Node 原生支持 gbk，不用引第三方库 */
  ok("**按 GBK 真的读得出中文**（Node 的 TextDecoder 原生支持）",
     decodeAs(gbk, "gbk") === "订单,金额\n", JSON.stringify(decodeAs(gbk, "gbk")));
  ok("不认识的编码说不行，不静默回退成 UTF-8", decodeAs(gbk, "没这个编码") === null);

  /* ⚠️ **插件那边走的是字符串这条路，不是 Buffer。**
     浏览器里没有 `Buffer` —— 接线时当场撞上：这一份判据 30/30 全绿，
     而插件一跑就 `Buffer is not defined`。
     **「测试环境能跑」和「运行环境能跑」是两件事**，纯逻辑判据验不出这一条，
     所以把运行环境真正走的那条路也钉一次。 */
  const asText = gbk.toString("utf8");          // 宿主 read_file 给插件的就是这个
  const e3 = sniffEncoding(asText) as any;
  ok("**接字符串也判得出来**（插件那边只有解过的文本，没有原始字节）",
     e3.confident === false && Array.isArray(e3.alternatives), e3.why);
  ok("干净的文本接字符串也说有把握", (sniffEncoding("订单,金额\n") as any).confident === true);
  /* Uint8Array 那条（浏览器里真要拿字节时走它） */
  ok("接 Uint8Array 也行（浏览器里没有 Buffer）",
     (sniffEncoding(new Uint8Array(gbk)) as any).confident === false);
  ok("拿不到字节时说判不了，不假装有把握",
     (sniffEncoding(null) as any).confident === false, (sniffEncoding(null) as any).why);
}

/* ── 光标落在哪一行哪一列（源码档的状态行要它）── */
{
  const src = "order_id,amount,note\n1,100,ok\n2,200,hi\n";
  const r = parseCsv(src) as any;
  const at = (needle: string) => src.indexOf(needle);
  ok("光标在第 2 条记录上", rowAt(r.rows, at("100")) === 1, rowAt(r.rows, at("100")));
  ok("**光标在第几列算得对**（状态行要说「第 2 行 · amount」）",
     colAt(src, r.rows[1], at("100"), ",") === 1, colAt(src, r.rows[1], at("100"), ","));
  ok("第三列也对", colAt(src, r.rows[1], at("ok"), ",") === 2);
  /* 列名从表头取 —— 这是「说得出列名」的最后一步 */
  const ci = colAt(src, r.rows[1], at("100"), ",");
  ok("配上表头就能说出列名", r.header.cells[ci] === "amount", r.header.cells[ci]);
}

/* ── 空文件 / 只有表头 ── */
{
  ok("空文件不炸", (parseCsv("") as any).rows.length === 0);
  const only = parseCsv("a,b,c\n") as any;
  ok("只有表头时没有坏行", only.rows.length === 1 && only.badCount === 0, only.rows.length);
}

/* ── 光标落在哪一行（issue #56）──
   `rowAt` 原来是 `off >= from && off <= to`，而一条记录的 `to` 就是
   **下一条的 `from`**（`to` 指到换行符之后）—— 于是**行首的光标被算成上一行**：
   用户把光标放在第 3 行开头，状态行说「第 2 行 · 最后一列」。

   ⚠️ 顺带：这两个函数写了之后**一处都没调用过**（只被 import 了）——
   **写了而没接上，比没写更坏**：它让下一个人以为这件事已经做了。
   现在插件的状态行真的在用它们了。 */
console.log("\n 光标落在哪一行（issue #56）");
{
  const text = "订单,金额\n1,100\n2,200\n";
  const { rows, delimiter } = parseCsv(text);
  ok("三条记录", rows.length === 3, String(rows.length));
  /* ⚠️ **每一行的行首都要落在它自己身上** —— 这是左闭右开的直接后果，
     而逐行验（不是只验一行）才能发现「只有第一行对」那种半对的实现。 */
  for (let i = 0; i < rows.length; i++) {
    ok(`第 ${i + 1} 条记录的**行首**落在它自己身上（原来会算成上一条）`,
       rowAt(rows, rows[i]!.from) === i, `rowAt(${rows[i]!.from}) = ${rowAt(rows, rows[i]!.from)}，该是 ${i}`);
  }
  /* 文件末尾那个偏移：光标按 ⌘↓ 能停在那里，左闭右开会落空 —— 单独放行 */
  const end = text.length;
  ok("**文件末尾的偏移落在最后一条**（左闭右开会让它落空，而光标真能停在那里）",
     rowAt(rows, end) === rows.length - 1, `rowAt(${end}) = ${rowAt(rows, end)}`);
  ok("范围外的偏移回 -1（不是硬凑一个答案）", rowAt(rows, 9999) === -1, String(rowAt(rows, 9999)));
  /* 列：行首是第 0 列，分隔符之后进下一列 */
  ok("行首是第 0 列", colAt(text, rows[1]!, rows[1]!.from, delimiter) === 0, String(colAt(text, rows[1]!, rows[1]!.from, delimiter)));
  ok("**分隔符之后进下一列**（第 2 条记录 `1,100` 的 `100` 是第 1 列）",
     colAt(text, rows[1]!, rows[1]!.from + 2, delimiter) === 1,
     String(colAt(text, rows[1]!, rows[1]!.from + 2, delimiter)));
}

/* ── 十几万行不许炸（issue #106，2026-10-06）──
   `widthOf` 原来是 `Math.max(...rows.map((r) => r.cells.length))` ——
   展开把每个元素当一个实参传，受**调用栈的实参上限**约束。
   而 `parseCsv` 没有行数上限，于是**十几万行的 CSV 是「打不开」而不是「卡」**。

   ⚠️ 阈值**现量，不写死**：它跟栈大小有关，换机器 / 换 Node 版本就会变。
   写死 12 万的话，哪天阈值降到 8 万，这条判据会在一个**本该报警的环境里**照样绿。 */
{
  /* 先现量一次「展开到多少个就抛」—— 这既是样本有效性，也是读数 */
  let spreadLimit = 0;
  for (let n = 20000; n <= 400000; n += 20000) {
    try { Math.max(...new Array(n).fill(1)); spreadLimit = n; }
    catch { break; }
  }
  const N = spreadLimit + 40000;            // 一定超过这台机器的阈值
  ok(`（样本有效性）展开求极值在这台机器上约 ${spreadLimit} 个还行，样本取 ${N} 行`,
     spreadLimit > 0 && N > spreadLimit);
  const big: Array<{ cells: string[] }> = [];
  for (let i = 0; i < N; i++) big.push({ cells: i === 7 ? ["a", "b", "c", "d"] : ["a", "b"] });
  let threw = "";
  let w = -1;
  try { w = widthOf(big); } catch (e) { threw = String((e as Error)?.constructor?.name ?? e); }
  ok(`**${N} 行也求得出列数**（原来：\`Math.max(...)\` 抛 RangeError —— 文件直接打不开）`,
     !threw && w === 4, threw || `${w} 列`);
  /* 反面：**真的会抛** —— 证明这条判据量的是一件真事，不是一条永远绿的断言 */
  let spreadThrew = "";
  try { Math.max(...big.map((r) => r.cells.length)); } catch (e) { spreadThrew = String((e as Error)?.constructor?.name ?? e); }
  ok("（对照）同一份数据用展开求就是 RangeError", spreadThrew === "RangeError", spreadThrew || "居然没抛");
}

console.log(fail === 0 ? `\n✓ CSV 解析与位置 ${pass}/${pass + fail}\n` : `\n✗ CSV 解析与位置 ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
