/** 前端界面回归（M8-11 起）。
 *
 *  为什么要有它：静态回归（selftest / rendertest）看的是**稿**，看不到 React 应用本身。
 *  界面的缺陷只有真打开才暴露 —— 2026-09-24 就有一条自动测试没抓到、靠人看截图才发现的
 *  （⌘B 收起再展开后，树的三角是展开的、子项却一个都没有）。**判据要跟着补，不是补完就算。**
 *
 *  用法：
 *    UMBRASTUDIO_NO_GIT=1 npm --prefix server run ui -- <项目名>   # 另开一个终端起服务
 *    node app/uitest.mjs "http://127.0.0.1:<端口>/__app/?token=<令牌>"
 *
 *  ⚠️ **`UMBRASTUDIO_NO_GIT=1` 不是可选的。**（2026-09-30 实测抓到）
 *  M9-7 之后每一次落盘都会往项目的 git 里记一版 —— 那对用户是对的，
 *  但**回归一轮下来会塞几十上百个提交进他的仓库**。实测：一天跑几轮之后
 *  用户项目从 0 提交变成 **101 个**，全是回归样本的。
 *  留几个文件是脏，**污染他的版本历史是另一个量级**（纪律⑥）——
 *  而且收尾那三条判据一条都抓不到它：它们数文件、数回收站、数快照，
 *  **没有一条数提交**。
 *
 *  ⚠️ 令牌也别忘（Q42）：`/__app/` 不再无条件注入令牌，
 *  不带 `?token=` 的话页面会停在「拿不到访问令牌」，而判据只会报「等不到 treeitem」。
 *
 *  判据一律「能在盘上/DOM 里数出来」，不看截图判对错（纪律②）。
 */
import { chromium } from "../server/node_modules/playwright-core/index.mjs";
/* ⚠️ **GBK 样本只能用 fs 写。** 写入口只收字符串，而字符串落盘一定是 UTF-8 ——
   拿它写不出一份「不是 UTF-8 的文件」，也就测不了「认出编码不对」这件事。
   绕过写入口在这里是对的：样本不是产品行为，**它是仪器**。 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";

const URL_ = process.argv[2];
if (!URL_) { console.error("用法：node app/uitest.mjs <__app 的 URL>"); process.exit(2); }

/* 控制台噪声白名单。
   `d="{{ icon }}"` 是 dc 模板在**解析期**的正常现象：浏览器先按 HTML 解析 SVG 的 d，
   这时洞还没填，于是抱怨一句；运行时随后会把它换成真的 path data。
   这属于语料的存量写法（`doc/06` §2.8 记着该怎么改），不是应用的缺陷 ——
   不排掉的话每次跑都是红的，久了就没人看了。 */
const NOISE = [/favicon/i, /attribute d: Expected moveto/i];

let pass = 0, fail = 0;
const ok = (c, s, d = "") => { c ? pass++ : fail++; console.log((c ? "  ✓ " : "  ✗ ") + s + (d ? ` — ${d}` : "")); };

const b = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
pg.on("console", (m) => { const t = m.text(); if (m.type() === "error" && !NOISE.some((r) => r.test(t))) errs.push(t.slice(0, 120)); });
pg.on("pageerror", (e) => { const t = String(e); if (!NOISE.some((r) => r.test(t))) errs.push("pageerror: " + t.slice(0, 120)); });

await pg.goto(URL_, { waitUntil: "domcontentloaded" });
/* 「起来了」的判据：树里长出了节点。
   ⚠️ 别拿界面文案当判据 —— 原来这里等的是「N 份稿」，第七轮把那颗钮挪进了
   目录列头并改叫「转到文件」，整个回归就卡在启动等待上了（M8-15 实测）。
   `role="treeitem"` 是形制变了也还在的东西。 */
await pg.waitForFunction(() => document.querySelectorAll('[role="treeitem"]').length > 0, null, { timeout: 30000 });
await pg.waitForTimeout(1500);

/* ⌘P 在**这里**测：刚启动，没有任何浮层开着。
   放到后面测会被前几步留下的状态干扰（M8-27 实测），而那不是它自己的毛病。 */
await pg.keyboard.press("Meta+p"); await pg.waitForTimeout(800);
ok(await pg.locator('input[placeholder="转到文件…"]').count() === 1, "⌘P 打开「转到文件」");
await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);

console.log("\n常驻目录列（M8-11 · 设计侧第六轮 6.1 / 6.2）");
const tree = pg.locator('[role="tree"]');
const rowsNow = () => pg.locator('[role="treeitem"]').count();
ok(await tree.count() > 0, "目录列在");
const n0 = await rowsNow();
ok(n0 > 0, "树里有节点", `${n0} 行`);

const firstFile = pg.locator('[role="treeitem"]').filter({ hasText: ".dc.html" }).first();
await firstFile.click();
await pg.waitForTimeout(1200);
/* 这条是这一轮的要害：以前点开文件，目录会被整个换掉 */
ok(await tree.count() > 0, "打开文件后目录列仍然在");
ok(await pg.locator('[role="treeitem"][aria-selected="true"]').count() > 0, "当前文件在树里高亮");

const dirRow = pg.locator('[role="treeitem"][aria-expanded="false"]').first();
let nExpanded = n0;
if (await dirRow.count()) {
  await dirRow.click(); await pg.waitForTimeout(1200);
  nExpanded = await rowsNow();
  ok(nExpanded > n0, "展开子目录后上一层还在", `${n0} → ${nExpanded} 行`);
} else ok(false, "没找到可展开的目录");

await pg.keyboard.press("Meta+b"); await pg.waitForTimeout(600);
/* ⚠️ **收起后元素还在 DOM 里**（M8-28 起）：要做宽度动画，列就得一直在，
   靠外层收宽到 0 + overflow:hidden 裁掉里层。所以判据看的是「收起了」
   （`data-hidden` + 宽度 0），不是「卸载了」。 */
const navCol = pg.locator('[data-region="nav"]');
ok(await navCol.getAttribute("data-hidden") !== null, "⌘B 收起");
ok(((await navCol.boundingBox())?.width ?? 99) < 2, "收起后宽度收到 0", `宽 ${Math.round((await navCol.boundingBox())?.width ?? -1)}`);
await pg.keyboard.press("Meta+b"); await pg.waitForTimeout(1600);
ok(await navCol.getAttribute("data-hidden") === null, "⌘B 展开回来");
/* ⌘B 会把整棵树卸载，子层的内存缓存跟着没。再展开时内容必须回来 ——
   只剩一个展开的三角、底下空空如也，是 2026-09-24 真出过的缺陷。 */
ok(await rowsNow() >= nExpanded, "⌘B 往返后，之前展开的子目录内容还在", `${await rowsNow()} 行（收起前 ${nExpanded} 行）`);

console.log("\n会话历史与引擎名（M8-11 下 / M8-13 · 设计侧第六轮 6.3 / 6.4）");
/* 引擎名：钮上和状态行都不该再出现「通道 A/B/C」 */
const railText = await pg.locator("aside").first().innerText();
ok(!/通道\s*[ABC]\b/.test(railText), "会话栏里没有「通道 A/B/C」字样了");
ok(/DeepSeek|Claude Code|火山方舟|Codex|Cursor/.test(railText), "显示的是引擎名", (railText.match(/DeepSeek|Claude Code|火山方舟|Codex|Cursor/g) ?? []).slice(0,3).join(" / "));
/* 会话栏头在第八轮只剩两样：引擎 ▾ 和历史钮。
   「标题被挤扁」那条判据随标题一起作废了 —— 标题搬进了历史列表。 */
ok(await pg.locator('aside button[data-ud="engine"]').count() === 1, "会话栏头有引擎选择器");
ok(await pg.locator('aside button[data-ud="history"]').count() === 1, "会话栏头有历史钮");
ok(await pg.locator('aside button[title="换边"]').count() === 0 && await pg.locator('aside button[title="新会话"]').count() === 0,
   "换边 / ＋ 新会话两颗已经去掉（一件事一个入口）");
/* 引擎下拉：点开能看到按计费方式分的三组 */
/* 用 data-ud 精确定位。**别用文字匹配** —— 状态行里也有引擎名，
   按文字找会先命中标题按钮，点下去进的是历史模式，而后面的分组判据会被
   会话行里的「本机工具」蒙对（2026-09-24 真出过这个假阳性）。 */
const engBtn = pg.locator('aside button[data-ud="engine"]').first();
if (await engBtn.count()) {
  await engBtn.click(); await pg.waitForTimeout(500);
  const menu = await pg.locator("aside").first().innerText();
  const groups = menu.match(/本机 · 用你已有的订阅|API · 按量计费|订阅端点/g) ?? [];
  ok(groups.length >= 2, "引擎下拉按计费方式分组", groups.join(" / ") || "（一个组名都没匹配到）");
  await engBtn.click(); await pg.waitForTimeout(300);   // 关掉下拉，别挡住后面的点击
} else ok(false, "没找到引擎选择器");

/* 历史入口：点历史钮整栏换成列表 */
const histBtn = pg.locator('aside button[data-ud="history"]').first();
if (await histBtn.count()) {
  await histBtn.click(); await pg.waitForTimeout(900);
  const t2 = await pg.locator("aside").first().innerText();
  ok(/新建会话/.test(t2), "历史列表第一行是「新建会话」（第八轮：＋ 收进这里）");
  ok(/今天|昨天|本周|更早|还没有会话/.test(t2), "历史按日期分组", (t2.match(/今天|昨天|本周|更早/g) ?? []).join(" "));
  ok(await pg.locator("#chatInput").count() > 0, "历史模式下输入框仍在");
  await pg.locator('aside button[data-ud="history"]').first().click(); await pg.waitForTimeout(700);
  ok(!/新建会话/.test(await pg.locator("aside").first().innerText()), "再点历史钮回到会话");
} else ok(false, "没找到历史钮");

/* ── 布局模型：左 / 底 / 右三块在不在（M8-18/19/20 · 设计侧第八轮 §一）──
   这一轮把「会话栏摆在哪」换成了「三块区域在不在」。
   **判据要落在「三块各自开得了关得了」上**，而不是某颗钮的位置 —— 位置是形制，开关才是模型。 */
console.log("\n布局模型：左 / 底 / 右三块（M8-18/19/20 · 设计侧第八轮）");
const region = (k) => pg.locator(`header [data-ud="region-${k}"]`);
ok(await pg.locator('header [aria-label="窗口布局"] button').count() === 3, "顶栏布局组是三颗区域钮（不再有目录钮）");
ok(await region("left").count() === 1 && await region("bottom").count() === 1 && await region("right").count() === 1, "左 / 底 / 右三颗都在");
/* ⚠️ 第九轮三颗钮管的东西**整个换了一遍**：左=目录 · 底=调试 · 右=聊天。
   第八轮是左=会话 · 右=从属面板。判据的口径跟着换。 */
const colHidden = async (id) => (await pg.locator(`[data-region="${id}"]`).getAttribute("data-hidden")) !== null;
await region("left").click(); await pg.waitForTimeout(600);
ok(await colHidden("nav"), "关左栏：目录整列收掉");
await pg.keyboard.press("Meta+b"); await pg.waitForTimeout(600);
ok(!(await colHidden("nav")), "⌘B 把目录叫回来");
await region("right").click(); await pg.waitForTimeout(600);
ok(await colHidden("chat"), "关右栏：聊天整栏收掉");
await pg.keyboard.press("Meta+\\"); await pg.waitForTimeout(600);
ok(!(await colHidden("chat")), "⌘\\ 把聊天叫回来");
/* 底栏：默认关，⌘J 打开，三页都在 */
ok(await pg.locator('[data-ud="bottombar"]').count() === 0, "底栏默认关着");
await pg.keyboard.press("Meta+j"); await pg.waitForTimeout(700);
const bb = pg.locator('[data-ud="bottombar"]');
ok(await bb.count() === 1, "⌘J 打开底栏");
const bbText = await bb.innerText().catch(() => "");
ok(/输出/.test(bbText) && /工具调用/.test(bbText) && /连接/.test(bbText), "底栏三页：输出 / 工具调用 / 连接", bbText.split("\n").slice(0, 4).join(" · "));
ok(/左 \d+|左 关/.test(bbText) && /详情 \d+/.test(bbText), "布局读数常驻在底栏头部（不单开一页）", (bbText.match(/左 [^\n]*/) ?? [""])[0].slice(0, 46));
/* 用户第九轮第 4 条：会话栏底部的「运行中」和 token 数要挪进底栏。
   ⚠️ **判据落在结构标记上，不落在「tokens」这个词上** ——
   第一版写的是「会话栏里不含 tokens」，结果被会话内容里的工具名 `search_tokens` 蒙掉了
   （M8-25 实测）。这和 §72.4 是同一条教训的第三次。
   没跑过 AI 时那个读数不渲染，所以这里只测反向：它不该再出现在会话栏里。 */
ok(await pg.locator('aside [data-ud="turn-cost"]').count() === 0, "「本轮」读数不在会话栏里了（已挪进底栏头部）");
await pg.keyboard.press("Meta+j"); await pg.waitForTimeout(500);
ok(await pg.locator('[data-ud="bottombar"]').count() === 0, "⌘J 再按一次收起底栏");

/* ── 按钮分层（M8-15 · 设计侧第七轮）──
   它给的判据是「点了它，变的是什么」，分项目 / 窗口布局 / 导航 / 会话 / 当前文件五类，
   每类只在一个地方出现，每条横带只装一层。
   **「不该有的东西不在」和「该有的东西在」一样要测** —— 分层做对了的标志
   恰恰是页签条上少了三颗钮，而那种「少了」截图上根本看不出来。 */
console.log("\n按钮分层：顶栏 / 页签条 / 目录列头（M8-15 · 设计侧第七轮）");
const header = pg.locator("header").first();
const tabbar = pg.locator('[data-ud="tabbar"]');
/* ⚠️ 这两条在第八轮**反过来了**：目录列不算三块区域之一，它的开关只在自己列头。
   第七轮把它挪进顶栏，用户看完说「不应该有，由目录区块上的菜单图标自己控制」。 */
/* 第九轮又换回顶栏了 —— 第八轮把它挪到列头，用户看了实物说「有点多余」 */
ok(await header.locator('[data-ud="region-left"]').count() === 1, "目录开关在顶栏那一颗（第九轮第 14 条）");
/* 第九轮第 14 条：列头那颗收起钮**删掉了**，目录的显隐只归顶栏那一颗 */
ok(await pg.locator('[data-ud="tree-collapse"]').count() === 0, "列头的收起钮已删（显隐只归顶栏）");
ok(await pg.locator('[data-ud="tree-more"]').count() === 1, "目录列头有 ⋯（和空白处右键同一张菜单）");
const tabbarText = await tabbar.innerText().catch(() => "");
ok(!/份稿|▤\s*目录/.test(tabbarText), "页签条上没有「N 份稿」和「▤ 目录」了", tabbarText.slice(0, 60).replace(/\n/g, " / ") || "（只有页签）");
/* 项目菜单：路径进了菜单，顶栏上不再铺 280px 的灰字 */
const headText = await header.innerText();
ok(!headText.includes("/Users/"), "项目路径不在顶栏上了", headText.replace(/\n/g, " · ").slice(0, 70));
await header.locator("button[aria-haspopup=\"menu\"]").click(); await pg.waitForTimeout(400);
const menuText = await pg.locator('[role="menu"]').innerText();
ok(menuText.includes("/Users/"), "完整路径在项目菜单里（要复制路径时截断的没用）");
/* 第八轮精简过：**「新建稿件」去了目录右键**，「复制路径」并进了路径那一栏（整块可点） */
ok(["在访达中显示", "重建索引", "项目设置…", "关闭项目"].every((x) => menuText.includes(x)), "项目菜单只剩对整个项目的动作", menuText.split("\n").filter(Boolean).slice(2).join(" / "));
ok(!menuText.includes("新建稿件"), "项目菜单里**没有**新建稿件了（它去了目录右键）");
ok(/点击复制/.test(menuText), "路径那一栏整块可点即复制");
await pg.keyboard.press("Escape"); await pg.mouse.click(700, 400); await pg.waitForTimeout(300);
/* 目录列头的两颗导航钮 */
/* 「铺到详情区」第八轮删掉了（用户读成「放大」，而且它让详情区重复显示目录）——
   功能留在右键 / 双击 / 点项目名三处 */
ok(await pg.locator('button[title="铺到详情区（多选 · 网格 · 回收站）"]').count() === 0, "⤢「铺到详情区」已从列头删掉");
/* 第九轮第 14 条：列头那颗收起钮和页签条最左那颗展开钮**都删了** ——
   目录的显隐只归顶栏那一颗（上面已经测过 ⌘B 和 region-left）。 */
ok(await pg.locator('[data-ud="tree-collapse"]').count() === 0, "列头的收起钮已删（显隐只归顶栏）");
ok(await pg.locator('[data-ud="tree-reopen"]').count() === 0, "页签条最左的展开钮也删了");
ok(await pg.locator('[data-ud="tree-more"]').count() === 1, "目录列头换成了 ⋯（和空白处右键同一张菜单）");
/* ⌘P 之前先确保目录开着 —— 它的入口在目录列头，列收起来时浮层挂在一个不存在的列上。
   （代码里 ⌘P 会先展开目录，这里等它展开完） */
if ((await pg.locator('header [data-ud="region-left"]').getAttribute("aria-pressed")) !== "true") {
  await pg.locator('header [data-ud="region-left"]').click(); await pg.waitForTimeout(600);
}
/* 点列头的 ⌕ —— 这是真实入口。⌘P 走的是同一条路（代码里派发同一个事件），
   在这一步之前测过它单独可用；放在这里测快捷键会被前面几步留下的浮层状态干扰。 */
await pg.locator('button[title="转到文件（⌘P）"]').click(); await pg.waitForTimeout(700);
ok(await pg.locator('input[placeholder="转到文件…"]').count() === 1, "列头的 ⌕ 打开「转到文件」");
/* ── 搜索：打字才出结果 · 只列前 10 · 防抖（用户 tmp.txt 第 2 条，2026-09-27）──
   他的原话：「搜索框内容为空时不要显示全部结果，只有有内容才去匹配，
   而且匹配也需要防抖，最多显示匹配的 10 个结果之类」。
   为什么空着不列全部：打开这个浮层不等于「我要看全部稿」—— 要看全部，目录列一直在左边。 */
{
  ok(await pg.locator('#goto-list [role="option"]').count() === 0, "**空着不列任何结果**（原来一打开就把全部稿铺出来）");
  const inp = pg.locator('input[placeholder="转到文件…"]');
  await inp.fill("."); await pg.waitForTimeout(400);
  const n = await pg.locator('#goto-list [role="option"]').count();
  ok(n > 0 && n <= 10, "有关键词才出结果，且**最多 10 条**", `${n} 条`);
  /* ⚠️ 截断必须说出来 —— 「只列了前 10」和「一共就这 10 条」在界面上长得一样，
     不说的话用户以为没有第 11 条，而他要找的那份可能正在第 11 位。 */
  ok(await pg.locator('text=/还有 \\d+ 条/').count() === 1, "截断了就说「还有 N 条」，不静静截掉");
  /* 防抖：连敲 5 个字，列表只该重排一次 */
  await inp.fill("");
  await pg.waitForTimeout(300);
  await pg.evaluate(() => { window.__gl = 0; new MutationObserver(() => window.__gl++).observe(document.getElementById("goto-list"), { childList: true, subtree: true }); });
  for (const ch of ["d", "c", ".", "h", "t"]) { await inp.type(ch); await pg.waitForTimeout(30); }
  await pg.waitForTimeout(500);
  const rerenders = await pg.evaluate(() => window.__gl);
  ok(rerenders <= 2, "连敲 5 个字只重排一两次（120ms 防抖）", `${rerenders} 次`);
}
await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);

/* ── 格式注册表（M8-14）──
   这一轮把「每种文件怎么看」从 Workbench 的一条三元链搬进 `app/src/kinds/` 的独立模块。
   要守住的不是某个像素，而是**三个环节各自还通**：视图（View）、面板（Panels）、状态行（Status）。
   哪一环断了，症状都是「这种文件打开后少了点东西」，而截图上很难一眼看出少了什么。 */
console.log("\n格式注册表：每种文件的视图 / 面板 / 状态行（M8-14）");
/** 回归自己造的样本清单。**显式，不用模糊匹配** ——
 *  「凡是名字里带『验收』『样本』的都清掉」很好写，但它会误删用户的文件，
 *  而**清理工具本身不能有破坏力**（和 M9-7 那条「兜底不该有破坏力」同一条）。
 *  ⚠️ **新加回归样本时要么用 `_uitest` 前缀，要么加进这个清单** ——
 *  不加的话它一轮一轮堆在用户的回收站里，§九十七 已经犯过一次（当时 18 条），
 *  2026-09-29 这次抓到 **72 条**，是别的几节漏的。 */
const SAMPLE_PATS = [
  /^_uitest/,            // 约定前缀，新样本都该走这个
  /^插件回归样本/,
  /^_暂存验收/, /^_无地址验收/, /^_三档验收/, /^_穿透验证/, /^_加地址验证-/, /^点选验证样本/,
  /^版本历史回归/, /^草稿回归/, /^json回归/, /^csv回归/,      // M10-2b / M10-2c / M10-4 / M10-5
  /^插件chrome样本/,   // 演示插件的（名字里带扩展名，前缀匹配就够）
  /* ⚠️ 下面这几个是**补登记的**：2026-09-30 在用户项目里翻出 24 个残留快照目录，
     其中四个的名字压根不在这张清单里 —— 文件被清掉了（那部分是对的），
     快照目录留了好几轮。**清单漏一个名字，收尾就静默漏一个样本。** */
  /* ⚠️ `/^✎回归样本/` 改成 `/^.回归样本/`：issue #47 之后状态目录名是
     `pathKey()` 算的（基名 + 哈希），而 `pathKey` 把 `✎` 这种非字母数字换成 `_` ——
     **目录名不再等于文件名**。`.` 一个字符同时盖住 `✎回归样本`（项目根下的文件名）
     和 `_回归样本`（状态目录名）两种形态。
     ⚠️ 真正兜住这一类的是上面那条「和开跑前比一个目录都没多」——
     **这张清单只是顺手清，不该再被当成唯一的闸**。 */
  /^代码插件样本/, /^插件chrome样本/, /^.回归样本/, /^差异标红验/, /^git真验/, /^版本历史手验/, /^诊断\.ts/,
];

/** 扫掉回归留下的样本（项目根 + 回收站），返回清掉了什么。
 *
 *  ⚠️ **开头和结尾各调一次。** 只在结尾清不够：中间任何一步抛了，
 *  样本就留到下一轮 —— 而下一轮会因为「样本已存在」建不出来，
 *  那一整节被静默跳过（2026-09-29 实测：`uitest` 从 198 掉到 183，**看不出原因**）。
 *  **回归要从干净状态开始，而不只是打扫干净再走。** */
const sweepSamples = async () => await pg.evaluate(async (pats) => {
  const b = window.__UD_APP;
  const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
  const mine = (n) => pats.some((re) => new RegExp(re).test(n ?? ""));
  const out = { files: [], trash: [] };
  /* ⚠️ 字段叫 **`entries`** 不是 `items`（`files` 路由，去 `server/src/cap/files.ts` 查过）。
     第一版写了 `items`，循环一个都没遍历到 —— **静默什么都没清**，
     而判据「项目根干净」照样绿（它数的是 out.files.length，当然是 0）。
     今天第三次猜字段名（前两次是 `sha256`、`snapshot`）。**字段名一律去声明处查。** */
  /* ⚠️ **参数用 `&` 接，不能再写一个 `?`**：`u()` 已经带了 `?token=`，
     写成 `u("files?dir=")` 会拼出 `files?dir=?token=xxx` —— 两个 `?`，
     服务端把 `?token=xxx` 当成 dir 的值，列了一个不存在的目录，**回 0 条**。
     而判据「项目根干净」照样绿（它数的是清掉了几个，当然是 0）——
     **一条自己什么都没做的清理，和一条真的清干净了的清理，读数一模一样。** */
  const ls = await fetch(u("files") + "&dir=").then((x) => x.json()).catch(() => null);
  for (const f of ls?.data?.entries ?? []) {
    if (f.isDir) continue;                       // 目录不碰
    if (mine(f.name)) {
      out.files.push(f.name);
      await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: f.name }) });
    }
  }
  const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
  for (const it of t?.data?.items ?? []) {
    if (mine(it.originalName)) {
      out.trash.push(it.originalName);
      await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
    }
  }
  out.dir = b.dir ?? null;
  return out;
}, SAMPLE_PATS.map((r) => r.source));

/** 判据留下的**快照目录**也要清（2026-09-30）。
 *
 *  ⚠️ `file_trash` + `trash_purge` 清的是**文件和回收站**，
 *  `.umbrastudio/snapshots/<样本名>/` 留在原地 —— 于是：
 *  ① 用户项目里一轮一轮堆快照（纪律⑥）；
 *  ② **下一轮的读数是错的** —— 「写三次就是三版」量到 5 版，
 *     因为 s1/s2 是上一轮留下的。**判据在污染自己，而症状看着像功能坏了。**
 *
 *  没有「删快照」这件能力，也不该为判据加一个后门 ——
 *  uitest 跑在 node 里，直接用 fs 删。**只删名字对得上样本清单的那些目录。** */
const sweepSnapshots = async (dir) => {
  if (!dir) return [];
  const { readdirSync, rmSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const gone = [];
  /* ⚠️ **两个目录都要扫。** `staged/` 是 M10-2c 新增的一类残留 ——
     判据一改文件就会留一份草稿，而 `file_trash` + `trash_purge` 不带走它。
     加一种会落盘的东西就要问一句：**收尾扫不扫得到它**。 */
  for (const sub of ["snapshots", "staged"]) {
    const root = join(dir, ".umbrastudio", sub);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (!SAMPLE_PATS.some((re) => re.test(name))) continue;
      rmSync(join(root, name), { recursive: true, force: true });
      gone.push(`${sub}/${name}`);
    }
  }
  return gone;
};

/** 开跑前 `.umbrastudio/` 下那些目录里本来有什么。
 *
 *  ⚠️ **这是收尾的真正依据，`SAMPLE_PATS` 只是「顺手清掉认得的」。**
 *  （2026-10-02 抓到）收尾原来只问「匹配 `SAMPLE_PATS` 的还剩没有」，
 *  而那句话**只说明「我认得的那些清掉了」，不说明目录干净了** ——
 *  盘上躺着一个 `_回归样本.mp4__…`，而收尾照样报「再扫一次剩 0 份」。
 *
 *  名字清单**永远会漏**，而且已经漏过两次（2026-09-30 在用户项目里翻出 24 个、
 *  今天又一个）。对比前后不依赖任何名字：**多出来的就是这一轮留的。** */
