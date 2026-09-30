/** 位置感知 JSON 解析的回归（M10-4）。
 *
 *  ⚠️ 这一份测的是**纯逻辑**，不开浏览器 —— 它是 S19「在源码里看 L12–17」
 *  和「光标路径」的地基，地基错了上面全是错的，而界面判据看不出是哪一层的错。
 *
 *  跑：`npm --prefix server run jsonpostest`
 */
/* ⚠️ 插件是 .mjs 没有类型声明 —— 用运行期路径 import，绕开 tsc 的静态解析。
   **判据要测的是插件里真跑的那一份**，不是它的一个 TS 副本
   （复制一份去测等于测了个影子，两边会各自漂）。 */
const MOD = new URL("../../plugins/com.umbra.code/1.0.0/jsonpos.mjs", import.meta.url).href;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { parseWithPos, nodeAt, prettyPath } = (await import(MOD)) as any;

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`); }
  else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`); }
};

console.log("\n位置感知 JSON 解析（M10-4）");

const SRC = `{
  "name": "umbra",
  "channels": {
    "a": { "model": "x", "on": true },
    "b": [1, 2, 3]
  },
  "n": null
}
`;
const r = parseWithPos(SRC) as any;
ok("解析得通", r.ok === true && !r.posBroken, r.posBroken ?? "");
const by = (p: string) => r.nodes.find((n: any) => n.path === p);

/* ── 行号：这是「在源码里看 L12–17」的全部依据 ── */
ok("根节点从第 1 行到最后一行", by("")?.line === 1 && by("")?.endLine === 8, `${by("")?.line}–${by("")?.endLine}`);
ok("**`channels` 是 L3–L6**（不是它那一行，是它整块）",
   by("channels")?.line === 3 && by("channels")?.endLine === 6, `${by("channels")?.line}–${by("channels")?.endLine}`);
ok("单行的对象起止在同一行", by("channels.a")?.line === 4 && by("channels.a")?.endLine === 4);
ok("数组也算得对", by("channels.b")?.line === 5 && by("channels.b")?.endLine === 5);
ok("叶子的行号是它自己那一行", by("name")?.line === 2 && by("n")?.line === 7);

/* ── 顺序：树是按这个顺序画的 ── */
const order = r.nodes.map((n: any) => n.path);
ok("**父节点排在子节点前面**（递归是先算完子的，所以必须按 from 排）",
   order.indexOf("channels") < order.indexOf("channels.a"), order.slice(0, 5).join(" → "));
ok("兄弟按出现顺序", order.indexOf("channels.a") < order.indexOf("channels.b"));

/* ── 类型与项数 ── */
ok("对象 / 数组 / 字面量的类型都认得出",
   by("")?.kind === "object" && by("channels.b")?.kind === "array" &&
   by("name")?.kind === "string" && by("channels.a.on")?.kind === "boolean" && by("n")?.kind === "null",
   [by("channels.b")?.kind, by("n")?.kind]);
ok("对象数组给得出项数", by("channels")?.count === 2 && by("channels.b")?.count === 3);

/* ── 原文切片：「给 AI」带的就是这一段 ── */
ok("**`from`/`to` 切出来就是那个节点的原文**（给 AI 带的是它）",
   SRC.slice(by("channels.a")!.from, by("channels.a")!.to) === '{ "model": "x", "on": true }',
   SRC.slice(by("channels.a")!.from, by("channels.a")!.to));

/* ── 光标路径：源码里光标在哪个节点 ── */
const offOf = (needle: string) => SRC.indexOf(needle);
ok("**光标落在最深的那个节点上**（不是它的父）",
   nodeAt(r.nodes, offOf('"x"'))?.path === "channels.a.model", nodeAt(r.nodes, offOf('"x"'))?.path);
ok("光标在数组元素上给的是那个元素", nodeAt(r.nodes, offOf("2"))?.path === "channels.b.1", nodeAt(r.nodes, offOf("2"))?.path);
ok("光标在对象的空白处给的是那个对象", nodeAt(r.nodes, offOf('"channels"') + 12)?.path === "channels", nodeAt(r.nodes, offOf('"channels"') + 12)?.path);

/* ── 路径写法 ── */
ok("路径写成人看得懂的样子", prettyPath("channels.b.1") === "$.channels[0]".replace("[0]", "") + ".b[1]",
   prettyPath("channels.b.1"));
ok("根是 `$`", prettyPath("") === "$");

