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
  /^版本历史回归/,      // M10-2b
  /* ⚠️ 下面这几个是**补登记的**：2026-09-30 在用户项目里翻出 24 个残留快照目录，
     其中四个的名字压根不在这张清单里 —— 文件被清掉了（那部分是对的），
     快照目录留了好几轮。**清单漏一个名字，收尾就静默漏一个样本。** */
  /^代码插件样本/, /^插件chrome样本/, /^✎回归样本/, /^差异标红验/, /^git真验/, /^版本历史手验/, /^诊断\.ts/,
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
  const root = join(dir, ".umbrastudio", "snapshots");
  if (!existsSync(root)) return [];
  const gone = [];
  for (const name of readdirSync(root)) {
    if (!SAMPLE_PATS.some((re) => re.test(name))) continue;
    rmSync(join(root, name), { recursive: true, force: true });
    gone.push(name);
  }
  return gone;
};

/* 开跑前先清 —— 上一轮可能抛在半路留下了东西 */
{
  const pre = await sweepSamples();
  const snaps = await sweepSnapshots(pre.dir);
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

/* JSON：M8-14 新加的一种。**它存在就是「加一种格式只需新增一个文件」的证据** */
if (await openByName(".json")) {
  /* ⚠️ 第九轮把「这份文件的读数」从工具栏拿掉了：工具栏变成了**编辑栏**，
     只放改稿用的开关。读数没有新家 —— 设计侧这一轮没给它安排位置，先不测。 */
  await openEdit();
  /* 这两档现在在**统一的文件工具栏**上（M8-15 把它从视图内部搬了出来），
     所以判据要落在那条带上 —— 落在 body 上的话，搬没搬都一样过，测不出东西。 */
  const tb = pg.locator('[data-ud="file-toolbar"] [role="group"][aria-label="视图"]').first();
  ok(await tb.count() > 0, "JSON：视图段组在编辑栏上");
  const tbText = await tb.innerText().catch(() => "");
  ok(/结构/.test(tbText) && /源码/.test(tbText), "JSON：结构 / 源码两档都在", tbText.replace(/\n/g, " / "));
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
  [".json", "JSON", /结构/g],
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
    await pg.waitForTimeout(1200);
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
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(30);
  /* 刚按下 Esc 的那一瞬间它该**还在**、且已经不接指针了 —— 这就是 80ms 淡出 */
  const fading = await pg.locator('[data-ud="ctxmenu"][data-exiting]').count();
  ok(fading === 1, "Esc 关：先淡出 80ms（这一帧还在 DOM 里，标着 data-exiting）");
  const noHit = await pg.locator('[data-ud="ctxmenu"]').evaluate((e) => getComputedStyle(e).pointerEvents).catch(() => "?");
  ok(noHit === "none", "淡出期间不接指针（正在消失的菜单项不该还能点到）", noHit);
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
      const sample = () => {
        const b = document.querySelector('[data-ud="canvas"]');
        const cur = b?.querySelector('iframe[data-pool="cur"]');
        const prev = b?.querySelector('iframe[data-pool="prev"]');
        window.__fadeHist.push({ fading: b?.getAttribute("data-fading") ?? null, cur: cur ? getComputedStyle(cur).opacity : null, prev: prev ? getComputedStyle(prev).opacity : null });
      };
      new MutationObserver(sample).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-fading"] });
      /* ⚠️ **属性变化采不到渐变**：opacity 从 1 到 0 是一条 CSS 过渡，
         中间没有任何属性变。所以再加一条轮询，专门采那一半。
         两个采样器写进同一个 `__fadeHist`，判据一起看。 */
      window.__fadeTimer = setInterval(sample, 40);
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
    await dc.nth(Math.min(3, n - 1)).click();
    await pg.waitForTimeout(2600);
    const hist = await pg.evaluate(() => { clearInterval(window.__fadeTimer); return window.__fadeHist ?? []; });
    const during = hist.find((h) => h.fading === "1");
    /* ⚠️ 判据认**两样中的任意一样**，因为过场的实质有两个可观察面：
       `data-fading="1"`（工作台知道自己在过场）或 **`prev` 的 opacity 真的在渐变**
       （那是用户看得见的那一半）。
       只认属性的话，MutationObserver 有个盲区：**它不报告新插入节点的初始属性** ——
       canvas 若是新建的而不是复用的，`data-fading="1"` 就是「初始值」不是「变化」。 */
    const faded = hist.some((h) => h.prev != null && Number(h.prev) > 0.02 && Number(h.prev) < 0.98);
    ok(!!during || faded, "切稿时真的走了过场（属性或 prev 的淡出，两者认其一）",
       `采到 ${hist.length} 次${during ? " · 有 fading=1" : ""}${faded ? " · prev 在渐变" : ""}`);
    if (during) {
      ok(during.prev === "1", "**过场中上一份完整可见**（不淡出 —— 淡出就会透出画布底色，那才是「闪」）", `prev=${during.prev}`);
      ok(during.cur === "0", "新的在它下面加载、先透明（等待和展示是重叠的）", `cur=${during.cur}`);
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
    const SAMPLE = "插件回归样本.csv";
    const made = await pg.evaluate(async ({ name }) => {
      const b = window.__UD_APP;
      const u = (route) => `${b.url.replace(/\/$/, "")}/__ud/${route}?token=${encodeURIComponent(b.token)}`;
      const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: name, content: "name,role\n甲,设计\n乙,开发\n丙,测试\n", expectSha256: "0" }) });
      return (await w.json()).ok;
    }, { name: SAMPLE });
    if (made) {
      /* 建完要让目录树刷出来 —— 服务端会发 fs 事件，给它一点时间 */
      await pg.waitForTimeout(1200);
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
          await pg.waitForTimeout(1200);
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
              await pg.waitForTimeout(1200);
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
                await pg.waitForTimeout(1200);
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
              const made2 = await pg.evaluate(async ({ name }) => {
                const b = window.__UD_APP;
                const u = (r) => `${b.url.replace(/\/$/, "")}/__ud/${r}?token=${encodeURIComponent(b.token)}`;
                const w = await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ path: name, content: '<!DOCTYPE html><html><body><main><button class="primary">买</button><div id="hero"><p>一</p><p>二</p></div></main></body></html>', expectSha256: "0" }) });
                return (await w.json()).ok;
              }, { name: H });
              if (made2) {
                await pg.waitForTimeout(1200);
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
                  /* 点它 —— 桥接脚本该把选中的元素发出来 */
                  await btn.click({ force: true });
                  await pg.waitForTimeout(700);
                  const pill = (await plug.locator("#pill").innerText().catch(() => "")).trim();
                  ok(pill === "<button.primary>", "**药丸写的是开始标签缩写**（不是选择器路径）", pill || "（没有药丸）");
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
  ok(stillThere.length === 0, "**快照目录清干净了**（留着会让下一轮读数变错，不只是脏）",
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