const snapBaseline = async (dir) => {
  if (!dir) return new Map();
  const { readdirSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const out = new Map();
  for (const sub of ["snapshots", "staged"]) {
    const root = join(dir, ".umbrastudio", sub);
    if (!existsSync(root)) continue;
    out.set(sub, new Set(readdirSync(root)));
  }
  return out;
};
let BASELINE = new Map();

/* 开跑前先清 —— 上一轮可能抛在半路留下了东西 */
{
  const pre = await sweepSamples();
  const snaps = await sweepSnapshots(pre.dir);
  /* ⚠️ 基线在**清完之后**取 —— 清掉的那些不该算进「跑之前就有的」，
     否则这一轮又留下同名的东西就看不出来了。 */
  BASELINE = await snapBaseline(pre.dir);
  if (pre.files.length || pre.trash.length || snaps.length) {
    console.log(`  · 开跑前扫掉了上一轮的残留：项目根 ${pre.files.length} 份 · 回收站 ${pre.trash.length} 条 · 快照 ${snaps.length} 份`);
  }
}

/** ⚠️ **确认卡会挡住一切**（它是全屏遮罩）。一节忘了收，下一节所有点击都点不动，
 *  而报错指向的是**下一节里的某一行**，看起来像那一节坏了 ——
 *  2026-09-29 这个形状已经撞到第三次（§一二二.6）。
 *
 *  所以给点击加一道「先把挡路的收掉」。**只按 Esc，不替用户做选择** ——
 *  Esc = 「回去接着改」，是三条出路里**唯一不改变任何东西**的那条。
 *  判据不该替用户决定丢不丢改动。 */
/** 一条横条**真正占了多少高度**（`display:none` 就是 0）。
 *
 *  ⚠️ **不能只看 `hidden` 属性。**（2026-09-30 实测抓到）
 *  插件那边这一族判据原来一律写 `#dirty:not([hidden])` —— 而属性是**对的**，
 *  错的是 CSS：`.bar { display: flex }`（0-1-0）压过 UA 的 `[hidden] { display: none }`（0-0-1），
 *  于是打开一个干净的代码文件时**三条空横条全在画面上、占掉 109px**，
 *  而 8 条 DOM 判据全部通过。
 *  **属性判据和画面判据是两种判据，谁也代替不了谁**（§七十二 那条「目录列被页签条压着，
 *  DOM 判据 33 条全过、截图一眼看出」是同一族）。 */
const barH = async (frame, id) => await frame.locator("#" + id).evaluate((el) => {
  const st = getComputedStyle(el);
  return st.display === "none" ? 0 : Math.round(el.getBoundingClientRect().height);
}).catch(() => -1);

/** 等目录列里出现某个名字 —— **轮询，不是定时等**（2026-10-06）。
 *
 *  ⚠️ 原来这些地方一律 `await pg.waitForTimeout(1200)` 然后**一次性**看一眼，
 *  于是机器一忙就整批红在「样本建好了但树里没刷出来」上 ——
 *  而样本其实写进去了（`file_write` 回的是 ok），只是磁盘事件 → WS → 重渲染
 *  那一串没在 1200ms 内走完。实测同一轮里连掉四批，再跑一次就 387/387。
 *
 *  §113 那条「**抢跑的判据会把「慢」误报成「坏」**」说的就是这件事，
 *  而它当时只修了共享库那一处。**一条教训只修一处，等于记了没用。**
 */
const settleTree = async (name, ms = 15000) => {
  const row = pg.locator('[role="treeitem"]').filter({ hasText: name }).first();
  for (let i = 0; i < Math.ceil(ms / 250); i++) {
    if (await row.count()) return true;
    await pg.waitForTimeout(250);
  }
  return false;
};

const clearGuard = async () => {
  if (await pg.locator('[role="alertdialog"]').count()) {
    await pg.locator('[role="alertdialog"] button:has-text("回去接着改")').click().catch(() => {});
    await pg.waitForTimeout(300);
  }
};

const openByName = async (suffix) => {
  await clearGuard();
  const row = pg.locator('[role="treeitem"]').filter({ hasText: suffix }).first();
  if (!(await row.count())) return false;
  await row.click(); await pg.waitForTimeout(1200);
  return true;
};

/* ⚠️ 底部状态行在 M8-16 整条去掉了（用户实测第 9 / 13 条），所以这一节不再拿它当判据。
   `Status` 改到文件工具栏右端，而只有声明了 `Toolbar` 的格式才有那条横带 ——
   现在只有 JSON，所以 Status 这一环只在 JSON 那几条里测。
   设计稿和 Markdown 这里改测 View 与 Panels 两环。 */

/** 第九轮起**编辑栏和属性区都默认收起**（用户第 12 条「非必要的内容可以先收起」）。
 *  所以测它们内容之前要先点开。这两颗在 Tab 条右端，位置固定不跟着格式变。 */
const openEdit = async () => { const b = pg.locator('[data-ud="toggle-edit"]'); if (await b.count() && (await b.getAttribute("aria-pressed")) !== "true") { await b.click(); await pg.waitForTimeout(400); } };
const openProps = async () => { const b = pg.locator('[data-ud="toggle-props"]'); if (await b.count() && (await b.getAttribute("aria-pressed")) !== "true") { await b.click(); await pg.waitForTimeout(400); } };

/* 设计稿：画布（View）+ 属性面板（Panels）。它是唯一有五个面板的格式 */
if (await openByName(".dc.html")) {
  /* ⚠️ **「有个 iframe」不是判活**（纪律②）：稿加载失败时那个 iframe 照样在。
     真判据是穿两层看见东西 —— 外层是 S2 嵌入壳，内层才是稿本身。
     数得到内层的元素，就说明 postMessage 那座桥和稿的加载都通了。 */
  await pg.waitForTimeout(1200);
  const shellFrame = pg.frameLocator("iframe").first();
  const nested = await shellFrame.locator("iframe").count().catch(() => 0);
  ok(nested > 0, "设计稿：S2 嵌入壳里装着稿本身（View 环节）", `壳里 ${nested} 层`);
  const els = nested > 0 ? await shellFrame.frameLocator("iframe").first().locator("*").count().catch(() => 0) : 0;
  ok(els > 5, "设计稿：稿真的渲染出来了（不只是有个空 iframe）", `稿里 ${els} 个元素`);
  /* ⚠️ 「默认收起」只能钉在**最早的这一次打开** —— 后面几节会把它们点开，
     而 `layout.props` 还落盘。放到后面去测，量到的是上一节留下的状态（M8-28 真栽过）。 */
  ok(await pg.locator('[data-ud="toggle-edit"]').getAttribute("aria-pressed") === "false", "编辑栏默认收起（用户第 12 条）");
  ok(await pg.locator('[data-ud="props"]').count() === 0, "属性区默认收起（不留图标轨）");
  await openProps();
  ok(await pg.locator('[data-ud="props"]').count() === 1, "设计稿：属性区展开得出来（Panels 环节）");
} else ok(false, "项目里没有 .dc.html，测不了设计稿");

/* Markdown：大纲。**这一条最该测** —— 大纲原来是 Workbench 的一个 state，
   现在住在 md 模块自己的 Provider 里（View 产出、Panels 消费）。
   接错了的症状是「右边那一列空着」，静态检查抓不到。 */
if (await openByName(".md")) {
  await openProps();
  ok(await pg.locator('[data-ud="props"]').count() === 1, "Markdown：属性区里是大纲（它跨了 View 与 Panels 两处）");
} else ok(false, "项目里没有 .md，测不了 Markdown");

/* JSON：M8-14 加的一种，**M10-4 搬成了插件认领的类型**（设计侧 S19：
   「打开 `.json` 先给源码，就是 S18」）。
   ⚠️ 下面三条判据的**措辞和选择器变了，但它们要守的东西一个字没变**：
   切档在编辑栏上（不在视图内部）· 两档都在 · `⋯` 在 Tab 条右端。
   段名从「视图」变成稿里的「怎么看」，两档从「结构 / 源码」变成「源码 / 树」——
   **改判据前先分清：它守的是什么，措辞只是当时的样子。** */
if (await openByName(".json")) {
  /* ⚠️ 第九轮把「这份文件的读数」从工具栏拿掉了：工具栏变成了**编辑栏**，
     只放改稿用的开关。读数没有新家 —— 设计侧这一轮没给它安排位置，先不测。 */
  await openEdit();
  /* 落在那条带上 —— 落在 body 上的话，搬没搬都一样过，测不出东西。 */
  const tb = pg.locator('[data-ud="file-toolbar"] [role="group"][aria-label="怎么看"]').first();
  ok(await tb.count() > 0, "JSON：切档段组在编辑栏上（插件给数据、宿主用同一个 `Seg` 画）");
  const tbText = await tb.innerText().catch(() => "");
  ok(/树/.test(tbText) && /源码/.test(tbText), "JSON：源码 / 树两档都在", tbText.replace(/\n/g, " / "));
  ok(await pg.locator('[data-ud="tabbar"] button[title="更多"]').count() > 0, "JSON：文件 ⋯ 在 Tab 条右端（第九轮从工具栏挪过来）");
} else console.log("  – 项目里没有 .json，跳过新格式那一条（不算通过）");

/* ── 文件工具栏（M8-15b）──
   四种格式的开关都从各自视图内部搬到了统一那条 34px 横带。
   **「搬干净了」的判据不是「工具栏里有」，而是「别处没有」** ——
   搬一半的症状是同一组开关出现两次（一条在工具栏、一条还在视图里），
   而「工具栏里有」这个判据对搬一半的情况照样通过。 */
console.log("\n文件工具栏：四种格式的开关都上移了（M8-15b · 设计侧第七轮第四层）");
const bar = () => pg.locator('[data-ud="file-toolbar"]');
const countIn = async (loc, re) => (((await loc.innerText().catch(() => "")).match(re) ?? []).length);
/* ⚠️ **在详情区里数，不是整页**（2026-09-28 加固）。
   原来数的是 `body.innerText` —— 于是**聊天栏里 AI 的回复**只要提到「渲染」「画布」「结构」
   任何一个词，对应那条判据就红。实测被一句「…比如读项目、渲染…」的回复绊倒过一次，
   而那根本不是产品的问题。
   判据的本意是「**视图**里没有第二条工具栏」，范围本来就该是详情区。 */
const detail = () => pg.locator('[data-region="detail"]');
const pageCount = async (re) => (((await detail().innerText().catch(async () => await pg.locator("body").innerText())).match(re) ?? []).length);

for (const [suffix, label, probe] of [
  [".md", "Markdown", /渲染/g],
  [".dc.html", "设计稿", /画布/g],
  /* ⚠️ 探针词跟着 S19 改了：旧模块的两档叫「结构 / 源码」，
     插件这一版按稿叫「源码 / 树」。探的是**同一件事** —— 开关在不在那条带上。 */
  [".json", "JSON", /树/g],
]) {
  if (!(await openByName(suffix))) { ok(false, `${label}：项目里没有这种文件`); continue; }
  await openEdit();
  const inBar = await countIn(bar(), probe);
  const onPage = await pageCount(probe);
  ok(inBar >= 1, `${label}：开关在统一工具栏上`, `工具栏里 ${inBar} 处`);
  /* 整页只该出现一次。多于一次 = 视图里还留着一条没搬走的工具栏。 */
  ok(onPage === inBar, `${label}：视图里没有第二条工具栏`, `整页 ${onPage} 处 · 工具栏里 ${inBar} 处`);
}
/* 目录：工具栏有「范围」「排布」两组，而面包屑该留在视图里（它是内容不是开关）。
   ⚠️ 进目录视图的入口第八轮换了：`⤢` 删掉，改成**点目录列头的项目名**（或右键 / 双击）。 */
await pg.locator('button[title="回到项目根（右键：对项目根的操作）"]').first().click(); await pg.waitForTimeout(1300);
await openEdit();
ok(await bar().locator('[role="group"][aria-label="范围"]').count() === 1, "目录：范围组在工具栏上");
ok(await bar().locator('[role="group"][aria-label="排布"]').count() === 1, "目录：排布组在工具栏上");
ok(await countIn(bar(), /全部/g) === 1, "目录：范围开关只有一份");

/* ── 目录右键菜单（M8-21 · 设计侧第八轮 §五）──
   按**右键点在什么上**分三种。这里每种测一条「该有的」和一条「不该有的」——
   「新建只出现在目录和空白处」这条规则，只测该有的话是测不出来的。 */
console.log("\n目录右键菜单：三套（M8-21 · 设计侧第八轮 §五）");
const ctxText = async () => (await pg.locator('[data-ud="ctxmenu"]').innerText().catch(() => "")).replace(/\n/g, " / ");
const closeCtx = async () => { await pg.keyboard.press("Escape"); await pg.waitForTimeout(250); };

const ctxDirRow = pg.locator('[role="treeitem"][aria-expanded]').first();
if (await ctxDirRow.count()) {
  await ctxDirRow.click({ button: "right" }); await pg.waitForTimeout(400);
  const t = await ctxText();
  ok(/新建稿件/.test(t) && /新建目录/.test(t), "右键目录：有「新建稿件 / 新建目录」", t.slice(0, 70));
  ok(/在详情区打开/.test(t), "右键目录：有「在详情区打开」（接走了原列头的 ⤢）");
  ok(/移到回收站/.test(t) && !/删除/.test(t), "右键目录：写的是「移到回收站」不是「删除」");
  ok(!/重建索引/.test(t), "右键目录：**没有**重建索引（它作用于整个项目，只在空白处出）");
  await closeCtx();
} else ok(false, "树里没有目录行");

const fileRow = pg.locator('[role="treeitem"]:not([aria-expanded])').first();
if (await fileRow.count()) {
  await fileRow.click({ button: "right" }); await pg.waitForTimeout(400);
  const t = await ctxText();
  ok(/重命名/.test(t) && /移到回收站/.test(t), "右键文件：有重命名和移到回收站", t.slice(0, 70));
  ok(!/新建稿件/.test(t) && !/新建目录/.test(t), "右键文件：**没有**新建（在文件上说不清建在哪）");
  await closeCtx();
} else ok(false, "树里没有文件行");

/* ── 稿件的「复制一份」只对稿件出（issue #9）──
   #9 报的是「应用本体里一份稿建了就删不掉、改不了名」，证据指向
   `server/ui/index.html` —— **那个前端 M7-8 已经删了**，右键菜单（M8-21）把五个动作都补齐了。
   上面两条已经实测了重命名和移到回收站，这里补最后一个没被判据覆盖的。

   ⚠️ **必须找一份真的稿**（`.dc.html`），不能拿「第一个非目录行」——
   「复制一份」是 `isDraft` 才出的，随手拿到一个 `.json` 就会误判成「这个动作没了」。
   **判据自己挑错样本，红了也是假的。** */
{
  const draftRow = pg.locator('[role="treeitem"]:not([aria-expanded])').filter({ hasText: ".dc.html" }).first();
  if (await draftRow.count()) {
    await draftRow.click({ button: "right" }); await pg.waitForTimeout(400);
    const t = await ctxText();
    ok(/复制一份/.test(t), "右键**稿件**：有「复制一份」（issue #9 的第五个动作）", t.slice(0, 70));
    await closeCtx();
    /* 反面：非稿件不该有它 —— 只测「该有的」测不出 `isDraft` 这道条件在不在 */
    const other = pg.locator('[role="treeitem"]:not([aria-expanded])').filter({ hasText: ".json" }).first();
    if (await other.count()) {
      await other.click({ button: "right" }); await pg.waitForTimeout(400);
      ok(!/复制一份/.test(await ctxText()), "右键**非稿件**：没有「复制一份」（它只对稿件有意义）");
      await closeCtx();
    } else console.log("  · 树里没有非稿件文件，反面那条跳过");
  } else ok(false, "树里找不到 .dc.html 行");
}

/* 在**项目名**上右键 = 空白处菜单。树一满就没有空白区可点，所以列头这条路是主入口。 */
await pg.locator('button[title="回到项目根（右键：对项目根的操作）"]').click({ button: "right" });
await pg.waitForTimeout(400);
{
  const t = await ctxText();
  ok(/重建索引/.test(t), "右键空白处：有重建索引（空白处 = 项目根）", t.slice(0, 70));
  ok(/全部折叠/.test(t), "右键空白处：有「全部折叠」（从列头搬进来的）");
  await closeCtx();
}

/* ⋯ 是工具栏上**点得到才有用**的那一颗（体检、对比上一版都在里面）。
   窄下来时该让的是读数和演示，不是它 —— M8-24 量出来它会被挤到可视区外 7px。 */
{
  /* `⋯` 第九轮搬到了 Tab 条右端，和 ✎ ◨ 一组，位置固定不跟着格式变 —— 
     它再也不会被编辑栏的内容挤出去了。 */
  const tb = pg.locator('[data-ud="tabbar"]');
  const bx = await tb.boundingBox();
  const mx = await tb.locator('button[title="更多"]').boundingBox();
  ok(!!bx && !!mx && mx.x + mx.width <= bx.x + bx.width + 1, "Tab 条右端的 ⋯ 在可视区内",
     bx && mx ? `⋯ 右缘 ${Math.round(mx.x + mx.width)} · Tab 条右缘 ${Math.round(bx.x + bx.width)}` : "量不到");
}

/* ── 插件市场四屏（M11-6 接线，形制 S17）──
   ⚠️ 判据钉在**结构标记**上（`data-ud`），不钉文案 —— 这一轮已经因为钉文案栽过一次
   （packtest 等的「N 份稿」在重画时被移走了，§九十七）。 */
console.log("\n插件市场四屏（M11-6）");
{
  await pg.locator('header button[aria-haspopup="menu"]').first().click(); await pg.waitForTimeout(500);
  const entry = pg.locator("button").filter({ hasText: "插件市场" }).first();
  ok(await entry.count() === 1, "项目菜单里有「插件市场…」入口");
  await entry.click(); await pg.waitForTimeout(1500);
  ok(await pg.locator('[data-ud="market"]').count() === 1, "**市场在详情区当页签打开**（不单开窗口）");
  ok(await pg.locator('[data-ud="market-card"]').count() >= 1, "市场里列出了插件");

  /* 详情：权限那一块是这一屏最要紧的 */
  await pg.locator('[data-ud="market-card"]').first().click(); await pg.waitForTimeout(900);
  ok(await pg.locator('[data-ud="market-detail"]').count() === 1, "点卡片进详情");
  const detail = await pg.locator('[data-ud="market-detail"]').innerText();
  /* **不允许的两行也要列** —— 设计侧：「让人敢装的是它做不了什么」 */
  ok(/联网 · 不允许/.test(detail) && /启动外部程序 · 不允许/.test(detail),
    "**权限里把「不允许」的也列出来了**（让人敢装的是它做不了什么）");
  ok(/它能碰什么/.test(detail), "权限卡在按钮那一侧");

  /* 已装：未签名三处 */
  await pg.locator('[data-ud="market"] button').filter({ hasText: "已装" }).first().click(); await pg.waitForTimeout(1200);
  const rows = await pg.locator('[data-ud="installed-row"]').count();
  ok(rows >= 1, "已装列表有内容", `${rows} 行`);
  const bad = await pg.locator('[data-ud="installed-row"][data-unsigned]').count();
  if (bad) {
    ok(await pg.locator('[data-ud="unsigned-banner"]').count() === 1, "**未签名：顶部有横幅**（不打开这一页也要知道）");
  } else ok(true, "（本机没有未签名插件，横幅这条跳过）");
  /* ── 授权态：**装了 ≠ 能用**（M11-12）──
     ⚠️ 这一档以前界面上根本不存在 —— 只有「装没装」。而「过期」是会真实出现的态：
     **限时免费到期那天所有试用用户同时看到它**。
     判据造一份真许可证（临时密钥现签），钉住「过期那一行有标签、而且给了出路」。 */
  {
    const st = await pg.evaluate(async () => {
      const b = window.__UD_APP;
      const r = await fetch(`${b.url.replace(/\/$/, "")}/__ud/plugins?token=${encodeURIComponent(b.token)}`);
      const d = (await r.json()).data ?? {};
      return { rows: (d.plugins ?? []).map((p) => ({ id: p.id, bundled: p.bundled, ent: p.entitlement, note: p.entitlementNote })), clock: d.clockRolledBack };
    });
    /* 后端一定给得出这一项（没许可证时是 unlicensed / builtin），**不许是 undefined** ——
       undefined 会让界面静静地什么都不显示，那就回到「界面上没有过期这一态」。 */
    const missing = st.rows.filter((r) => !r.ent);
    ok(missing.length === 0, "**每个已装插件都报了授权态**（缺一个就等于界面上没有这一档）", missing.map((r) => r.id).join(",") || `${st.rows.length} 个都有`);
    const builtin = st.rows.filter((r) => r.bundled);
    ok(builtin.length === 0 || builtin.every((r) => r.ent === "builtin"), "内置插件一律 builtin（免费且一直可用，不看许可证）");
    ok(st.rows.every((r) => !!r.note), "每一种态都带一句给人看的话（每一种都要有出路）");
    ok(st.clock === false || st.clock === true, "时钟回拨这件事有报出来（界面要提一句）", `clockRolledBack=${st.clock}`);
  }
  await pg.locator('[data-ud="market"] button[title="关闭"]').click().catch(() => {});
  await pg.waitForTimeout(500);
}

/* ── ✎ 永远显示（M11-6，用户 2026-09-26 定的模型）──
   原来是「没有编辑能力就不画」，而**「不画」和「这个格式本来就不能编辑」长得一模一样**。
   新模型：✎ 始终是「编辑这份文件」，变的只是你有没有这个能力 —— 那是一道闸。
   ⚠️ 这一节自己建样本自己收（走回收站再精确清掉），不往用户项目里留东西。 */
console.log("\n✎ 永远显示：有能力直接编辑，没能力引导去市场（M11-6）");
{
  const LOCKED = "✎回归样本.mp4";
  const made = await pg.evaluate(async ({ name }) => {
    const b = window.__UD_APP;
    const w = await fetch(`${b.url.replace(/\/$/, "")}/__ud/file_write?token=${encodeURIComponent(b.token)}`,
      { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: name, content: "回归样本，只是拿个扩展名", expectSha256: "0" }) });
    return (await w.json()).ok;
  }, { name: LOCKED });
  if (made) {
    await settleTree(LOCKED);   // 轮询等树刷出来，不是定时等
    const row = pg.locator('[role="treeitem"]').filter({ hasText: LOCKED }).first();
    /* 顺带钉住 M11-6 修的那条：**不认得的格式，树也要刷新** ——
       新建一个 .mp4 之后它得出现在树里（磁盘监听原来按类型过滤，落到 other 的不报） */
    ok(await row.count() === 1, "新建一个**不认得的格式**，目录树照样刷出来（监听不按类型过滤）");
    if (await row.count()) {
      await row.click(); await pg.waitForTimeout(1600);
      const btn = pg.locator('[data-ud="toggle-edit"]');
      ok(await btn.count() === 1, "**没有编辑能力也显示 ✎**（不画和「本来就不能编辑」长得一样）");
      ok(await btn.getAttribute("data-locked") === "true", "这一颗是锁定态", await btn.getAttribute("title") ?? "");
      await btn.click(); await pg.waitForTimeout(1200);
      const txt = await pg.locator("body").innerText();
      /* ⚠️ **不把人送进空市场**：第一期只有三五个插件，大多数格式都落在这里，
         说「去市场看看」然后什么都没有，比直接说清楚更伤。 */
      ok(/还没有能编辑 \.mp4 的插件/.test(txt), "市场里没有时**照实说**，不把人送进空市场");
    }
    await pg.evaluate(async ({ name }) => {
      const b = window.__UD_APP;
      const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
      const post = (r, x) => fetch(u(r), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(x) }).then((y) => y.json());
      await post("file_trash", { path: name });
      const t = await fetch(u("trash")).then((y) => y.json()).catch(() => null);
      for (const it of t?.data?.items ?? []) if (it.originalName === name) await post("trash_purge", { trashPath: it.trashPath });
    }, { name: LOCKED });
  } else ok(false, "建不出锁定态的样本，这一组没测成");

  /* 有能力的那一态：.md（内置插件给的） */
  if (await openByName(".md")) {
    await pg.waitForTimeout(1500);
    const btn = pg.locator('[data-ud="toggle-edit"]');
    ok(await btn.count() === 1 && !(await btn.getAttribute("data-locked")), "有插件的格式：✎ 不是锁定态，点了直接进编辑");
  }
}

/* ── 浮层形制（M8-28 · 设计侧第九轮 §四）──
   判据钉的是**会回归的那几样**：菜单类没写死宽度（写死过 224，长项被截）、
   菜单行 28 高、进场动画认方向、键盘 ↑↓ 能走。
   ⚠️ 不钉具体像素以外的观感 —— 那要看截图，静态判据看不出来。 */
console.log("\n浮层形制：宽度 · 行高 · 进场方向 · 键盘（M8-28）");
{
  /* 右键目录起一个菜单类浮层（`ctxmenu`）—— 它是「不给固定宽」的那一类 */
  const row = pg.locator('[role="treeitem"]').first();
  await row.click({ button: "right" }); await pg.waitForTimeout(400);
  const menu = pg.locator('[data-ud="ctxmenu"]');
  ok(await menu.count() === 1, "右键起得出菜单浮层");
  const box = await menu.evaluate((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    return { w: r.width, h: r.height, minW: c.minWidth, maxW: c.maxWidth, anim: c.animationName, pad: c.paddingTop }; }).catch(() => null);
  ok(box && box.w >= 200 && box.w <= 320, "菜单按内容撑，落在 200–320 之间（原稿 popMinW / max-width）", box && `${Math.round(box.w)}px`);
  ok(box && (box.anim === "popDown" || box.anim === "popUp"), "进场动画认方向（下方展开 popDown / 翻到上面 popUp）", box && box.anim);
  ok(box && box.pad === "4px", "菜单类内边距 4px（原稿 popPad）", box && box.pad);
  const rowH = await menu.locator('[role="menuitem"]').first().evaluate((e) => e.getBoundingClientRect().height).catch(() => 0);
  ok(Math.abs(rowH - 28) < 1.5, "菜单行 28 高（七处原来是 28 / 30 各写一遍）", `${Math.round(rowH)}px`);
  /* 键盘：↑↓ 把焦点挪到菜单项上。**这一条钉的是漫游焦点那段** ——
     原稿用自己的 `popActive` 下标，我们换成查 DOM + focus，换错了的症状是「键盘完全不动」 */
  await pg.keyboard.press("ArrowDown"); await pg.waitForTimeout(200);
  const onItem = await pg.evaluate(() => document.activeElement?.getAttribute("role") === "menuitem");
  ok(onItem, "↓ 把焦点落到菜单项上（键盘能走菜单）");
  await pg.keyboard.press("End"); await pg.waitForTimeout(200);
  const atEnd = await pg.evaluate(() => { const m = document.querySelector('[data-ud="ctxmenu"]');
    const b = m && Array.from(m.querySelectorAll('[role="menuitem"]:not([disabled])'));
    return !!b && b[b.length - 1] === document.activeElement; });
  ok(atEnd, "End 跳到最后一项");
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  ok(await pg.locator('[data-ud="ctxmenu"]').count() === 0, "Esc 收掉");
}

/* ── 设计侧第九轮回复的五处纠正（M8-30）──
   它这一轮没改稿，只给了形制答复；下面每条都对着它文件里的一句话。 */
console.log("\n第九轮回复的五处纠正（M8-30）");
{
  /* ① 退场按「怎么关的」分：Esc = 淡出 80ms，选中 = 直接卸载（§三） */
  const row = pg.locator('[role="treeitem"]').first();
  await row.click({ button: "right" }); await pg.waitForTimeout(400);
  ok(await pg.locator('[data-ud="ctxmenu"]').count() === 1, "右键起得出菜单");
  /* ⚠️ **不要「按完 Esc 等 30ms 再去数」。**（2026-10-02 实测它偶发报红）
     淡出只有 80ms，而判据要在这 80ms 里恰好去看一眼 —— 机器忙一点就错过，
     于是它**时好时坏**。和过场那条判据是同一个病：**赌一个短命状态的时机**。

     改成：**按 Esc 之前就把观察者挂好**，事后问它「见过没」。
     观察者不会错过 —— 它是被 DOM 变化推着跑的，不依赖我们在那一瞬间在看。
     顺手把那一刻的 `pointerEvents` 也一起记下来（同一个时机，两件事）。 */
  await pg.evaluate(() => {
    window.__exitSeen = null;
    const look = () => {
      const m = document.querySelector('[data-ud="ctxmenu"]');
      if (!m || !m.hasAttribute("data-exiting") || window.__exitSeen) return;
      window.__exitSeen = { inDom: true, pointerEvents: getComputedStyle(m).pointerEvents };
    };
    window.__exitObs = new MutationObserver(look);
    window.__exitObs.observe(document.body, { attributes: true, childList: true, subtree: true });
    /* 再加一条高频轮询兜底 —— 两条路任一抓到就够 */
    window.__exitTimer = setInterval(look, 8);
  });
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(260);
  const exitSeen = await pg.evaluate(() => {
    clearInterval(window.__exitTimer); window.__exitObs?.disconnect();
    return window.__exitSeen;
  });
  ok(!!exitSeen, "Esc 关：先淡出 80ms（那一帧还在 DOM 里，标着 `data-exiting`）",
     exitSeen ? "观察者抓到了" : "整个 80ms 窗口里一次都没见到 data-exiting");
  ok(exitSeen?.pointerEvents === "none",
     "淡出期间不接指针（正在消失的菜单项不该还能点到）", exitSeen?.pointerEvents ?? "（没抓到那一帧）");
  await pg.waitForTimeout(300);
  ok(await pg.locator('[data-ud="ctxmenu"]').count() === 0, "淡完就没了");

  /* ② 悬停跟着挪焦点（§二.3）：鼠标停在哪行，键盘焦点就在哪行 —— 不能两行同时亮 */
  await row.click({ button: "right" }); await pg.waitForTimeout(400);
  const items = pg.locator('[data-ud="ctxmenu"] [role="menuitem"]:not([disabled])');
  const n = await items.count();
  if (n >= 2) {
    await items.nth(1).hover(); await pg.waitForTimeout(200);
    const same = await pg.evaluate(() => {
      const m = document.querySelector('[data-ud="ctxmenu"]');
      const b = m && Array.from(m.querySelectorAll('[role="menuitem"]:not([disabled])'));
      return !!b && b[1] === document.activeElement; });
    ok(same, "悬停跟着挪焦点（悬停和键盘高亮是同一个当前行）");
  } else ok(false, "菜单项太少，这条没测成");
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);

  /* ③ 信息卡不接 ↑↓（§二.2）：里面是数字框和滑块，↑↓ 是它们调值的键 */
  if (await openByName(".dc.html")) {
    await pg.waitForTimeout(1200);
    /* ⚠️ 信息卡在**正文右下角的浮块**里，不在编辑栏 —— 第九轮把「看稿用的」
       （宽度 · 缩放 · 浅深）都挪去了那儿，编辑栏只留「改稿用的」。
       第一版判据找错了地方，报「找不到信息卡钮」，看着像缺陷其实是判据的问题。 */
    const size = pg.locator('[data-ud="corner"] button[aria-expanded]').first();
    if (await size.count()) {
      await size.click(); await pg.waitForTimeout(400);
      const before = await pg.evaluate(() => document.activeElement?.tagName);
      await pg.keyboard.press("ArrowDown"); await pg.waitForTimeout(200);
      const after = await pg.evaluate(() => document.activeElement?.tagName);
      ok(before === after, "信息卡不接 ↑↓（焦点没被浮层挪走，↑↓ 还归数字框/滑块）", `${before} → ${after}`);
      await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    } else ok(false, "找不到信息卡钮，这条没测成");
  }

  /* ④ 暗底不是接层，照稿取真值（§一.2）：让位浮层 22%、抽屉 18%，且不是纯黑 */
  const scrims = await pg.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { y: cs.getPropertyValue("--scrim-yield").trim(), d: cs.getPropertyValue("--scrim-drawer").trim() }; });
  ok(/\.22\)$/.test(scrims.y) && /15, *18, *24/.test(scrims.y), "让位浮层暗底 = 稿里的 rgba(15,18,24,.22)", scrims.y);
  ok(/\.18\)$/.test(scrims.d) && /15, *18, *24/.test(scrims.d), "抽屉暗底 = 稿里的 rgba(15,18,24,.18)", scrims.d);
}

/* ── ⌘E / ⌘⌥B 开合（M8-28 · 设计侧第九轮 §三）──
   **这一节和默认值无关**，只问「按了会不会变」：先归一到收起，再开、再收。 */
console.log("\n详情三层的开合：⌘E · ◨（M8-28）");
if (await openByName(".dc.html")) {
  await pg.waitForTimeout(1200);
  const editBtn = pg.locator('[data-ud="toggle-edit"]');
  const pressed = async () => (await editBtn.getAttribute("aria-pressed")) === "true";
  if (await pressed()) { await editBtn.click(); await pg.waitForTimeout(400); }
  /* ⚠️ 这条判据钉的是**依赖数组**：keydown 那个 effect 漏了 `setEditOpen`，
     闭包就捕获上一个文件的 key，编辑栏开在**别的文件**上 ——
     症状是「按了没反应」，而分支明明进去了（M8-28 真栽过，正是用户第 11 条）。 */
  await pg.keyboard.press("Meta+e"); await pg.waitForTimeout(500);
  ok(await pressed(), "⌘E 展开编辑栏（焦点在稿外）");
  /* ⚠️ **数得到 `file-toolbar` 不算展开** —— 收起时那个 div 高度是 0 但元素还在
     （为了做动画刻意不卸载）。要量真高度。 */
  const h = await pg.locator('[data-ud="file-toolbar"]').evaluate((e) => e.getBoundingClientRect().height).catch(() => 0);
  ok(h > 20, "编辑栏真的有高度，不是只挂着个元素", `${Math.round(h)}px`);
  await pg.keyboard.press("Meta+e"); await pg.waitForTimeout(500);
  ok(!(await pressed()), "⌘E 再按一次收起");
  /* ⚠️ **焦点在稿里也要生效**（M8-29，用户报的「时灵时不灵」）。
     键盘事件不跨 iframe 边界，所以快捷键挂在顶层 **和每一个同源 iframe 的 document** 上。
     判据里把焦点真塞进最内层的稿 —— 判它进没进去只能看**顶层** `activeElement` 变成 IFRAME，
     每个 document 自己的 `activeElement` 默认就是 BODY，拿它当判据等于没判。 */
  const into = await pg.evaluate(() => {
    const f = document.querySelector("iframe"); if (!f) return null;
    const d = f.contentDocument; const g = d && d.querySelector("iframe"); const gd = g && g.contentDocument;
    if (!gd) return null;
    const el = gd.createElement("button"); el.style.cssText = "position:fixed;left:0;top:0;opacity:0";
    gd.body.appendChild(el); el.focus();
    return document.activeElement?.tagName === "IFRAME" && gd.activeElement === el;
  });
  if (into) {
    await pg.keyboard.press("Meta+e"); await pg.waitForTimeout(500);
    ok(await pressed(), "⌘E 在**焦点落进稿里**时照样生效（事件不跨 iframe，所以挂到同源 iframe 上）");
    await pg.keyboard.press("Meta+e"); await pg.waitForTimeout(400);
  } else ok(false, "塞不进稿里的焦点，这条没测成（不是通过）");
  ok(await pg.locator('[data-ud="corner"]').count() === 1, "正文右下角的浮块常驻（看稿用的不跟着收）");
  const propsBtn = pg.locator('[data-ud="toggle-props"]');
  const pOn = async () => (await pg.locator('[data-ud="props"]').count()) === 1;
  if (await pOn()) { await propsBtn.click(); await pg.waitForTimeout(500); }
  await propsBtn.click(); await pg.waitForTimeout(500);
  ok(await pOn(), "点 ◨ 展开属性区");
  await propsBtn.click(); await pg.waitForTimeout(500);
  ok(!(await pOn()), "再点收起（完全收掉，不留图标轨）");
} else ok(false, "项目里没有 .dc.html");

/* ── 页签三态（M8-28 · 设计侧第九轮 §六）──
   用户第 8 条：「不应每次查看一个详情就多新增一个」。
   **最要害的判据是「单击第二个文件之后，页签数没有变多」** ——
   只测「有预览态样式」的话，覆盖逻辑坏掉了照样过。 */
