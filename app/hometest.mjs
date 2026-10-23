/** 首页「最近项目」那一行的入口回归（2026-10-21 新建）。
 *
 *  ### 为什么单独一套，而不是塞进 `uitest`
 *  它要**真的点「从列表移除」和「忘掉这个项目」**，而那两件动的是
 *  `STATE_ROOT/.umbrastudio/workspace.json` —— **「最近打开」是用户的东西**
 *  （首页直接显示它，`doc/00` §166 实测过「删临时目录删不掉它」）。
 *  所以整套跑在**临时 `STATE_ROOT`** 上，和 `prefstest` 同一个理由。
 *
 *  ### 它钉的是什么
 *  2026-10-21 抓到的那条：服务端 M14-3 就有 `remove_recent_project` /
 *  `forget_project` / `clear_stale_records` 三件能力，而 `app/src` 里**一处都没调过** ——
 *  首页只在**失效的那几行**上有一颗「忘掉它」。于是「把这个项目从 Studio 里去掉」
 *  在界面上**根本做不到**，而我照着服务端的能力表以为它有，还把它写进了给用户的步骤里。
 *
 *  > **「能力在」和「够得着」是两件事。** 能力表是给模型看的，不是给人看的。
 *  > 所以这一套的第一条判据不是「调得通」，是「**不悬停也看得见、点得到**」。
 *
 *  用法：`node app/hometest.mjs`（自己起服务、自己收尾，不用先开终端）
 */
import { stripComments } from "../server/dist/shared/stripcomments.js";
import { mkdtemp, writeFile, realpath, rm, mkdir } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-home-state-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_NO_GIT = "1";

/** 真实「最近打开」现在有几条 —— 收尾要证明我们一条都没碰（纪律⑥ 的状态版）。 */
const realWorkspace = join(process.env.HOME ?? "", "Documents", "SourceTree", "Geek", "UmbraStudio", ".umbrastudio", "workspace.json");
const realBefore = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;

/** 当前显示的那个工作台。
 *
 *  ⚠️ **并存之后（M15-1 S2）DOM 里可能有好几个工作台**（隐藏的那几个
 *  用 `display:none`，不卸载）。于是 `[data-ud="tree-more"]` 这种全局选择器
 *  `.first()` 会选到**隐藏的那一个** → 点它当场超时 30 秒，
 *  而报错说的是「元素不可见」**指向产品**，不是指向判据选错了那一个。
 *  这一套第一次撞到它就是这么崩的。
 *  > **一个在单项目下唯一的选择器，在并存之后就成了「选到哪一个」的赌博。** */
const WB = '[data-ud="workbench-slot"][data-active] ';

const live = await realpath(await mkdtemp(join(tmpdir(), "umbra-home-live-")));
await writeFile(join(live, "project.json"), JSON.stringify({ name: "还在的项目", title: "还在的项目" }));
const gone = await realpath(await mkdtemp(join(tmpdir(), "umbra-home-gone-")));
await writeFile(join(gone, "project.json"), JSON.stringify({ name: "没了的项目", title: "没了的项目" }));

const { buildProject } = await import(`file://${ROOT}/server/dist/project.js`);
const { serveStart } = await import(`file://${ROOT}/server/dist/serve.js`);
const { touchProject, listRecentProjects } = await import(`file://${ROOT}/server/dist/workspace.js`);

await touchProject(live, "还在的项目", "还在的项目");
await touchProject(gone, "没了的项目", "没了的项目");
await rm(gone, { recursive: true, force: true });   // 造一条失效记录

const srv = await serveStart(await buildProject(live));
const url = `${srv.url.replace(/\/$/, "")}/__app/home?token=${encodeURIComponent(srv.token)}`;

