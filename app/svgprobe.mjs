/** **Q84 的界面探针**：矢量图拆成独立 kind 之后，在界面上还看得见图吗（2026-10-23）。
 *
 *  ⚠️ **为什么要单独一个文件，而不是塞进 `uitest`**：`uitest` 的样本里**一份 svg 都没有**
 *  —— 所以「打开一份 `.svg`」这条路它从来没走过，而 Q84 改的正是这条路。
 *  （这也是为什么那条已知的控制台噪声在 `uitest` 日志里是 0 次：
 *  不是它不存在，是 `uitest` 碰不到它。）
 *
 *  ⚠️ **而且这一条只有人看一眼 / 真开浏览器才测得到**：`kindtest` 能钉住
 *  「`.svg` 的 kind 是 `svg`」「它是 textual」「`IMAGE_LIKE_KINDS` 两种都在」，
 *  但钉不住「**看图模块真的把它画出来了**」—— 前端那一半是
 *  `app/src/kinds/image/index.tsx` 的 `ids` 里有没有 `svg`，
 *  漏了的话它会静静落到 `other` 的文件卡上，**看起来像「这种文件还没做」**。
 *  §170.4 那条：DOM 判据说元素在、功能判据说能用，而两个输入框**完全看不见**。
 *
 *  用法：`node app/svgprobe.mjs <__app 的 URL>`（服务要带 `UMBRASTUDIO_NO_GIT=1` 起）
 *  收尾：自己造的样本自己清，而**判准是问服务端的文件列表，不是看树**（见文件末尾那段）。
 */
import { chromium } from "../server/node_modules/playwright-core/index.mjs";
const URL_ = process.argv[2];
const b = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
pg.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));
let pass = 0, fail = 0;
const ok = (c, w, d = "") => { if (c) { pass++; console.log(`  ✓ ${w}${d ? " — " + d : ""}`); } else { fail++; console.log(`  ✗ ${w}${d ? " — " + d : ""}`); } };
await pg.goto(URL_, { waitUntil: "domcontentloaded" });
await pg.waitForFunction(() => !!window.__UD_APP, null, { timeout: 30000 }).catch(() => {});
await pg.waitForTimeout(2500);

/* ⚠️ 第一条就是「开发期自检没炸」—— `auditKinds()` 会找出「声明了 kind 却没有模块认领的」，
   而新加一种 kind 最容易忘的正是这一步（忘了的话它静静落到 other 的文件卡，
   看起来像「这种文件还没做」而真相是「做了一半」）。 */
const unclaimed = await pg.evaluate(() => (window.__UD_APP?.auditKinds?.() ?? null));
ok(unclaimed === null || unclaimed.length === 0,
   "**没有「声明了 kind 却没人认领」的类型**（新 kind 最容易漏的就是前端那一半）",
   JSON.stringify(unclaimed));