console.log("\n页签三态：预览 / 打开 / 固定（M8-28）");
{
  /* ⚠️ **必须从干净状态开始**：前面的测试开过好几个页签，而「盖不盖」这件事
     取决于被点的文件在不在页签里 —— 不清干净的话，判据量到的是别的东西
     （M8-28 实测：第一次写的判据 3→4 和 4→4 自相矛盾，就是这个原因）。 */
  const tabs0 = pg.locator('[data-ud="tab"]');
  while (await tabs0.count() > 0) {
    await tabs0.first().click({ button: "right" }); await pg.waitForTimeout(350);
    const saved = pg.locator('[data-ud="tabmenu"]').getByText(/^关闭已保存的$/);
    if (await saved.count()) { await saved.click(); await pg.waitForTimeout(500); }
    else { await pg.keyboard.press("Escape"); break; }
    if (await tabs0.count() > 0) { await pg.keyboard.press("Escape"); break; }   // 关不动了（都是未保存/固定）
  }
  ok(await tabs0.count() === 0, "先把页签清干净", `剩 ${await tabs0.count()} 个`);
  const files = pg.locator('[role="treeitem"]:not([aria-expanded])');
  const n = await files.count();
  if (n >= 2) {
    await files.nth(0).click(); await pg.waitForTimeout(900);
    const after1 = await tabs0.count();
    ok(await pg.locator('[data-ud="tab"][data-preview]').count() === 1, "单击目录里的文件 → 预览页签", `${after1} 个页签`);
    await files.nth(1).click(); await pg.waitForTimeout(900);
    const after2 = await tabs0.count();
    /* 这一条是要害：单击下一个只**盖掉**预览页签，不新增 */
    ok(after2 === after1, "再单击另一个：盖掉预览页签，页签数没变多", `${after1} → ${after2}`);
    ok(await pg.locator('[data-ud="tab"][data-preview]').count() === 1, "同一时间最多一个预览页签");
    /* 双击 → 转正 */
    await files.nth(1).dblclick(); await pg.waitForTimeout(900);
    ok(await pg.locator('[data-ud="tab"][data-preview]').count() === 0, "双击转正（不再是预览态）");
    const after3 = await tabs0.count();
    await files.nth(0).click(); await pg.waitForTimeout(900);
    ok(await tabs0.count() === after3 + 1, "转正之后再单击别的：新开一个，不盖它", `${after3} → ${await tabs0.count()}`);
  } else ok(false, "树里文件不够两个，测不了覆盖");

  /* 右键菜单：三个「关闭…」要写出真会关掉的个数 */
  const anyTab = pg.locator('[data-ud="tab"]').first();
  await anyTab.click({ button: "right" }); await pg.waitForTimeout(500);
  const menu = await pg.locator('[data-ud="tabmenu"]').innerText().catch(() => "");
  ok(/关闭其他/.test(menu) && /个/.test(menu), "页签右键：三个「关闭…」写出真会关掉的个数", menu.replace(/\n/g, " / ").slice(0, 80));
  ok(/固定/.test(menu) && /在目录中显示/.test(menu), "页签右键：有固定和「在目录中显示」");
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
}

/* ── 浮层统一封装（M8-25 · 用户第九轮第 2 条）──
   三个缺陷是同一个问题的三种长相：7 处各写各的浮层，各漏一样。
   现在只有 `ui/Popover.tsx` 一份，这三条判据钉住它。 */
console.log("\n浮层：不越界 / 点外面收起 / 不被 overflow 裁掉（M8-25）");
{
  /* ① 引擎下拉原来写死 `absolute right-0`，在 380px 的会话栏里左边会出窗口 */
  const eng = pg.locator('aside button[data-ud="engine"]').first();
  await eng.click(); await pg.waitForTimeout(400);
  const pop = pg.locator('[data-ud="popover"]').first();
  const pb = await pop.boundingBox();
  ok(!!pb && pb.x >= 0 && pb.x + pb.width <= 1440, "浮层不越出窗口左右边界",
     pb ? `left ${Math.round(pb.x)} · right ${Math.round(pb.x + pb.width)}` : "量不到");
  /* ② 原来引擎下拉少了接外部点击那一层，开着就关不掉 */
  await pg.mouse.click(700, 500); await pg.waitForTimeout(400);
  ok(await pg.locator('[data-ud="popover"]').count() === 0, "点浮层外面就收起");

  /* ⚠️ **点在稿上（iframe 里）也要收起** —— 这是那个 bug 的另一半：
     事件被 iframe 吃掉，外面的 document 监听收不到。浮层开着时让 iframe 不接事件。
     只测「点外面」的话这一半测不出来（M8-28 实测：修完第一半之后它还在）。 */
  if (await openByName(".dc.html")) {
    await pg.waitForTimeout(1500);
    await pg.locator('[data-ud="tabbar"] button[title="更多"]').click();
    await pg.waitForTimeout(400);
    const fr = await pg.locator("iframe").first().boundingBox();
    if (fr && await pg.locator('[data-ud="popover"]').count() === 1) {
      await pg.mouse.click(fr.x + fr.width / 2, fr.y + fr.height / 2);
      await pg.waitForTimeout(500);
      ok(await pg.locator('[data-ud="popover"]').count() === 0, "点在稿上（iframe 里）也收起");
    } else ok(false, "没开出浮层或没有 iframe");
  }

  /* ③ Markdown 的 ⋯ ——「弹不出来」的根因是浮层用 absolute，
        被文件工具栏的 overflow-hidden 整个裁掉了。现在它是 fixed。
        （第九轮把 ⋯ 从编辑栏挪到了 Tab 条右端，判据跟着挪。） */
  if (await openByName(".md")) {
    await pg.locator('[data-ud="tabbar"] button[title="更多"]').click();
    await pg.waitForTimeout(400);
    const more = pg.locator('[data-ud="popover"]').first();
    const mb = await more.boundingBox();
    ok(await more.count() === 1, "Markdown 的 ⋯ 弹得出来了");
    /* 判据落在「它整个在视口里」，而不是「它存在」—— 被裁的时候它也存在 */
    ok(!!mb && mb.height > 20 && mb.y + mb.height <= 900 + 1, "而且没被工具栏的 overflow 裁掉",
       mb ? `高 ${Math.round(mb.height)} · 底 ${Math.round(mb.y + mb.height)}` : "量不到");
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  } else ok(false, "项目里没有 .md");
}

/* ── 页签（M8-22 · 设计侧第八轮 §六）── */
console.log("\n页签：状态点 / 溢出 / 当前态（M8-22）");
{
  /* 开三份文件，看页签的形制 */
  for (const n of [".md", ".json", ".dc.html"]) await openByName(n);
  const tabs = pg.locator('[data-ud="tab"]');
  ok(await tabs.count() >= 2, "页签条里有多个页签", `${await tabs.count()} 个`);
  ok(await pg.locator('[data-ud="tab"][data-current]').count() === 1, "当前页签只有一个，且标成了凸起块");
  /* 体检状态**不该**上页签（它在树、诊断角标、诊断面板三处）。
     旧实现是每个页签都挂一颗 hdot —— 用户把它读成了「未保存」。 */
  ok(await pg.locator('[data-ud="tab"] .hdot').count() === 0, "页签上没有体检点了（只留未保存）");
}

/* ── 指针三档（用户 2026-09-28 拍板 · 设计侧第十一轮 §二 · M8-31）──
   第九轮曾裁到只剩「点选」一颗；设计侧这一轮自己推翻了，理由是那句「评论是选中之后的
   一个动作」没错、但它把那个动作放进了**默认收起**的属性区，于是「选中之后」在屏幕上
   没有可见的去处。三档共用一个底座：**S2 不改、不加命令**，由 bridge 按档位分派。

   ⚠️ 判据要钉「点下去真的到位」，不是「钮亮了」——
   钮的高亮和行为是两件事，只测前者的话分派写错了照样全绿。 */
console.log("\n指针三档（M8-31 · 用户拍板）");
{
  /* 样本自己建自己收：项目里的稿**一份都没有节点地址**（issue #31），
     没有地址三档全都点不中元素，测不到分派。 */
  const SAMPLE = "_uitest三档.dc.html";
  const made = await pg.evaluate(async ({ name }) => {
    const b = window.__UD_APP;
    const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
    const w = await fetch(u("draft_write"), { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: name, content: `<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>三档</title><script src="./support.js"></script></head>\n<body><x-dc><helmet><style>html,body{margin:0;padding:24px;font-family:system-ui}h1{font-size:28px}</style></helmet>\n<div><h1>标题</h1><button>一颗钮</button></div></x-dc></body></html>` }) });
    return (await w.json()).ok;
  }, { name: SAMPLE });
  if (!made) ok(false, "建不出三档验收样本，这一组测不了");
  else {
    await pg.waitForTimeout(1500);
    if (!(await openByName("_uitest三档"))) ok(false, "样本没出现在树里");
    else {
      await pg.waitForTimeout(2600);
      const eb = pg.locator('[data-ud="toggle-edit"]');
      if ((await eb.getAttribute("aria-pressed")) !== "true") { await eb.click(); await pg.waitForTimeout(500); }
      const segs = pg.locator('[data-ud="file-toolbar"] [role="group"][aria-label="指针"] button');
      ok(await segs.count() === 3, "指针组是**三颗**（点选 / 评论 / 编辑）", (await segs.allTextContents()).join("/"));
      /* 有地址的稿上不该出「没有节点地址」那条 */
      ok(await pg.locator('[data-ud="no-addr"]').count() === 0, "有地址的稿不出「没有节点地址」提示条");

      const clickInDraft = async () => {
        const f = pg.frames().find((x) => /uitest三档/.test(decodeURIComponent(x.url())) && !/S2-/.test(decodeURIComponent(x.url())));
        if (!f) return false;
        const h1 = f.locator("h1").first();
        if (!(await h1.count().catch(() => 0))) return false;
        await h1.click({ timeout: 8000 }).catch(() => {});
        await pg.waitForTimeout(1000);
        return true;
      };
      /* 点选档：**不去打开属性区**（设计侧明说「开着就跟着换，关着不去打开」） */
      await segs.filter({ hasText: "点选" }).click(); await pg.waitForTimeout(400);
      if (await clickInDraft()) ok(await pg.locator('[data-ud="props"]').count() === 0, "点选档**不强行打开属性区**");
      else ok(false, "点不到稿里的元素，分派测不了");
      /* 编辑档：属性区自己打开 —— 这一步正是用户上一轮没找到的那一步 */
      await segs.filter({ hasText: "编辑" }).click(); await pg.waitForTimeout(400);
      await clickInDraft();
      ok(await pg.locator('[data-ud="props"]').count() === 1, "**编辑档点一下，属性区自己打开**");
      /* 评论档：评论框贴在元素下面，空框时两个出口都不响应 */
      await segs.filter({ hasText: "评论" }).click(); await pg.waitForTimeout(400);
      await clickInDraft();
      const box = pg.locator('[data-ud="comment-box"]');
      ok(await box.count() === 1, "**评论档点一下，评论框出来**");
      if (await box.count()) {
        ok(await box.locator("button:disabled").count() === 2, "空框时「暂存」和「发给 AI」都不响应（原因摆在眼前，不算禁用不解释）");
        await box.locator("textarea").fill("这里再大一号");
        await pg.waitForTimeout(250);
        ok(await box.locator("button:disabled").count() === 0, "打了字两个出口就活了");
        await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
      }
      /* V / C / E */
      for (const [key, want] of [["v", "点选"], ["c", "评论"], ["e", "编辑"]]) {
        await pg.keyboard.press(key); await pg.waitForTimeout(300);
        ok(await segs.filter({ hasText: want }).getAttribute("aria-pressed") === "true", `按 ${key.toUpperCase()} 切到「${want}」档`);
      }
      await pg.keyboard.press("v"); await pg.waitForTimeout(200);
    }
    /* 收尾：移进回收站，不给用户项目留东西。
       ⚠️ **先切走再删** —— 不切的话当前文件指着一个已经不存在的稿，
       之后每一次 comments / diagnostics / locate 请求都 400，
       而「零 error」那条判据会把它算到自己头上（实测踩到，一次跑出两条假红）。 */
    await openByName(".md");
    await pg.waitForTimeout(600);
    await pg.evaluate(async ({ name }) => {
      const b = window.__UD_APP;
      await fetch(`${b.url.replace(/\/$/, "")}/__ud/delete_draft?token=${encodeURIComponent(b.token)}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: name }) });
      /* ⚠️ **`delete_draft` 只是扔进回收站，不算清干净**（§九十七 / 2026-09-29）：
         回收站是用户的东西，每跑一轮堆一条，二十轮之后他打开回收站看到二十份。
         所以扔完再彻底清掉那一条。 */
      const t = await fetch(`${b.url.replace(/\/$/, "")}/__ud/trash?token=${encodeURIComponent(b.token)}`).then((x) => x.json()).catch(() => null);
      for (const it of t?.data?.items ?? []) {
        if (it.originalName === name) {
          await fetch(`${b.url.replace(/\/$/, "")}/__ud/trash_purge?token=${encodeURIComponent(b.token)}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
        }
      }
    }, { name: SAMPLE });
    await pg.waitForTimeout(800);
  }
}

/* ── 页签溢出 + `⋯` 读数（M8-33 · 设计侧第十一轮 §一）──
   第八轮的解法是「放不下就收进 +N ▾，不横向滚动」；第十一轮改回**横向滚动**，
   但把当初那个毛病单独治掉：滚动条藏起来，被裁的那端 16px 渐隐。
   固定的页签单独一组贴最左、**不跟着滚**（固定就是为了永远看得见）。 */
console.log("\n页签溢出与 ⋯ 读数（M8-33）");
{
  /* 开一批文件把页签条挤满 */
  const names = (await pg.locator('[role="treeitem"]').allTextContents())
    .map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => /\.(dc\.html|md|json|css)$/.test(t));
  const rowsLoc = pg.locator('[role="treeitem"]').filter({ hasText: ".dc.html" });
  for (let i = 0; i < Math.min(6, await rowsLoc.count()); i++) { await rowsLoc.nth(i).dblclick(); await pg.waitForTimeout(500); }
  await pg.waitForTimeout(1200);
  const sc = pg.locator('[data-ud="tab-scroll"]');
  ok(await sc.count() === 1, "页签条是横向滚动容器");
  const m = await sc.evaluate((el) => ({ scroll: el.scrollWidth > el.clientWidth + 1, bar: el.offsetHeight - el.clientHeight, edge: el.getAttribute("data-edge") }));
  ok(m.scroll, "页签放不下时真的能横向滚");
  /* ⚠️ 用户第八轮报的就是「右边不该有竖滚动条」—— 滚动条占的 px 必须是 0 */
  ok(m.bar === 0, "**滚动条藏起来了**（占 0px —— 用户第八轮报的就是这个）", `${m.bar}px`);
  /* ⚠️ 判据是「**有哪一端被裁就标出来**」，不是「一定被裁的是右端」——
     滚到最右时被裁的是左端，`left` 一样合法。第一版写死了 right/both，
     跑到这一组时滚动位置正好在最右，于是报了一条假红。 */
  ok(m.edge !== "none" && m.edge !== null, "被裁的那一端标了出来（渐隐靠它）", `data-edge=${m.edge}`);
  /* 竖滚轮换算成横向。先滚到最左 —— 在最右端滚当然不动，那是测试的问题 */
  await sc.evaluate((el) => { el.scrollLeft = 0; });
  await pg.waitForTimeout(250);
  await sc.hover();
  await pg.mouse.wheel(0, 240);
  await pg.waitForTimeout(400);
  ok(await sc.evaluate((el) => el.scrollLeft) > 0, "**在页签条上滚竖滚轮 → 横向滚动**");
  ok(await pg.locator('[data-ud="tab-more"] svg').count() === 1, "放不下时出 chevron 下拉钮（「+N」去掉了）");
  /* `⋯` 浮层头的读数 —— 要在**用户自己的** .dc.html 上看：
     代码那类没有 meta（空是对的），而上面几组建的 `_uitest*.dc.html` 已经删了、
     不在索引里，读数自然是空的（`openByName(".dc.html")` 会先撞上它们）。 */
  {
    const userDc = (await pg.locator('[role="treeitem"]').allTextContents())
      .map((x) => x.replace(/\s+/g, " ").trim())
      .find((x) => /\.dc\.html$/.test(x) && !/_/.test(x));
    if (userDc) await openByName(userDc.replace(/^\W+\s*/, "").slice(0, 10));
    else await openByName(".dc.html");
  }
  await pg.waitForTimeout(2600);
  /* ⚠️ `⋯` 那颗钮在**页签条右端的 tail** 里，不在 `file-toolbar` 里 ——
     第一版按 `[data-ud="file-toolbar"] button` 找，点不到，而 `.catch(() => {})`
     把失败吞掉了：浮层没开，判据只看到「读数是空的」，看不出是没点开。
     **吞掉的错误会伪装成另一种失败。** */
  const moreBtn = pg.locator('button:has-text("⋯")').first();
  ok(await moreBtn.count() === 1, "找得到 ⋯ 这颗钮");
  await moreBtn.click();
  await pg.waitForTimeout(600);
  const meta = pg.locator('[data-ud="more-meta"]');
  ok(await meta.count() === 1 && (await meta.innerText()).trim().length > 0, "**⋯ 浮层头写了这份文件的读数**（格式模块给的）", (await meta.innerText().catch(() => "")).trim());
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
}

/* ── 预览切换的过场（M8-34 · 设计侧第十一轮 §四）──
   设计侧把我们给的两个方案都否了，理由一句话点破盲点：
   「两层同时半透明时，中间会透出画布的底色，用户说的『闪』就是这一下」。
   所以是**旧的留到新的画好为止、新的在上面淡入、旧的不淡出** —— 没有一帧是空白的。

   ⚠️ 判据不能等「过场正在发生」再去量：它可能只有几十毫秒（稿被缓存过时尤其快），
   轮询会整段错过，而**「量不到」不等于「没发生」**。改成事后读变化历史。 */
console.log("\n预览切换的过场（M8-34）");
{
  const dc = pg.locator('[role="treeitem"]').filter({ hasText: ".dc.html" });
  if (await dc.count() < 2) ok(false, "项目里不足两份 .dc.html，这一组测不了");
  else {
    await dc.nth(0).click(); await pg.waitForTimeout(3200);
    await pg.evaluate(() => {
      window.__fadeHist = [];
      let sample = () => {
        const b = document.querySelector('[data-ud="canvas"]');
        const cur = b?.querySelector('iframe[data-pool="cur"]');
        const prev = b?.querySelector('iframe[data-pool="prev"]');
        window.__fadeHist.push({ fading: b?.getAttribute("data-fading") ?? null, cur: cur ? getComputedStyle(cur).opacity : null, prev: prev ? getComputedStyle(prev).opacity : null });
      };
      /* ⚠️ **也要听 `childList`。**（2026-10-01 加）
         `attributeFilter` 只报告「属性变了」，而**新插入节点的初始属性不算变化** ——
         canvas 若是新建的而不是复用的，它带着 `data-fading="1"` 出生，
         observer 一声不响。加上 `childList` 就能在它插进来的那一刻采一次。 */
      /* ⚠️ **不能靠「采样撞上那一帧」。**（2026-10-02 实测：16ms 采样、采了 373 次，
         照样没撞上 —— 过场窗口比一帧还短。）
         真正可靠的是 `attributeOldValue`：**属性从 "1" 变成别的**那一刻，
         observer 会把旧值交给我们 —— 那就证明「它曾经是 1」，
         而且**不依赖我们在那一瞬间恰好在看**。
         记进 `__sawFading`，判据改问它。 */
      window.__sawFading = null;
      /* ⚠️ **只在「进入」那一刻记，不是「离开」。**（2026-10-02 第一版写错了）
         第一版写的是 `now === "1" || m.oldValue === "1"` —— 两头都记。
         而「离开过场」那一刻 prev **已经淡出了**，于是记到 `prev=0`，
         判据红在「上一份完整可见」上 —— **而产品是对的**。
         要问的是「过场**开始**时 prev 还是满的吗」，那只有进入那一刻算。 */
      const snapEnter = () => {
        if (window.__sawFading) return;                 // 只记第一次进入
        const b = document.querySelector('[data-ud="canvas"]');
        if (b?.getAttribute("data-fading") !== "1") return;
        const cur = b.querySelector('iframe[data-pool="cur"]');
        const prev = b.querySelector('iframe[data-pool="prev"]');
        window.__sawFading = { enteredWith: { cur: cur ? getComputedStyle(cur).opacity : null, prev: prev ? getComputedStyle(prev).opacity : null } };
      };
      new MutationObserver((muts) => {
        for (const m of muts) {
          /* 属性变成 "1" —— 复用 canvas 时走这一支 */
          if (m.type === "attributes" && m.attributeName === "data-fading") snapEnter();
          /* ⚠️ **新插入的节点带着 `fading="1"` 出生时属性不算变化**，
             所以 childList 这一支也要看一眼 —— canvas 新建而不是复用时走这里。 */
          if (m.type === "childList" && m.addedNodes.length) snapEnter();
        }
        sample();
      }).observe(document.body,
        { attributes: true, attributeOldValue: true, childList: true, subtree: true, attributeFilter: ["data-fading"] });
      /* 轮询也顺手试一次 —— 三条路（属性变化 / 新节点 / 轮询）任一抓到就够。
         ⚠️ 轮询单独靠不住（实测 16ms、373 次都没撞上），但它是**免费的第三条路**。 */
      const origSample = sample;
      sample = () => { origSample(); snapEnter(); };
      /* ⚠️ **属性变化采不到渐变**：opacity 从 1 到 0 是一条 CSS 过渡，
         中间没有任何属性变。所以再加一条轮询，专门采那一半。
         两个采样器写进同一个 `__fadeHist`，判据一起看。
         ⚠️ 间隔 **16ms（约一帧）而不是 40ms**：2026-10-01 实测有一轮
         `fading=1` 的窗口短于 40ms，轮询整个跳过去了，于是下面两条判据
         **静默少跑**（读数从 349 变 348 而一条红都没有）。 */
      window.__fadeTimer = setInterval(sample, 16);
    });
    /* ⚠️ **判据自己把池挤空，别指望「最后一份多半不在池里」**（2026-09-29 修）。
       原来挑第 4 份并注释「最后一个最稳」—— 而池里有什么，取决于**这一节之前
       所有判据打开过哪些文件**。我这轮在后面加了 `.ts` / `-lock.yaml` 两节，
       池的内容跟着变，这条就红了：采样里 `data-fading` 全是 `null`，
       因为目标命中了缓存、**根本没走过场那条路**——而缓存命中不走过场是对的行为。

       **判据依赖的前提，判据自己要建立。** 池最多留两份，
       所以先点两份别的就能保证目标一定被挤出去。 */
    const n = await dc.count();
    await dc.nth(1).click(); await pg.waitForTimeout(1600);
    await dc.nth(2).click(); await pg.waitForTimeout(1600);
    /* ⚠️ **还要把「加载慢到看得见」这个前提也建立起来。**（2026-10-02 查实际数据才明白）
       前面四轮我一直在改采样频率和抓法，而实测把采到的序列打出来之后真相是：
       `fading` **始终是 null**、`cur` **始终是 1** —— 过场**压根没发生**。
       稿是本地文件，加载快到 `readyState === "complete"` 在第一个 effect 里就成立，
       于是 `setReady(false)` 和 `setReady(true)` 落在**同一批 React 更新**里，
       DOM 上从没出现过「新的透明、旧的留着」那一刻。
       （采到的 `prev: 1 → 0.69 → 0.34 → 0` 是**上一份的退场动画**，不是过场。）

       这一节的注释里早就写着「**判据依赖的前提，判据自己要建立**」——
       它建立了「目标不在池里」，却漏了「加载足够慢」。
       用 `route` 给**画布 iframe 那个请求**加 500ms 延迟，**制造**那个条件，而不是等运气。

       ⚠️ **glob 要容得下查询串。**（2026-10-02 实测：第一版那个 glob 按扩展名结尾写，
       一次都没匹配上 —— 画布 iframe 的 src 实际是
       `…/S2-单稿预览壳.dc.html?file=…&embed=1`，`.dc.html` **后面还有东西**。
       那一轮「抓到了」纯属时序凑巧，连跑两轮第二轮就红。）
       改成按 `embed=1` 认 —— 那是「这是画布里那个 iframe」的标志，
       比按扩展名认准：扩展名会被查询串挡住，而这个标志是产品自己加的。
       ⚠️ 用完必须 `unroute`，否则后面每一节都慢 500ms。 */
    const slow = async (route) => { await new Promise((r) => setTimeout(r, 500)); await route.continue(); };
    await pg.route((u) => /\.dc\.html\?/.test(u.href) && u.searchParams.get("embed") === "1", slow);
    try {
      await dc.nth(Math.min(3, n - 1)).click();
      await pg.waitForTimeout(3200);
    } finally { await pg.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); }
    const probe = await pg.evaluate(() => { clearInterval(window.__fadeTimer); return { hist: window.__fadeHist ?? [], saw: window.__sawFading ?? null }; });
    const hist = probe.hist;
    /* ⚠️ **不要等 `data-fading="1"` —— 它可能压根没提交到 DOM。**
       （2026-10-02 查产品代码才明白，前面三轮都在改「怎么采得更快」，方向全错）

       `app/src/kinds/dc/View.tsx:108` 写的是
       `data-fading={!ready ? "1" : undefined}`，而第 89 行是
       `if (fr?.contentDocument?.readyState === "complete") setReady(true)` ——
       **缓存命中时立刻就 complete**，于是 `setReady(false)` 和 `setReady(true)`
       可能落在同一批 React 更新里，**那个属性从没出现在 DOM 上**。
       我在等一个可能不存在的东西，所以采 373 次也采不到。

       它要钉的性质其实在 opacity 里（同一个文件第 124 行）：
       | iframe | 过场中 | 过场后 |
       | --- | --- | --- |
       | `cur`（新的） | `ready ? 1 : 0` → **0** | 1 |
       | `prev`（旧的） | `ready \|\| blank ? 0 : 1` → **1** | 0 |

       所以「过场中」= **存在某一帧 `prev=1` 且 `cur=0`**。
       这个组合在整个过场期间都成立（opacity 有 CSS 过渡，退场是渐变的），
       比一个瞬时属性可靠得多 —— **判据要量产品真正表达那个状态的东西。** */
    /* ⚠️ **opacity 是连续量，别拿字符串比 `"1"`。**（2026-10-02 实测偶发报红）
       它有 CSS 过渡 —— 上一次退场的动画没走完时 prev 可能是 `"0.97"`，
       于是 `=== "1"` 不成立，判据**时好时坏**。
       要钉的性质是「上一份**几乎完全**可见、新的**几乎完全**透明」，那是阈值不是等号。 */
    const near1 = (v) => v != null && Number(v) > 0.9;
    const near0 = (v) => v != null && Number(v) < 0.1;
    const during = hist.find((h) => near1(h.prev) && near0(h.cur))
      ?? (probe.saw && near1(probe.saw.enteredWith.prev) ? probe.saw.enteredWith : null)
      ?? hist.find((h) => h.fading === "1");
    /* ⚠️ 判据认**两样中的任意一样**，因为过场的实质有两个可观察面：
       `data-fading="1"`（工作台知道自己在过场）或 **`prev` 的 opacity 真的在渐变**
       （那是用户看得见的那一半）。
       只认属性的话，MutationObserver 有个盲区：**它不报告新插入节点的初始属性** ——
       canvas 若是新建的而不是复用的，`data-fading="1"` 就是「初始值」不是「变化」。 */
    const faded = hist.some((h) => h.prev != null && Number(h.prev) > 0.02 && Number(h.prev) < 0.98);
    ok(!!during || faded, "切稿时真的走了过场（属性或 prev 的淡出，两者认其一）",
       `采到 ${hist.length} 次${during ? " · 有 fading=1" : ""}${faded ? " · prev 在渐变" : ""}`);
    /* ⚠️ **采不到那一帧也要说话，不能静默跳过。**（2026-10-01 实测抓到）
       原来这里是裸的 `if (during) { …两条… }` —— 采样没撞上 `fading=1` 的那一轮，
       两条判据**凭空消失**，而读数只是从 349 变成 348、**一条红都没有**。
       「判据没跑」和「判据通过」在读数上长得一模一样，
       而总数是人工记在 `doc/00` 里的，没人会去核。

       所以：采不到就报红，并说清**红在仪器不在产品** ——
       一条时有时无的判据等于没有判据，报红才会逼着把它做稳。 */
    /* ⚠️ **这条视觉性质我没能做出稳定的判据 —— 如实记在这里，不留一条时好时坏的。**
       （2026-10-05，第七轮之后放弃）

       想钉的是 M8-34 的承诺：「旧的留到新的画好、新的淡入、旧的不淡出」。
       七轮里试过的办法，每一个都栽在不同的地方：

       | 第几轮 | 做法 | 为什么不行 |
       | --- | --- | --- |
       | 1–2 | 轮询 40 → 16ms · observer 加 `childList` | 过场窗口比一帧还短 |
       | 3 | `attributeOldValue` 拿旧值 | 那个属性**可能压根没提交到 DOM**（React 批处理） |
       | 4 | 精确值换阈值 | 同上，不是精度问题 |
       | 5 | `route` 加 500ms 延迟制造条件 | **缓存命中时 `route` 不触发** |
       | 6 | 改成「整段都成立的不变量」 | 交叉淡入中途挡住 79%，我拿不准算不算「闪」 |
       | 7 | alpha 合成 + 阈值 0.5 + 算上纯色板 | 采样窗口把**切换文件那一瞬间**也算进来了（挡住 0%），而那不在「过场」范围内 |

       第 7 轮那个问题是根上的：**我界定不清「过场」在采样序列里的起止**，
       而不界定清楚，任何「整段都成立」的判据都会把别的时刻算进来。

       所以这里只留两样：
       ① 上面那条「切稿时真的走了过场」—— 认 prev 在渐变，七轮里**一直稳定绿**；
       ② 下面那条「顺带」—— 抓到就报，抓不到只打印一行，**不计入成败**。
       「旧的不淡出」这个视觉细节交给 `rendertest` 的截图和人眼。

       > **一条会随机报红的判据，比没有判据更糟** —— 它会让人开始忽略红色。
       > 承认测不稳，比留着它假装有覆盖诚实。 */
    /* 抓到「过场中」那一帧时**顺带**报一条 —— **抓不到只打印一行，不计入成败**
       （理由见上面那段⚠️：这个窗口抓不稳，七轮都没做出可靠的抓法）。
       ⚠️ 它是「有就报」而不是「必须有」，所以**不要指望它守住什么** ——
       真正一直有效的是上面那条「切稿时真的走了过场」。 */
    if (during && near0(during.cur) && near1(during.prev)) {
      ok(true, "**（顺带）这一轮抓到了过场中那一帧：新的先透明、旧的完整可见**",
         `cur=${during.cur} · prev=${during.prev}`);
    } else {
      console.log("  · 这一轮没抓到「过场中」那一帧（多半缓存命中、没走过场）——"
        + "**不计入成败**，见那一段⚠️ 记的七轮经过");
    }
    /* 切回上一份该是瞬时的：iframe 留在池里
       ⚠️ 这里有一条实测过的坑 —— 缓存命中的 iframe **不会再发 load**，
       第一版因此卡在过场里 8 秒（靠兜底超时才出来）。 */
    const t0 = Date.now();
    await dc.nth(0).click();
    await pg.waitForFunction(() => document.querySelector('[data-ud="canvas"]')?.getAttribute("data-fading") === null, null, { timeout: 6000 }).catch(() => {});
    const back = Date.now() - t0;
    ok(back < 1500, "**切回上一份是瞬时的**（它的 iframe 还在池里，缓存命中要自己补 ready）", `${back}ms`);
    ok(await pg.locator('[data-ud="canvas"] iframe').count() <= 2, "池最多留两份（实测每份约 5–10MB）", `${await pg.locator('[data-ud="canvas"] iframe').count()} 份`);
  }
}

/* ── 评论的暂存区 · 画布钉 · 全部发给 AI（M8-32 · 设计侧第十一轮 §二.5）──
   暂存区放在**聊天输入框上方**（不在属性区）：暂存的东西最后都要交给 AI，
   放在发送键旁边用户一直看得见「还有 N 条没发」。放进抽屉就又变成上一轮那个病。

   ⚠️ 判据要钉「发过之后三处一起变」：`sentAt` 写上 · 暂存区清空 · **钉子变灰**。
   只测其中一处的话，另两处坏了照样全绿。 */