const { chromium } = await import(`file://${ROOT}/server/node_modules/playwright-core/index.mjs`);
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;
const ok = (c, what, extra) => {
  if (c) { pass++; console.log(`  ✓ ${what}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
  else { fail++; console.log(`  ✗ ${what}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};

console.log(`\n首页行菜单 · 临时状态目录 ${STATE}\n服务 ${srv.url}\n`);
await pg.goto(url, { waitUntil: "domcontentloaded" });
await pg.getByText("还在的项目").first().waitFor({ timeout: 20000 });

/* ── ① 前提：两条记录都列出来了 ── */
console.log("① 前提");
ok(await pg.getByText("还在的项目").first().isVisible(), "（前提）「还在的项目」列出来了");
ok(await pg.getByText("没了的项目").first().isVisible(), "（前提）失效的那条也列出来了（它不该静默消失，M14-3）");
const mores = pg.locator('[data-ud="home-more"]');
ok(await mores.count() === 2, "两行各有一颗 ⋯", await mores.count());
/* ⚠️ **按名字取行，不按下标**（第一版就栽在这里）：列表按最近打开倒排，
   而「失效的那条」恰好排在前面 —— 于是 ②③④⑤ 四条全在量另一行，
   报出来的红看着像产品坏了，其实是判据指错了行。
   **判据要落在结构上**，所以行上加了 `data-ud="project-row" data-name=…`。 */
const moreOf = (name) => pg.locator(`[data-ud="project-row"][data-name="${name}"] [data-ud="home-more"]`);

/* ── ② ⚠️ 这一条是这套判据的理由：**不悬停也看得见** ──
   2026-10-21 之前整列是 `opacity-0 group-hover:opacity-100`，
   而「从列表移除 / 忘掉」没有别的入口 —— **一个只在悬停时出现的唯一入口，
   等于告诉用户这件事做不到**。所以量的是 opacity，不是「在不在 DOM 里」。 */
console.log("\n② 够得着（不是「在 DOM 里」）");
const op = await moreOf("还在的项目").evaluate((e) => {
  let cur = e, min = 1;
  while (cur && cur !== document.body) { min = Math.min(min, Number(getComputedStyle(cur).opacity)); cur = cur.parentElement; }
  return min;
});
ok(op === 1, "没悬停时 ⋯ 就是**不透明**的（祖先链上没有 opacity:0）", op);
ok(await moreOf("还在的项目").isVisible(), "⋯ 看得见");
await moreOf("还在的项目").click({ trial: true });
ok(true, "⋯ 碰得到（trial click 不抛）");

/* ── ③ 菜单里有那两项，而且「忘掉」要两下 ── */
console.log("\n③ 菜单");
await moreOf("还在的项目").click();
const menu = pg.locator('[data-ud="home-row"]').first();
await menu.waitFor({ state: "visible", timeout: 5000 });
const txt = await menu.innerText();
ok(/从列表移除/.test(txt), "有「从列表移除」", txt.replace(/\n/g, " · "));
ok(/忘掉这个项目/.test(txt), "有「忘掉这个项目…」");
ok(/在访达中显示/.test(txt), "还在的项目有「在访达中显示」");
/* ⚠️ 第一下**不许真删** —— 这是两段式的全部意义。
   先量记录条数，点一下「忘掉这个项目…」，再量一次：必须没变。 */
const before = (await listRecentProjects()).recents.length;
await menu.getByText("忘掉这个项目…").click();
await pg.waitForTimeout(300);
const mid = (await listRecentProjects()).recents.length;
ok(before === 2 && mid === 2, "**第一下不删**：点完「忘掉这个项目…」记录还是 2 条", { before, mid });
/* 要给设计侧看字面时：`SHOT=<路径> node app/hometest.mjs` */
if (process.env.SHOT) { await pg.screenshot({ path: process.env.SHOT }); console.log(`    截图 ${process.env.SHOT}`); }
const txt2 = await menu.innerText();
ok(/一个字节都不动/.test(txt2) && /真的忘掉/.test(txt2), "第一下摊开的是「会删什么 / 不会动什么」+ 第二颗钮", txt2.replace(/\n/g, " · "));
await pg.keyboard.press("Escape");
await pg.waitForTimeout(200);

/* ── ④ 从列表移除：记录没了，而**目录还在盘上** ── */
console.log("\n④ 从列表移除");
await moreOf("还在的项目").click();
await menu.waitFor({ state: "visible", timeout: 5000 });
await menu.getByText("从列表移除").click();
await pg.waitForTimeout(600);
const after = await listRecentProjects();
ok(after.recents.length === 1 && after.recents[0]?.name === "没了的项目", "记录少了一条，少的正是点的那一条", after.recents.map((r) => r.name));
ok(existsSync(live) && existsSync(join(live, "project.json")), "**那个目录和里面的文件一个字节都没动**");
ok(!(await pg.getByText("还在的项目").count()), "界面上那一行也跟着不见了（不用刷新）");

/* ── ⑤ 失效的那条也移除得掉 ── */
console.log("\n⑤ 失效的记录也移除得掉");
const more2 = moreOf("没了的项目");
ok(await pg.locator('[data-ud="home-more"]').count() === 1, "（前提）只剩失效那一行的 ⋯", await pg.locator('[data-ud="home-more"]').count());
await more2.click();
await menu.waitFor({ state: "visible", timeout: 5000 });
const txt3 = await menu.innerText();
ok(!/在访达中显示/.test(txt3), "失效那条**不给**「在访达中显示」（目录都没了，点了只会开一个空窗）", txt3.replace(/\n/g, " · "));
await menu.getByText("从列表移除").click();
await pg.waitForTimeout(600);
ok((await listRecentProjects()).recents.length === 0, "失效的那条也移除掉了");

/* ── ⑥ 打开一个**普通目录**：零写入 + 工作台里有「接管」那条出路（M14-4 B3）──
   ⚠️ 这一节的意义在**第二条**：B3 让打开目录一个字节都不写，
   代价是那种目录里 `.dc.html` 的预览壳不在。**不给出路的话，
   这就从「少写了点东西」变成「这种文件打不开」** —— 所以横条本身要有判据。 */
console.log("\n⑥ 普通目录：零写入 + 接管那条出路");
{
  const plain = await realpath(await mkdtemp(join(tmpdir(), "umbra-home-plain-")));
  await writeFile(join(plain, "一份文档.md"), "# 文档\n");
  /* ⚠️ **样本里必须有一份 `.dc.html`**（2026-10-22 反向验证逼出来的）：
     第一版只放了一份 `.md`，于是 `drafts` 回 `indexed: true`（没有稿要索引），
     前端那句「没索引就自动建一个」**压根没跑** —— 两道闸全拆掉它也绿。
     > **判据在没有样本的时候，测的是「今天恰好没事」**（今天第三次）。
     放一份稿进去，「自动建索引」那条路才真的会被走到。 */
  await writeFile(join(plain, "别人发来的.dc.html"),
    '<!DOCTYPE html><html><head><script src="./support.js"></script></head><body><x-dc><div>一份稿</div></x-dc></body></html>\n');
  /* ⚠️⚠️ **这两行是 2026-10-22 补的，而缺了它们这一节在一个真缺陷上全绿。**
     「别人发来一份设计稿」现实里就是这个样子：稿 + `support.js` + `.umbradesign/select-bridge.js`
     （那个目录名是格式与协议级标识，发稿时一起发过来）。
     而 `buildProject()` 第一句 `migrateUdDir(dir)` 看见 `.umbradesign/` 就整个拷成
     `.umbrastudio/` —— **于是「打开普通目录零写入」在这个样本上不成立**。
     成因是两件事叠的：① 那个目录名今天不只是「旧配置目录」；
     ② B1/B2 把项目里的 `.umbrastudio/` 搬空之后，「新目录不在才搬」这个守卫
     **从几乎永假翻成了永真**。
     > **一个判准的前提被别处改掉了，而它自己不会报错。**
     > 而判据的样本里没有那个前提，于是它测的是「今天恰好没事」（第四次）。 */
  await mkdir(join(plain, ".umbradesign"), { recursive: true });
  await writeFile(join(plain, ".umbradesign", "select-bridge.js"), "/* 发稿时一起带过来的点选桥 */\n");
  const walkPlain = () => {
    const out = [];
    const rec = (d, pre) => { for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) rec(join(d, e.name), pre + e.name + "/"); else out.push(pre + e.name); } };
    rec(plain, "");
    return out.sort();
  };
  const before = walkPlain();
  /* ⚠️ 行上的名字来自 `buildProject`（没有 project.json 就用**目录名**兜底），
     **不是** `touchProject` 传的那个显示名 —— 第一版按后者找行，当场超时。 */
  const plainName = plain.split("/").pop();
  await touchProject(plain, plainName, plainName);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.locator(`[data-ud="project-row"][data-name="${plainName}"]`).first().waitFor({ timeout: 15000 });
  await pg.locator(`[data-ud="project-row"][data-name="${plainName}"]`).first().click();
  /* ⚠️⚠️ **工作台顶部那条「接管为设计项目」横条 2026-10-23（M16-7c / C3）删了，
     这一节里关于它的三条判据跟着删（不是放宽）。**

     它的文案自己写着「要预览 `.dc.html` 设计稿的话，得先放几样工具文件进来」，
     判准是 `hasDrafts`（这个目录里有没有我们的稿）—— **设计稿这一档没了之后，
     它要解决的问题不存在了**：没有预览壳要部署，也没有「有几份稿」可问。
     > **一个判据该删还是该挪，看的是它测的那件事还在不在** ——
     > M14-7 那次是「顺序反了」（事还在，位置错），所以挪；这次是事没了，所以删。

     ⚠️ **只读横条那一半照旧全留**（`readonly-bar` / `unlock-btn`）——
     「随手打开的目录默认不动你的文件」和设计稿无关。
     ⚠️ 「接管」这个**动作**还在（`adopt_project` + 新建稿件那一问），
     所以下面的对照组没删，只是换成从**那一问**里点（见那一节）。 */
  /* ⚠️ **要等一会儿再数**（反向验证逼出来的）：自动建索引是异步的，
     横条一出现就数的话，它还没落盘 —— **两道闸全拆掉这一条也绿**。
     「打开之后没多文件」要说的是「过了一会儿也没多」。 */
  await pg.waitForTimeout(2500);
  /* ⚠️ **递归数，不是只数顶层**：上面那个破口多出来的是 `.umbrastudio/select-bridge.js`，
     只数顶层的话它显示成「多了一个 `.umbrastudio`」—— 能看出来，但
     「多了一个空目录」和「多了 19 KB」在读数上该分得清。 */
  const after = walkPlain();
  const extra = after.filter((x) => !before.includes(x));
  ok(extra.length === 0, "**打开之后那个目录一个文件都没多**（样本里带着 `.umbradesign/`）",
    extra.join(" · ") || `${after.length} 项，和打开前一样`);
  /* ── 只读预览那条横条，以及它和「接管」那条的顺序（M14-7 / Q70，2026-10-22）──
     ⚠️ **横条本身不是闸**（闸在两条写入口上，`apitest` ⑲ 钉着）——
     这里钉的是「它说出来了没有、出路够不够得着」。
     ⚠️ **顺序那一条才是这一节的要点**：接管必然蕴含可编辑（它要写 `project.json`），
     所以在还只读的时候摆一颗「接管为设计项目」，等于让人先点一个
     **会往他目录里写 750 KB** 的按钮，来解除一个「不动你文件」的保护 —— 顺序反了。 */
  {
    const ro = pg.locator(WB + '[data-ud="readonly-bar"]');
    await ro.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    ok(await ro.isVisible(), "**只读预览那条横条出来了**（随手打开的目录，默认不动它的文件）");
    const roText = await ro.innerText().catch(() => "");
    ok(/只读预览/.test(roText) && /连 AI 也不行/.test(roText),
       "横条说的是「**我们默认不动它们**，连 AI 也不行」，不是 Notion 那句「需要导入」（我们不复制文件）",
       roText.replace(/\n/g, " ").slice(0, 46));
    await pg.locator(WB + '[data-ud="unlock-btn"]').click();
    await pg.waitForTimeout(1200);
    ok(!(await ro.isVisible()), "点完「开始编辑」那条横条自己退场");
    const body = await pg.evaluate(() => document.body.innerText);
    /* ⚠️ `doc/24` §21.4：**用户看不到的保证等于没有保证。**
       解锁那一下是说这句话最自然的时机 —— 他刚刚授权我们动他的文件。 */
    ok(/原文件夹不会多出任何文件/.test(body), "**解锁之后正面回答他最初那个担心**（原文件夹不会多出任何文件）",
       (body.match(/版本历史记在[^\n]*/) ?? ["(没说)"])[0].slice(0, 44));
    const after1 = walkPlain();
    ok(after1.filter((x) => !before.includes(x)).length === 0,
       "**解锁这一下也没往那个目录里放任何东西**（标记落在我们自己那边）",
       after1.filter((x) => !before.includes(x)).join(" · ") || "一个都没多");
  }

  /* ── 「新建稿件」在普通目录里直接给表单（C3 / M16-7c-2a 改写）──
     ⚠️⚠️ **这一节原来测的是「先问一句要不要接管」，而那一问 2026-10-23 删了。**
     它当初存在的理由：建一份稿会**静默写 5 个文件 · 227 KB**（稿 1 KB + 运行时副本 4 份），
     而写完还是半残的（预览壳不在 → 编辑档 iframe 404）。
     C3 删掉 `ensureRuntimeBeside` 之后**建一份稿只多那一份稿**，两个理由都没了。

     ⚠️ **留下来的那一条是 B3 的承诺**（「取消之后那个目录一个字节都没动」）——
     它和接管无关，所以照旧。
     ⚠️ 新增的那一条钉的是**今天的承诺**：建完只多那一份稿。
     > 一节判据的对象变了，要分清哪几条跟着走、哪几条本来就不是为它写的。 */
  {
    const b2 = walkPlain();
    await pg.locator(WB + '[data-ud="tree-more"]').first().click();
    await pg.waitForTimeout(400);
    const mk = pg.locator('[data-ud="ctxmenu"] button, [data-ud="ctxmenu"] [role="menuitem"]')
      .filter({ hasText: /新建稿件/ }).first();
    ok(await mk.count() > 0, "（前提）普通目录里**有**「新建稿件…」这一项（不是把入口藏掉）");
    await mk.click();
    await pg.waitForTimeout(600);
    /* ⚠️ **直接是表单，不再有「先接管」那一问** —— 这一条是反面的：
       留着那一问的话它会挡在前面，而文件名框就不会出现。 */
    ok(await pg.locator('input[placeholder^="例如"]').count() > 0,
       "**点「新建稿件」直接给文件名表单**（不再先问一句要不要接管）");
    const dlg = pg.locator('[role="dialog"]').first();
    const txt = await dlg.innerText().catch(() => "");
    ok(!/接管/.test(txt), "弹窗里**一个「接管」字都没有**（那条线整条删了）", txt.replace(/\n/g, " ").slice(0, 40));
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(400);
    const a2 = walkPlain();
    ok(a2.join("|") === b2.join("|"), "**取消之后那个目录一个字节都没动**",
       a2.filter((x) => !b2.includes(x)).join(" · ") || "一个都没多");
  }

  /* 对照组：真建一份稿，而且**只多那一份** —— 见上面那段注释。
     ⚠️ 没有它的话，上一条「取消之后没动」可能只是因为建稿整条路都坏了，
     而那两种在文件数上长得一模一样。 */
  {
    const b3 = walkPlain();
    await pg.locator(WB + '[data-ud="tree-more"]').first().click();
    await pg.waitForTimeout(400);
    await pg.locator('[data-ud="ctxmenu"] button, [data-ud="ctxmenu"] [role="menuitem"]')
      .filter({ hasText: /新建稿件/ }).first().click();
    await pg.waitForTimeout(600);
    const nameBox = pg.locator('input[placeholder^="例如"]').first();
    await nameBox.fill("_hometest新稿");
    await pg.waitForTimeout(300);
    await nameBox.press("Enter");
    /* 轮询等它落盘 —— 定时等会在机器一忙时把慢误报成坏（§113 那一族），上限 40 次 */
    let made = [];
    for (let i = 0; i < 40; i++) {
      await pg.waitForTimeout(250);
      made = walkPlain().filter((x) => !b3.includes(x));
      if (made.length) break;
    }
    ok(made.length > 0, "（对照）在普通目录里真建一份稿是成的 —— 「什么都没写」不是因为「什么都写不了」",
       made.join(" · ") || "一个都没多");
    /* ⚠️⚠️ **这一条是 C3 的新承诺，而它原来不成立**：`ensureRuntimeBeside` 删掉之前
       同一个动作会静默多写 225 KB（`support.js` + 两个 React UMD）。 */
    ok(made.length === 1 && made[0] === "_hometest新稿.dc.html",
       "**建一份稿只多那一份稿**（不再顺手拷 225 KB 运行时副本）", made.join(" · "));
  }


  await rm(plain, { recursive: true, force: true });
}

