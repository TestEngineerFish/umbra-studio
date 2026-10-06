/** 预览点选桥的回归（`runtime/select-bridge.js`）。
 *
 *  ⚠️ **这一套以前不存在。** 那个文件是点选 / 就地编辑 / 测间距的核心
 *  （370 行，跑在用户的稿里），而它**一条判据都没有** ——
 *  `uitest` 测的是工作台那一侧，`rendertest` 测的是控制台干不干净，
 *  **两边都碰不到它的几何**。
 *  （同一轮里 markdown 插件的 B 面也是这样：唯一的真 B 面，零覆盖 —— §150.4。）
 *
 *  判据是**像素级的数值**，不是「有没有画出来」：
 *  「画了四条线」和「四条线上的数字对」是两件事，而后者才是用户要的。
 *
 *  不用起 UI 服务 —— 造一张合成页面、把桥注进去就行。
 *  找不到浏览器时整块跳过并说清楚（和 `rendertest` 同一条规矩：
 *  **不能让「没浏览器」冒充「过了」**）。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TOOL_ROOT } from "./project.js";
import { findBrowser } from "./render.js";

let pass = 0, bad = 0;
const ok = (cond: boolean, msg: string, extra?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}${extra === undefined ? "" : `  ${JSON.stringify(extra)}`}`); }
  else { bad++; console.log(`  ✗ ${msg}${extra === undefined ? "" : `  ${JSON.stringify(extra)}`}`); }
};
const bar = (s: string) => console.log(`\n──── ${s} ${"─".repeat(Math.max(0, 54 - s.length))}`);

const found = findBrowser();
if (!found) {
  console.log("\n⚠️ 找不到 chromium / Chrome —— 点选桥回归整块跳过。");
  console.log("   这**不算通过**：装一个浏览器，或设 UMBRASTUDIO_CHROMIUM 指向它。\n");
  process.exit(0);
}

const BRIDGE = await readFile(join(TOOL_ROOT, "runtime", "select-bridge.js"), "utf8");
const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ executablePath: found.path });
const pg = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();

/* 合成页面：四个盒子，位置是**算好的**，所以期望值能写成确定的数。
   a(40,40,100x60) · b(180,40,100x60) · c(40,160,100x60)
   outer(400,40,200x200) 里套 inner(+30,+20,80x50) */
await pg.setContent(`<!doctype html><html data-ud-select-on><body style="margin:0;padding:0">
  <div data-ud-node="a" style="position:absolute;left:40px;top:40px;width:100px;height:60px;background:#ddd"></div>
  <div data-ud-node="b" style="position:absolute;left:180px;top:40px;width:100px;height:60px;background:#ccc"></div>
  <div data-ud-node="c" style="position:absolute;left:40px;top:160px;width:100px;height:60px;background:#bbb"></div>
  <div data-ud-node="outer" style="position:absolute;left:400px;top:40px;width:200px;height:200px;background:#eee">
    <div data-ud-node="inner" style="position:absolute;left:30px;top:20px;width:80px;height:50px;background:#aaa"></div>
  </div>
</body></html>`);
await pg.addScriptTag({ content: BRIDGE });
await pg.waitForTimeout(200);

/** 现在画出来的那些数字（排好序）。
 *  ⚠️ **按 `data-ud-spacing` 这个标记找容器**，不按 `style` 里的 z-index ——
 *  `cssText` 会把它规整成 `z-index: …`（带空格），按样式串匹配一定落空。
 *  手验第一版就是这么空的，而症状是「一条线都没画」（看着像功能坏了）。 */
/*  ⚠️ **字符串形式的 `evaluate`** —— server 的 tsconfig 没有 DOM lib
 *  （它是个 Node 工程，加上 DOM 会让服务端代码也能写 `document` 而编译器不管）。
 *  `render.ts` 里那几处也是这么写的。 */
const nums = () => pg.evaluate(`(() => {
  var box = document.querySelector("[data-ud-spacing]");
  if (!box) return null;
  return [].slice.call(box.children).map(function (n) { return n.textContent || ""; })
    .filter(Boolean).sort(function (x, y) { return Number(x) - Number(y); });
})()`) as Promise<string[] | null>;