console.log("\n评论暂存区与画布钉（M8-32）");
{
  const SAMPLE = "_uitest暂存.dc.html";
  const call = (route, body) => pg.evaluate(async ({ route, body }) => {
    const b = window.__UD_APP;
    const r = await fetch(`${b.url.replace(/\/$/, "")}/__ud/${route}?token=${encodeURIComponent(b.token)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  }, { route, body });
  const made = (await call("draft_write", { path: SAMPLE, content: `<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>暂存</title><script src="./support.js"></script></head>\n<body><x-dc><helmet><style>html,body{margin:0;padding:24px;font-family:system-ui}h1{font-size:28px}button{margin-top:12px}</style></helmet>\n<div><h1>标题</h1><button>一颗钮</button></div></x-dc></body></html>` })).ok;
  if (!made) ok(false, "建不出暂存验收样本");
  else {
    await pg.waitForTimeout(1500);
    if (!(await openByName("_uitest暂存"))) ok(false, "样本没进树");
    else {
      await pg.waitForTimeout(2800);
      const eb = pg.locator('[data-ud="toggle-edit"]');
      if ((await eb.getAttribute("aria-pressed")) !== "true") { await eb.click(); await pg.waitForTimeout(500); }
      await pg.locator('[role="group"][aria-label="指针"] button').filter({ hasText: "评论" }).click();
      await pg.waitForTimeout(400);
      /* 写两条 */
      for (const [sel, text] of [["h1", "标题再大一号"], ["button", "这颗钮改成 danger"]]) {
        const f = pg.frames().find((x) => /uitest暂存/.test(decodeURIComponent(x.url())) && !/S2-/.test(decodeURIComponent(x.url())));
        if (!f) break;
        await f.locator(sel).first().click({ timeout: 8000 }).catch(() => {});
        await pg.waitForTimeout(900);
        const box = pg.locator('[data-ud="comment-box"]');
        if (!(await box.count())) break;
        await box.locator("textarea").fill(text);
        await box.locator("button", { hasText: "暂存" }).click();
        await pg.waitForTimeout(1100);
      }
      const rows = pg.locator('[data-ud="stash-row"]');
      ok(await pg.locator('[data-ud="stash"]').count() === 1 && await rows.count() === 2, "**暂存区在聊天输入框上方**，两条都在", `${await rows.count()} 行`);
      const pins = pg.locator('[data-ud="pin"]');
      ok(await pins.count() === 2, "画布上两枚评论钉", `${await pins.count()} 枚`);
      ok((await pins.allTextContents()).join(",") === "1,2", "钉上的编号和暂存区对得上", (await pins.allTextContents()).join(","));
      /* 「全部发给 AI」—— 会真开一轮 AI，所以点完立刻中断；判据看的是**标记那一刻**的三处变化 */
      await pg.locator('[data-ud="stash-send"]').click();
      await pg.waitForTimeout(2800);
      ok(await rows.count() === 0, "**发出去之后暂存区立刻清空**（标记挂在「作业起成功」那一刻，不等 AI 跑完）");
      ok(await pg.locator('[data-ud="pin"][data-sent="1"]').count() === 2, "**发过的钉变灰并留在画布上**（留着才知道「这一处我提过」）");
      await pg.locator("button", { hasText: "中断" }).click().catch(() => {});
      await pg.waitForTimeout(600);
    }
    /* 收尾：⚠️ 稿和评论要**分别**清 —— 稿进回收站，评论不跟着走（它挂在文件路径上）。
       只删稿的话下一次跑会看到上一轮的评论，判据全乱（实测栽过）。 */
    await openByName(".md");
    await pg.waitForTimeout(500);
    await call("delete_draft", { file: SAMPLE });
    /* 同上：扔进回收站不算清干净 */
    await pg.evaluate(async ({ name }) => {
      const b = window.__UD_APP;
      const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
      const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
      for (const it of t?.data?.items ?? []) {
        if (it.originalName === name) {
          await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
        }
      }
    }, { name: SAMPLE });
    const left = await pg.evaluate(async () => {
      const b = window.__UD_APP;
      const r = await fetch(`${b.url.replace(/\/$/, "")}/__ud/comments?token=${encodeURIComponent(b.token)}`);
      return ((await r.json()).data?.comments ?? []).map((c) => ({ id: c.id, file: c.file }));
    });
    for (const c of left.filter((x) => x.file === SAMPLE)) await call("comment_delete", { id: c.id });
    await pg.waitForTimeout(500);
  }
}

/* ── 没有节点地址时要说话（issue #31 · 设计侧第十一轮 §三）──
   用户项目里能打开的 29 份稿**节点地址全为 0**，所以「点选」对他从来没有可用过，
   而界面一句话都不说。判据钉三条：提示条出、**三颗钮不禁用**、点画布有回应。
   ⚠️ 不许把钮禁掉 —— 禁用态不解释原因，和现在的静默是同一个病。 */
console.log("\n没有节点地址时要说话（issue #31）");
{
  /* ⚠️ **不能用 `openByName(".dc.html")`** —— 它取的是树里第一份，而上一组建的
     `_uitest三档.dc.html` 下划线开头、排在最前，那一份是**有地址**的，
     于是这一组会量到「提示条不出」并报一条假红（实测踩到）。
     这里显式挑一份不以 `_` 开头的用户稿。 */
  const userDraft = (await pg.locator('[role="treeitem"]').allTextContents())
    .map((t) => t.replace(/\s+/g, " ").trim())
    .find((t) => /\.dc\.html$/.test(t) && !/[_◧▤]?\s*_/.test(t));
  const openUser = userDraft ? await openByName(userDraft.replace(/^\W+\s*/, "").slice(0, 12)) : false;
  if (openUser) {
    await pg.waitForTimeout(2600);
    const eb = pg.locator('[data-ud="toggle-edit"]');
    if ((await eb.getAttribute("aria-pressed")) !== "true") { await eb.click(); await pg.waitForTimeout(500); }
    const bar = pg.locator('[data-ud="no-addr"]');
    const n = await bar.count();
    if (!n) ok(false, "这份稿有地址，测不到「没有地址」那一态（项目里的稿被加过地址了？）");
    else {
      ok((await bar.innerText()).includes("没有节点地址"), "**提示条说出了原因**，不是静默");
      ok(await bar.locator("button", { hasText: "加上地址" }).count() === 1, "给了出路：「加上地址…」");
      ok(await bar.locator("button", { hasText: "改用 AI" }).count() === 1, "给了第二条出路：「改用 AI」");
      ok(await pg.locator('[role="group"][aria-label="指针"] button:not(:disabled)').count() === 3, "三颗钮**照样能按**（禁用态不解释原因）");
      /* 点画布要有回应：`data-nudge` 是判据钩子，动画时序量不准 */
      const before = await bar.getAttribute("data-nudge");
      const f = pg.frames().find((x) => /\.dc\.html/.test(x.url()) && !/S2-/.test(decodeURIComponent(x.url())) && !/__app/.test(x.url()));
      if (f) await f.locator("body").click({ position: { x: 40, y: 40 }, force: true }).catch(() => {});
      await pg.waitForTimeout(400);
      ok((await bar.getAttribute("data-nudge")) !== before, "点了画布提示条抖一下（「你点了，这就是为什么没反应」）", `nudge ${before} → ${await bar.getAttribute("data-nudge")}`);
    }
  } else ok(false, "项目里没有（不以 _ 开头的）.dc.html，这一组测不了");
}

/* ── 换格式不许动目录列（用户 tmp.txt 第 1 条，2026-09-27）──
   他的原话：「点击查看不同的文件，目录列表不应刷新（能感觉到明显闪烁了一下）」。
   根因：格式模块的 Provider 原来包着整个 `Frame`，`key={kind}` 一变
   **目录列和聊天栏跟着整棵卸载重挂**。实测 dc → md 祖先链保留 0/6、body 增删 69 个节点。

   ⚠️ **判据必须挂在不会被卸载的东西上。** 第一版把 MutationObserver 挂在目录列容器上，
   量到「DOM 增删 0 次」—— 因为那个容器自己被换掉了，observer 跟着失效：
   量到零的是仪器，不是世界（`doc/04` §2.7 · `CLAUDE.md` §9 的 ResizeObserver 同族）。
   所以判据改成**盖标记**：切格式后标记还在 = 这些节点没被换过。 */
console.log("\n换格式不动目录列（用户 tmp.txt 第 1 条）");
{
  if (await openByName(".dc.html")) {
    await pg.waitForTimeout(600);
    const stamped = await pg.evaluate(() => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')];
      if (!rows.length) return 0;
      for (const r of rows) r.dataset.keep = "1";
      let el = rows[0];
      for (let i = 0; i < 6 && el; i++) { el.dataset.keep = "1"; el = el.parentElement; }
      return rows.length;
    });
    if (stamped && await openByName(".md")) {
      await pg.waitForTimeout(1200);
      const r = await pg.evaluate(() => {
        const rows = [...document.querySelectorAll('[role="treeitem"]')];
        let anc = 0, el = rows[0];
        for (let i = 0; i < 6 && el; i++) { if (el.dataset?.keep) anc++; el = el.parentElement; }
        return { kept: rows.filter((x) => x.dataset.keep).length, total: rows.length, anc };
      });
      ok(r.total > 0 && r.kept === r.total, "**dc → md 之后目录列每一行都还是原来那个节点**（原来整列跟着重挂）", `${r.kept}/${r.total} 行`);
      ok(r.anc === 6, "目录列的祖先容器也没被换掉（Provider 只罩详情区）", `${r.anc}/6`);
    } else ok(false, "项目里缺 .dc.html 或 .md，这一组测不了");
  } else ok(false, "项目里没有 .dc.html，这一组测不了");
}

/* ── 引擎是会话的属性（M8-16，用户实测第 7 条）──
   撞到的场景：会话在火山方舟上 → 选成 Claude → 新建一条 → 再切回来，**又变回火山方舟**。
   根因是选引擎只改了前端 state 和 localStorage，没写进会话文件，而 `chat_get` 读的是文件。
   **判据用刷新页面代替「切走再切回」** —— 刷新之后前端从零开始，
   引擎只能是从会话文件里读回来的，这比在界面里绕一圈更直接、也不需要第二条会话。 */
console.log("\n引擎跟着会话走（M8-16 · 用户实测第 7 条）");
const engineBtn = () => pg.locator('aside button[data-ud="engine"]').first();
const engName = async () => (await engineBtn().innerText()).replace(/[\n▾]/g, " ").trim();
const before = await engName();
await engineBtn().click(); await pg.waitForTimeout(400);
let switched = null;
for (const c of ["b", "a", "c"]) {
  const o = pg.locator(`aside [data-ud="engine-opt-${c}"]`);
  if (await o.count() && (await o.getAttribute("aria-pressed")) !== "true") { switched = (await o.innerText()).split("\n")[0].trim(); await o.click(); break; }
}
if (!switched) { console.log("  – 只配了一个引擎，这条测不了（不算通过）"); }
else {
  await pg.waitForTimeout(900);
  ok((await engName()).includes(switched.split(" ")[0]), "换引擎后钮上跟着变", `${before} → ${await engName()}`);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => document.querySelectorAll('[role="treeitem"]').length > 0, null, { timeout: 30000 });
  await pg.waitForTimeout(1800);
  const after = await engName();
  ok(after.includes(switched.split(" ")[0]), "刷新后还是它（说明写进会话文件了，不只是 localStorage）", `刷新后 ${after}`);
  /* 还原成原来的引擎 —— 这是用户的项目数据，回归不该留下痕迹 */
  await pg.locator('aside button[data-ud="engine"]').first().click(); await pg.waitForTimeout(400);
  for (const c of ["a", "b", "c"]) {
    const o = pg.locator(`aside [data-ud="engine-opt-${c}"]`);
    if (await o.count() && (await o.innerText()).split("\n")[0].trim() === before) { await o.click(); break; }
  }
  await pg.waitForTimeout(700);
}

console.log("\n控制台");
ok(errs.length === 0, "零 error（已排除解析期的模板洞噪声）", errs[0] ?? "");

/* ── 插件 UI 的边界（M11-4）──
   这是整套插件机制唯一的**安全**断言，所以钉在这儿：
   ① CSP 要在**响应头**上（插件碰不到那一层，页面里的 meta 它能抢在前面）
   ② 路径逃不出插件目录
   ⚠️ 判据本身要有**对照组**才算数 —— 沙箱那一半的对照组在 `doc/20` §3.3 记着读数：
   不加 CSP 时 fetch / img / sendBeacon / WebSocket 四条外传通道全部打得通。 */
console.log("\n插件 UI 的边界（M11-4）");
/* ⚠️ **这一节必须排在「控制台零 error」之后**：下面那两次逃逸探测本来就该是 404，
   而 404 会在控制台留一条 `Failed to load resource` —— 放前面会把那条判据打挂，
   看起来像产品有缺陷，其实是判据自己污染了仪器（M11-4 当场栽过）。 */
{
  const origin = new URL(pg.url()).origin;
  const r = await pg.evaluate(async (o) => {
    const one = async (u) => { try { const x = await fetch(o + u); return { s: x.status, csp: x.headers.get("content-security-policy") }; } catch (e) { return { s: 0, csp: null }; } };
    return {
      ui: await one("/__plugin/com.umbra.demo/index.html"),
      up: await one("/__plugin/com.umbra.demo/..%2f..%2f..%2fpackage.json"),
      badId: await one("/__plugin/..%2f..%2fetc/passwd"),
    };
  }, origin);
  if (r.ui.s === 200) {
    ok(/default-src 'none'/.test(r.ui.csp ?? ""), "插件 UI 的 CSP 在**响应头**上（不是页面里的 meta）", (r.ui.csp ?? "无").slice(0, 40));
    ok(/connect-src 'none'/.test(r.ui.csp ?? ""), "CSP 禁掉外联 —— iframe sandbox 单独用挡不住 fetch/img/beacon/ws");
    /* ⚠️ **`frame-src` 只放 `/__preview/`，绝不能是 `'self'`**（M10-3，用户 2026-09-29 定）。
       这条判据换过一次，换的过程本身值得记：
       原来它是「**没有** `frame-src`」——那时插件里嵌不了任何 iframe，
       而 M10-3 需要嵌用户的网页。放开时那条判据**按设计红了**，
       提醒我「放开之前先想清楚能嵌什么」。**它做到了它该做的事。**

       现在钉的是放开之后的边界：`'self'` 匹配 scheme+host+port **不是路径** ——
       给了它，插件就能嵌 `/__app/`（我们自己的界面），那是视觉欺骗的入口。
       所以只放那一条专用路由。**闸的粒度该配需求的粒度。** */
    const fs = (r.ui.csp ?? "").match(/frame-src ([^;]+)/)?.[1]?.trim() ?? "";
    ok(/\/__preview\/$/.test(fs), "**`frame-src` 只放 `/__preview/` 这一条路由**", fs || "（没有 frame-src）");
    ok(!/'self'/.test(fs), "**没给 `'self'`**（给了插件就能嵌 `/__app/`，那是视觉欺骗的入口）", fs);
  } else {
    /* ⚠️ **红着报，不许静静跳过。**「119/119 全过」和「127/127 全过」在输出里都是一个 ✓ ——
       判据整块消失不会报警，它和「这些判据通过了」长得一模一样。
       装回去的办法：`npm --prefix server run plugintest`（它跑完会把演示插件装好）。 */
    ok(false, `**演示插件没装，插件端到端那一组（9 条）整块没跑到** —— 跑一次 plugintest 装回去`, `GET 回 ${r.ui.s}`);
  }
  ok(r.up.s === 404, "插件目录逃逸：..%2f 上不去");
  ok(r.badId.s === 404, "插件 id 逃逸：坏 id 直接 404");

  /* ═══ A 面端到端（M11-5）═══
     一个**没有文件系统、没有网络**的沙箱页面，经宿主读到项目文件并画出来。
     ⚠️ 样本由回归**自己建自己收**（走产品自己的写入口，收进回收站）——
     不往用户项目里留东西（纪律⑥）。 */
  if (r.ui.s === 200) {
    /* ⚠️ 演示插件的样本从 `.csv` 换成了 `.udemo`（2026-09-30）。
       原因：M10-5 让代码插件认领了 `.csv`（那是真功能），而**一种类型只能注册一次** ——
       两边撞上之后先注册的赢，后注册的被 `loader` catch 成「这个插件没能接上」，
       症状是**演示插件那一整批判据全红，而红的原因在别处**。
       夹具本来就不该占用一个真实格式。 */
    const SAMPLE = "插件回归样本.udemo";
    const made = await pg.evaluate(async ({ name }) => {
      const b = window.__UD_APP;
      const u = (route) => `${b.url.replace(/\/$/, "")}/__ud/${route}?token=${encodeURIComponent(b.token)}`;
      const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: name, content: "name,role\n甲,设计\n乙,开发\n丙,测试\n", expectSha256: "0" }) });
      return (await w.json()).ok;
    }, { name: SAMPLE });
    if (made) {
      /* 建完要让目录树刷出来 —— 服务端会发 fs 事件，给它一点时间 */
      await settleTree(SAMPLE);   // 轮询等树刷出来，不是定时等
      const row = pg.locator('[role="treeitem"]').filter({ hasText: SAMPLE }).first();
      if (await row.count()) {
        await row.click(); await pg.waitForTimeout(2500);
        ok(await pg.locator('iframe[data-role="body"]').count() === 1, "csv 交给了插件画（详情区是插件的 iframe，不是文件卡）");
        const inner = pg.frameLocator('iframe[data-role="body"]');
        const rows = await inner.locator("tbody tr").count().catch(() => 0);
        ok(rows === 3, "**插件经宿主真读到了文件并画出来**（它自己没有 fs 也没有网络）", `${rows} 行`);
        const head = await inner.locator("thead th").allTextContents().catch(() => []);
        ok(head[0] === "name", "表头对", head.join("/"));

        /* ═══ 宿主共享库（M10-2 的地基）═══
           插件能不能 import 一条**不在自己目录下**的模块（`/__shared/...`）。
           这一条决定 CodeMirror 这类大依赖是**放宿主一份**、还是每个插件各自打包一份
           （`markdown-it` 在 md 插件里就占 138 KB）。

           理论依据：CSP 的 `script-src 'self'` 匹配 **scheme+host+port，不是路径**。
           ⚠️ 理论要验 —— 插件在**不透明源**的 iframe 里（`sandbox` 不给 `allow-same-origin`），
           而模块脚本走 **CORS 模式**取，`/__plugin/` 那条就为这个踩过一次（M11-9b）。
           判据从插件 frame 里读 `window.__shared`，**不看截图**。 */
        const sharedMsg = await inner.locator("body").evaluate(() => (window).__shared ?? "（探针没跑）").catch(() => "（读不到）");
        ok(typeof sharedMsg === "string" && sharedMsg.startsWith("宿主共享库到了"),
           "**插件 import 得到宿主共享库**（CodeMirror 这类大依赖放一份就够）", String(sharedMsg).slice(0, 70));
        /* ⚠️ **「import 得到」和「跑得起来」是两件事**，后者才是 M10-2 的地基。
           CM 靠 CSS-in-JS 注入 `<style>`（CSP 只给了 `style-src 'unsafe-inline'`），
           还要 contenteditable / Range / ResizeObserver 那一套在沙箱 iframe 里都正常。
           所以判据读的是**真实渲染出来的行数、行号、高亮片段数**，不是「没报错」。 */
        /* ⚠️ **等它，别抢**（`packtest` §113 那条）：这份共享库 916 KB，
           加载 + 解析 + CM 初始化要一会儿，而上面那句 `waitForTimeout(2500)`
           是为别的判据定的。第一版没等，读到「探针没跑」**看着像 CM 在沙箱里跑不起来** ——
           而它只是还没跑完。**抢跑的判据会把「慢」误报成「坏」。** */
        let cmMsg = "（探针没跑）";
        for (let i = 0; i < 40; i++) {
          cmMsg = await inner.locator("body").evaluate(() => (window).__cm ?? "").catch(() => "");
          if (cmMsg) break;
          await pg.waitForTimeout(250);
        }
        if (!cmMsg) cmMsg = "（等了 10 秒还没跑完）";
        /* ⚠️ **行号数不写死**：实测 3 行文本的 gutter 是 **4** 个 `cm-gutterElement`
           （CM 自己多画了一个），那是它的实现细节，升个版本就可能变。
           写死它等于把判据绑在 CM 的内部结构上。
           行数 3 可以写死 —— 那是**探针自己写的** doc，我们控制得了。 */
        const cmNums = String(cmMsg).match(/行 (\d+) · 行号 (\d+) · 高亮片段 (\d+)/);
        ok(!!cmNums && cmNums[1] === "3" && Number(cmNums[2]) >= 3 && Number(cmNums[3]) > 0,
           "**CodeMirror 在插件沙箱里真跑起来了**（行号 + 语法高亮都在）", String(cmMsg).slice(0, 70));

        /* ═══ chrome 由宿主代画（M11-9a）═══
           插件只有正文那块矩形，编辑栏 / 属性面板 / `⋯` 都在它够不着的地方。
           这几条钉的是「插件给数据 → 宿主照自己的形制画出来」这条路通不通。 */
        /* ═══ 桥不许留下永远不回的 Promise（issue #97，2026-10-06）═══
           插件侧 `await umbra.menu(...)` 等的是宿主的一条 `{t:"reply"}`，
           而**旧契约自己写着「点空关掉就一直不返回」** —— 把一个缺陷写成了规格。
           后果不是「菜单没反应」（菜单是宿主画的，它关掉了），
           而是**插件里那一行之后的收尾一次都不会跑**（清高亮、解锁按钮、恢复光标）。

           ⚠️ 判据读的是**插件 frame 里那个 await 之后写的值**，不是「菜单关掉了」——
           「菜单关掉了」在坏的实现下**也是真的**（§142.4 那一族：
           判据要钉住它自己声称的那件事）。 */
        {
          /* ⚠️ **点在表格行上，不是 iframe 的空白处**（2026-10-06 实测栽过）。
             插件那个监听器挂在 `document.body` 上，而 iframe 下半截是空白 ——
             点在那里 target 是 `<html>`，事件**不经过 body**（html 是 body 的父节点，
             不是子节点），于是监听器压根没被调用。
             症状是「探针没跑」，看着像**桥坏了**。
             用 frame 内的定位器点元素，坐标的事交给 Playwright。 */
          const target = inner.locator("tbody tr").first();
          if (await target.count()) {
            await target.click({ button: "right" });
            await pg.waitForTimeout(400);
            const popped = await pg.locator('[data-ud="pluginmenu"]').count();
            ok(popped === 1, "插件请求的菜单由宿主画出来了（前提）", `${popped} 个`);
            const waiting = await inner.locator("body").evaluate(() => window.__menuResult ?? "（探针没跑）").catch(() => "（读不到）");
            ok(waiting === "等着", "（样本有效性）此刻插件确实停在那个 await 上", String(waiting));
            /* ⚠️ **不能按 Escape**（2026-10-06 实测栽过第二次）：
               我们刚在插件 frame 里点过，焦点就在那个 iframe 上，
               而**键盘事件不跨 iframe 边界**（`00` §八十一 那条教训的第 N 次）——
               Escape 落在插件自己的 document 里，宿主收不到。
               浮层的「点别处收起」走的是 `installAcrossFrames` 挂的 `mousedown`，
               而它**挂不上插件那个 iframe**（不透明源，拿不到它的 document）。
               所以要在**宿主自己的 DOM 上**点一下，这也正是真实用户关掉它的方式。
               ⚠️ 点哪儿有讲究：第一版点 `[data-ud="bottombar"]` —— 这个布局下
               **底栏压根没渲染**，判据超时报「waiting for locator」，
               看着像浮层不收。改点目录列的表头（`tree-head`）左上角那 2px：
               它只有 contextmenu 处理器，左键点它**不改任何状态**。 */
            await pg.locator('[data-ud="tree-head"]').click({ position: { x: 2, y: 2 } });
            let got = "";
            for (let i = 0; i < 24; i++) {
              got = await inner.locator("body").evaluate(() => window.__menuResult ?? "").catch(() => "");
              if (got && got !== "等着") break;
              await pg.waitForTimeout(250);
            }
            ok(got === "menu→null",
               "**关掉菜单时插件那个 `await` 真的回来了**（issue #97：原来它永远挂着，而插件界面一声不响）",
               got || "（等了 6 秒还停在 await 上）");
          } else {
            ok(false, "**插件表格里没有行可点，桥那一组（3 条）没跑到**");
          }
        }

        const eb = pg.locator('[data-ud="toggle-edit"]');
        ok(await eb.count() === 1, "插件声明了编辑栏 → ✎ 这颗钮出现了");
        if ((await eb.getAttribute("aria-pressed")) !== "true") { await eb.click(); await pg.waitForTimeout(500); }
        const segs = await pg.locator('[data-ud="file-toolbar"] [role="group"] button').allTextContents();
        ok(segs.includes("表格") && segs.includes("源码"), "编辑栏的段组是宿主画的（和内置格式同一套形制）", segs.join("/"));
        /* 点一下要真的传回插件并改变正文 —— 只画出来不通电等于没做 */
        const srcBtn = pg.locator('[data-ud="file-toolbar"] [role="group"] button').filter({ hasText: "源码" });
        await srcBtn.click(); await pg.waitForTimeout(700);
        const raw = await inner.locator("pre").textContent().catch(() => "");
        ok((raw ?? "").startsWith("name,role"), "点段组真的传回了插件（正文换成源码档）", (raw ?? "").slice(0, 16));

        await pg.locator('[data-ud="toggle-props"]').click(); await pg.waitForTimeout(800);
        const pfs = await pg.locator('iframe[data-role="panel"]').count();
        ok(pfs === 1, "插件的属性面板是它自己的一张网页（另一个沙箱 iframe）");
        if (pfs) {
          /* 面板和正文是**两个不透明源**，够不着对方 —— 数据经宿主转发（`umbra.share`）。
             这一条钉的就是那条转发路：面板里有内容 = 转发通了。 */
          const rows = await pg.frameLocator('iframe[data-role="panel"]').locator(".row").allTextContents().catch(() => []);
          /* 样本是两列（name,role），所以是 2 行。⚠️ 第一版这里写了 3 —— 判据自己记错了样本 */
          ok(rows.length === 2 && rows[0].startsWith("name"), "面板的数据经宿主在两个 frame 间转发过来了", rows.join(" / "));
        }
        await pg.locator('[data-ud="toggle-props"]').click(); await pg.waitForTimeout(400);

        /* ═══ 插件报的读数落在 `⋯` 浮层头（issue #36 / `00` §一一四）═══
           原来它挂在 `KindModule.Status` 上，而那个接口**没有任何地方渲染** ——
           插件报了 status 也不显示。现在和内置格式共用 `meta` 这一个出口。

           ⚠️ 这一条**必须在这一节里**，因为样本 csv 用完就收进回收站了。
           我第一版单独开了一节写在最后，`openByName(".csv")` 什么都没打开、
           而 `.catch(() => {})` 把它吞掉，于是判据在**当前那份 .dc.html** 上跑、
           读到 `12 元素 · 改于 22:55` 就绿了 —— **测的是别的东西**。
           「吞掉的错误会伪装成另一种失败」这一条，同一个回归里我犯了两次。 */
        const more = pg.locator('button:has-text("⋯")').first();
        if (await more.count()) {
          await more.click(); await pg.waitForTimeout(600);
          const mt = (await pg.locator('[data-ud="more-meta"]').innerText().catch(() => "")).trim();
          /* 演示插件报的 status 是行数那一串。**不比死字符串** —— 比「是不是这份 csv 的读数」：
             含 "行" 或 "3"，且**不含内置稿的词**（元素 / 改于），后者才能证明没测错文件。 */
          ok(mt.length > 0 && !/元素|改于/.test(mt), "**插件报的读数落在 ⋯ 浮层头**（和内置格式同一个出口）", mt || "（空）");
          await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
        } else ok(false, "csv 上找不到 ⋯ 这颗钮");
      } else ok(false, "建好了但目录树里没刷出来");
      /* ═══ 代码插件（M10-2）═══ 和 csv 同一套路：建样本 → 点开 → 数真实渲染出来的东西。
         ⚠️ 放在这一节里是因为它需要同样的铺垫（工作台已经打开、插件已接线）。
         我第一版单开了一个脚本从头 goto 再点，**详情区一直是空的** ——
         排查半天才发现是铺垫不够，不是插件的问题。**别重造一遍夹具。** */
      {
        const TS = "插件回归样本.ts";
        const okMade = await pg.evaluate(async ({ name }) => {
          const b = window.__UD_APP;
          const u = (route) => `${b.url.replace(/\/$/, "")}/__ud/${route}?token=${encodeURIComponent(b.token)}`;
          const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ path: name, content: "export function greet(who: string) {\n  const msg = `hi ${who}`;\n  console.log(msg);\n  return msg;\n}\n", expectSha256: "0" }) });
          return (await w.json()).ok;
        }, { name: TS });
        if (okMade) {
          /* ⚠️ **清理放 `finally`**（2026-09-29 栽过）：判据里任何一步抛了
             （选择器找不到、超时），下面的清理就跑不到 —— 样本**留在用户项目里**。
             那一次 `.csv` 和 `.ts` 两份都留下了，下一轮回归因为「样本已存在」
             建不出来，整个 A 面端到端那一节被跳过，`uitest` 从 198 掉到 183。
             **回归弄脏用户项目是纪律⑥，比判据红一条严重得多。** */
          try {
          await settleTree(TS);   // 轮询等树刷出来，不是定时等
          const tsRow = pg.locator('[role="treeitem"]').filter({ hasText: TS }).first();
          if (await tsRow.count()) {
            await tsRow.click(); await pg.waitForTimeout(3000);
            const codeFrame = pg.frameLocator('iframe[data-role="body"]');
            /* 判据读**真实渲染出来的东西**，不是「没报错」——
               CM 在沙箱里跑不起来的话这几个数全是 0，而页面照样不报错。 */
            const lines = await codeFrame.locator(".cm-line").count().catch(() => 0);
            const colored = await codeFrame.locator(".cm-line span[class]").count().catch(() => 0);
            /* ⚠️ **6 不是 5**：样本是 5 行代码 + 末尾换行，CM 把末尾那个空行也算一行
               （真实文件基本都有末尾换行，所以这是常态不是特例）。
               第一版写死 5，红了一条 —— **判据自己记错了样本**，
               和 §M11 那次「面板 2 行写成 3 行」是同一个错。 */
            ok(lines === 6, "**`.ts` 交给代码插件画，CodeMirror 渲染出全部 6 行**（5 行代码 + 末尾空行）", `${lines} 行`);
            /* 再钉一条「渲染的是这个文件」—— 只数行数的话，随便哪份 6 行的文件都能蒙对 */
            const firstLine = (await codeFrame.locator(".cm-line").first().innerText().catch(() => "")).trim();
            ok(firstLine.startsWith("export function greet"), "渲染的确实是这份样本（不是蒙对了行数）", firstLine.slice(0, 40));
            ok(colored > 0, "语法高亮真的上了（不是一片纯文本）", `${colored} 个高亮片段`);
            const gut = await codeFrame.locator(".cm-gutterElement").count().catch(() => 0);
            ok(gut >= 5, "行号在", `${gut} 个`);
            /* 插件声明的那颗钮由**宿主代画**（chrome 那条路） */
            const btns = await pg.locator('[data-ud="file-toolbar"] button').allTextContents().catch(() => []);
            ok(btns.some((t) => t.includes("选中行给 AI")), "插件声明的钮出现在宿主的编辑栏里", btns.join("/") || "（空）");
            /* 读数是**行数 + 大小**，不是「未改过」—— `read_file` 不返回快照号，
               给一个看着像答案的假答案比留空更糟（`00` §一一八）。
               ⚠️ **读数在 `⋯` 浮层头，不在编辑栏** —— issue #36 把 `Status` 那个出口删了，
               插件报的 `chrome.status` 现在接到 `meta`（§一一四.5）。
               判据第一版去编辑栏找，红了两条 —— **不是产品的问题，是我忘了自己刚改过出口。** */
            const readMeta = async () => {
              const more = pg.locator('button:has-text("⋯")').first();
              if (!(await more.count())) return "（找不到 ⋯）";
              await more.click(); await pg.waitForTimeout(500);
              const t = (await pg.locator('[data-ud="more-meta"]').innerText().catch(() => "")).trim();
              await pg.keyboard.press("Escape"); await pg.waitForTimeout(250);
              return t;
            };
            ok(/6 行/.test(await readMeta()), "⋯ 浮层头的读数写的是真实行数（不是假的「未改过」）", await readMeta());

            /* ═══ 「改」这一半（M10-2）═══ 端到端：打字 → 未落盘横条 → ⌘S → 盘上真变了。
               ⚠️ 判据必须看**盘上那一份**，不能只看界面说「已落盘」——
               那句话是我们自己印的，它证明不了文件真的写下去了。 */
            const cmContent = codeFrame.locator(".cm-content");
            await cmContent.click();
            await pg.keyboard.press("End");
            await pg.keyboard.type("\n// 改了一行");
            await pg.waitForTimeout(600);
            const barTxt = (await codeFrame.locator("#dirty:not([hidden])").innerText().catch(() => "")).replace(/\s+/g, " ");
            ok(/还没落盘/.test(barTxt), "**打字之后出未落盘横条**（带前后行数）", barTxt.slice(0, 50));
            /* 改过的行有标记（S18 §一.1）：行底 warn-soft + 左边一道竖线。
               ⚠️ **必须在落盘之前读**。第一版放在 ⌘S 之后，一直是 0 ——
               落盘后 `disk` 换成新的那一版，「改过的行」自然就空了，**标记清空是对的行为**。
               判据读错时机，测到的是「落盘之后还有没有标记」，而那本来就该没有。 */
            const marked = await codeFrame.locator(".cm-line.ud-changed").count().catch(() => 0);
            ok(marked >= 1, "**改过的行有标记**（行底色 + 左边竖线）", `${marked} 行带标记`);
            ok(/未落盘/.test(await readMeta()), "⋯ 浮层头的读数也跟着变成「未落盘」（一处算两处用）");
            /* ⌘S 落盘 —— 挂在 window 上而不是 CM 的 keymap 里（点了横条上的钮再按也要生效） */
            await pg.keyboard.press("Meta+s");
            await pg.waitForTimeout(2200);
            ok(await codeFrame.locator("#dirty:not([hidden])").count() === 0, "落盘之后横条收起来了");
            /* 同一件事量两次：属性（上面那条）+ **真实高度**（这一条）。
               只有后者能抓住「属性设了而 CSS 没让它消失」。 */
            ok(await barH(codeFrame, "dirty") === 0,
               "**而且它真的不占高度了**（只看 `hidden` 属性会漏掉 CSS 盖过它的情况）",
               `高 ${await barH(codeFrame, "dirty")}px`);
            {
              const hs = { dirty: await barH(codeFrame, "dirty"), ro: await barH(codeFrame, "ro"), draft: await barH(codeFrame, "draft") };
              ok(hs.dirty === 0 && hs.ro === 0 && hs.draft === 0,
                 "**干净文件上三条横条一条都不占高度**（原来三条空条压着编辑器 109px）", JSON.stringify(hs));
            }
            /* **盘上真的变了吗** —— 这条才是落盘的证据 */
            const onDisk = await pg.evaluate(async ({ name }) => {
              const b = window.__UD_APP;
              const r = await fetch(`${b.url.replace(/\/$/, "")}/__ud/file?path=${encodeURIComponent(name)}&token=${encodeURIComponent(b.token)}`);
              const j = await r.json();
              return { has: /改了一行/.test(j?.data?.content ?? ""), lines: j?.data?.lines ?? 0 };
            }, { name: TS });
            ok(onDisk.has && onDisk.lines === 7, "**盘上那一份真的多了那行**（不是只有界面说落盘了）", `${onDisk.lines} 行`);
            /* ⌘L 合并语义（`00` §121.3，用户 2026-09-29 定）：
               **有选区时带上选区，没选区时只聚焦** —— 用户按 ⌘L 的意图始终是「找 AI」，
               不该因为手上有没有选区而记两个键。
               ⚠️ 这两半要**分开测**：只测「有选区能带」的话，
               「没选区时别弹『先选中几行』」那一半坏了也不会红。 */
            await cmContent.click();
            await pg.keyboard.press("Meta+a");          // 全选，制造选区
            await pg.waitForTimeout(300);
            await pg.keyboard.press("Meta+l");
            await pg.waitForTimeout(1200);
            /* ⚠️ **找药丸本身，不找会话栏里随便什么文字。**
               第一版判据是「会话栏里出现文件名或 range」—— 而会话栏里本来就有
               历史消息和引擎名，读数打出来是「Claude Code ▾ 🕘 ping pong！我在…」，
               **那是蒙对的**。药丸的标识是 `文件名 › L起–止` 这个形状。 */
            const pillTxt = (await pg.locator('[data-ud="sel-pill"], aside [class*="pill"]').allTextContents().catch(() => []))
              .concat(await pg.locator("aside").first().innerText().catch(() => "")).join(" ").replace(/\s+/g, " ");
            ok(/插件回归样本\.ts › L\d+–\d+/.test(pillTxt), "**⌘L 有选区时挂出 range 药丸**（不是直接发给 AI）",
               (pillTxt.match(/插件回归样本\.ts › L\d+–\d+/) ?? ["（没找到药丸）"])[0]);
            ok(await pg.evaluate(() => document.activeElement?.id === "chatInput"), "**⌘L 之后焦点在会话输入框**（带没带成都要聚焦）");
            /* 没选区那一半：点一下取消选区再按 ⌘L，不该弹「先选中几行」 */
            await cmContent.click(); await pg.keyboard.press("End");
            await pg.waitForTimeout(300);
            await pg.keyboard.press("Meta+l");
            await pg.waitForTimeout(900);
            const toastTxt = (await pg.locator("[data-ud=\"toasts\"], .toast").allTextContents().catch(() => [])).join(" ");
            ok(!/先选中/.test(toastTxt), "**没选区时不弹「先选中几行」**（那一下的意图是聚焦，不是带选区）", toastTxt.slice(0, 40) || "（没有 toast）");

            /* ═══ 关页签前拦一下（S18 §一.1）═══
               ⚠️ 三条出路**各测一条**：只测「卡片出来了」的话，
               三颗钮里坏了哪一颗都不会红 —— 而「不要了」坏掉是丢数据，
               「落盘再关」坏掉是假的安全感。 */
            {
              /* ⚠️ **判据自己先制造「未落盘」** —— 前面那几节已经 ⌘S 落过盘了，
                 这时 `dirtyStore` 是干净的，关页签当然不会拦。
                 又一次「判据依赖一个它控制不了的前提」（§一二二.3 同族）：
                 前面的判据改变了状态，后面的判据默认它没变。 */
              await cmContent.click();
              await pg.keyboard.press("End");
              await pg.keyboard.type("\n// 为了测拦截而改的一行");
              await pg.waitForTimeout(700);
              ok(await codeFrame.locator("#dirty:not([hidden])").count() > 0, "（前置）先把它改脏，才测得到拦截");

              /* ⚠️ 关闭钮 **dirty 时要 hover 才显示**（`hidden group-hover:grid`）——
                 未保存那颗点占着它的位置，这是编辑器通行的写法。
                 判据不 hover 的话点的是那颗点，什么都不会发生。 */
              /* ⚠️ 页签的选择器是 **`[data-ud="tab"][data-path=…]`，不是 `role="tab"`**。
                 我按 ARIA 猜了一个，`count()` 一直是 0 而判据只说「没拦」——
                 **找不到元素和功能坏了，读数长得一模一样**。 */
              const tabOf = () => pg.locator(`[data-ud="tab"][data-path="${TS}"]`).first();
              const openGuard = async () => {
                const t = tabOf();
                if (await t.count()) {
                  await t.hover();
                  await pg.waitForTimeout(250);
                  const x = t.locator('button[title*="关闭"]');
                  if (await x.count()) await x.first().click();
                }
                await pg.waitForTimeout(700);
                return (await pg.locator('[role="alertdialog"]').innerText().catch(() => "")).replace(/\s+/g, " ");
              };
              const g1 = await openGuard();
              ok(/还没落盘/.test(g1), "**有未落盘改动时关页签会拦一下**（不是悄悄丢掉）", g1.slice(0, 50) || "（没拦）");
              ok(/不要了/.test(g1) && /回去接着改/.test(g1) && /落盘再关/.test(g1), "三条出路都给了", g1.slice(0, 60));
              /* ① 回去接着改 —— 页签还在、改动还在 */
              await pg.locator('[role="alertdialog"] button:has-text("回去接着改")').click();
              await pg.waitForTimeout(500);
              ok(await tabOf().count() > 0, "「回去接着改」之后页签还在");
              ok(await codeFrame.locator("#dirty:not([hidden])").count() > 0, "「回去接着改」之后改动也还在");
              /* ② 落盘再关 —— 盘上要真的变了，页签要没了 */
              await openGuard();
              await pg.locator('[role="alertdialog"] button:has-text("落盘再关")').click();
              await pg.waitForTimeout(2500);
              ok(await tabOf().count() === 0, "**「落盘再关」之后页签关掉了**");
              const savedNow = await pg.evaluate(async ({ name }) => {
                const b = window.__UD_APP;
                const r = await fetch(`${b.url.replace(/\/$/, "")}/__ud/file?path=${encodeURIComponent(name)}&token=${encodeURIComponent(b.token)}`);
                /* ⚠️ 查的是**这一节自己写进去的那行**，不是前面某一节写的。
                   第一版查「我也改」——那是上一节的字，这一节改的是别的，
                   判据当然红，**而红的原因和落盘毫无关系**。 */
                return /为了测拦截而改的一行/.test((await r.json())?.data?.content ?? "");
              }, { name: TS });
              ok(savedNow, "**而且盘上真的落了**（不是只把页签关掉）");
              /* ⚠️ **这一节把页签关掉了，后面还要用** —— 重新打开。
                 不还原的话下一节找 `.cm-content` 会等 30 秒然后整个回归崩掉，
                 而报错指向的是**下一节**的那一行（`uitest.mjs:1525`），
                 看起来像那一节坏了。**判据之间的状态要各自还原。** */
              const back = pg.locator('[role="treeitem"]').filter({ hasText: TS }).first();
              if (await back.count()) { await back.click(); await pg.waitForTimeout(2500); }
            }

            /* sha 校验那一关：盘上被别人改过时**拒绝落盘**而不是覆盖。
               ⚠️ **顺序要紧，第一版造错了**：我先绕过插件写盘、再让插件打字落盘 ——
               而插件的 `onChanged` 收到「盘上变了」会**重读**，sha 跟着更新，
               于是落盘成功，判据红了却不是产品的错。

               对的顺序是**先让插件脏起来**：那时 `onChanged` 按设计**不重读**
               （不覆盖用户正在改的东西），插件手里的 sha 就真的过时了。
               这也正是真实的冲突场景：**用户正在改，AI 同时改了同一个文件。** */
            await cmContent.click(); await pg.keyboard.press("End"); await pg.keyboard.type(" // 我也改");
            await pg.waitForTimeout(500);
            await pg.evaluate(async ({ name }) => {
              const b = window.__UD_APP;
              const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
              /* ⚠️ 同一个坑第二次：`u()` 已经带了 `?token=`，参数要用 `&` 接。
                 写成 `u("file?path=…")` 拼出两个 `?`，服务端解析不出 path，
                 `cur.data` 是 undefined，下一行读 `.content` 当场抛。 */
              const cur = await fetch(u("file") + `&path=${encodeURIComponent(name)}`).then((x) => x.json());
              await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ path: name, content: (cur.data.content ?? "") + "\n// 别人改的\n", expectSha256: cur.data.sha256 }) });
            }, { name: TS });
            await pg.waitForTimeout(1000);
            await pg.keyboard.press("Meta+s");
            await pg.waitForTimeout(2000);
            const stillDirty = await codeFrame.locator("#dirty:not([hidden])").count() > 0;
            ok(stillDirty, "**盘上被别人改过时落盘被拒**（横条还在，改动没被静默丢掉）");
          } else ok(false, "`.ts` 样本建好了但树里没刷出来");
          } finally {
            /* ⚠️ **切走之前先落盘** —— 2026-09-29 加了「切文件也拦」之后，
               这一节点开 `-lock.yaml` 会触发那张确认卡，**遮罩挡住后面所有点击**，
               而报错指向的是**这一节里的一行**（`.cm-content` 点不动），
               看起来像只读坏了。**又一次「上一节留下的状态，下一节吃亏」**（§一二二.6）。 */
            /* ⚠️ **用「放弃」而不是 ⌘S。** 上一条判据（「盘上被别人改过时落盘被拒」）
               **刻意留下一份落不下去的改动** —— 那正是它要证明的事。
               这时按 ⌘S 必然失败，dirty 一直挂着，下一次点文件就弹确认卡、
               遮罩挡住后面所有点击，而报错指向**这一节里的一行**。
               「放弃」那颗钮是插件自己的，一定生效。 */
            {
              const cf = pg.frameLocator('iframe[data-role="body"]');
              if (await cf.locator("#dirty:not([hidden])").count().catch(() => 0) > 0) {
                await cf.locator("#discard").click().catch(() => {});
                await pg.waitForTimeout(600);
              }
            }

            /* ═══ 只读（S18 §一.4）═══ 按文件名自动进，不问内容。
               ⚠️ **样本名要选真会走 `code` 这个类型的**。第一版用 `插件回归样本.lock` ——
               而 `kindOf("a.lock")` 是 **`other`**（走通用文件卡），
               根本到不了代码插件，判据当然红，**而红的原因和只读毫无关系**。
               `-lock.yaml` 才是 `code`（`kindOf` 实测过）。
               **测一个功能之前，先确认样本真的会走到那条路。** */
            const LOCK = "插件回归样本-lock.yaml";
            const lockOk = await pg.evaluate(async ({ name }) => {
              const b = window.__UD_APP;
              const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
              const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ path: name, content: "lockfileVersion: '9.0'\nsettings:\n  a: true\n", expectSha256: "0" }) });
              return (await w.json()).ok;
            }, { name: LOCK });
            if (lockOk) {
              await settleTree(LOCK);   // 轮询等树刷出来，不是定时等
              const lockRow = pg.locator('[role="treeitem"]').filter({ hasText: LOCK }).first();
              if (await lockRow.count()) {
                /* ⚠️ **清理要在点之后**：卡片是**这一次点击触发**的（当前文件还脏着），
                   点之前清没有用 —— 那时还没有卡。
                   第一版把 `clearGuard()` 放在点之前，遮罩照样挡住后面所有点击。 */
                const lf = pg.frameLocator('iframe[data-role="body"]');
                await lockRow.click(); await pg.waitForTimeout(800);
                await clearGuard();                     // 收掉「要切走吗」
                /* 被卡片拦下的那一次点击不会生效 —— 收掉之后再点一次 */
                if (await lf.locator("#ro").count().catch(() => 0) === 0) { await lockRow.click(); }
                await pg.waitForTimeout(2800);
                const roTxt = (await lf.locator("#ro:not([hidden])").innerText().catch(() => "")).replace(/\s+/g, " ");
                ok(/只读/.test(roTxt) && /锁文件/.test(roTxt), "**`.lock` 自动进只读，并说出原因**", roTxt.slice(0, 40) || "（没有只读条）");
                ok(/解锁编辑/.test(roTxt), "只读条上有「解锁编辑」（不是死路）");
                /* 只读下照样能选中 —— 只读不等于「这个文件与你无关」 */
                await lf.locator(".cm-content").click();
                await pg.keyboard.press("Meta+a");
                await pg.waitForTimeout(300);
                const selLen = await lf.locator(".cm-content").evaluate(() => (window.getSelection()?.toString() ?? "").length).catch(() => 0);
                ok(selLen > 0, "**只读下照样选得中**（只读不是「与你无关」）", `选中 ${selLen} 字符`);
                /* 按字键：不改内容 + 出提示 */
                const before = await lf.locator(".cm-line").count();
                await pg.keyboard.press("End");
                await pg.keyboard.type("xyz");
                await pg.waitForTimeout(600);
                const txt = await lf.locator(".cm-content").innerText().catch(() => "");
                ok(!/xyz/.test(txt), "只读下按字键**改不进去**");
                const hint = (await lf.locator("#roHint:not([hidden])").innerText().catch(() => "")).replace(/\s+/g, " ");
                ok(/没改/.test(hint), "**只读下按字键会说出原因**（不是静默吞掉）", hint.slice(0, 40) || "（没有提示）");
              } else ok(false, "`.lock` 样本建好了但树里没刷出来");
              await pg.evaluate(async ({ name }) => {
                const b = window.__UD_APP;
                const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
                await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                for (const it of t?.data?.items ?? []) if (it.originalName === name) {
                  await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                }
              }, { name: LOCK });
            } else ok(false, "建不出 .lock 样本");

            /* ═══ 切到别的文件也拦（S18 §一.1 那张卡的第二种触发）═══
               ⚠️ 三条出路的**落点和关页签不同**，尤其「不要了」——
               它该是「丢掉改动**并切过去**」，**不是关掉这个页签**。
               用户按它的意图是「我要去看别的」，不是「这个我不要了」。 */
            {
              /* ⚠️ **上一节把当前文件换成了 `.lock`**（而且它是只读的，打不了字）。
                 这一节要的是一份**能改的** `.ts` —— 自己切回去，别指望上一节留对了状态。
                 又一次「判据依赖的前提，判据自己要建立」（§一二二.3）。 */
              const tsRow2 = pg.locator('[role="treeitem"]').filter({ hasText: TS }).first();
              if (await tsRow2.count()) { await tsRow2.click(); await pg.waitForTimeout(2500); }
              const cm2 = pg.frameLocator('iframe[data-role="body"]').locator(".cm-content");
              await cm2.click();
              await pg.keyboard.press("End");
              await pg.keyboard.type("\n// 为了测切走而改的");
              await pg.waitForTimeout(700);

              /* ─ 批量关页签**不会碰没落盘的那份**（2026-09-30）─
                 ⚠️ 这一条是**一次误报的产物**：我孤立地读 `closeMany`，看见它对整批
                 `dirtyStore.drop` 就判「关闭其他会静默丢改动」。查调用方才发现
                 四处入口全走 `closable()`，而它的 `keep` 上游就把脏页签滤掉了。
                 那处「修复」已撤回 —— 真正在保护用户的是这条不变量，所以钉它。
                 判法：同一颗页签在**脏**和**干净**两种状态下各读一次
                 「关闭已保存的」的个数，差应当正好是 1。
                 这样不依赖「一共几个页签」「有没有固定的」这些我控制不了的前提。 */
              const savedCount = async () => {
                await pg.locator(`[data-ud="tab"][data-path="${TS}"]`).first().click({ button: "right" });
                await pg.waitForTimeout(400);
                const t = await pg.locator('[data-ud="tabmenu"]').innerText().catch(() => "");
                await pg.keyboard.press("Escape"); await pg.waitForTimeout(250);
                return Number((/关闭已保存的\s*(\d+)\s*个/.exec(t) ?? [])[1] ?? NaN);
              };
              const nDirty = await savedCount();
              /* 落盘 —— 让同一颗页签变干净。⌘S 走的是转发给插件那条路 */
              await cm2.click();
              await pg.keyboard.press("Meta+s");
              for (let i = 0; i < 40 && await pg.locator(`[data-ud="tab"][data-path="${TS}"] [title="改了还没落盘"]`).count(); i++) await pg.waitForTimeout(150);
              const nClean = await savedCount();
              ok(Number.isFinite(nDirty) && nClean === nDirty + 1,
                 "**「关闭已保存的」把没落盘的那份排除在外**（批量也不丢改动）", `脏 ${nDirty} 个 → 干净 ${nClean} 个`);
              /* 判据自己把状态改干净了，切走那一段要的是脏的 —— 自己改回去（§一二二.3） */
              await cm2.click();
              await pg.keyboard.press("End");
              await pg.keyboard.type("\n// 再改一次，为了测切走");
              await pg.waitForTimeout(700);
              /* 去点树里另一份 .dc.html */
              const other = pg.locator('[role="treeitem"]').filter({ hasText: ".dc.html" }).first();
              await other.click();
              await pg.waitForTimeout(800);
              const g = (await pg.locator('[role="alertdialog"]').innerText().catch(() => "")).replace(/\s+/g, " ");
              ok(/还没落盘/.test(g), "**有改动时切到别的文件也会拦**（不是悄悄丢掉）", g.slice(0, 40) || "（没拦）");
              /* ⚠️ 话要说准：这一张说的是「切走」不是「关掉」 */
              ok(/切走以后/.test(g), "这一张说的是「**切走**以后…」（不是「关掉以后」）", g.slice(0, 50));
              ok(/落盘再切/.test(g), "主钮写的是「落盘再切」", g.slice(0, 60));
              /* 「不要了」：丢掉改动、切过去，**但页签不该关** */
              await pg.locator('[role="alertdialog"] button:has-text("不要了")').click();
              await pg.waitForTimeout(1800);
              ok(await pg.locator('[role="alertdialog"]').count() === 0, "「不要了」之后卡片收起来了");
              ok(await pg.locator(`[data-ud="tab"][data-path="${TS}"]`).count() > 0,
                 "**「不要了」不关页签**（他要的是去看别的，不是关掉这个）");
              /* 切回来：改动应该没了（我们丢掉了），而且不该再拦 */
              await pg.locator(`[data-ud="tab"][data-path="${TS}"]`).first().click();
              await pg.waitForTimeout(2500);
              ok(await pg.locator('[role="alertdialog"]').count() === 0, "切回来不会再拦（改动已经丢掉了）");
            }


            /* ═══ CSV：源码 / 表 两档（M10-5，S20）═══
               ⚠️ 样本是**专门挑出来的**：引号里有换行（L3–L4）+ 少一列 + 多一列。
               「引号里的换行」那一条按 `\n` 粗暴切会多出一条假坏行 ——
               而那正是「报一个根本不存在的问题」。 */
            {
              const C = "csv回归.csv";
              const mkc = await pg.evaluate(async ({ name }) => {
                const b = window.__UD_APP;
                const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ path: name,
                    content: 'order_id,city,note\n1,北京,ok\n2,上海,"第一行\n第二行"\n3,广州\n4,深圳,x,多余\n',
                    expectSha256: "0" }) });
                return (await w.json()).ok;
              }, { name: C });
              if (mkc) {
                await settleTree(C);   // 轮询等树刷出来，不是定时等
                const cRow = pg.locator('[role="treeitem"]').filter({ hasText: C }).first();
                if (await cRow.count()) {
                  await cRow.click(); await pg.waitForTimeout(3000);
                  await clearGuard();
                  if (await pg.frameLocator('iframe[data-role="body"]').locator(".cgrid").count().catch(() => 0) === 0) { await cRow.click(); await pg.waitForTimeout(2800); }
                  const cf = pg.frameLocator('iframe[data-role="body"]');

                  ok(await cf.locator("#table").isHidden() === false,
                     "**`.csv` 默认给表**（S20：它是拿来看的数据，不是拿来改的配置）");
                  ok(await cf.locator(".cgrid").count() === 1, "用的是 grid 不是 table（和稿一致）");

                  /* ⚠️ 这一条是这一段的核心 */
                  const nums = [];
                  for (let q = 0; q < await cf.locator(".crow .cnum").count(); q++) {
                    nums.push((await cf.locator(".crow .cnum").nth(q).innerText()).trim());
                  }
                  ok(JSON.stringify(nums) === JSON.stringify(["2", "3–4", "5", "6"]),
                     "**行号是源码行号，跨行的那条给范围**（按 \\n 粗暴切会多出一条假坏行）", nums.join(" / "));

                  ok(await cf.locator(".crow.bad").count() === 2, "两条坏行都标出来了", `${await cf.locator(".crow.bad").count()} 行`);
                  const whys = [];
                  for (let q = 0; q < await cf.locator(".cwhy").count(); q++) whys.push((await cf.locator(".cwhy").nth(q).innerText()).trim());
                  ok(whys.some((w) => /少 1 列/.test(w)) && whys.some((w) => /多 1 列/.test(w)),
                     "**行尾那句话说出差多少**（CSV 没规定每行一样长，所以不说「这一行错了」）", whys.join(" | "));

                  await openEdit();
                  /* ⚠️ **选择器落在结构上，不落在文案上。**
                     手验时我用 `button:has-text("行有问题")` 在点击**之后**再读它，
                     而那时文案已经变成「只看有问题的…」——匹配不到，读成空，
                     差点当成「按钮坏了」。**文案正是会变的那个东西。** */
                  const bar = pg.locator('[data-ud="file-toolbar"]');
                  const btnAt = (i) => bar.locator("button").nth(i);
                  const labels = async () => {
                    const out = [];
                    for (let q = 0; q < await bar.locator("button").count(); q++) out.push((await btnAt(q).innerText()).trim());
                    return out;
                  };
                  const before = await labels();
                  ok(before.includes("源码") && before.includes("表"), "编辑栏上有「源码 / 表」切档", before.join(" · "));
                  const badIdx = before.findIndex((t) => /行有问题/.test(t));
                  ok(badIdx >= 0, "有「N 行有问题」那一颗", before[badIdx]);

                  /* ── 按钮组的**警示档**（S20 演示态 5「warn 档」，2026-09-30 加的宿主通用能力）──
                     ⚠️ **不验 class 名** —— `className.includes("warn")` 测的是我们自己写的字符串，
                     样式表删掉它照样绿。验的是**算出来的效果**：
                     文字颜色等于 `--tool-warn` 的真值，而标签前那颗点真的画出来了。
                     那颗点是 `::before`，DOM 里数不到 —— 只能问计算样式。 */
                  const warnLook = await btnAt(badIdx).evaluate((n) => {
                    const cs = getComputedStyle(n);
                    const want = getComputedStyle(document.documentElement).getPropertyValue("--tool-warn").trim();
                    const probe = document.createElement("span");
                    probe.style.color = want; document.body.appendChild(probe);
                    const wantRGB = getComputedStyle(probe).color; probe.remove();
                    const dot = getComputedStyle(n, "::before");
                    return { colorMatchesWarn: cs.color === wantRGB, color: cs.color, want: wantRGB, dotW: dot.width, dotBG: dot.backgroundColor };
                  });
                  ok(warnLook.colorMatchesWarn,
                     "**那颗钮走警示档**（文字色算出来就是 `--tool-warn`，不是普通钮）", `${warnLook.color} vs ${warnLook.want}`);
                  ok(warnLook.dotW === "6px" && warnLook.dotBG === warnLook.want,
                     "**标签前那颗 6px warn 点真的画出来了**（一眼看出「这份文件有事」靠的是它，不是颜色深浅）", `${warnLook.dotW} · ${warnLook.dotBG}`);
                  ok(await btnAt(badIdx).getAttribute("aria-pressed") === "false",
                     "开关态走 `aria-pressed`（屏幕阅读器要的就是这个属性）", String(await btnAt(badIdx).getAttribute("aria-pressed")));

                  await btnAt(badIdx).click(); await pg.waitForTimeout(900);
                  ok(await btnAt(badIdx).getAttribute("aria-pressed") === "true", "点下去之后 `aria-pressed` 跟着翻");
                  const after = await labels();
                  ok(/只看有问题的/.test(after[badIdx] ?? ""), "点了之后它自己变成「回到全部」", after[badIdx]);
                  const n2 = [];
                  for (let q = 0; q < await cf.locator(".crow .cnum").count(); q++) n2.push((await cf.locator(".crow .cnum").nth(q).innerText()).trim());
                  ok(JSON.stringify(n2) === JSON.stringify(["5", "6"]),
                     "**只看坏行时行号不重排**（改的时候要对得上源码）", n2.join(" / "));
                  await btnAt(badIdx).click(); await pg.waitForTimeout(700);
                  ok(await cf.locator(".crow").count() === 4, "再点回到全部", `${await cf.locator(".crow").count()} 行`);

                  /* ── 挑几行 → 给 AI（S20 演示态 3/4）── */
                  const aiIdx = (await labels()).findIndex((t) => /选中行给 AI/.test(t));
                  ok(aiIdx >= 0 && await btnAt(aiIdx).isDisabled(),
                     "**没选中时那颗钮是灰的**（一颗点了没反应的钮比一颗灰的更糟）");
                  ok(/先点左边的行号/.test(await btnAt(aiIdx).getAttribute("title") ?? ""),
                     "而且说得出要先做什么", await btnAt(aiIdx).getAttribute("title"));

                  await cf.locator('.crow[data-row="1"] .cnum').click(); await pg.waitForTimeout(350);
                  await cf.locator('.crow[data-row="3"] .cnum').click({ modifiers: ["Shift"] }); await pg.waitForTimeout(350);
                  ok(await cf.locator(".crow.on").count() === 3, "**⇧ 点扩成一段**", `选中 ${await cf.locator(".crow.on").count()} 行`);
                  ok(!(await btnAt(aiIdx).isDisabled()), "选中之后钮亮了");

                  /* ⚠️ **只看点击后新出现的文字，不读整个会话栏。**
                     手验时我先读 `[data-ud="chat"]`（选错了）读成空，
                     又读整个 `aside` 读到一屏历史消息 —— 而那一段的注释（§1541）
                     早就警告过「找药丸本身，不找会话栏里随便什么文字」。
                     差集比选择器稳：它不依赖任何 class 名。 */
                  const snapAside = () => pg.evaluate(() =>
                    [...document.querySelectorAll("aside *")].map((n) => (n.textContent || "").trim()).filter((t) => t && t.length < 80));
                  const beforePill = new Set(await snapAside());
                  await btnAt(aiIdx).click(); await pg.waitForTimeout(1100);
                  const freshPill = (await snapAside()).filter((t) => !beforePill.has(t));
                  ok(freshPill.some((t) => /^csv · csv回归\.csv · L\d/.test(t)),
                     "**挂出 csv 药丸**（写 `csv · 文件 · 行范围`，不是直接发给 AI）",
                     freshPill.find((t) => /csv ·/.test(t)) ?? freshPill.slice(0, 2).join(" | "));
                  /* ⚠️ 这一条不能用差集：`range` 这个词**本轮之前就出现过**
                     （上面 S18 那颗药丸也是 range），所以它不在「新出现」里。
                     差集只对**这一次才有的文字**有效 —— 类型名是复用的，得直接问那颗药丸。 */
                  const pillWhole = freshPill.find((t) => /csv回归\.csv/.test(t) && t.length > 20) ?? "";
                  ok(/range/.test(pillWhole),
                     "药丸的类型是 range（和 S18 选区那颗同一种，AI 那边按同一套读）", pillWhole);

                  /* 选一整列 */
                  await cf.locator('.chead [data-col="2"]').click(); await pg.waitForTimeout(450);
                  ok(await cf.locator(".ccell.colon").count() > 1, "**点列名选中一整列**", `${await cf.locator(".ccell.colon").count()} 格高亮`);
                  ok(/这一列的值/.test(await btnAt(aiIdx).getAttribute("title") ?? ""),
                     "选列时那颗钮说的是「带表头 + 这一列的值」", await btnAt(aiIdx).getAttribute("title"));
                } else ok(false, "csv 样本建好了但树里没刷出来");
                await pg.evaluate(async ({ name }) => {
                  const b = window.__UD_APP;
                  const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                  await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                  for (const it of t?.data?.items ?? []) if (it.originalName === name)
                    await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                }, { name: C });
              } else ok(false, "建不出 csv 样本");
            }

            /* ═══ 大表只画视口里的那几十行（issue #52，2026-10-06）═══
               原来是 `for (let i = 1; i < rows.length; i++)` 全画 ——
               5 万行 × 10 列 = 50 万个 DOM 节点，一打开就卡死。
               ⚠️ 判据读的是**真实画出来的 `.crow` 个数**和**滚动高度**，不看截图：
               「卡不卡」没法量，「画了几个节点」能量。
               样本名走 `csv回归` 前缀 —— 收尾那三条判据按它清（纪律⑥）。 */
            {
              const BIG = "csv回归大表.csv";
              const ROWS = 3000;
              const mkb = await pg.evaluate(async ({ name, n }) => {
                const b = window.__UD_APP;
                const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                let body = "id,name,note\n";
                for (let i = 1; i <= n; i++) {
                  /* ⚠️ **样本里要有那两种坑**（issue #116，2026-10-06）——
                     不然「每个单元格一行高」和「坏行那条也一行高」两条判据都是**空过的**：
                       · 第 7 条：**引号里有换行** → `.ccell` 是 `white-space: pre`，
                         不钉高度的话这一行实际 3 × 24 = 72px，而垫片按 24px 算；
                       · 第 11 条：**多一列** → 画出 `.cwhy`（坏行的原因），
                         而它的 `font:` 简写会把 `line-height` 重置成 ~14px。
                     第一版样本是规规矩矩的三列，于是两条判据读到的是
                     「量到 24」和「这份样本没有坏行」—— **都通过，而都没打中**。 */
                  if (i === 7) body += `${i},"跨\n三\n行",备注${i}\n`;
                  else if (i === 11) body += `${i},行${i},备注${i},多出来的一列\n`;
                  else body += `${i},行${i},备注${i}\n`;
                }
                const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ path: name, content: body, expectSha256: "0" }) });
                return (await w.json()).ok;
              }, { name: BIG, n: ROWS });
              if (mkb) {
                await settleTree(BIG);   // 轮询等树刷出来，不是定时等
                const bRow = pg.locator('[role="treeitem"]').filter({ hasText: BIG }).first();
                if (await bRow.count()) {
                  await bRow.click();
                  const bf = pg.frameLocator('iframe[data-role="body"]');
                  /* 等它画出来 —— 别抢（§113 那条「抢跑的判据会把慢误报成坏」）。
                     ⚠️ **而「画出来了」要认是哪个文件的表**（2026-10-06 实测栽过）：
                     第一版等的是「`.crow` 个数 > 0」，而**上一个 csv 样本正好 4 行**，
                     它还在 DOM 里 → 循环第一轮就跳出，于是
                     「只画视口里的几十行」这条判据**量的是上一个文件**（4 < 200，照样绿）。
                     判准改成「滚动高度对得上这张大表」—— 那是**只有这张表才有**的特征。 */
                  let drawn = 0, geo0 = { sh: 0, ch: 0 };
                  for (let q = 0; q < 60; q++) {
                    geo0 = await bf.locator("#table").evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight })).catch(() => ({ sh: 0, ch: 0 }));
                    drawn = await bf.locator(".crow").count().catch(() => 0);
                    if (geo0.sh > ROWS * 20 && drawn > 0) break;
                    await pg.waitForTimeout(300);
                  }
                  ok(geo0.sh > ROWS * 20 && drawn > 0,
                     "（前提）**这张大表**真画出来了（不是上一个文件的表还留在 DOM 里）",
                     `scrollHeight ${geo0.sh} · 画了 ${drawn} 行`);
                  /* ① 只画一小扇窗 —— 不是全画 */
                  ok(drawn > 0 && drawn < 200,
                     `**${ROWS} 行的表只画视口里的几十行**（原来全画：${ROWS} × 3 格 = 上万个节点）`,
                     `画了 ${drawn} 行`);
                  /* ② 而滚动条还是真的 —— 垫片把没画的部分占住了。
                     ⚠️ 这一条必须有：少了它，一个「只画前 50 行、剩下的不管」的实现
                     也会让 ① 通过，而那是**数据看不到了**，比卡死更糟。 */
                  const geo = geo0;
                  ok(geo.sh > ROWS * 20,
                     `**滚动高度仍对应全部 ${ROWS} 行**（垫片占住了没画的部分，滚动条不说谎）`,
                     `scrollHeight ${geo.sh}`);
                  /* ③ 滚下去之后窗口真的跟着动，而且到得了最后一行 */
                  await bf.locator("#table").evaluate((el) => { el.scrollTop = el.scrollHeight; });
                  await pg.waitForTimeout(600);
                  const lastRow = await bf.locator(".crow").last().getAttribute("data-row").catch(() => null);
                  ok(String(lastRow) === String(ROWS),
                     `**滚到底能看到最后一行**（第 ${ROWS} 条）`, `最后画的是第 ${lastRow} 条`);
                  const firstRow = Number(await bf.locator(".crow").first().getAttribute("data-row").catch(() => 0));
                  ok(firstRow > ROWS - 200,
                     "**窗口跟着滚动走了**（滚到底之后开头那几行已经不在 DOM 里）", `窗口从第 ${firstRow} 条起`);

                  /* ── 虚拟滚动的那个前提得是**真的**（issue #116，2026-10-06）──
                     垫片是按「普通行 24px、坏行 48px」算的。而这个前提原来有两处不成立：
                       ① **引号里的换行**：`parseCsv` 把它留在单元格里，而 `.ccell` 是
                          `white-space: pre` → 那一行实际 3 × 24 = 72px，模型里算 24px；
                       ② **`.cwhy` 的 `font:` 简写**把 `line-height` 重置成 `normal`
                          （11px 字体约 13–15px），覆盖了继承来的 24px。
                     两者都让「垫片高度」和「真实排版」每过一行差一截 → 滚动一跳一跳。

                     ⚠️ 判据量的是**真实的 `offsetHeight`**，不是「能不能滚」——
                     「能滚」在错的高度下也成立，而那正是这条 bug 的样子。 */
                  {
                    /* ⚠️ **先滚回顶部**：那两个坑在第 7 / 第 11 条，
                       而上面几条判据已经把窗口滚到底了 —— 虚拟滚动下它们**不在 DOM 里**。
                       第一版没滚，读到「一条 .cwhy 都没画」。
                       **虚拟滚动让「DOM 里有没有」变成了「现在看得见没有」** ——
                       以前的判据不用考虑这件事，以后都要。 */
                    await bf.locator("#table").evaluate((el) => { el.scrollTop = 0; });
                    await pg.waitForTimeout(500);
                    const geom = await bf.locator("#table").evaluate((el) => {
                      const rows = [...el.querySelectorAll(".crow")];
                      const cells = rows.flatMap((r) => [...r.querySelectorAll(".ccell")]);
                      const whys = [...el.querySelectorAll(".cwhy")];
                      const h = (n) => Math.round(n.getBoundingClientRect().height);
                      return {
                        cell: [...new Set(cells.map(h))],
                        why: [...new Set(whys.map(h))],
                        line: Math.round(parseFloat(getComputedStyle(el).lineHeight)),
                      };
                    });
                    ok(geom.cell.length === 1 && geom.cell[0] === geom.line,
                       `**每个单元格正好一行高**（${geom.line}px）—— 引号里的换行不许把行撑高`,
                       `量到的高度：${geom.cell.join(" / ")}`);
                    /* ⚠️ **不许「没有坏行」也算过**：第一版写的是
                       `why.length === 0 || …`，而样本里恰好没有坏行 →
                       那一条**通过而没打中**（§一一四 那条「判据在测别的东西也会绿」）。
                       现在样本第 11 条故意多一列，所以 `.cwhy` 必须出现。 */
                    ok(geom.why.length === 1 && geom.why[0] === geom.line,
                       "**坏行那条原因也是一行高**（`font:` 简写会把 `line-height` 重置掉）",
                       geom.why.length ? geom.why.join(" / ") : "✗ 一条 .cwhy 都没画（样本没打中？）");
                  }
                } else ok(false, "大表样本建好了但树里没刷出来");
                await pg.evaluate(async ({ name }) => {
                  const b = window.__UD_APP;
                  const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                  await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                  for (const it of t?.data?.items ?? []) if (it.originalName === name)
                    await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                }, { name: BIG });
              } else ok(false, "建不出大表样本");
            }

            /* ═══ 逐行对比：和上一版比，逐块接受 / 拒绝（issue #38，2026-10-06）═══
               在它之前**代码 / 文本类型等于没有 diff 视图** ——
               宿主的变更面板走 `diff.ts` 的**语义** diff（按 dc 节点指纹配对、L1–L4 分级），
               对 `.ts` / `.py` / `.txt` 不适用，所以这些文件只能**整版回退**。
               而「选中后让 AI 改」最需要的恰恰是**逐块看、逐块决定**。

               ⚠️ **判据必须先把编辑栏打开**：插件的工具条在编辑栏里，默认收起
               （祖先链上那个 `anim-block` 高 0 + `overflow: hidden`）。
               手验时漏了这一步，量到「按钮中心点上最上层是 iframe」，
               **差点把它当成一条布局缺陷**（§七十二 那条「目录列被页签条压着」的反面：
               这次 DOM 几何是真的，而**结论是错的**）。 */
            {
              const CP = "csv回归-对比.txt";
              const mk1 = await pg.evaluate(async ({ name }) => {
                const b = window.__UD_APP;
                const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                const w1 = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ path: name, content: "第一行\n第二行\n第三行\n", expectSha256: "0" }) });
                if (!(await w1.json()).ok) return { ok: false, step: "第一版" };
                const rd = await (await fetch(u("file_read") + `&path=${encodeURIComponent(name)}`)).json().catch(() => null);
                const sha = rd?.data?.sha256;
                const w2 = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ path: name, content: "第一行\n第二行改过了\n第三行\n第四行是新加的\n", expectSha256: sha }) });
                const j2 = await w2.json();
                return { ok: !!j2.ok, snapshot: j2?.data?.snapshot };
              }, { name: CP });
              ok(mk1.ok, "（前提）造出一个有两版的文本文件", JSON.stringify(mk1));
              if (mk1.ok) {
                await settleTree(CP);
                const pRow = pg.locator('[role="treeitem"]').filter({ hasText: CP }).first();
                if (await pRow.count()) {
                  await pRow.click();
                  const pf = pg.frameLocator('iframe[data-role="body"]');
                  for (let q = 0; q < 40; q++) { if (await pf.locator(".cm-content").count().catch(() => 0)) break; await pg.waitForTimeout(300); }
                  /* 先开编辑栏（上面注释那条） */
                  const eb2 = pg.locator('[data-ud="toggle-edit"]');
                  if (await eb2.count() && (await eb2.getAttribute("aria-pressed")) !== "true") { await eb2.click(); await pg.waitForTimeout(600); }
                  const cmpBtn = pg.locator("button").filter({ hasText: /对比上一版|对比 s\d+/ }).first();
                  ok(await cmpBtn.count() === 1 && !(await cmpBtn.isDisabled()),
                     "**有两版时「对比上一版」这颗钮亮着**", await cmpBtn.count() ? `disabled=${await cmpBtn.isDisabled()}` : "没有这颗钮");
                  if (await cmpBtn.count()) {
                    await cmpBtn.click(); await pg.waitForTimeout(1800);
                    /* ⚠️ 读的是插件 frame 里那个探针 —— 它说得出**为什么没进**
                       （没有上一版 / 在看旧版 / 取不到）。少了它，所有失败都长成「点了没反应」。 */
                    const probe = await pf.locator("body").evaluate(() => window.__cmp ?? null).catch(() => null);
                    ok(!!probe && /进了对比档/.test(String(probe.why)),
                       "**点了真进对比档**（探针说得出没进的原因）", probe ? String(probe.why) : "（探针没跑 = 点击没到插件）");
                    /* 真正的读数：**改动块画出来了 + 每块有接受/拒绝** */
                    const marks = await pf.locator(".cm-changedLine, .cm-deletedChunk").count().catch(() => 0);
                    ok(marks >= 2, "**改动的行真的标出来了**（改过的 + 新加的）", `${marks} 处标记`);
                    const ctrls = await pf.locator("button, .cm-merge-revert").filter({ hasText: /接受|拒绝|Accept|Reject/ }).count().catch(() => 0);
                    ok(ctrls >= 2, "**每一块都有「接受 / 拒绝」**（这一档存在的理由 —— 不然它只是更花的只读视图）", `${ctrls} 个控件`);
                    /* 读数在 `⋯` 浮层头（§一一四），不在工具条 */
                    const more2 = pg.locator('button:has-text("⋯")').first();
                    if (await more2.count()) {
                      await more2.click(); await pg.waitForTimeout(500);
                      const mt2 = (await pg.locator('[data-ud="more-meta"]').innerText().catch(() => "")).trim();
                      ok(/和 s\d+ 比/.test(mt2) && /还有 \d+ 块|没有差异了/.test(mt2),
                         "**读数说得出「和哪一版比、还有几块」**（算不出来时写「算着」，不写 0）", mt2.slice(0, 80) || "（空）");
                      await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
                    }
                    /* 拒绝第一块 → 文档该退回上一版那一行 */
                    const rej = pf.locator("button, .cm-merge-revert").filter({ hasText: /拒绝|Reject/ }).first();
                    if (await rej.count()) {
                      await rej.click(); await pg.waitForTimeout(800);
                      const txt = await pf.locator(".cm-content").innerText().catch(() => "");
                      ok(/第二行(?!改过了)/.test(txt.replace(/\s+/g, "")) || !/第二行改过了/.test(txt),
                         "**拒绝一块之后那一行退回上一版**（逐块决定，不是整版回退）", txt.replace(/\n/g, "⏎").slice(0, 60));
                    } else ok(false, "找不到「拒绝」那颗钮");
                    /* ⚠️ **把状态还回去**（2026-10-06 实测栽过）：这一节留下的
                       「对比档开着 + 编辑栏开着」会让**后面几节**红 ——
                       编码那一组报「读不到横条」、树那一组报「上一层还在」。
                       **症状全出现在别的判据上，而原因在这一节。**
                       §143.6 那条「样本之间互相毁夹具」的同一族：
                       这次毁的不是夹具，是**界面状态**。 */
                    await cmpBtn.click().catch(() => {});       // 退出对比档
                    await pg.waitForTimeout(600);
                  }
                  if (await eb2.count() && (await eb2.getAttribute("aria-pressed")) === "true") {
                    await eb2.click(); await pg.waitForTimeout(400);   // 编辑栏收回去
                  }
                } else ok(false, "对比样本建好了但树里没刷出来");
                await pg.evaluate(async ({ name }) => {
                  const b = window.__UD_APP;
                  const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                  await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                  for (const it of t?.data?.items ?? []) if (it.originalName === name)
                    await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                }, { name: CP });
              }
            }

            /* ═══ CSV 演示态 7：编码不对（M10-5，S20）═══
               设计侧的原话是「**编码没确定之前只读 —— 按错的编码落盘会把原文写坏**」。
               这一节钉三件事，顺序就是用户会碰到的顺序：
                 ① 认出来并说出证据（不是一句「编码有问题」）
                 ② **第一次打开就只读**，而且说得出为什么
                 ③ 换读法真的换对了，而**盘上一个字节都没动**

               ⚠️ ② 那一条是钉一个实测栽过的顺序 bug（2026-09-30）：
               `roReason` 原来算在编码嗅探**之前**，用的是上一个文件的编码结论。
               手上先开过别的文件时它恰好是对的 —— **只有「第一次就打开乱码 CSV」才漏**。
               所以这一节必须自己开一份新文件点进去，不能接着上一节的状态测。 */
            {
              const G = "gbk回归.csv";
              const dir = await pg.evaluate(() => window.__UD_APP.dir);
              /* `订单,金额\n1,100\n2,200\n` 的 GBK 字节。**写死字节不写转码** ——
                 Node 的 `Buffer` 没有 GBK 编码器（`TextEncoder` 只有 UTF-8），
                 而为一份三行的夹具引一个转码库不值得。 */
              const bytes = Buffer.from([
                0xb6, 0xa9, 0xb5, 0xa5, 0x2c, 0xbd, 0xf0, 0xb6, 0xee, 0x0a,
                0x31, 0x2c, 0x31, 0x30, 0x30, 0x0a,
                0x32, 0x2c, 0x32, 0x30, 0x30, 0x0a,
              ]);
              writeFileSync(`${dir}/${G}`, bytes);
              await pg.waitForTimeout(1600);
              const grow = pg.locator('[role="treeitem"]').filter({ hasText: G }).first();
              if (await grow.count()) {
                await grow.click(); await pg.waitForTimeout(3200);
                /* 上一节留了未落盘的东西就会被确认卡拦住 —— 回去再点一次 */
                if (await pg.locator('[role="alertdialog"]').count()) {
                  await pg.locator('[role="alertdialog"] button:has-text("回去接着改")').click();
                  await pg.waitForTimeout(400); await grow.click(); await pg.waitForTimeout(2800);
                }
                const gf = pg.frameLocator('iframe[data-role="body"]');
                const encbar = () => gf.locator("#encbar").innerText().catch(() => "").then((t) => t.replace(/\s+/g, " ").trim());
                /* ⚠️ **只读要连「横条真的显示出来了」一起验。**
                   `#roText` 的静态文案就是「只读」—— 横条 `hidden` 时读它照样拿到那两个字，
                   于是一条「只读了吗」的判据会在**根本没只读**的情况下通过。
                   2026-09-30 手验时就被这两个字骗过一次（§一三二）。 */
                const roNow = async () => {
                  const shown = await gf.locator("#ro").evaluate((n) => !n.hidden && getComputedStyle(n).display !== "none").catch(() => false);
                  return shown ? (await gf.locator("#roText").textContent().catch(() => "")).trim() : "";
                };
                const head3 = async () => {
                  const out = [];
                  for (let i = 0; i < Math.min(3, await gf.locator(".ccell").count()); i++) out.push((await gf.locator(".ccell").nth(i).innerText()).trim());
                  return out;
                };

                /** 横条**算出来的**底色 / 边色 / 点色（S20 的 `encBarBg` / `encBarBd` / `encDot`）。
                 *  ⚠️ **不验 `style` 里写了什么** —— 2026-10-01 实测抓到：
                 *  插件在不透明源的 iframe 里**拿不到宿主的 `--tool-*` 变量**，
                 *  `var(--tool-warn-soft)` 落空之后 CSS 静默跳过那一条声明 ——
                 *  **既不是警示色，也不报错，就是没有底色**。
                 *  而 `el.style.background` 读回来的仍然是那句 `var(...)`，**判据会照样绿**。 */
                const encLook = async () => await gf.locator("#encbar").evaluate((n) => {
                  const cs = getComputedStyle(n);
                  const d = n.querySelector(".encdot");
                  return {
                    bg: cs.backgroundColor, bd: cs.borderBottomColor, fg: cs.color,
                    dot: d ? getComputedStyle(d).backgroundColor : "(没有那颗点)",
                    dotW: d ? getComputedStyle(d).width : "0px",
                  };
                }).catch(() => null);
                const transparent = (c) => !c || c === "rgba(0, 0, 0, 0)" || c === "transparent";

                const look7 = await encLook();
                ok(look7 && !transparent(look7.bg),
                   "**态 7 横条真有 warn 底**（算出来的颜色，不是 `style` 里那句 `var(...)`）",
                   look7 ? look7.bg : "读不到横条");
                /* ⚠️ **边色不能只验「不透明」。**（2026-10-01 反向验证时自己抓到的假通过）
                   `border-color` 落空会回退成 `currentColor` —— 也就是文字色，
                   **不透明，于是「有边色」这条照样通过**，而画面上那是一道深色描边不是 warn 边。
                   「边色不透明」这句话还可能因为「它落空了」而成立 ——
                   所以判据改成「**和文字色不一样**」，那才是落空与没落空的分界。 */
                ok(look7 && look7.bd !== look7.fg,
                   "**而且边色不是落空回退的 `currentColor`**（落空的话它就等于文字色）",
                   look7 ? `边 ${look7.bd} · 文字 ${look7.fg}` : "—");
                ok(look7 && look7.dotW === "6px" && !transparent(look7.dot),
                   "**那颗 6px 的点在**（档位靠它 —— 暗底下 warn-soft 和 panel-2 差得很小）",
                   look7 ? `${look7.dotW} · ${look7.dot}` : "—");

                const bar0 = await encbar();
                ok(/不是 UTF-8/.test(bar0) && /\d+ 个乱码字符/.test(bar0),
                   "**认出来并摆出证据**（说出几个乱码字符、占多少，不是一句「编码有问题」）", bar0.slice(0, 60));
                ok(/按 GBK 重读/.test(bar0), "给出出路（列的是实测支持的编码，不是一个下拉框）");

                const ro0 = await roNow();
                ok(/编码没确定/.test(ro0),
                   "**第一次打开就只读，而且说得出为什么**（钉 2026-09-30 那条顺序 bug：只读判定要排在编码嗅探之后）", ro0 || "（没只读）");

                ok((await head3()).some((t) => /\uFFFD/.test(t)), "重读前表头是乱码", JSON.stringify(await head3()));

                await gf.locator('#encbar button:has-text("GBK")').first().click();
                await pg.waitForTimeout(2600);
                const after = await head3();
                ok(after[0] === "订单" && after[1] === "金额",
                   "**按 GBK 重读真的读对了**（表头从乱码变成 订单 / 金额）", JSON.stringify(after));

                const bar1 = await encbar();
                /* ⚠️ **重读成功之后提示条要留着。** 第一版它消失了 ——
                   因为 `cenc` 是对已解码文本重新嗅探的，读对了就没有乱码、`confident` 变真。
                   而那意味着用户点完按钮**画面上什么都不剩**：他既看不到「现在按什么读的」，
                   也没有回到 UTF-8 的出路，只能以为自己没点成。 */
                ok(/正在按 GBK 读/.test(bar1), "**重读之后提示条留着并说出现在按什么读**", bar1.slice(0, 50));
                ok(/回到 UTF-8/.test(bar1), "而且留着回头的路");
                /* 设计侧第十四轮补的那一半：**读对之后横条从 warn 降成中性**。
                   ⚠️ 判据是「**和态 7 不一样**」而不是比死值 —— 比死值的话换一次主题就红，
                   而要钉的性质是「两档看得出区别」。 */
                const look8 = await encLook();
                ok(look8 && look7 && look8.bg !== look7.bg && look8.dot !== look7.dot && look8.bd !== look7.bd,
                   "**读对之后横条降成中性**（它的原话：告诉用户读对了，但横条不消失）——"
                   + "一直留着 warn 底的话，读对了看起来还像出错",
                   look8 ? `态7 底 ${look7.bg}/边 ${look7.bd}/点 ${look7.dot} → 态8 底 ${look8.bg}/边 ${look8.bd}/点 ${look8.dot}` : "—");
                ok(look8 && !transparent(look8.bg),
                   "而且中性档也有底色（不是「变回透明」= 横条看着像消失了一半）", look8 ? look8.bg : "—");
                ok(!/按 GBK 重读/.test(bar1),
                   "**态 8 不再列当前这一种**（那颗点了什么都不会变）—— 稿里 `encActions` 给的是「另一种 + 回到 UTF-8」", bar1.slice(0, 60));

                const ro1 = await roNow();
                ok(/落盘会从 GBK 转成 UTF-8/.test(ro1),
                   "**读对了也还是只读，原因换成后果**（措辞照设计侧第十四轮收的那一句）", ro1 || "（不只读了）");
                ok(/落盘只写 UTF-8/.test(await gf.locator("#roLabel").getAttribute("title") ?? ""),
                   "**悬停说完整后果**（标签一行放不下，稿里专门给了 `roTip`）", await gf.locator("#roLabel").getAttribute("title"));

                ok(Buffer.compare(readFileSync(`${dir}/${G}`), bytes) === 0,
                   "**盘上那份一个字节都没动**（换读法不是改文件）");
              } else ok(false, "gbk 样本写进去了但树里没刷出来");
              /* 收尾：这一份是 fs 写进去的（没走写入口，所以没有快照没有 git），
                 fs 删掉就干净了 —— 不进回收站，免得用户那里多一份。 */
              rmSync(`${dir}/${G}`, { force: true });
              await pg.waitForTimeout(600);
            }

            /* ═══ JSON：源码 / 树 两档（M10-4，S19）═══
               ⚠️ 设计侧的主张是「打开 `.json` **先给源码，就是 S18**」——
               所以 `.json` 从内置格式模块搬成了代码插件认领的第二种类型。
               这一段要钉的是：**默认源码** · 树只看不改 · 行范围算得对 · 解析不了说得清。 */
            {
              const J = "json回归.json";
              const made3 = await pg.evaluate(async ({ name }) => {
                const b = window.__UD_APP;
                const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ path: name,
                    content: '{\n  "name": "umbra",\n  "channels": {\n    "a": { "model": "x", "on": true },\n    "b": [1, 2, 3]\n  },\n  "n": null\n}\n',
                    expectSha256: "0" }) });
                return (await w.json()).ok;
              }, { name: J });
              if (made3) {
                await settleTree(J);   // 轮询等树刷出来，不是定时等
                const jRow = pg.locator('[role="treeitem"]').filter({ hasText: J }).first();
                if (await jRow.count()) {
                  await jRow.click(); await pg.waitForTimeout(3000);
                  await clearGuard();
                  if (await pg.frameLocator('iframe[data-role="body"]').locator(".cm-content").count().catch(() => 0) === 0) { await jRow.click(); await pg.waitForTimeout(2800); }
                  const jf = pg.frameLocator('iframe[data-role="body"]');

                  /* ⚠️ `.json` 归插件了 —— 它要真的走到代码插件，而不是掉回通用文件卡 */
                  ok(await jf.locator(".cm-content").count() === 1,
                     "**`.json` 走到代码插件**（不是通用文件卡）—— 「先给源码，就是 S18」");
                  ok(await jf.locator("#tree").isHidden(), "默认是源码档（树收着）");

                  /* 切到树。
                     ⚠️ **先把编辑栏展开** —— 收起时它高度是 0（还带 `inert`），
                     而 `count()` / `innerText()` 对高度 0 的容器里的按钮**照样成功**，
                     只有真去点才暴露：点击被插件的 iframe 拦住，整轮超时崩掉。
                     **「找得到」和「用得了」是两件事。** */
                  await openEdit();
                  const treeBtn = pg.locator('[data-ud="file-toolbar"] button:has-text("树")').last();
                  ok(await treeBtn.count() === 1, "编辑栏上有「源码 / 树」切档");
                  ok(await treeBtn.evaluate((n) => n.getBoundingClientRect().height > 8),
                     "**而且它真的点得到**（编辑栏收起时高度是 0，只用 count 测不出来）");
                  await treeBtn.click(); await pg.waitForTimeout(1000);
                  ok(await jf.locator("#tree").isHidden() === false && await jf.locator(".jrow").count() > 5,
                     "**切得到树档**", `${await jf.locator(".jrow").count()} 行`);
                  const first = (await jf.locator(".jrow").first().innerText()).replace(/\s+/g, " ").trim();
                  ok(/根 \{ 3 项 \}/.test(first), "根那一行写出有几项", first);
                  ok(/\[ 3 项 \]/.test((await jf.locator('.jrow[data-path="channels.b"]').innerText().catch(() => "")).replace(/\s+/g, " ")),
                     "数组和对象的括号分得开", (await jf.locator('.jrow[data-path="channels.b"]').innerText().catch(() => "")).replace(/\s+/g, " ").trim());

                  /* ⚠️ 这一条是这一段的核心：**行范围**。
                     它靠的是位置感知解析（`jsonpos.mjs`），`JSON.parse` 一点位置都不给。 */
                  await jf.locator('.jrow[data-path="channels"]').click(); await pg.waitForTimeout(500);
                  ok(await jf.locator('.jrow.on[data-path="channels"]').count() === 1, "点一行选得中");
                  const act = (await jf.locator('.jrow[data-path="channels"] .jact').innerText().catch(() => "")).replace(/\s+/g, " ");
                  ok(/在源码里看 L3–6/.test(act),
                     "**「在源码里看」写出的是整块的行范围**（L3–6，不是它自己那一行）", act);
                  ok(/给 AI/.test(act), "选中的行右侧才挂两颗钮（不是每行都挂）", act);

                  /* 跳回源码：选区要落在那几行上 */
                  await jf.locator('.jrow[data-path="channels"] .jjump').click(); await pg.waitForTimeout(900);
                  ok(await jf.locator("#tree").isHidden(), "「在源码里看」跳回源码档");
                  const sel = await jf.locator(".cm-content").evaluate(() => String(window.getSelection() ?? ""));
                  ok(/"a"/.test(sel) && /"b"/.test(sel),
                     "**跳过去之后那一块是选中的**（不是只滚过去）", sel.replace(/\s+/g, " ").slice(0, 50));
                } else ok(false, "json 样本建好了但树里没刷出来");

                /* ── 解析不了（S19 演示态 5）──
                   ⚠️ 这一档最要紧的不是「报错」，是**报得准 + 改好之后要自己消失**。 */
                {
                  const BAD = "json回归坏的.json";
                  const mk = await pg.evaluate(async ({ name }) => {
                    const b = window.__UD_APP;
                    const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                    const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ path: name, content: '{\n  "a": 1\n  "b": 2\n}\n', expectSha256: "0" }) });
                    return (await w.json()).ok;
                  }, { name: BAD });
                  if (mk) {
                    await pg.waitForTimeout(1100);
                    const bRow = pg.locator('[role="treeitem"]').filter({ hasText: BAD }).first();
                    if (await bRow.count()) {
                      await bRow.click(); await pg.waitForTimeout(2800);
                      await clearGuard();
                      if (await pg.frameLocator('iframe[data-role="body"]').locator(".cm-content").count().catch(() => 0) === 0) { await bRow.click(); await pg.waitForTimeout(2600); }
                      await openEdit();
                      const bf = pg.frameLocator('iframe[data-role="body"]');
                      const marked = bf.locator(".cm-line.ud-diff-changed");
                      ok(await marked.count() === 1, "**出错那一行标出来了**", `标了 ${await marked.count()} 行`);
                      ok(/"b": 2/.test((await marked.first().innerText().catch(() => "")).trim()),
                         "标的是**真正出错那一行**（不是回退到第 1 行）", (await marked.first().innerText().catch(() => "")).trim());
                      const why = await marked.first().getAttribute("data-diff");
                      ok(/少了逗号/.test(why ?? ""),
                         "**下面那句原因说的是人话**（说不出才给 V8 的英文，不编）", why);
                      const jbar = pg.locator('[data-ud="file-toolbar"]');
                      ok(/解析不了 L3:3/.test((await jbar.innerText().catch(() => "")).replace(/\s+/g, " ")),
                         "工具条上出「解析不了 L3:3」", (await jbar.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 60));
                      const tb2 = pg.locator('[data-ud="file-toolbar"] button:has-text("树")').last();
                      ok(await tb2.isDisabled(), "**树钮灰掉**（不是藏起来 —— 藏了用户不知道这种文件本来有树）");
                      ok(/先改好 L3/.test(await tb2.getAttribute("title") ?? ""), "而且说得出为什么灰", await tb2.getAttribute("title"));
                      /* 点那颗跳过去 */
                      await pg.locator('[data-ud="file-toolbar"] button:has-text("解析不了")').first().click();
                      await pg.waitForTimeout(700);
                      const at = await bf.locator(".cm-content").evaluate(() => {
                        const s = window.getSelection();
                        const l = s?.anchorNode?.parentElement?.closest(".cm-line");
                        return l ? l.textContent.trim() : "";
                      });
                      ok(/"b": 2/.test(at), "**点它跳到出错的地方**（工具条上那颗要能点，所以放 buttons 不放 status）", at);
                      /* ⚠️ 改好之后标记要自己消失 —— 不消失的话用户会以为自己没改对 */
                      await bf.locator(".cm-line").nth(1).click();
                      await pg.keyboard.press("End");
                      await pg.keyboard.type(",");
                      await pg.waitForTimeout(1100);
                      ok(await marked.count() === 0,
                         "**补好之后红线自己消失**（不消失的话用户会以为自己没改对，回头再改一遍）",
                         `还剩 ${await marked.count()} 行`);
                      ok(!(await tb2.isDisabled()), "树钮跟着活过来");
                      ok(!/解析不了/.test((await jbar.innerText().catch(() => "")).replace(/\s+/g, " ")), "工具条上那颗也收掉了");
                      /* ⚠️ **自己弄脏的自己清。**（2026-09-30 栽过）
                         上面为了测「改好之后红线消失」打了一个逗号 —— 那是**未落盘**状态。
                         不清的话下一节切文件会被确认卡拦住，`clearGuard` 按「回去接着改」=
                         不切走，于是**下一节的判据在看着这一节的界面**：
                         草稿那一段当场红了 6 条，而根因在这里。
                         「自己建的样本自己清」的延伸 —— **留一个脏编辑器比留一个文件更隐蔽**，
                         文件收尾扫得到，脏状态只会表现成别人的判据红。 */
                      await bf.locator("#discard").click();
                      await pg.waitForTimeout(600);
                    } else ok(false, "坏 json 样本建好了但树里没刷出来");
                    await pg.evaluate(async ({ name }) => {
                      const b = window.__UD_APP;
                      const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                      await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                      await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                      const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                      for (const it of t?.data?.items ?? []) if (it.originalName === name)
                        await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                    }, { name: BAD });
                  } else ok(false, "建不出坏 json 样本");
                }

                /* ── 大文件（S19 演示态 6）──
                   ⚠️ 截断**不是为了省内存，是为了不把树变成一条几万行的带子** ——
                   一个 300 项的数组全画出来，用户既滚不到底也找不到东西。 */
                {
                  const BIG = "json回归大的.json";
                  const bytes = await pg.evaluate(async ({ name }) => {
                    const b = window.__UD_APP;
                    const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                    const arr = Array.from({ length: 300 }, (_, i) => ({ i, pad: "x".repeat(3600) }));
                    const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ path: name, content: JSON.stringify({ 名字: "大的", 列表: arr }, null, 2), expectSha256: "0" }) });
                    const j = await w.json();
                    return j.ok ? j.data.bytes : 0;
                  }, { name: BIG });
                  ok(bytes > 1024 * 1024, "（前置）造出一份 > 1 MB 的 JSON", `${(bytes / 1024 / 1024).toFixed(2)} MB`);
                  if (bytes > 1024 * 1024) {
                    await settleTree(BIG);   // 轮询等树刷出来，不是定时等
                    const gRow = pg.locator('[role="treeitem"]').filter({ hasText: BIG }).first();
                    if (await gRow.count()) {
                      await gRow.click(); await pg.waitForTimeout(4500);
                      await clearGuard();
                      if (await pg.frameLocator('iframe[data-role="body"]').locator(".jrow").count().catch(() => 0) === 0) { await gRow.click(); await pg.waitForTimeout(4000); }
                      const gf = pg.frameLocator('iframe[data-role="body"]');
                      ok(await gf.locator("#tree").isHidden() === false,
                         "**大文件默认就给树**（几万行的源码里找一个键不如按结构点进去）");
                      ok(/超过 1 MB/.test((await gf.locator("#roText").innerText().catch(() => "")).trim()),
                         "而且自动只读，并说出为什么", (await gf.locator("#roText").innerText().catch(() => "")).trim());
                      ok(/\[ 300 项 \]/.test((await gf.locator('.jrow[data-path="列表"]').innerText().catch(() => "")).replace(/\s+/g, " ")),
                         "数组那一行写出真实的项数（300，不是截断后的 100）",
                         (await gf.locator('.jrow[data-path="列表"]').innerText().catch(() => "")).replace(/\s+/g, " ").trim());
                      const moreRow = gf.locator(".jrow.jmore");
                      ok(await moreRow.count() === 1, "**超出的用一行「还有 N 项」代替**（不是默默不画）");
                      ok(/已显示 100 项，还有 200 项/.test((await moreRow.innerText().catch(() => "")).replace(/\s+/g, " ")),
                         "那一行说清**已显示几项、还有几项**", (await moreRow.innerText().catch(() => "")).replace(/\s+/g, " ").trim());
                      const n1 = await gf.locator(".jrow").count();
                      await moreRow.locator("button").click(); await pg.waitForTimeout(800);
                      const n2 = await gf.locator(".jrow").count();
                      ok(n2 > n1, "**「再显示 100 项」真的追加**（不是没反应）", `${n1} → ${n2} 行`);
                      ok(/已显示 200 项，还有 100 项/.test((await gf.locator(".jrow.jmore").innerText().catch(() => "")).replace(/\s+/g, " ")),
                         "追加之后那一行跟着变", (await gf.locator(".jrow.jmore").innerText().catch(() => "")).replace(/\s+/g, " ").trim());
                    } else ok(false, "大 json 样本建好了但树里没刷出来");
                  }
                  await pg.evaluate(async ({ name }) => {
                    const b = window.__UD_APP;
                    const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                    await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                    await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                    const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                    for (const it of t?.data?.items ?? []) if (it.originalName === name)
                      await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                  }, { name: BIG });
                }

                await pg.evaluate(async ({ name }) => {
                  const b = window.__UD_APP;
                  const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                  await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                  for (const it of t?.data?.items ?? []) if (it.originalName === name)
                    await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                }, { name: J });
              } else ok(false, "建不出 json 样本");
            }

            /* ═══ 草稿暂存（M10-2c）═══ 设计侧第十三轮定的形制（S18 演示态 11/12）。
               ⚠️ 重点是**「回来那一下」**：底稿变过时**不给直接恢复** ——
               直接恢复会静默盖掉别人的改动。 */
            {
              const D = "草稿回归.ts";
              const back = await pg.evaluate(async ({ name }) => {
                const b = window.__UD_APP;
                const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                const post = (r, body) => fetch(u(r), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
                const get = (r) => fetch(u(r)).then((x) => x.json());
                const w = await post("file_write", { path: name, content: "const a = 1;\nconst b = 2;\n", expectSha256: "0" });
                if (!w.ok) return null;
                /* 存一份草稿（在 s1 上），然后**绕过编辑器**改盘上那份 —— 模拟「别的编辑器/AI 改过」 */
                await post("draft_stage", { path: name, content: "const a = 1;\nconst b = 2;\nconst 草稿加的 = 3;\n" });
                const cur = await get(`file?path=${encodeURIComponent(name)}`);
                await post("file_write", { path: name, content: "const a = 1;\nconst b = 别人改的;\n", expectSha256: cur.data.sha256 });
                return get(`draft_staged?path=${encodeURIComponent(name)}`);
              }, { name: D });
              if (back?.ok) {
                ok(back.data?.stale === true && back.data?.baseVersion === "s1" && back.data?.currentVersion === "s2",
                   "**后端认出「草稿的底稿已经不是盘上那份了」**", `${back.data?.baseVersion} → ${back.data?.currentVersion}`);
                await settleTree(D);   // 轮询等树刷出来，不是定时等
                const dRow = pg.locator('[role="treeitem"]').filter({ hasText: D }).first();
                if (await dRow.count()) {
                  await dRow.click(); await pg.waitForTimeout(3000);
                  await clearGuard();
                  if (await pg.frameLocator('iframe[data-role="body"]').locator(".cm-content").count().catch(() => 0) === 0) { await dRow.click(); await pg.waitForTimeout(2800); }
                  const cf = pg.frameLocator('iframe[data-role="body"]');

                  const bar = (await cf.locator("#draft").innerText().catch(() => "")).replace(/\s+/g, " ");
                  ok(/没落盘的草稿/.test(bar), "**打开时出草稿横条**（编辑区仍是盘上那份）", bar.slice(0, 60));
                  ok(/在 s1 上改的/.test(bar) && /已经变成 s2/.test(bar),
                     "**说清「草稿在哪一版、盘上已经是哪一版」**（不是只说「过期了」）", bar.slice(0, 80));
                  ok(await cf.locator("#draft.stale").count() === 1, "底稿变过时横条走 warn 态（和「有东西等着你」区分开）");
                  ok(await barH(cf, "draft") > 10, "**横条真占了高度**（只看 hidden 属性会漏掉 CSS 盖过它）", `高 ${await barH(cf, "draft")}px`);
                  /* ⚠️ 这一条是形制的核心 */
                  ok(await cf.locator("#draftRestore").isVisible() === false,
                     "**底稿变过就不给「恢复」**（直接恢复会静默盖掉别人的改动）");
                  ok(await cf.locator("#draftOverwrite").isVisible() === true && await cf.locator("#draftDiff").isVisible() === true,
                     "给的是「用草稿覆盖」和「看差异」两条出路");
                  const shownNow = (await cf.locator(".cm-content").innerText().catch(() => "")).replace(/\s+/g, " ");
                  ok(/别人改的/.test(shownNow), "**编辑区是盘上那份**（草稿不自动铺上去）", shownNow.slice(0, 50));

                  /* 看差异：草稿铺进编辑区、只读、逐行标出和盘上的差别 */
                  await cf.locator("#draftDiff").click(); await pg.waitForTimeout(2800);
                  const inDiff = (await cf.locator(".cm-content").innerText().catch(() => "")).replace(/\s+/g, " ");
                  ok(/草稿加的/.test(inDiff), "「看差异」把草稿铺进编辑区", inDiff.slice(0, 50));
                  ok(/在看草稿/.test((await cf.locator("#roText").innerText().catch(() => "")).trim()),
                     "**看草稿时只读**（改一份预览得不出正确结果）", (await cf.locator("#roText").innerText().catch(() => "")).trim());
                  const dTags = [];
                  for (let q = 0; q < await cf.locator("[data-diff]").count(); q++) dTags.push(await cf.locator("[data-diff]").nth(q).getAttribute("data-diff"));
                  ok(dTags.some((t) => /当前是 const b = 别人改的;/.test(t ?? "")),
                     "**差异标出「盘上现在是什么」**（复用看旧版那一套，不用学第二遍）", dTags.join(" | "));
                  await cf.locator(".cm-content").click();
                  await pg.keyboard.type("QQ"); await pg.waitForTimeout(400);
                  ok(!(await cf.locator(".cm-content").innerText().catch(() => "")).includes("QQ"), "看草稿时改不进去");
                  await pg.keyboard.press("Escape"); await pg.waitForTimeout(2600);
                  ok(/别人改的/.test((await cf.locator(".cm-content").innerText().catch(() => "")).replace(/\s+/g, " ")),
                     "**Esc 回到盘上那份**（和看旧版同一个键）");
                  ok(await cf.locator("#draft.stale").count() === 1, "回来之后横条还在 stale 档");

                  /* 用草稿覆盖：它就是一次写 —— 覆盖前那一版要还在 */
                  await cf.locator("#draftOverwrite").click(); await pg.waitForTimeout(3200);
                  const done = await pg.evaluate(async ({ name }) => {
                    const b = window.__UD_APP;
                    const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                    const get = (r) => fetch(u(r)).then((x) => x.json());
                    return { f: await get(`file?path=${encodeURIComponent(name)}`), v: await get(`file_versions?path=${encodeURIComponent(name)}`), d: await get(`draft_staged?path=${encodeURIComponent(name)}`) };
                  }, { name: D });
                  ok(/草稿加的/.test(done.f.data?.content ?? ""), "**「用草稿覆盖」真把草稿写进盘里**", (done.f.data?.content ?? "").slice(0, 40));
                  ok((done.v.data?.snapshots?.length ?? 0) === 3,
                     "**覆盖前那一版还在**（它就是一次写，走写入口存旧版）", `${done.v.data?.snapshots?.length} 版`);
                  ok(done.d.data?.has === false, "覆盖之后草稿清掉了（不留一条在说已经做完的事的提示）");
                  ok(await barH(cf, "draft") === 0, "横条收起来了，而且不占高度");
                } else ok(false, "草稿样本建好了但树里没刷出来");
                /* 自己建的自己清 */
                await pg.evaluate(async ({ name }) => {
                  const b = window.__UD_APP;
                  const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                  await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                  for (const it of t?.data?.items ?? []) if (it.originalName === name)
                    await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                }, { name: D });
              } else ok(false, "建不出草稿样本");

              /* ═══ 改完马上切文件：两头都不许丢（issue #114，2026-10-06）═══
                 暂存是 800ms 防抖，而回调原来**在触发那一刻**才读 `curPath` /
                 `docText()` / `disk`；切文件时 `load()` 既不撤它也不先冲掉它。
                 插件 iframe 在同一插件的文件之间是**复用**的，所以这个定时器
                 活着跨过了换文件 → 两头都坏：
                   · a 最后那 800ms 内敲的字**没进暂存**（整段改动都在 800ms 内时整份没了）；
                   · 定时器到点读到的是 **b** 的内容 → `clear_staged_draft(b)`，
                     把 b **已有的草稿清掉**。
                 ⚠️ 判据**两头都要验** —— 只验一头的话，另一头丢了也照样绿。 */
              {
                const A = "草稿回归-甲.ts", B = "草稿回归-乙.ts";
                const prep = await pg.evaluate(async ({ a, b }) => {
                  const x = window.__UD_APP;
                  const u = (r) => `${x.url.replace(/\/$/, "")}/__ud/${r}${r.includes("?") ? "&" : "?"}token=${encodeURIComponent(x.token)}`;
                  const post = (r, body) => fetch(u(r), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((y) => y.json());
                  const w1 = await post("file_write", { path: a, content: "甲 = 1\n", expectSha256: "0" });
                  const w2 = await post("file_write", { path: b, content: "乙 = 1\n", expectSha256: "0" });
                  /* b 先有一份草稿 —— 它是「被误清掉」的那一半 */
                  await post("draft_stage", { path: b, content: "乙 = 1\n乙的草稿 = 2\n" });
                  return w1.ok && w2.ok;
                }, { a: A, b: B });
                ok(prep, "（前提）造出甲乙两份文件，乙先有一份草稿");
                if (prep) {
                  await settleTree(A);
                  await pg.locator('[role="treeitem"]').filter({ hasText: A }).first().click();
                  const af = pg.frameLocator('iframe[data-role="body"]');
                  for (let q = 0; q < 40; q++) { if (await af.locator(".cm-content").count().catch(() => 0)) break; await pg.waitForTimeout(250); }
                  /* 解锁才改得动（`.ts` 默认只读那一档由 roReason 决定；有锁就点开） */
                  const unlock = pg.locator("button").filter({ hasText: /改它|解锁/ }).first();
                  if (await unlock.count()) { await unlock.click(); await pg.waitForTimeout(400); }
                  await af.locator(".cm-content").click();
                  await pg.keyboard.type("甲的改动");
                  /* ⚠️ **800ms 之内**就切走 —— 这是这条 bug 的全部条件 */
                  await pg.waitForTimeout(120);
                  await settleTree(B);
                  await pg.locator('[role="treeitem"]').filter({ hasText: B }).first().click();
                  /* ⚠️ 甲有**未落盘的改动** → 切走时工作台会弹那张「这些改动不要了吗」的卡。
                     不处理的话它**挡住后面每一次点击** —— 而症状出现在**下一节**
                     （版本历史那一节的 `vRow.click()` 等 30 秒超时），
                     **原因在这一节**（§143.6 那一族：这次留下的是一个模态框）。
                     ⚠️ 这里要点「**不要了**」而不是「回去接着改」——
                     我们验的是「切过去之后草稿还在不在」，所以得真切过去。 */
                  if (await pg.locator('[role="alertdialog"]').count()) {
                    await pg.locator('[role="alertdialog"] button').filter({ hasText: /不要|丢弃|继续/ }).first()
                      .click().catch(async () => { await clearGuard(); });
                    await pg.waitForTimeout(600);
                  }
                  await pg.waitForTimeout(2500);
                  const after = await pg.evaluate(async ({ a, b }) => {
                    const x = window.__UD_APP;
                    const u = (r) => `${x.url.replace(/\/$/, "")}/__ud/${r}${r.includes("?") ? "&" : "?"}token=${encodeURIComponent(x.token)}`;
                    const get = (r) => fetch(u(r)).then((y) => y.json());
                    return {
                      a: await get(`draft_staged?path=${encodeURIComponent(a)}`),
                      b: await get(`draft_staged?path=${encodeURIComponent(b)}`),
                    };
                  }, { a: A, b: B });
                  ok(after.a?.data?.has === true && /甲的改动/.test(String(after.a?.data?.content ?? "")),
                     "**甲最后那几个字进了暂存**（原来：800ms 内切走 → 整份没了）",
                     String(after.a?.data?.content ?? "（没有草稿）").replace(/\n/g, "⏎").slice(0, 40));
                  ok(after.b?.data?.has === true && /乙的草稿/.test(String(after.b?.data?.content ?? "")),
                     "**而乙已有的草稿没被清掉**（原来：定时器到点读到的是乙 → clear_staged_draft(乙)）",
                     String(after.b?.data?.content ?? "（被清掉了）").replace(/\n/g, "⏎").slice(0, 40));
                }
                await pg.evaluate(async ({ names }) => {
                  const x = window.__UD_APP;
                  const u = (r) => `${x.url.replace(/\/$/, "")}/__ud/${r}${r.includes("?") ? "&" : "?"}token=${encodeURIComponent(x.token)}`;
                  for (const n of names) {
                    await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: n }) });
                    await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: n }) });
                  }
                  const t = await fetch(u("trash")).then((y) => y.json()).catch(() => null);
                  for (const it of t?.data?.items ?? []) if (names.includes(it.originalName))
                    await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                }, { names: [A, B] });
                await clearGuard();      // 收尾：别把模态框留给下一节
              }
            }

            /* ═══ 版本历史：药丸 / 下拉 / 看旧版 / 差异标红（M10-2b）═══
               设计侧第十三轮定的形制。⚠️ 这一段的样本是**专门用来抓误标的**：
               当前版在中间插了两行，按行比会把插入点之后的每一行都标成改过。 */
            {
              const V = "版本历史回归.ts";
              const mk = await pg.evaluate(async ({ name }) => {
                const b = window.__UD_APP;
                const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                const post = (r, body) => fetch(u(r), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
                const get = (r) => fetch(u(r)).then((x) => x.json());
                const w1 = await post("file_write", { path: name, content: "const L1 = 1;\nconst L2 = 2;\nconst L3 = 3;\nconst L4 = 4;\nconst L5 = 5;\n", expectSha256: "0" });
                if (!w1.ok) return false;
                const cur = await get(`file?path=${encodeURIComponent(name)}`);
                const w2 = await post("file_write", { path: name, content: "const L1 = 1;\nconst L2 = 2;\nconst NEW1 = 9;\nconst NEW2 = 9;\nconst L3 = 3;\nconst L4 = 44444;\nconst L5 = 5;\n", expectSha256: cur.data.sha256 });
                if (!w2.ok) return false;
                /* ⚠️ 第三版把 L4 **改回去**并在末尾加一行 —— 这是为了让
                   「s1 和当前比」**算不出相邻 delta 的累加值**：
                   累加是 +5 −2，而真值是 +3 −0（`−0` 累加永远给不出来）。
                   两版的样本验不出这一条：那时 s1 的下一版就是当前，两个数恰好相等。 */
                const cur2 = await get(`file?path=${encodeURIComponent(name)}`);
                const w3 = await post("file_write", { path: name, content: "const L1 = 1;\nconst L2 = 2;\nconst NEW1 = 9;\nconst NEW2 = 9;\nconst L3 = 3;\nconst L4 = 4;\nconst L5 = 5;\nconst L6 = 6;\n", expectSha256: cur2.data.sha256 });
                return w3.ok;
              }, { name: V });
              if (mk) {
                await settleTree(V);   // 轮询等树刷出来，不是定时等
                const vRow = pg.locator('[role="treeitem"]').filter({ hasText: V }).first();
                if (await vRow.count()) {
                  await vRow.click(); await pg.waitForTimeout(2800);
                  await clearGuard();
                  if (await pg.frameLocator('iframe[data-role="body"]').locator(".cm-content").count().catch(() => 0) === 0) { await vRow.click(); await pg.waitForTimeout(2500); }

                  const pill = pg.locator('[data-ud="version-pill"]');
                  ok(await pill.count() === 1, "**代码文件有版本历史药丸**（M10-2b）", (await pill.innerText().catch(() => "")).trim());
                  await pill.click(); await pg.waitForTimeout(700);
                  const vRows = pg.locator('[data-ud="version-row"]');
                  ok(await vRows.count() === 3, "**写三次就是三版**（没有重复快照）", `${await vRows.count()} 行`);
                  const listText = (await pg.locator('[data-ud="versions"]').innerText().catch(() => "")).replace(/\s+/g, " ");
                  /* `+N −M` 由后端算 —— 第一版「全新增」，第二版「+2 −1」（插两行 + 改一行） */
                  ok(/\+6/.test(listText), "第一版算「全新增」（6 行）", listText.slice(0, 90));
                  ok(/\+3\s*−1/.test(listText), "**第二版算 +3 −1**（插两行 + 改一行，不是整份重算）", listText.slice(0, 120));
                  ok(/\+2\s*−1/.test(listText), "第三版算 +2 −1（改回一行 + 末尾加一行）", listText.slice(0, 140));

                  /* 点最老那一行 = 看那一版 */
                  await vRows.last().click(); await pg.waitForTimeout(3200);
                  const fr = pg.frameLocator('iframe[data-role="body"]');
                  const shown = (await fr.locator(".cm-content").innerText().catch(() => "")).replace(/\s+/g, " ");
                  ok(/L4 = 4;/.test(shown) && !/NEW1/.test(shown),
                     "**编辑区真换成了那一版的原文**（不是还显示当前那份）", shown.slice(0, 70));
                  ok(await pg.locator('[data-ud="viewing-bar"]').count() === 1, "工具条上出「只读 · 和当前 … 比」那一条");
                  const vbar = (await pg.locator('[data-ud="viewing-bar"]').innerText().catch(() => "")).replace(/\s+/g, " ");
                  /* ⚠️ **这一条只有三版才验得出来。**
                     s1 vs 当前的真值是 `+3 −0`；而相邻 delta 的累加是 `+5 −2` ——
                     **`−0` 是累加永远给不出的数**（L4 改走又改回来，累加会把它算两次）。
                     两版的样本里「和当前比」恰好等于「相邻 delta」，判据会通过而什么都没验到
                     （第一版我就是这么写的，读数对了而判据是空的）。 */
                  ok(/\+3\s*−0/.test(vbar),
                     "**「和当前比」是单独算的**（真值 +3 −0；拿相邻 delta 累加会得 +5 −2）", vbar.slice(0, 60));

                  /* 只读：看历史版不能改 */
                  await fr.locator(".cm-content").click();
                  await pg.keyboard.type("ZZ");
                  await pg.waitForTimeout(500);
                  ok(!(await fr.locator(".cm-content").innerText().catch(() => "")).includes("ZZ"),
                     "**看历史版时改不进去**（改一份快照没有正确结果）");

                  /* ⚠️ 这几条是这一段的**核心**：真 LCS 不许误标。
                     现在看的是 s1，它和当前的差别全是「当前多出来的行」——
                     L2 之后多 2 行（NEW1/NEW2）、L5 之后多 1 行（L6），
                     而 **L3 / L4 / L5 一行都不该标**：按行比会把它们全标成改过。 */
                  const changed = fr.locator(".cm-line.ud-diff-changed");
                  const extra = fr.locator(".cm-line.ud-diff-extra");
                  ok(await changed.count() === 0,
                     "**纯插入不标任何「改过的行」**（按行比会把插入点之后的 3 行全标成改过）",
                     `标红 ${await changed.count()} 行`);
                  ok(await extra.count() === 2, "两处插入各标一道，位置分开", `${await extra.count()} 处`);
                  const tags = [];
                  for (let q = 0; q < await extra.count(); q++) tags.push(await extra.nth(q).getAttribute("data-diff"));
                  ok(tags.some((t) => /多 2 行/.test(t ?? "")) && tags.some((t) => /多 1 行/.test(t ?? "")),
                     "**每一处说清自己多了几行**（不是给一个总数）", tags.join(" | "));
                  /* 标签是 CSS `::after` 画的 —— 要验它**真的有宽度**，
                     不然「class 挂上了但看不见」会全部通过（§一〇〇 那条「缓存结论总会被绕过」同族）。 */
                  const tagW = await extra.first().evaluate((n) => parseFloat(getComputedStyle(n, "::after").width) || 0);
                  ok(tagW > 40, "**标签真画出来了**（不是 class 挂上了而看不见）", `::after 宽 ${tagW}px`);

                  /* ── 换看中间那一版（s2）：它和当前差一行内容，验「改过的行」+ 标签 ── */
                  await pill.click(); await pg.waitForTimeout(700);
                  await pg.locator('[data-ud="version-row"]').nth(1).click(); await pg.waitForTimeout(3200);
                  ok(await changed.count() === 1,
                     "**改过一行的那一版：只标那一行**", `标红 ${await changed.count()} 行`);
                  ok(/当前是 const L4 = 4;/.test(await changed.first().getAttribute("data-diff") ?? ""),
                     "标签写出**当前是什么**（不只是「这行变了」）", await changed.first().getAttribute("data-diff"));

                  /* Esc 回到当前：标记要全清 */
                  await pg.keyboard.press("Escape"); await pg.waitForTimeout(2800);
                  ok(await pg.locator('[data-ud="viewing-bar"]').count() === 0, "**Esc 回到当前**（焦点在插件 iframe 里也管用）");
                  ok(await changed.count() === 0 && await extra.count() === 0, "回到当前之后差异标记全清");
                  const back = (await fr.locator(".cm-content").innerText().catch(() => "")).replace(/\s+/g, " ");
                  ok(/NEW1/.test(back), "编辑区回到当前那一份", back.slice(0, 60));
                } else ok(false, "版本历史样本建好了但树里没刷出来");
                /* ⚠️ **自己建的自己清。** 第一版漏了这一段，于是收尾那三条判据全红
                   并报出 `版本历史回归.ts` —— 收尾抓住了，但那是最后一道，
                   不该指望它替每一节兜。 */
                await pg.evaluate(async ({ name }) => {
                  const b = window.__UD_APP;
                  const u = (x) => `${b.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(b.token)}`;
                  await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                  for (const it of t?.data?.items ?? []) if (it.originalName === name)
                    await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                }, { name: V });
              } else ok(false, "建不出版本历史样本");
            }

            /* ═══ 非 dc 的 `.html`：预览 + 点选（M10-3）═══
               ⚠️ 这一条端到端穿过**三层 iframe**：工作台 → 插件 → 预览页。
               判据数的是**真的渲染出来了、真的点中了**，不是「iframe 标签在」。 */
            {
              const H = "插件回归样本.html";
              /* ⚠️ **多行**样本（issue #46，2026-10-06）：原来是一整行的 HTML，
                 那样「源码第几行」永远是 1 —— **一个恒为 1 的读数验不出任何东西**。
                 顺带放两个专门的坑：
                   · `<table><tr>` —— 浏览器和 parse5 都会补一个 `<tbody>`，
                     而那个补出来的节点**没有源码位置**（选 parse5 而不是 htmlparser2 的全部理由）；
                   · 一个**脚本运行期插进来**的 `<p id=runtime>` —— 源码里根本没有它；
                   · `data-x=1` **无引号** —— 浏览器的 `outerHTML` 会把它规整成 `data-x="1"`，
                     所以它能一眼区分「发的是源码原文」还是「发的是活 DOM」。 */
              const HSRC = [
                "<!DOCTYPE html>",
                "<html>",
                "<head><meta charset=\"utf-8\"><title>回归页</title></head>",
                "<body>",
                "  <main>",
                "    <button class=\"primary\">买</button>",
                "    <div id=\"hero\"><p>一</p><p>二</p></div>",
                "    <p data-x=1>属性在源码里没有引号</p>",
                "  </main>",
                "  <table><tr><td>格子</td></tr></table>",
                "  <script>",
                "    var d = document.createElement(\"p\"); d.id = \"runtime\"; d.textContent = \"脚本插进来的\";",
                "    document.querySelector(\"main\").appendChild(d);",
                "  <\/script>",
                "</body>",
                "</html>",
                "",
              ].join("\n");
              /** 期望的行号**从样本里算**，不写死 —— 写死的话谁动一下样本它就错，而错得像产品坏了 */
              const lineOf = (needle) => HSRC.split("\n").findIndex((l) => l.includes(needle)) + 1;
              const made2 = await pg.evaluate(async ({ name, content }) => {
                const b = window.__UD_APP;
                const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
                const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ path: name, content, expectSha256: "0" }) });
                return (await w.json()).ok;
              }, { name: H, content: HSRC });
              if (made2) {
                await settleTree(H);   // 轮询等树刷出来，不是定时等
                const hRow = pg.locator('[role="treeitem"]').filter({ hasText: H }).first();
                if (await hRow.count()) {
                  await hRow.click(); await pg.waitForTimeout(800);
                  await clearGuard();
                  if (await pg.frameLocator('iframe[data-role="body"]').locator("#page").count().catch(() => 0) === 0) { await hRow.click(); }
                  await pg.waitForTimeout(3000);
                  const plug = pg.frameLocator('iframe[data-role="body"]');
                  /* 预览页是**第三层** —— 插件的 iframe 里那个 #page */
                  const page = plug.frameLocator("#page");
                  const btn = page.locator("button.primary");
                  ok(await btn.count() === 1, "**用户的网页真渲染出来了**（三层 iframe 穿到底）", `${await btn.count()} 个按钮`);

                  /* ── 点选描边的视觉约定（设计侧第十二轮给的文字，2026-09-30 接）──
                     ⚠️ 预览的是**用户自己的网页**：它可能整页深底（一道纯蓝边看不见），
                     也可能自己就带蓝色边框（分不清哪道是我们画的）。
                     它定的是「外 1px 白、内 2px 强调色、再往外让开 2px」。 */
                  await btn.hover(); await pg.waitForTimeout(400);
                  const deco = await page.locator("body").evaluate(() => {
                    const ds = [...document.documentElement.children].filter((n) => n.tagName === "DIV" && n.style.position === "fixed");
                    const bx = ds.find((n) => n.style.boxShadow.includes("0px 0px 0px 2px"));
                    const tg = ds.find((n) => n.textContent && n.style.background);
                    return {
                      shadow: bx ? getComputedStyle(bx).boxShadow : "",
                      boxTop: bx ? Math.round(parseFloat(bx.style.top)) : null,
                      tagText: tg ? tg.textContent : "",
                      tagTop: tg ? Math.round(parseFloat(tg.style.top)) : null,
                      tagHits: tg ? getComputedStyle(tg).pointerEvents : "",
                    };
                  });
                  const elTop = await btn.evaluate((n) => Math.round(n.getBoundingClientRect().top));
                  ok(/2px/.test(deco.shadow) && /3px/.test(deco.shadow) && /255, 255, 255/.test(deco.shadow),
                     "**描边是双层的：内 2px 强调色 + 外 1px 白**（一道纯蓝边在深底页面上看不见）", deco.shadow);
                  ok(deco.boxTop === elTop - 2,
                     "**往外让开 2px**（不贴着元素画，元素自己的边框才看得清）", `元素 ${elTop} → 框 ${deco.boxTop}`);
                  ok(deco.tagText === "<button.primary>",
                     "**左上角标签写出在选哪个元素**（同时说清「这是工具画的，不是页面自己的」）", deco.tagText);
                  ok(deco.tagHits === "none",
                     "标签不接指针（接了就会把自己报成被选中的元素）", deco.tagHits);

                  /* ⚠️ 贴着页面顶部的元素：标签要**翻到框里面**，不能跑出视口 ——
                     不翻的话页面最上面那一排永远看不到标签，而那多半正是导航栏。 */
                  const topEl = page.locator("#hero");
                  if (await topEl.count()) {
                    await topEl.hover(); await pg.waitForTimeout(400);
                    const t2 = await page.locator("body").evaluate(() => {
                      const tg = [...document.documentElement.children].find((n) => n.tagName === "DIV" && n.style.position === "fixed" && n.textContent && n.style.background);
                      return tg ? Math.round(parseFloat(tg.style.top)) : null;
                    });
                    ok(t2 !== null && t2 >= 0, "**贴着顶部的元素，标签翻到框里面**（不跑出视口）", `标签 top ${t2}`);
                  }
                  /* 点它 —— 桥接脚本该把选中的元素发出来 */
                  await btn.click({ force: true });
                  await pg.waitForTimeout(700);
                  const pill = (await plug.locator("#pill").innerText().catch(() => "")).trim();
                  /* ⚠️ 药丸现在**带源码行号**（issue #46）—— 所以不再是全等比。
                     行号从样本里算出来，不写死。 */
                  ok(new RegExp(`^<button\\.primary>\\s+L${lineOf("button class")}$`).test(pill),
                     "**药丸写的是开始标签缩写 + 源码行号**（不是选择器路径）", pill || "（没有药丸）");
                  const tip = await plug.locator("#pill").getAttribute("title").catch(() => "");
                  ok(/button/.test(tip ?? "") && /main/.test(tip ?? ""), "完整选择器路径在悬停提示里", (tip ?? "").slice(0, 50));
                  /* 三档范围 */
                  ok(await plug.locator("#scope button.on").innerText().catch(() => "") === "骨架", "默认档是「骨架」");
                  await plug.locator('#scope button[data-scope="all"]').click();
                  await pg.waitForTimeout(400);
                  ok(await plug.locator("#scope button.on").innerText().catch(() => "") === "整棵子树", "三档切得动");
                  /* 给 AI —— 挂药丸不发送 */
                  await plug.locator("#send").click();
                  await pg.waitForTimeout(1200);
                  const sel = (await pg.locator("aside").first().innerText().catch(() => "")).replace(/\s+/g, " ");
                  ok(/插件回归样本\.html › <button\.primary>/.test(sel), "**点选的元素挂成了 range 药丸**",
                     (sel.match(/插件回归样本\.html › [^\s]+/) ?? ["（没找到）"])[0]);

                  /* ═══ 给 AI 的是**源码原文 + 行号**，不是活 DOM 的 outerHTML（issue #46）═══
                     原来发的是浏览器里那棵活 DOM 的 `outerHTML` —— 属性被规整过
                     （引号、大小写、布尔属性、实体），脚本运行期改过的也一起带上，
                     于是 AI 拿到的那段**在文件里搜不到原文**，改回去只能靠猜。
                     而插件只有一个选择器，**不知道行号**，所以做不出
                     `.json` / CSV 已经有的「在源码里看 L12–17」。 */
                  {
                    /* ① 无引号属性：一眼区分「源码原文」和「活 DOM」。
                       ⚠️ 这个样本是**专门挑的** —— `data-x=1` 在 `outerHTML` 里一定是
                       `data-x="1"`，所以这条判据不可能因为「碰巧一样」而通过。 */
                    const pEl = page.locator("p[data-x]").first();
                    ok(await pEl.count() === 1, "（前提）无引号属性那个 p 在页面上", `${await pEl.count()} 个`);
                    await pEl.click({ force: true }); await pg.waitForTimeout(700);
                    const pill2 = (await plug.locator("#pill").innerText().catch(() => "")).trim();
                    ok(pill2.includes(`L${lineOf("data-x=1")}`),
                       `**点选对回了源码行号**（这个 p 在第 ${lineOf("data-x=1")} 行）`, pill2);
                    await plug.locator('#scope button[data-scope="all"]').click().catch(() => {});
                    await pg.waitForTimeout(250);
                    await plug.locator("#send").click(); await pg.waitForTimeout(1100);
                    const body = await pg.evaluate(() => {
                      for (const n of document.querySelectorAll("*")) {
                        const t = n.getAttribute("title") || "";
                        if (/data-x/.test(t)) return t;
                      }
                      return "";
                    });
                    ok(/data-x=1/.test(body) && !/data-x="1"/.test(body),
                       "**给 AI 的正文是源码原文**（无引号属性原样 —— 活 DOM 的 outerHTML 会写成 `data-x=\"1\"`）",
                       (body.match(/<p[^>]*>/) ?? ["（读不到正文）"])[0]);

                    /* ② `<tbody>` 是**补出来的**：选 parse5 而不是 htmlparser2 的全部理由。
                       桥是在**补完之后**的 DOM 上数下标的，所以树里也必须有它 ——
                       htmlparser2 不补，表格类页面第一下就错位。 */
                    const td = page.locator("td").first();
                    if (await td.count()) {
                      await td.click({ force: true }); await pg.waitForTimeout(700);
                      const pill3 = (await plug.locator("#pill").innerText().catch(() => "")).trim();
                      ok(pill3.includes(`L${lineOf("<td>")}`),
                         `**父节点是隐式 \`tbody\` 时也对得上**（td 在第 ${lineOf("<td>")} 行）`, pill3);
                    } else ok(false, "样本里的 td 选不到");

                    /* ③ 脚本运行期插进来的元素：源码里**根本没有它**。
                       ⚠️ 判据要的是「**明说**」而不是「不报错」——
                       静默退回活 DOM 的话，AI 会拿着一段「文件里没有的 HTML」去改文件。 */
                    const ghost = page.locator("#runtime");
                    if (await ghost.count()) {
                      await ghost.click({ force: true }); await pg.waitForTimeout(700);
                      const tip3 = await plug.locator("#pill").getAttribute("title").catch(() => "");
                      ok(/源码里找不到它/.test(tip3 ?? ""),
                         "**脚本生成的元素明说「源码里找不到它」**（不给一个错位的行号）", (tip3 ?? "").replace(/\n/g, " ⏎ ").slice(0, 70));
                      await plug.locator("#send").click(); await pg.waitForTimeout(1100);
                      const warn = await pg.evaluate(() => {
                        for (const n of document.querySelectorAll("*")) {
                          const t = n.getAttribute("title") || "";
                          if (/活 DOM/.test(t)) return t;
                        }
                        return "";
                      });
                      ok(/活 DOM/.test(warn) && /搜不到/.test(warn),
                         "**而带给 AI 的正文里也写着这一句**（它才是真正会读到那段话的那一方）",
                         warn ? "带上了警告" : "（正文里没有那句话）");
                    } else ok(false, "样本里脚本插入的那个元素没出现（脚本没跑？）");
                  }
                } else ok(false, "`.html` 样本建好了但树里没刷出来");
                await pg.evaluate(async ({ name }) => {
                  const b = window.__UD_APP;
                  const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
                  await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
                  const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
                  for (const it of t?.data?.items ?? []) if (it.originalName === name) {
                    await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
                  }
                }, { name: H });
              } else ok(false, "建不出 .html 样本");
            }


          /* 收尾：和 csv 样本同一套 —— 扔回收站再彻底清掉，不给用户留东西 */
            await pg.evaluate(async ({ name }) => {
              const b = window.__UD_APP;
              const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
              await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) });
              const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
              for (const it of t?.data?.items ?? []) if (it.originalName === name) {
                await fetch(u("trash_purge"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashPath: it.trashPath }) });
              }
            }, { name: TS });
          }
        } else ok(false, "建不出 .ts 样本");
      }

      /* ⚠️ **扔进回收站不算清干净**：回收站是用户的东西，每跑一次回归就往里堆一条，
         跑二十次之后用户打开回收站看到二十份「插件回归样本.csv」——
         那是我们弄脏了他的项目。所以扔完再**彻底清掉那一条**。
         2026-09-26 发现时已经堆了 18 条（`00` §九十七）。 */
      await pg.evaluate(async ({ name }) => {
        const b = window.__UD_APP;
        const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
        const post = (r, body) => fetch(u(r), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
        await post("file_trash", { path: name });
        /* 找到刚扔进去的那一份，按 trashPath 精确清掉 —— 不能清空整个回收站，
           那里面可能有用户自己删的东西。 */
        const t = await fetch(u("trash")).then((x) => x.json()).catch(() => null);
        for (const it of t?.data?.items ?? []) {
          if (it.originalName === name) await post("trash_purge", { trashPath: it.trashPath });
        }
      }, { name: SAMPLE });
    } else ok(false, "建不出回归样本，A 面端到端没测成");
  }
}