/* ── ⑦ 从系统里拖文件进来（M14-5 下半 · `doc/24` §22.1）──
   ⚠️⚠️ **先说清这一节能测到哪一层，以及为什么只能到这一层。**
   真的从访达拖一个文件进来要驱动系统 UI，Playwright 做不到；而 Electron 的
   `webUtils.getPathForFile()` 对**页面里 new 出来的 `File`** 回空串 ——
   它只认真从系统拖进来的那种。所以这一节测的是**拖拽逻辑那一层**：
   合成一次带 `Files` 的 drag → 落点算得对不对 · 问句是哪一句 · 两个落点会不会
   同时弹两个问句 · 这个宿主拿不到路径时**说话了没有**。
   「路径真的取得到」那一层在 `shelltest` 里钉（它跑真 Electron，而且那条
   版本陷阱 `File.path === undefined` 在那里量得到）。
   > **分不清「这一层测到了什么」和「这件事测完了」，就会把半套当成全套。**

   ⚠️ 这一节跑在**浏览器**里，所以 `pathsForDrop` 必然回空 —— 于是它恰好是
   「拿不到路径要说话」那条判据的现成样本。**而这正是最容易静默的那一条**：
   拖了一下什么都不发生，用户只会以为拖拽坏了。 */
console.log("\n⑦ 从系统里拖文件进来（场景 ①②③ 的逻辑层）");
{
  /** 在一个元素上合成一次 drag：带 `Files` 类型 + 一个 File。 */
  const dragTo = async (sel, name = "拖进来的.png") => pg.evaluate(({ sel, name }) => {
    const el = document.querySelector(sel);
    if (!el) return "没找到这个元素";
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], name, { type: "image/png" }));
    for (const type of ["dragenter", "dragover", "drop"]) {
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
    return "ok";
  }, { sel, name });

  /* 先开一个真项目（要有文件列可拖）。
     ⚠️ **自己新建一个，不要复用前面几节那几条** —— ④⑤ 已经把它们从列表里移除了，
     第一版复用「还在的项目」当场超时 15 秒。
     > **判据之间会互相拿掉夹具**（§143.6 那一族，这次拿掉的是「列表里还有没有这一行」）。 */
  const dragProj = await realpath(await mkdtemp(join(tmpdir(), "umbra-home-drag-")));
  await writeFile(join(dragProj, "project.json"), JSON.stringify({ name: "拖拽项目", title: "拖拽项目" }));
  await writeFile(join(dragProj, "一份文档.md"), "# 文档\n");
  /* ⚠️ 要有一个**子目录** —— 「拖到一行上那一行亮」钉的是目录行，
     而根级文件行的落点是项目根（那时亮的是树的空白区，不是那一行）。 */
  await mkdir(join(dragProj, "图"), { recursive: true });
  await writeFile(join(dragProj, "图", "已有的.png"), "x");
  await touchProject(dragProj, "拖拽项目", "拖拽项目");
  /* ⚠️ **`goto(首页)` 不是 `reload()`**：⑥ 跑完页面停在工作台上（而那个目录已经被删了），
     `reload` 会按当前地址重载工作台 —— 第一版就这么超时了 15 秒，
     而报错说的是「等不到那一行」，**指向的是列表，不是「我压根没回首页」**。 */
  await pg.goto(url, { waitUntil: "domcontentloaded" });
  await pg.locator(`[data-ud="project-row"][data-name="拖拽项目"]`).first().waitFor({ timeout: 15000 });
  await pg.locator(`[data-ud="project-row"][data-name="拖拽项目"]`).first().click();
  await pg.locator(WB + '[data-ud="tree-body"]').waitFor({ timeout: 15000 });

  /* ⓐ 浏览器里拿不到路径 → **要说话**，不能静静没反应 */
  {
    const r = await dragTo(WB + '[data-ud="tree-body"]');
    ok(r === "ok", "（前提）合成的那一下真落在文件列上了", r);
    const t = pg.locator('[data-ud="toast"], [role="status"]');
    await t.first().waitFor({ timeout: 4000 }).catch(() => {});
    const txt = await pg.evaluate(() => document.body.innerText);
    ok(/拖不进来/.test(txt), "**浏览器里拖进来会说一句「这里拖不进来」**（拿不到路径 ≠ 什么都不做）",
       (txt.match(/这里拖不进来[^\n]*/) ?? ["(没说)"])[0].slice(0, 50));
    /* ⚠️ 钉「说了为什么」，而**不钉那句话的措辞** —— 设计侧第 59 封把它改过一次
       （去掉了「不是我们没做」那句辩解和「上面的」那种按位置指路）。
       判据钉措辞的话，每次文案润色它都会红，而它要守的不变量是
       **「说出了原因 + 给了出路」**。 */
    ok(/浏览器不会告诉网页文件存在磁盘的什么位置/.test(txt) && /打开目录/.test(txt),
       "而且说的是**为什么** + **怎么办**（不是干巴巴一句「不支持」）",
       (txt.match(/浏览器不会告诉[^\n]*/) ?? ["(没说)"])[0].slice(0, 56));
  }

  /* ⓑ 落点要画出来：拖到某一行时那一行高亮 —— 人要在**松手之前**知道会放到哪 */
  {
    const row = pg.locator(WB + '[role="treeitem"]').first();
    const has = await row.count();
    if (!has) ok(false, "（前提）树里至少有一行 —— 这一条没验到");
    else {
      /* ⚠️ **dispatch 完要等一拍再读 className** —— React 的 state 更新是异步的，
         同一个 `evaluate` 里读到的还是渲染之前那一版。
         第一版就是这么红的，而读数（「没有 ring-accent」）**和「高亮压根没做」一模一样**。
         > 又一次：**判据抢跑会把「还没发生」读成「不会发生」**（§113 同族）。 */
      const sel = WB + '[role="treeitem"][aria-expanded]';   // 当前那个工作台里的目录行（有 aria-expanded 的才是）
      const has2 = await pg.locator(sel).count();
      ok(has2 > 0, "（前提）树里有一个目录行可以拖上去", `${has2} 个`);
      await pg.evaluate((sel) => {
        const el = document.querySelector(sel);
        const dt = new DataTransfer();
        dt.items.add(new File(["x"], "a.png", { type: "image/png" }));
        el.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
        el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      }, sel);
      await pg.waitForTimeout(250);
      const lit = await pg.evaluate((sel) => document.querySelector(sel).className.includes("ring-accent"), sel);
      ok(lit, "**拖到一个目录行上时那一行高亮**（松手之前就知道会放到哪一层）");
      /* 反面：落点是那个目录时，**别的行不许一起亮**（第一版就是全亮） */
      const others = await pg.evaluate((sel) => {
        const all = [...document.querySelectorAll('[data-ud="workbench-slot"][data-active] [role="treeitem"]')];
        const target = document.querySelector(sel);
        return all.filter((e) => e !== target && e.className.includes("ring-accent")).length;
      }, sel);
      ok(others === 0, "**只有那一行亮**（第一版「落点等于我所在的目录就亮」会让根级每一行一起亮）", `另外亮了 ${others} 行`);
    }
  }

  /* ⓒ 两个落点不许同时弹两个问句 —— 文件列那一下要 `stopPropagation`
     ⚠️ 这一条在浏览器里只能验「窗口级那个处理器没有也跟着跑」，办法是数
     「这一下一共触发了几次 drop 处理」。用页面上的 toast 条数当读数：
     拖一次只该有一条「拖不进来」，两个落点都接的话会是两条。 */
  {
    await pg.evaluate(() => { for (const n of document.querySelectorAll('[data-ud="toast"]')) n.remove(); });
    await dragTo(WB + '[data-ud="tree-body"]');
    await pg.waitForTimeout(600);
    const n = await pg.evaluate(() => document.querySelectorAll('[data-ud="toast"]').length);
    ok(n <= 1, "**拖一次只问一次**（文件列那一下 stopPropagation 了，窗口级那个没跟着跑）", `${n} 条提示`);
  }

  /* ── ⓔ 那张问句上三颗钮的形制（M15-1 S4 · 设计侧第 59 封裁的）──
     ⚠️ 浏览器里拿不到路径，所以那张问句**出不来** —— 这一条只能钉源码。
     而它要钉的正是设计侧裁的那两件：
     ① **主钮是「在新窗口里打开」**（它是不破坏任何东西的那一个）；
     ② 次钮**叫「加到这个窗口」而不是「在当前窗口打开」** ——
        M15-1 S2 之后它实际做的就是「加到这个窗口」，当前项目不会关。
     ⚠️ 设计侧给的后果句「当前项目会关掉」**刻意没有照抄**（它审的是 S2 之前的行为），
     所以这里连「不许出现那句话」一起钉：
     > **那句话一旦被人好心补回来，它就是一句假话** —— 而假话在界面上
     > 没有任何东西会报警。**判据是这类假话唯一的报警器。**
     > 「照抄一条正确的裁定，可能写出一句错的话」—— 裁定基于的那个行为变了。 */
  {
    const src = readFileSync(join(ROOT, "app", "src", "host", "drop.tsx"), "utf8");
    const flat = src.replace(/\s+/g, " ");
    ok(/<button className="btn primary" data-ud="drop-newwin"/.test(flat),
       "**主钮是「在新窗口里打开」**（`btn primary` 挂在 `drop-newwin` 上）");
    ok(/data-ud="drop-here"[^>]*>加到这个窗口</.test(flat),
       "**次钮叫「加到这个窗口」**，不是「在当前窗口打开」（S2 之后它就是这个行为）");
    /* ⚠️ **只在「会渲染出去的那部分」里找，不在注释里找。**
       第一版直接 `test(src)` 当场红 —— 而命中的是**我自己写的那条注释**
       （「设计侧给的后果句『当前项目会关掉』我没照抄，因为…」）。
       > **一条判据如果分不清「界面上的文案」和「解释为什么不用它的注释」，
       > 它就会把一条正确的注释报成缺陷。**
       而注释里提到那句话是**应该的** —— 那是它存在的理由。
       所以先把注释剥掉再找：这也是 `doc/00` §107 那条
       「判据里出现的字符串，要是它检查的那个东西本身，不是提到它的文字」的第三次。 */
    const noComments = stripComments(src);
    ok(!/当前项目会关掉/.test(noComments),
       "**界面上没有「当前项目会关掉」那句话**（设计侧给的后果句，在 S2 之后是假的）");
    /* 反面自检：剥注释这一步真的在起作用吗 —— 不剥的话它该命中 */
    ok(/当前项目会关掉/.test(src),
       "（仪器自检）那句话**确实出现在注释里** —— 所以上一条测的是「剥掉注释之后还有没有」，不是「文件里有没有」");
  }

  /* ⓓ 拖一段**文字**不该触发任何东西 —— 判准是 `dataTransfer.types` 里有没有 `Files` */
  {
    await pg.evaluate(() => { for (const n of document.querySelectorAll('[data-ud="toast"]')) n.remove(); });
    const r = await pg.evaluate(() => {
      const el = document.querySelector('[data-ud="workbench-slot"][data-active] [data-ud="tree-body"]');
      const dt = new DataTransfer();
      dt.setData("text/plain", "一段文字");
      for (const type of ["dragenter", "dragover", "drop"]) {
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
      return document.querySelectorAll('[data-ud="toast"]').length;
    });
    ok(r === 0, "**拖一段文字进来什么都不发生**（不然选中一段字一拖，整个窗口就蒙一层「松手打开」）", `${r} 条提示`);
  }
  await rm(dragProj, { recursive: true, force: true });
}

/* ── 收尾：真实「最近打开」一个字节都没碰 ── */
console.log("\n收尾");
const realAfter = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;
ok(realAfter === realBefore, "**真实的 workspace.json 一个字节都没动**（全程临时 STATE_ROOT）",
  realBefore === null ? "本来就没有" : `${realBefore.length} 字节`);

await br.close();
await rm(STATE, { recursive: true, force: true });
await rm(live, { recursive: true, force: true });
console.log(fail === 0 ? `\n✓ 首页行菜单 ${pass}/${pass + fail}` : `\n✗ 首页行菜单 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