/* 造一份 svg 样本（走写入口），看它在树里怎么显示、点开落到哪 */
const NAME = "_q84矢量样本.svg";
const made = await pg.evaluate(async ({ name }) => {
  const a = window.__UD_APP;
  const u = (x) => `${a.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(a.token)}`;
  const r = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: name, content: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#e8873a"/></svg>\n', expectSha256: "0" }) });
  return (await r.json()).ok;
}, { name: NAME });
ok(made, "样本写进去了（经写入口）");
if (made) {
  for (let i = 0; i < 40; i++) { if (await pg.locator('[role="treeitem"]').filter({ hasText: NAME }).count()) break; await pg.waitForTimeout(300); }
  const row = pg.locator('[role="treeitem"]').filter({ hasText: NAME }).first();
  ok(await row.count() > 0, "树里刷出来了");
  if (await row.count()) {
    /* 类型列要写「矢量图」，不是「其他」—— 那是拆完 kind 用户第一眼看到的东西 */
    const rowTxt = (await row.innerText().catch(() => "")).replace(/\s+/g, " ");
    /* ⚠️ 树里显示的是 **icon + 文件名**，没有类型名文字 —— 第一版我断言「矢量图」那三个字，
       实测读数是 `◇ _q84矢量样本.svg`：**产品是对的，判据断言错了东西**。
       钉 icon：`◇` 是新 kind 的，`▣` 是栅格图的，`▢` 是 other 兜底的 —— 三个分得开。 */
    ok(rowTxt.includes("◇"), "**树里的图标是矢量图那一个（◇）**（`▣` = 当成栅格图 · `▢` = 落到 other 兜底）", rowTxt.slice(0, 40));
    await row.click({ timeout: 8000 }).catch(() => {});
    await pg.waitForTimeout(2500);
    /* ⚠️ 要钉的是**看得见图**，不是「DOM 里有个 img」——
       §165 那条：「在不在 DOM 里 / 看不看得见 / 碰不碰得到是三个不同的问题」。 */
    const img = pg.frameLocator('iframe[data-role="body"]').locator("img").first();
    const inHost = await pg.locator('img[src*=".svg"], [data-ud="file-body"] img').first();
    const shown = await img.isVisible().catch(() => false) || await inHost.isVisible().catch(() => false);
    ok(shown, "**打开它看得见图**（看图模块接住了矢量图，没退化成源码或文件卡）");
    const box = await img.boundingBox().catch(() => null) ?? await inHost.boundingBox().catch(() => null);
    ok(!!box && box.width > 4 && box.height > 4, "**而且它真的有尺寸**（不是一个 0×0 的占位）", box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "量不到");
  }
  /* 收尾：自己造的自己清 */
  await pg.evaluate(async ({ name }) => {
    const a = window.__UD_APP;
    const u = (x) => `${a.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(a.token)}`;
    await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
    const t = await (await fetch(u("trash"))).json();
    for (const it of (t.data?.items ?? [])) if (String(it.trashPath ?? "").includes("q84")) {
      await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
    }
  }, { name: NAME });
  /* ⚠️ **收尾自检要问盘，不要问界面。** 第一版断言「树里不再有这一行」，
     而它红了 —— 盘上其实早就干净了（`find` 两处都空），只是树还没刷新（我只等 600ms）。
     > 一条收尾判据如果问的是界面，它既会被刷新延迟**误报成红**，
     > 也会被一个「界面没显示但文件还在」的真残留**骗成绿** —— 两个方向都不可靠。
     （§113 那条「抢跑的判据把慢误报成坏」的同族，uitest 为此做了 `settleTree()` 轮询。） */
  const left = await pg.evaluate(async ({ name }) => {
    const a = window.__UD_APP;
    const u = (x) => `${a.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(a.token)}`;
    const ls = await (await fetch(u("files?dir="))).json();
    const inRoot = (ls.data?.entries ?? []).filter((e) => String(e.name).includes("q84")).map((e) => e.name);
    const t = await (await fetch(u("trash"))).json();
    const inTrash = (t.data?.items ?? []).filter((i) => JSON.stringify(i).includes("q84"));
    return { inRoot, nTrash: inTrash.length };
  }, { name: NAME });
  ok(left.inRoot.length === 0 && left.nTrash === 0,
     "**收尾：盘上一个字节不留**（问的是服务端的文件列表与回收站，不是树里显示什么）",
     `项目根 ${left.inRoot.length} 份 · 回收站 ${left.nTrash} 条`);
}
/* 噪声白名单 —— **照抄 `app/uitest.mjs:48`**，别自己另写一份。
   `attribute d: Expected moveto` 是 dc 模板在**解析期**的正常现象（浏览器先按 HTML
   解析 SVG 的 d，那时洞还没填），来源是 `projects/` 下 4 份用户真稿的存量写法。
   ⚠️ 第一版我没带这份白名单，于是它报了一条红 —— 而我差一步就把**一条 uitest
   明确排除过的已知噪声**，当成「我拆 svg 引入的缺陷」。
   救回来的是先去查「它是不是既存的」（uitest17/19 的日志里 0 次，而那是因为
   uitest 从不打开 `.svg`，不是因为它不存在）。 */
const NOISE = [/favicon/i, /ERR_ABORTED/i, /attribute d: Expected moveto/i];
const real = errs.filter((e) => !NOISE.some((r) => r.test(e)));
ok(real.length === 0, "控制台没有报错", real.slice(0, 2).join(" | "));
await b.close();
console.log(`\n${fail === 0 ? "✓" : "✗"} Q84 界面探针：${pass} 过 / ${fail} 不过`);
process.exit(fail === 0 ? 0 : 1);