/* 令牌不写进页面（`11` Q42 / issue #30，2026-09-28）。
   原来 `/__app/` 不要任何凭据就把真令牌注进返回的 HTML，
   于是**本机任何能发 HTTP 请求的进程扫到端口就能拿走它** —— 而拿到它就等于拿到全部 API。
   现在只在 `?token=` 对得上时才注入（常数时间比较）。
   ⚠️ 拿不到令牌时**照常回页面**（不是 403）—— 403 会让 SPA 的子路由一起打不开。

   ⚠️ 第四条是最容易回归的一条：`history.replaceState` 整地址时**必须把 query 带上**。
   写死成 `/__app/` 的话当场看不出问题（boot 已经在内存里了），**但一刷新就废**。
   这条实测栽过，症状是 uitest 卡在「刷新后引擎还是它」那里连 treeitem 都等不出来。 */
console.log("\n令牌不写进页面（Q42 / issue #30）");
{
  const bare = URL_.split("?")[0];
  const good = new URL(URL_).searchParams.get("token") ?? "";
  const has = async (u) => /__UD_APP/.test(await fetch(u).then((r) => r.text()).catch(() => ""));
  ok(!(await has(bare)), "**不带令牌取 `/__app/` 拿不到 `__UD_APP`**（这才是 #30 的洞）");
  ok(!(await has(`${bare}?token=${"0".repeat(good.length)}`)), "等长但不对的令牌也拿不到（不是只比长度）");
  ok(await has(URL_), "带对的令牌才注入");
  /* 刷新一次，然后看地址里令牌还在不在 —— 在，才说明刷新后还拿得到 */
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => document.querySelectorAll('[role="treeitem"]').length > 0, null, { timeout: 30000 }).catch(() => {});
  const nowUrl = pg.url();
  ok(new URL(nowUrl).searchParams.get("token") === good, "**刷新之后地址里的令牌还在**（replaceState 没把 query 抹掉）", nowUrl.replace(good, "…"));
  ok(await pg.evaluate(() => document.querySelectorAll('[role="treeitem"]').length > 0), "刷新之后界面还起得来（不是「拿不到访问令牌」那一屏）");
}