async function probe(from: string, to: string, what: string, want: string[]): Promise<void> {
  await pg.locator(`[data-ud-node="${from}"]`).first().click();
  await pg.waitForTimeout(120);
  const bx = await pg.locator(`[data-ud-node="${to}"]`).first().boundingBox();
  if (!bx) { ok(false, `${what}（量不到目标盒子）`); return; }
  await pg.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2, { steps: 2 });
  await pg.keyboard.down("Alt");
  /* 再动一下 —— 按下 Alt 本身不触发 mousemove，而桥是在 mousemove 里测的。
     ⚠️ 真人按住 Option 之后手总会动一下，所以这不是在迁就实现；
     但判据要把这一步写出来，不然下一个人会以为「按下就该出来」。 */
  await pg.mouse.move(bx.x + bx.width / 2 + 1, bx.y + bx.height / 2, { steps: 2 });
  await pg.waitForTimeout(180);
  const got = await nums();
  await pg.keyboard.up("Alt");
  ok(JSON.stringify(got) === JSON.stringify(want), what, { 量到: got, 期望: want });
}

bar("按住 Option 测间距（issue #17）");
/* a 右边 140、b 左边 180 → 水平 40；竖直完全重叠 → **只画一条**
   （两条的话第二条会横穿元素，那是 spacingjs 的边界情况清单里的第一条） */
await probe("a", "b", "**左右分开：一条线，40**", ["40"]);
/* a 下边 100、c 上边 160 → 竖直 60；水平完全重叠 → 只画一条 */
await probe("a", "c", "**上下分开：一条线，60**", ["60"]);
/* b 和 c 两个轴都分开 → 两条 */
await probe("b", "c", "**斜对角：两条，40 / 60**", ["40", "60"]);
/* inner 在 outer 里 → 画**四条内距**（上 20 · 左 30 · 右 90 · 下 130）。
   ⚠️ 这一档不能画「间距」—— 包含关系下间距是 0，画出来没有任何信息。 */
await probe("outer", "inner", "**包含关系：四条内距 20 / 30 / 90 / 130**", ["20", "30", "90", "130"]);

bar("两道闸");
/* ⚠️ 下面这两条是**反面判据**（「不该画」），而它们读的是「容器在、且是空的」——
   所以**依赖上面那四条先跑过**（容器是第一次测间距时才建的）。
   2026-10-06 反向验证实测：整个功能撤掉时它们读到 `null` 也会红，
   那是对的；但要是把它们挪到文件开头，就会因为「容器还没建」而红 ——
   **红的理由就变了**。顺序在这里是判据的一部分。 */
/* 松开 Option 要清掉 —— 不清的话线一直留着，而用户会以为它测的是现在鼠标下那个 */
await pg.keyboard.up("Alt");
await pg.mouse.move(300, 300, { steps: 2 });
await pg.waitForTimeout(220);
ok((await nums())?.length === 0, "**松开 Option 就清掉**（留着的话它测的是哪两个就说不清了）", await nums());

/* 和点选**同一个闸**：关掉之后稿的交互一切照旧，不该因为按了 Option 蹦出一堆线 */
await pg.evaluate(`document.documentElement.removeAttribute("data-ud-select-on")`);
const bbox = await pg.locator('[data-ud-node="b"]').first().boundingBox();
await pg.keyboard.down("Alt");
await pg.mouse.move((bbox?.x ?? 0) + 5, (bbox?.y ?? 0) + 5, { steps: 2 });
await pg.waitForTimeout(220);
ok((await nums())?.length === 0, "**关掉点选开关之后不画**（和点选同一个闸，不然「真的用这个界面」时会误触）", await nums());
await pg.keyboard.up("Alt");

bar("没选中时什么都不画");
/* ⚠️ 「和谁比」是这件事的前提。没选中就画出鼠标下那一个框，会让人以为功能坏了。 */
await pg.evaluate(`document.documentElement.setAttribute("data-ud-select-on", "")`);
await pg.keyboard.press("Escape");                       // 清掉选中
await pg.waitForTimeout(120);
await pg.keyboard.down("Alt");
await pg.mouse.move((bbox?.x ?? 0) + 7, (bbox?.y ?? 0) + 7, { steps: 2 });
await pg.waitForTimeout(220);
ok((await nums())?.length === 0, "**没选中过任何节点时不画**（「和谁比」是前提）", await nums());
await pg.keyboard.up("Alt");

await browser.close();
console.log(`\n${bad === 0 ? "✓" : "✗"} 点选桥 ${pass}/${pass + bad}\n`);
process.exit(bad === 0 ? 0 : 1);