/* ── 转义字符串不能把扫描带偏 ── */
{
  const t = `{"a": "他说\\"你好\\"", "b": 1}`;
  const rr = parseWithPos(t) as any;
  ok("**带转义引号的字符串不会把扫描带偏**（`\\\"` 要连着跳两个字符）",
     rr.ok && !rr.posBroken && rr.nodes.find((n: any) => n.path === "b")?.kind === "number",
     rr.posBroken ?? rr.nodes.map((n: any) => n.path).join(" "));
}

/* ── 坏 JSON：正确性归 JSON.parse ── */
{
  const bad = parseWithPos(`{ "a": [1, 2, 3,] }`) as any;
  ok("**坏 JSON 说不行**（正确性以 `JSON.parse` 为准，不是我们自己判）", bad.ok === false, bad.why?.slice(0, 50));
  ok("而且给得出行列（S19 那枚「解析不了 L12:5」标签点一下要跳过去）",
     typeof bad.line === "number" && typeof bad.col === "number", `L${bad.line}:${bad.col}`);

  /* ⚠️ **这一条钉的是 M8-14 实测栽过的坑**：V8 对这种写法报的消息里
     **一个数字都没有**，只带着出错处周围的一段原文（换行被压成空格）。
     只认 `position N` 的话会回退到「第 1 行第 1 列」，而真正的错在第 3 行 ——
     **报错位置指错地方比不报更坏**，人会照着去看那一行。 */
  const multi = parseWithPos(`{\n  "a": 1,\n  "b": [1, 2, 3,]\n}`) as any;
  ok("**多行坏 JSON 指到真正出错那一行**（不是回退到第 1 行）",
     multi.ok === false && multi.line === 3, `L${multi.line}:${multi.col} · ${String(multi.why).slice(0, 46)}`);
}

/* ── 空容器 / 深嵌套 ── */
{
  const t = `{"e":{},"f":[],"g":{"h":{"i":[{"j":1}]}}}`;
  const rr = parseWithPos(t) as any;
  ok("空对象空数组不出错", rr.ok && rr.nodes.find((n: any) => n.path === "e")?.count === 0);
  ok("深嵌套路径拼得对", !!rr.nodes.find((n: any) => n.path === "g.h.i.0.j"),
     rr.nodes.map((n: any) => n.path).filter((p: string) => p.startsWith("g")).join(" "));
}

/* ── 顶层不是对象 ── */
{
  const rr = parseWithPos(`[1, "two", null]`) as any;
  ok("顶层是数组也行", rr.ok && rr.nodes[0]?.kind === "array" && rr.nodes[0]?.count === 3);
  const rr2 = parseWithPos(`42`) as any;
  ok("顶层是裸数字也行（`JSON.parse` 认它）", rr2.ok && rr2.nodes[0]?.kind === "number");
}

/* ── 把报错说成人话（S19 演示态 5 的「下面一句原因」）──
   ⚠️ **说不出就给原文，不编。** 猜错一个原因比给一句英文糟得多：
   人会照着我们说的去改，改错地方再回来，那时他连「是不是我理解错了」都判断不了。 */
{
  const say = (t: string) => (parseWithPos(t) as any).say as string;
  ok("**少逗号说得出来**", /少了逗号/.test(say(`{\n  "a": 1\n  "b": 2\n}`)), say(`{\n  "a": 1\n  "b": 2\n}`));
  ok("多一个符号说得出是哪个", /多了一个/.test(say(`{\n  "a": [1, 2, 3,]\n}`)), say(`{\n  "a": [1, 2, 3,]\n}`));
  ok("没闭合说得出来", /少了逗号|没闭上/.test(say(`{\n  "a": 1`)), say(`{\n  "a": 1`));
  ok("**单引号那一种说得出「JSON 不认单引号」这类话**", /键名/.test(say(`{\n  a: 1\n}`)), say(`{\n  a: 1\n}`));
  ok("尾部多余说得出来", /已经结束/.test(say(`{"a":1} xx`)), say(`{"a":1} xx`));
  ok("字符串没收尾说得出来", /引号/.test(say(`{"a": "没收尾`)), say(`{"a": "没收尾`));
  /* ⚠️ 位置那一段要剥掉 —— 行列我们已经单独给了，重复一遍只是噪声 */
  ok("**说的话里不再带 `at position N`**（行列另外给，重复是噪声）",
     !/at position/.test(say(`{\n  "a": 1\n  "b": 2\n}`)), say(`{\n  "a": 1\n  "b": 2\n}`));
}

console.log(fail === 0 ? `\n✓ 位置感知 JSON ${pass}/${pass + fail}\n` : `\n✗ 位置感知 JSON ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