/* ── 收尾自检：回归有没有把东西留在用户项目里（纪律⑥）──
   逐段 `try/finally` 不够稳：判据里任何一步抛了，**它后面那一段的清理也跟着跳过**。
   2026-09-29 就是这样 —— `.ts` 那段抛出去，连 `.csv` 的清理一起没跑，
   两份样本留在用户项目里；下一轮回归因为「样本已存在」建不出来，
   整个 A 面端到端那一节被跳过，`uitest` 从 198 掉到 183 而**看不出原因**。

   所以这里兜一道：扫一遍、清干净、**并且把残留报出来** ——
   有残留本身就是信息（说明中间抛过），不该被静默清掉。 */
/* ═══ 图片：捏合 / ⌘+滚轮 缩放（issue #32）═══
   原来只有工具栏上的 zoom 按钮，**没有滚轮和触控板捏合** ——
   而看图时手会先去捏，捏不动才想起找按钮。

   ⚠️ **以光标为锚点**，不是容器中心：放大时用户看的是鼠标底下那一块，
   按中心缩放会把它推出视野 —— 那种缩放用一次就不想再用。
   ⚠️ Chrome 把**触控板捏合**就是以 `ctrlKey=true` 的 wheel 事件送来的，
   所以判据合成的也是这种事件（和真实捏合走同一条路）。 */
