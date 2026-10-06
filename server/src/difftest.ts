/** 跨版本净变更回归（issue #91，2026-10-06）。
 *
 *  测的不是「diff 算得对不对」（那是 `selftest` 的基准在管），
 *  而是**`doc/07` §六 那张合并规则表到底成不成立** ——
 *  原来的实现按 `nodeLabel`（给人看的标签）分组合并，于是两头都破：
 *  标签带文案 → 文案一改就被拆成两条；没文字的节点共用一个标签 → 不同节点被并成一条。
 *
 *  ⚠️ 每一条判据都带着 issue 里给出的那个**实测反例**，
 *  也就是说：这个文件里每一行都钉着一个**已经犯过的错**（CLAUDE.md 纪律⑤）。
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildProject } from "./project.js";
import { writeDraft } from "./write.js";
import { changesSince } from "./history.js";
import type { DiffResult } from "./diff.js";

let pass = 0, bad = 0;
const ok = (cond: boolean, msg: string, extra?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}${extra === undefined ? "" : `  ${JSON.stringify(extra)}`}`); }
  else { bad++; console.log(`  ✗ ${msg}${extra === undefined ? "" : `  ${JSON.stringify(extra)}`}`); }
};
const bar = (s: string) => console.log(`\n──── ${s} ${"─".repeat(Math.max(0, 56 - s.length))}`);

const DIR = await mkdtemp(join(tmpdir(), "umbrastudio-difftest-"));
await writeFile(join(DIR, "project.json"), JSON.stringify({ name: "difftest", title: "difftest" }), "utf8");
const p = await buildProject(DIR);

/** 一份合契约的稿，模板里的内容由调用方给。
 *  ⚠️ **body 必须放进 `<x-dc>` 里面**（2026-10-06 实测栽过）——
 *  语义快照只采模板里的节点，放在 `<x-dc>` 外面的话每一版都只量到
 *  `bytes_only`（`from`/`to` 都是 `undefined`），而判据写的是「至少一条」
 *  的那几条**照样绿** —— 又一次「判据绿是因为别的东西」。 */
const draft = (body: string) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${body}
<div>{{ t }}</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{}">
class Component extends DCLogic {
  renderVals() { return { t: "hi" }; }
}
</script>
</body>
</html>
`;

/** 按顺序把几版写进去，回最后一次的净变更（v1 → 最后一版）。 */
async function versions(rel: string, bodies: string[]): Promise<DiffResult> {
  for (const b of bodies) {
    const r = await writeDraft(p, rel, draft(b), "page");
    if (!r.outcome.written) throw new Error(`夹具写不进去：${r.outcome.refused}`);
  }
  return await changesSince(p, rel, "v1");
}

bar("例 1：两个不同的节点，同一个标签、同一个属性");
/* ⚠️ 两个 div 都**没有文字**，所以 `nodeLabel` 给它们的标签一模一样
   （`<div> (padding)`）—— 这正是原来那个分组键会把它们并成一条的条件。
   `data-k` 让 fp 不同，配对才分得清谁是谁（标签不含 attrs，所以不影响复现）。 */
{
  const A = (pa: string, pb: string) =>
    `<div data-k="a" style="padding:${pa}"></div><div data-k="b" style="padding:${pb}"></div>`;
  const d = await versions("例一.dc.html", [A("4px", "8px"), A("8px", "8px"), A("8px", "4px")]);
  /* 原来：两条并成一条 → from=4px、to=4px → 「改回原值」规则把整条吞掉 → **回「没有变化」**。
     而真实情况是**两处都改了**。这一类是**漏报** —— 实现侧照清单改完仍有改动没跟上。 */
  ok(d.changes.length === 2,
    "**两个节点各报一条**（原来：并成一条又被「改回原值」吞掉 → 回「没有变化」）",
    { 条数: d.changes.length, 明细: d.changes.map((c) => `${c.from}→${c.to}`) });
  const 值 = d.changes.map((c) => `${c.from}→${c.to}`).sort().join(" / ");
  ok(值 === "4px→8px / 8px→4px", "而且两条的值各自是对的", 值);
  ok(d.spans.join(",") === "v2,v3", "`spans` 说得出合并了哪几版（契约里承诺的）", d.spans);
}

bar("例 2：同一节点文案改回原值");
{
  const d = await versions("例二.dc.html", ["<p>A</p>", "<p>B</p>", "<p>A</p>"]);
  /* 原来：标签带着文案（`<p>「B」` / `<p>「A」`），两版的标签不同 →
     分成两个键 → **报两条**。契约第二行写的是「改回原值 → 不报」。 */
  ok(d.changes.length === 0, "**改回原值不报**（原来：标签带着文案，一改就被拆成两条 → 报 2 条）",
    { 条数: d.changes.length, 明细: d.changes.map((c) => c.message) });
}

bar("例 3：契约表那五行");
{
  /* ⚠️ 契约那一行说的是「同一**属性**」，所以样本得是属性 ——
     第一版写成改文案（`<p>20px</p>` → `22px` → `24px`），
     量到的是 `text_changed`，它的 `from`/`to` 是空的，判据红在**样本选错了**上。 */
  const d1 = await versions("多次.dc.html",
    ["<div style=\"padding:20px\"></div>", "<div style=\"padding:22px\"></div>", "<div style=\"padding:24px\"></div>"]);
  ok(d1.changes.length === 1 && d1.changes[0]?.from === "20px" && d1.changes[0]?.to === "24px",
    "同一属性多次变化 → 只报最终值（`20px → 22px → 24px` 报成 `20px → 24px`）",
    d1.changes.map((c) => `${c.kind} ${c.prop} ${c.from}→${c.to}`));

  const d2 = await versions("加了又删.dc.html",
    ["<p>在</p>", "<p>在</p><div data-x=\"新\"></div>", "<p>在</p>"]);
  ok(d2.changes.length === 0, "新增后又删除 → **不报**", d2.changes.map((c) => c.kind));

  const d3 = await versions("删了又加.dc.html",
    ["<p data-v=\"1\">文</p>", "<p>文</p>", "<p data-v=\"2\">文</p>"]);
  /* ⚠️ 不写「至少一条」—— `bytes_only` 这种**非语义**的变化也算一条，
     于是夹具根本没进模板的那一轮它也绿（2026-10-06 实测就这么假过一次）。
     要的是「`data-v` 这个属性从 1 变成 2」。 */
  ok(d3.changes.some((c) => c.prop === "data-v" && c.from === "1" && c.to === "2"),
    "删除后又新增（值不同）→ 报成「改」", d3.changes.map((c) => `${c.kind} ${c.prop} ${c.from}→${c.to}`));

  const d4 = await versions("删了又加回.dc.html",
    ["<p data-v=\"1\">文</p>", "<p>文</p>", "<p data-v=\"1\">文</p>"]);
  ok(d4.changes.length === 0, "删除后又新增（值相同）→ **不报**", d4.changes.map((c) => c.kind));
}

bar("只有一版 / since 就是最新那一版");
{
  await writeDraft(p, "单版.dc.html", draft("<p>只有一版</p>"), "page");
  const d = await changesSince(p, "单版.dc.html", "v1");
  ok(d.changes.length === 0 && d.from === "v1" && d.to === "v1",
    "只有一版时回「没有变化」而不是抛", { from: d.from, to: d.to });
}

await rm(DIR, { recursive: true, force: true });
console.log(`\n${bad === 0 ? "✓" : "✗"} 跨版本净变更 ${pass}/${pass + bad}\n`);
process.exit(bad === 0 ? 0 : 1);