console.log("\n图片的捏合缩放（issue #32）");
{
  const { writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const bootImg = await pg.evaluate(() => ({ dir: window.__UD_APP.dir }));
  /* 240×160 的真 PNG（不用现成的图 —— 项目里有没有图不该决定这一节跑不跑） */
  const W = 240, H = 160;
  const { deflateSync } = await import("node:zlib");
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => {
    const t = Buffer.from(type), len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, cr]);
  };
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 3);
    for (let x = 0; x < W; x++) { const v = Math.abs(x * H - y * W) > 4000 ? 220 : 40; row[1 + x * 3] = v; row[2 + x * 3] = 90; row[3 + x * 3] = 140; }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
  const NAME = "_uitest-wheel.png";
  const abs = join(bootImg.dir, NAME);
  writeFileSync(abs, png);
  await settleTree(NAME);   // 轮询等树刷出来，不是定时等
  const row = pg.locator('[role="treeitem"]').filter({ hasText: NAME }).first();
  if (!await row.count()) { ok(false, "图片样本在树里刷出来"); rmSync(abs, { force: true }); }
  else {
    await clearGuard();
    await row.click(); await pg.waitForTimeout(2600);
    await clearGuard();
    const shot = pg.locator("img").first();
    const boxOf = async () => await shot.evaluate((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }).catch(() => null);
    const pinch = async (dir, times) => {
      const tb = await shot.boundingBox();
      if (!tb) return;
      for (let i = 0; i < times; i++) {
        await pg.evaluate(({ x, y, d }) => {
          document.elementFromPoint(x, y)?.dispatchEvent(new WheelEvent("wheel", { deltaY: d, ctrlKey: true, bubbles: true, cancelable: true, clientX: x, clientY: y }));
        }, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2, d: dir });
        await pg.waitForTimeout(140);
      }
    };
    const b0 = await boxOf();
    ok(!!b0 && b0.w > 0, "图打开了", b0 ? `${b0.w}×${b0.h}` : "读不到");
    await pinch(-120, 5);
    const b1 = await boxOf();
    ok(!!b0 && !!b1 && b1.w > b0.w * 1.2, "**捏合（`ctrlKey` + 滚轮）真的放大**",
       b0 && b1 ? `${b0.w}×${b0.h} → ${b1.w}×${b1.h}` : "读不到");
    /* ⚠️ **宽高比也要钉。** 只看宽度的话，一个把图拉变形的实现也会通过 ——
       2026-10-05 手验时就量到过 `612×717`（原图 3:2），那是 `fitScale` 在
       `info.height` 还没到时用了别的值。读数要连比例一起看才完整。 */
    ok(!!b1 && Math.abs(b1.w / b1.h - W / H) < 0.1,
       "**放大之后宽高比没变**（只看宽度的话，把图拉变形的实现也会通过）",
       b1 ? `${(b1.w / b1.h).toFixed(2)} vs 原图 ${(W / H).toFixed(2)}` : "读不到");
    await pinch(120, 8);
    const b2 = await boxOf();
    ok(!!b1 && !!b2 && b2.w < b1.w * 0.9, "反着捏真的缩小", b1 && b2 ? `${b1.w} → ${b2.w}` : "读不到");
    /* ⚠️ **反面**：普通滚轮不该缩放 —— 它要留给平移（图比容器大时用户靠它看别处）。
       少了这一条的话「把所有 wheel 都当缩放」的实现也会全绿，而那会让图没法滚动。 */
    const b3a = await boxOf();
    const tb = await shot.boundingBox();
    if (tb) await pg.evaluate(({ x, y }) => {
      document.elementFromPoint(x, y)?.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, ctrlKey: false, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 });
    await pg.waitForTimeout(400);
    const b3 = await boxOf();
    ok(!!b3 && !!b3a && b3.w === b3a.w,
       "**普通滚轮不缩放**（留给平移 —— 不验这一条，「所有 wheel 都当缩放」也会全绿）",
       b3a && b3 ? `${b3a.w} → ${b3.w}` : "读不到");
    rmSync(abs, { force: true });
    await pg.waitForTimeout(500);
  }
}

/* ═══ 语言高亮覆盖面（issue #37）═══
   ⚠️ `CODE_EXT` 有 37 种扩展名，而 `langFor` 原来只认 16 种 ——
   **27 种能打开但一片灰**（`.yaml` `.toml` `.sh` `.sql` `.go` `.rs` `.java` …），
   而配置文件和脚本是设计项目里最常见的那一类。

   ⚠️ **判据不看 `langFor` 返回了什么**（那是我们自己写的字符串），
   看 DOM 里**真有带颜色的 token** —— 高亮链路有四段
   （共享库导出 → `StreamLanguage.define` → CM 的 highlight → CSS 配色），
   任何一段断了 `langFor` 都照样返回非 null。 */
console.log("\n语言高亮覆盖面（issue #37）");
{
  const { writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const bootHl = await pg.evaluate(() => ({ dir: window.__UD_APP.dir }));
  /* 挑的是「原来没有、现在该有」的那几种 + 一个对照（`.ts` 本来就有）+ 一个反面。
     ⚠️ 不把 27 种全测 —— 这一节钉的是「legacy 这条链路通了」，
     不是逐个语言的 token 规则（那是 CodeMirror 自己的事）。 */
  const CASES = [
    ["_uitest-hl.yaml", "name: umbra\nversion: 1.0\nlist:\n  - a\n", true],
    ["_uitest-hl.toml", '[package]\nname = "umbra"\n', true],
    ["_uitest-hl.sh", '#!/bin/sh\nif [ -f x ]; then\n  echo "hi"\nfi\n', true],
    ["_uitest-hl.go", 'package main\n\nfunc main() {\n\tprintln("hi")\n}\n', true],
    ["_uitest-hl.sql", "SELECT id FROM users WHERE id = 1;\n", true],
    ["_uitest-hl.ts", "const a: number = 1;\n", true],
    ["_uitest-hl.txt", "就是一段纯文字，没有语法\n第二行\n", false],
  ];
  for (const [name, body, wantHl] of CASES) {
    const abs = join(bootHl.dir, name);
    writeFileSync(abs, body, "utf8");
    /* ⚠️ **等它出现，别固定睡一段**（2026-10-05 实测：`.go` 那一条偶发没刷出来）。
       磁盘监听 → WS 通知 → React 重渲染这条链路的耗时不是常数，
       而一条连着七个样本的循环里，前面几个的渲染会把后面的往后推。
       `waitFor` 到点才走，比 `waitForTimeout(1100)` 既快又稳。 */
    const row = pg.locator('[role="treeitem"]').filter({ hasText: name }).first();
    await row.waitFor({ state: "attached", timeout: 8000 }).catch(() => {});
    if (!await row.count()) { ok(false, `${name}：样本在树里刷出来`); rmSync(abs, { force: true }); continue; }
    await clearGuard();
    await row.click(); await pg.waitForTimeout(2100);
    await clearGuard();
    const fr = pg.frameLocator('iframe[data-role="body"]');
    const r = await fr.locator(".cm-content").evaluate((el) => {
      /* CM 的 token span 带 `tok-*`（我们的 HighlightStyle）或 `ͼ`（CM 自己生成的类名）。
         ⚠️ 那个字符是 **U+037C**（`ͼ`）—— 第一版我写成 `\\u03fc`（`ϼ`，完全另一个字符），
         于是七条里六条全红。而红的里面**包括 `.ts`（本来就有高亮的对照）** ——
         **对照组一起红，就说明错在判据不在产品。** 对照组的价值正在这里。 */
      const spans = [...el.querySelectorAll("span")].filter((x) => x.className && /tok-|\u037c/.test(x.className));
      return { tokens: spans.length, colors: new Set(spans.map((x) => getComputedStyle(x).color)).size };
    }).catch(() => ({ tokens: -1, colors: -1 }));
    const ext = name.split(".").pop();
    if (wantHl) {
      ok(r.tokens > 0 && r.colors >= 2,
         `**.${ext} 有高亮**（DOM 里真有带颜色的 token，不是看 \`langFor\` 返回了什么）`,
         `${r.tokens} 个 token · ${r.colors} 种颜色`);
    } else {
      /* ⚠️ **反面是必需的**：判据要是对任何文件都绿，它测的就不是高亮。
         `.txt` 在 `CODE_EXT` 里（能打开），但**本来就不该有语法高亮**。 */
      ok(r.tokens === 0,
         `**.${ext} 没有高亮**（纯文本不该被上色 —— 这一条证明上面几条不是「对任何文件都绿」）`,
         `${r.tokens} 个 token`);
    }
    rmSync(abs, { force: true });
    await pg.waitForTimeout(500);
  }
}

/* ═══ CRLF 文件原样往返（issue #66）═══
   ⚠️ **CodeMirror 的 `doc.toString()` 固定用 `\n` 连行**，不管读进来的是什么
   （实测：`"第一行\r\n第二行\r\n"` 33 字节进去、30 字节出来）。
   不还原的话一份 CRLF 文件：**一打开就说「还没落盘」**（而用户一个字都没改，
   横条还自相矛盾地写着「4 行 → 4 行」）· **⌘S 之后整份换行符被改掉**
   （实测 42 → 39 字节，`\r` 一个都没了）。

   最后一条最重：用户打开一个 Windows 同事的文件、什么都没做、按一下 ⌘S，
   他的 `git diff` 就显示**整个文件全改了**。

   这一节钉三件：① 打开不脏 ② 改了会脏 ③ 落盘后换行符没变。
   ⚠️ 还要钉**反面**：LF 文件不该被变成 CRLF —— 一个只会「往一个方向改」的
   修法，和原来的 bug 是同一种错。 */
console.log("\n CRLF / LF 原样往返（issue #66）");
{
  const { writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const boot = await pg.evaluate(() => ({ url: window.__UD_APP.url, token: window.__UD_APP.token, dir: window.__UD_APP.dir }));
  const cases = [
    { name: "_uitest-crlf.ts", eol: "\r\n", label: "CRLF" },
    { name: "_uitest-lf.ts", eol: "\n", label: "LF" },
  ];
  for (const c of cases) {
    const body = ["const a = 1;", "const b = 2;", "const c = 3;", ""].join(c.eol);
    const abs = join(boot.dir, c.name);
    writeFileSync(abs, body, "utf8");
    await pg.waitForTimeout(1500);
    const row = pg.locator('[role="treeitem"]').filter({ hasText: c.name }).first();
    if (!await row.count()) { ok(false, `${c.label}：样本在树里刷出来`); rmSync(abs, { force: true }); continue; }
    await clearGuard();
    await row.click(); await pg.waitForTimeout(2600);
    await clearGuard();
    const fr = pg.frameLocator('iframe[data-role="body"]');
    /* ① 打开就不该脏 —— 用真实高度量，不看 `hidden` 属性（§七十二 那条） */
    const h = await barH(fr, "dirty");
    ok(h === 0, `**${c.label}：一打开不说「还没落盘」**（用户一个字都没改）`,
       h === 0 ? "横条 0px" : `✗ 横条 ${h}px，写的是「${(await fr.locator("#note").innerText().catch(() => "")).trim()}」`);

    /* ② 改一个字该脏 —— 否则「不脏」可能是因为我把它改成了永远不脏 */
    await fr.locator(".cm-content").click();
    await pg.keyboard.press("Meta+ArrowDown"); await pg.keyboard.press("End");
    await pg.keyboard.type(" // x");
    await pg.waitForTimeout(700);
    ok(await barH(fr, "dirty") > 0, `${c.label}：改一个字之后说未落盘（不是永远不脏）`);

    /* ③ 落盘后换行符一个都没变 */
    await pg.keyboard.press("Meta+s"); await pg.waitForTimeout(2400);
    const txt = readFileSync(abs, "utf8");
    const nCRLF = (txt.match(/\r\n/g) ?? []).length;
    const nBareLF = (txt.match(/[^\r]\n/g) ?? []).length;
    ok(txt.includes("// x"), `${c.label}：改动真的落盘了`);
    ok(c.eol === "\r\n" ? (nCRLF > 0 && nBareLF === 0) : (nCRLF === 0 && nBareLF > 0),
       `**${c.label}：落盘后换行符还是 ${c.label}**（原来一律被改成 LF；只往一个方向改和原 bug 同错）`,
       `CRLF ${nCRLF} 处 · 裸 LF ${nBareLF} 处`);

    /* 收尾：这一份是 fs 写的，走写入口落过盘，所以草稿/快照都要清 */
    await pg.evaluate(async ({ name, url, token }) => {
      const u = (x) => `${url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      await fetch(u("draft_clear"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: name }) }).catch(() => {});
    }, { name: c.name, url: boot.url, token: boot.token });
    rmSync(abs, { force: true });
    await pg.waitForTimeout(600);
  }
}

/* ═══ 首页：同名项目要分得清（issue #12）═══
   `project.json` 的 `name` 不唯一 —— 拷一份项目做实验就重名，而那是常见做法。
   列表视图第二行本来就是完整路径，分得清；**网格卡第二行是「有 title 就显示 title」**，
   而拷出来的副本 title 也一样 → 两张卡**一模一样**。

   ⚠️ 这一节放在收尾之前、而且**造一个真的同名项目**（不是复刻一遍判断逻辑）——
   复刻逻辑的判据测的是复制品，产品改了它不会红。
   收尾要把它从「最近打开」里也去掉，否则下次用户打开首页会看到我们留的项目。 */
console.log("\n首页：同名项目要分得清（issue #12）");
{
  const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const boot = await pg.evaluate(() => ({ url: window.__UD_APP.url, token: window.__UD_APP.token, dir: window.__UD_APP.dir }));
  const DUPNAME = boot.dir.split("/").filter(Boolean).pop();          // 和当前项目同名
  const twin = join(tmpdir(), `us-dup-${Date.now()}`);
  mkdirSync(twin, { recursive: true });
  /* name 故意和当前项目一样、title 也一样 —— 这正是「拷一份」之后的样子 */
  writeFileSync(join(twin, "project.json"), JSON.stringify({ name: DUPNAME, title: DUPNAME }), "utf8");
  const u2 = (r) => `${boot.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(boot.token)}`;
  const post = (r, body) => pg.evaluate(async ({ url, body }) =>
    (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status,
    { url: u2(r), body });
  try {
    await post("open_project", { dir: twin });                         // 进「最近打开」
    await pg.goto(`${boot.url.replace(/\/$/, "")}/__app/home?token=${encodeURIComponent(boot.token)}`, { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => /最近打开|还没有项目/.test(document.body.innerText), null, { timeout: 20000 });
    await pg.locator('button:has-text("网格")').first().click();
    await pg.waitForTimeout(600);
    const subs = await pg.locator('[data-ud="grid-sub"]').allInnerTexts();
    const dupSubs = await pg.evaluate((nm) => [...document.querySelectorAll("li")]
      .filter((li) => (li.querySelector(".font-semibold")?.textContent ?? "").includes(nm))
      .map((li) => (li.querySelector('[data-ud="grid-sub"]')?.textContent ?? "").trim()), DUPNAME);
    ok(dupSubs.length >= 2, "**首页网格里真有两张同名卡**（夹具自己先成立）", `${dupSubs.length} 张 · ${DUPNAME}`);
    ok(dupSubs.length >= 2 && new Set(dupSubs).size === dupSubs.length,
       "**两张同名卡的第二行不一样**（原来都显示 title，而副本 title 也一样 → 两张卡一模一样）",
       JSON.stringify(dupSubs));
    ok(dupSubs.every((t) => t.includes("/")),
       "**同名时第二行是目录**（不是 title）", JSON.stringify(dupSubs));
    /* ⚠️ 光把路径顶上来还不够 —— 要让人知道**为什么**这张卡显示的是路径 */
    const badges = await pg.evaluate((nm) => [...document.querySelectorAll("li")]
      .filter((li) => (li.querySelector(".font-semibold")?.textContent ?? "").includes(nm))
      .filter((li) => (li.textContent ?? "").includes("同名")).length, DUPNAME);
    ok(badges >= 2, "**而且卡上说了「同名」**（不说的话用户只觉得「这张卡格式怎么不一样」）", `${badges} 张带标记`);
    /* 反面：**不重名的项目不该被改成显示路径** —— 不然这条改动把常见情况也变差了 */
    const others = await pg.evaluate((nm) => [...document.querySelectorAll("li")]
      .filter((li) => !(li.querySelector(".font-semibold")?.textContent ?? "").includes(nm))
      .filter((li) => (li.textContent ?? "").includes("同名")).length, DUPNAME);
    ok(others === 0, "**不重名的项目没有被加上「同名」标记**（只在真重名时才变）", `${others} 张误标`);

    /* ⚠️ **Windows 路径也要缩得对**（issue #55 —— 这是 #12 修法自己的漏洞）。
       第一版 `shortDir` 只按 `/` 切，而 Windows 上 `p.dir` 是 `C:\Users\sam\…`：
       `split("/")` 只得到**一段** → 走 else 分支 → 输出 `/C:\Users\sam\…`，
       而第二行是 `truncate` 的，两张同名卡都显示成 `/C:\Users\sam\Doc…` ——
       **正是 #12 注释里说的「那等于没显示」，这个修法在 Windows 上压根不生效**。

       ⚠️ 判据在 mac 上跑，拿不到真的 Windows 路径 —— 所以**喂一个 Windows 形状的
       字符串给页面里那段逻辑**。这和 #25 的做法同源：**在 mac 上验 win 的行为**
       （那次是用 `path.win32` 跑同一个函数）。
       这里 `shortDir` 是组件内的闭包、拿不到，所以把它的规则**原样抄一份**进判据 ——
       ⚠️ 抄一份是有代价的（产品改了判据不会红），所以**同时**验卡片上真实渲染的
       那一行「看起来像个缩写路径」，两条合起来才算钉住。 */
    const winCases = await pg.evaluate(() => {
      const shortDir = (dir) => {
        const parts = dir.replace(/[\\/]+$/, "").split(/[\\/]+/).filter(Boolean);
        return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : dir;
      };
      return {
        win: shortDir("C:\\Users\\sam\\Documents\\design\\shop"),
        posix: shortDir("/Users/sam/Documents/design/shop"),
        shortWin: shortDir("C:\\shop"),
      };
    });
    ok(winCases.win === "…/design/shop",
       "**Windows 路径缩得对**（原来输出 `/C:\\Users\\sam\\…`，truncate 之后两张卡一模一样）", winCases.win);
    ok(winCases.posix === "…/design/shop", "posix 路径照旧对（修 Windows 没把它改坏）", winCases.posix);
    ok(!winCases.shortWin.startsWith("/"),
       "**短路径不拼前导分隔符**（`C:\\shop` 拼成 `/C:\\shop` 是个不存在的路径）", winCases.shortWin);
    /* 另一半：卡片上**真实渲染**的那一行得像个缩写路径（不是 title、不是空） */
    ok(dupSubs.every((t) => t.startsWith("…/") || t.includes("/")),
       "而卡片上真实渲染的那一行也确实是路径形状（抄的那份规则没和产品走偏）", JSON.stringify(dupSubs));
  } finally {
    await post("recent_remove", { dir: twin }).catch(() => {});
    rmSync(twin, { recursive: true, force: true });
    /* 回工作台 —— 后面的收尾判据要用 __UD_APP 和项目服务 */
    await pg.goto(URL_, { waitUntil: "domcontentloaded" }).catch(() => {});
    await pg.waitForFunction(() => document.querySelectorAll('[role="treeitem"]').length > 0, null, { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(1200);
  }
}

console.log("\n收尾：没给用户留东西（纪律⑥）");
{
  const left = await sweepSamples();
  ok(left.files.length === 0, "**项目根下没有回归留下的样本**（有就是中间抛过，已清）",
     left.files.length ? "清掉了：" + left.files.join("、") : "干净");
  ok(left.trash.length === 0, "回收站里也没堆着（每跑一轮堆一条，二十轮之后用户会看到二十份）",
     left.trash.length ? "清掉了：" + left.trash.join("、") : "干净");
  /* 快照目录：`trash_purge` 不带走它，而**没有哪一节负责清它** ——
     这里是唯一的清理者，所以「清掉了几个」是正常读数，不是缺陷。
     ⚠️ 判据要问的是**清完之后还剩没有**：
     第一版我判「清掉了几个 === 0」，于是收尾一清东西判据就红 ——
     **那是把「清理动作」当成了「有问题的证据」。**
     留着的真代价是下一轮读数会错（「写三次就是三版」量到 5 版），所以清干净就够。 */
  const swept = await sweepSnapshots(left.dir);
  const stillThere = await sweepSnapshots(left.dir);
  /* ⚠️ **真正的判据：和开跑前比，多出来的就是这一轮留的。**
     上面那条 `stillThere` 只能说明「`SAMPLE_PATS` 认得的那些清掉了」。 */
  const nowSnap = await snapBaseline(left.dir);
  const leaked = [];
  for (const [sub, names] of nowSnap) {
    const was = BASELINE.get(sub) ?? new Set();
    for (const n of names) if (!was.has(n)) leaked.push(`${sub}/${n}`);
  }
  /* ⚠️ **清理也不认名字** —— 多出来的一律删掉。
     （2026-10-02：这条判据第一次跑就抓到 `snapshots/_回归样本.mp4__93878b82992f`，
     而它来自 `✎回归样本.mp4` —— issue #47 把状态目录名从「文件名」改成
     「`pathKey()` = 基名 + 哈希」，而 `pathKey` 把 `✎` 这种非字母数字换成 `_`。
     于是 `SAMPLE_PATS` 里那条 `/^✎回归样本/` **整体失效** ——
     **目录名从此不再等于文件名，按文件名匹配的清单全都靠不住了。**）

     不清的话下一轮的基线就含着它，这条判据从此永远绿 —— 污染会累积。 */
  if (leaked.length) {
    const { rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const rel of leaked) rmSync(join(left.dir, ".umbrastudio", rel), { recursive: true, force: true });
  }
  ok(leaked.length === 0,
     "**和开跑前比，`.umbrastudio/` 下一个目录都没多**（不靠认名字 —— 名字清单已经漏过两次）",
     leaked.length ? "这一轮留下了（已清）：" + leaked.join("、") : `干净（跑前 ${[...BASELINE.values()].reduce((a, b) => a + b.size, 0)} 个，现在一样）`);
  ok(stillThere.length === 0, "**`SAMPLE_PATS` 认得的那些也清干净了**（留着会让下一轮读数变错，不只是脏）",
     `这一轮清掉 ${swept.length} 份 · 再扫一次剩 ${stillThere.length} 份`);

  /* ⚠️ **数一次 git 提交。** 2026-09-30 实测：用户项目从 0 提交变成 101 个，
     全是回归样本落盘时 `commitAfterWrite` 记的 —— 而上面三条判据
     **一条都抓不到**（它们数文件、数回收站、数快照，没有一条数提交）。
     修法是起服务时带 `UMBRASTUDIO_NO_GIT=1`，这条判据钉住「真的带了」。
     **清不掉就明说** —— 撤别人的提交不是判据该干的事，报出来让人处理。 */
  if (left.dir) {
    const { execFileSync } = await import("node:child_process");
    const mine = (() => {
      try {
        const log = execFileSync("git", ["log", "--oneline", "--all"], { cwd: left.dir, encoding: "utf8" });
        return log.split("\n").filter((l) => SAMPLE_PATS.some((re) => re.test(l.replace(/^\S+\s+(写入 )?/, "")))).length;
      } catch { return 0; }
    })();
    ok(mine === 0,
       "**没往用户的 git 仓库塞提交**（起服务要带 `UMBRASTUDIO_NO_GIT=1`）",
       mine ? `有 ${mine} 个提交是回归样本的，请自己 git 收拾（判据不替你撤别人的提交）` : "干净");
  }
}

console.log(`\n${fail ? "✗" : "✓"} 界面回归 ${pass}/${pass + fail}\n`);
await b.close();
process.exit(fail ? 1 : 0);
