/** 一个窗口并存多个项目的回归（M15-1 S2，2026-10-22 新建）。
 *
 *  ### 这一套的验收点只有一条，而它必须去盘上数
 *  > **改动落在正确的那个项目上。**
 *
 *  为什么只有这一条配得上「验收点」：并存要动的那一层里，错法只有一种形状 ——
 *  **拿到了 A 的路径、打在了 B 的服务上**（或者反过来）。而它的症状是
 *  **界面看起来完全正常**：页签名字对、目录树对、toast 说「已保存」。
 *  DOM 判据**说不出这件事**，只有去两个项目的目录里数文件才看得见。
 *  > **一条端到端的判据顶十条关于状态形状的判据**（`00` §172.7 原话）。
 *
 *  ### 为什么单独一套，而不是塞进 `hometest`
 *  它要**真写文件**（那是验收点的全部），而 `hometest` 的收尾承诺是
 *  「真实 `workspace.json` 一个字节都没动」那一类 —— 两套的收尾口径不同。
 *  这一套跑在**临时 `STATE_ROOT`** 上，两个项目都是自己建的临时目录。
 *
 *  用法：`node app/multiprojtest.mjs`（自己起服务、自己收尾）
 */
import { stripComments } from "../server/dist/shared/stripcomments.js";
import { mkdtemp, writeFile, realpath, rm, mkdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-mp-state-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_NO_GIT = "1";

/** 真实「最近打开」—— 收尾要证明一条都没碰（纪律⑥ 的状态版） */
const realWorkspace = join(ROOT, ".umbrastudio", "workspace.json");
const realBefore = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;

/* 两个项目，**各有一份同名的文件** —— 这是整套的夹具设计要点：
   同名才测得出「打在了另一个项目上」。不同名的话写错了会报 404，
   而那是个**会自己报错**的失败；同名的那种失败是**静默的**，正是要钉的那一种。 */
const mk = async (tag, body) => {
  const d = await realpath(await mkdtemp(join(tmpdir(), `umbra-mp-${tag}-`)));
  await writeFile(join(d, "project.json"), JSON.stringify({ name: tag, title: tag }));
  await writeFile(join(d, "说明.md"), body);
  await writeFile(join(d, `只有${tag}有.md`), `# 只有 ${tag} 有\n`);
  return d;
};
const A = await mk("甲", "# 甲的说明\n");
const B = await mk("乙", "# 乙的说明\n");

const { buildProject } = await import(`file://${ROOT}/server/dist/project.js`);
const { serveStart } = await import(`file://${ROOT}/server/dist/serve.js`);
const { touchProject } = await import(`file://${ROOT}/server/dist/workspace.js`);
await touchProject(A, "甲", "甲");
await touchProject(B, "乙", "乙");

const srv = await serveStart(await buildProject(A));
const url = `${srv.url.replace(/\/$/, "")}/__app/home?token=${encodeURIComponent(srv.token)}`;

const { chromium } = await import(`file://${ROOT}/server/node_modules/playwright-core/index.mjs`);
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;
const ok = (c, what, extra) => {
  if (c) { pass++; console.log(`  ✓ ${what}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
  else { fail++; console.log(`  ✗ ${what}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
pg.on("pageerror", (e) => console.log("  · [页面异常]", String(e).slice(0, 160)));

console.log(`\n一窗口多项目 · 临时状态目录 ${STATE}\n`);
await pg.goto(url, { waitUntil: "domcontentloaded" });

const openProject = async (name) => {
  const row = pg.locator(`[data-ud="project-row"][data-name="${name}"]`).first();
  await row.waitFor({ timeout: 20000 });
  await row.click();
  await pg.locator('[data-ud="workbench-slot"][data-active]').waitFor({ timeout: 20000 });
};

/* ── ① 两个项目同时挂着，只显示一个 ── */
console.log("① 并存：两个都挂着，只显示一个");
await openProject("甲");
ok((await pg.locator('[data-ud="workbench-slot"]').count()) === 1, "（前提）先开一个 → 一个工作台");
/* ⚠️ **先在甲里开一份它独有的文件**，让它有自己的页签。
   第一版没这一步，于是 ④ 那条「甲的页签里没有乙那份稿」的读数是
   **「（没有页签）」** —— 而那句话在「页签串了」的时候**照样成立**
   （甲压根没有页签，当然也没有乙那份）。
   > **一条判据的读数是「什么都没有」时，它多半什么都没测到。** */
await pg.locator('[data-ud="workbench-slot"][data-active] [role="treeitem"][data-path="只有甲有.md"]').first().click();
await pg.waitForTimeout(1200);
{
  const t0 = await pg.$$eval('[data-ud="workbench-slot"][data-active] [data-ud="tab"]', (ns) => ns.map((n) => n.getAttribute("data-path")));
  ok(t0.includes("只有甲有.md"), "（前提）甲里真的开出了一个它自己的页签 —— ④ 要靠它才测得到东西", t0.join(" · "));
}
/* 回首页再开第二个 —— 「打开另一个项目」在这一期走的就是首页那条路 */
await pg.locator('[data-ud="tree-head"] button').first().click().catch(() => {});
await pg.goto(url, { waitUntil: "domcontentloaded" });
await openProject("乙");
{
  const slots = await pg.$$eval('[data-ud="workbench-slot"]', (ns) => ns.map((n) => ({
    dir: n.getAttribute("data-dir"), active: n.hasAttribute("data-active"),
    shown: getComputedStyle(n).display !== "none",
  })));
  ok(slots.length === 2, "**两个工作台同时挂在 DOM 里**（并存，不是换 props）", slots.length);
  ok(slots.filter((x) => x.shown).length === 1, "**只有一个在显示**（另一个 display:none，没卸载）",
     slots.map((x) => `${x.dir.split("/").pop()}:${x.shown ? "显示" : "藏着"}`).join(" · "));
  ok(slots.filter((x) => x.active).length === 1, "当前只有一个");
}

/* ── ② 切换器在，而且认得出哪个是当前 ── */
console.log("\n② 项目切换器");
{
  await pg.locator('[data-ud="workbench-slot"][data-active] [aria-haspopup="menu"]').first().click();
  await pg.waitForTimeout(400);
  const items = await pg.$$eval('[data-ud="workbench-slot"][data-active] [data-ud="proj-switch-item"]',
    (ns) => ns.map((n) => ({ dir: n.getAttribute("data-dir"), cur: n.hasAttribute("data-current"), text: n.innerText.trim() })));
  ok(items.length === 2, "切换器里列着两个项目", items.map((x) => x.text).join(" · "));
  ok(items.filter((x) => x.cur).length === 1, "**当前那个标出来了**（不然切过去之前不知道现在在哪）");
  await pg.keyboard.press("Escape");
}

/* ══════════ ③ 验收点：改动落在正确的项目上（去盘上数）══════════
   ⚠️ 这一条是整件事的验收点，**而它必须去盘上数**：
   拿错项目的症状是「界面看起来完全正常」—— 页签名字对、toast 说已保存。
   所以判据不看界面，看**两个项目目录里的字节**。
   ⚠️ 两个项目各有一份**同名**的 `说明.md`，这是夹具设计的要点：
   同名才测得出「打在了另一个项目上」（不同名写错了会 404，那是会自己报错的失败）。 */
console.log("\n③ 【验收点】改动落在正确的项目上（去盘上数）");
{
  /* 经界面当前那个项目（乙）的服务写一次 —— 走的是真 HTTP 面，和 AI / 界面同一条路 */
  const write = async (text) => pg.evaluate(async (t) => {
    const b = window.__UD_APP;
    void b;
    /* ⚠️ **从当前那个工作台的 `core` 走**：页面里拿不到 React 内部状态，
       所以用它暴露在 DOM 上的 slot 找出当前项目目录，再打 hub 的 open_project
       回执里那台服务 —— 但那等于绕过被测的那一层。
       改成**真从界面点**：这里只验证服务端那一头，界面那一头由 ④ 的页签隔离覆盖。 */
    return t;
  }, text);
  void write;

  const aBefore = readFileSync(join(A, "说明.md"), "utf8");
  const bBefore = readFileSync(join(B, "说明.md"), "utf8");
  ok(aBefore !== bBefore, "（前提）两个项目的同名文件内容本来不同 —— 不然这一节测不出谁被改了",
     { 甲: aBefore.trim(), 乙: bBefore.trim() });

  /* 从**当前显示的那个工作台**里真的改一次：
     打开 `说明.md` → 在编辑器里改 → ⌘S。这条路经过的正是被测的那一层
     （当前是哪个项目 · 用哪个 core · 脏标记记在谁名下）。 */
  const slot = pg.locator('[data-ud="workbench-slot"][data-active]');
  await slot.locator('[role="treeitem"][data-path="说明.md"]').first().click();
  await pg.waitForTimeout(1500);
  /* `.md` 由内置插件在 iframe 里画，直接打字不稳；用插件面的保存那条路不如
     走一条**一定经过「当前项目的 core」**的界面动作：文件卡 / 编辑器都要等插件。
     所以这里改用「新建稿件」那条 —— 它也走当前项目的 core，而且结果**在盘上看得见**。 */
  await slot.locator('[data-ud="tree-more"]').first().click();
  await pg.waitForTimeout(400);
  const mkItem = pg.locator('[data-ud="ctxmenu"] button, [data-ud="ctxmenu"] [role="menuitem"]').filter({ hasText: /新建稿件/ }).first();
  ok(await mkItem.count() > 0, "（前提）当前那个工作台的菜单里有「新建稿件…」");
  await mkItem.click();
  await pg.waitForTimeout(600);
  const nameInput = pg.locator('input[placeholder^="例如"]').first();
  ok(await nameInput.count() > 0, "（前提）文件名表单出来了（这两个项目都接管过，不该再问接管）");
  await nameInput.fill("并存测试稿");
  await pg.locator('button:has-text("新建")').last().click();
  await pg.waitForTimeout(3000);

  /* ⚠️⚠️ **就是这两行**：当前显示的是乙，所以它必须落在乙，而甲一个字节都不许多。 */
  const inB = existsSync(join(B, "并存测试稿.dc.html"));
  const inA = existsSync(join(A, "并存测试稿.dc.html"));
  ok(inB, "**新建的稿落在当前那个项目（乙）里**", inB ? "在" : "✗ 不在");
  ok(!inA, "**而另一个项目（甲）一个字节都没多** —— 这是整件事的验收点",
     inA ? "✗ 它落到甲里去了（拿错项目）" : "甲里没有");
}

/* ── ④ 切过去之后，页签 / 当前文件各自是自己的 ── */
console.log("\n④ 切过去之后各自是自己的");
{
  await pg.locator('[data-ud="workbench-slot"][data-active] [aria-haspopup="menu"]').first().click();
  await pg.waitForTimeout(400);
  const aDir = A;
  await pg.locator(`[data-ud="proj-switch-item"][data-dir="${aDir}"]`).first().click();
  await pg.waitForTimeout(1500);
  const activeDir = await pg.$eval('[data-ud="workbench-slot"][data-active]', (n) => n.getAttribute("data-dir"));
  ok(activeDir === aDir, "**切过去了**（当前那个 slot 换成了甲）", activeDir?.split("/").pop());
  /* 甲从来没开过「并存测试稿」，所以它的页签条里不该有那一份 ——
     ⚠️ 这一条钉的是「页签按项目分」：串了的话甲会出现一个它根本没有的文件的页签。 */
  const tabs = await pg.$$eval('[data-ud="workbench-slot"][data-active] [data-ud="tab"]',
    (ns) => ns.map((n) => n.getAttribute("data-path")));
  /* ⚠️ **两头都断言**：有自己那一份 + 没有乙那一份。
     只断言后者的话，「甲一个页签都没有」也算通过（第一版就是这么假绿的）。 */
  ok(tabs.includes("只有甲有.md") && !tabs.includes("并存测试稿.dc.html"),
     "**甲的页签条是甲自己的**（它那一份在、乙那份新稿不在 —— 页签按项目分，没串）",
     tabs.join(" · ") || "✗ 一个页签都没有（那这一条什么都没测到）");
  /* 反面：甲自己独有的那份文件在它的树里，而乙那份独有的不在 —— 证明树也是各自的 */
  const paths = await pg.$$eval('[data-ud="workbench-slot"][data-active] [role="treeitem"]',
    (ns) => ns.map((n) => n.getAttribute("data-path")));
  ok(paths.includes("只有甲有.md") && !paths.includes("只有乙有.md"),
     "**甲的目录树是甲的**（它独有的那份在、乙独有的那份不在）",
     paths.filter((p) => p.startsWith("只有")).join(" · "));
}

/* ── ⑤ 当前这个工作台打的是**它自己那台服务** ──
   ⚠️⚠️ **这一条是反向验证逼出来的。** 第一版这一套 16 条全绿，而我注入
   「所有 slot 都拿当前那个 entry」之后**它照样 16/16** ——
   因为我注入的是「隐藏那个拿错了」，而隐藏的那个看不见，错了也没人知道。
   **真正要防的是「当前这个拿错了」**：handle 是甲的、core 是乙的那一台。
   那种错的症状是「界面全对、改动落到另一个项目」，所以判据要**把两者对起来看**：
   当前 slot 上写的目录（来自 handle）和它实际在打的那台服务（来自 core）
   必须指向同一个项目。
   > **注入一个看不见的缺陷，判据不红是理所当然的** ——
   > 反向验证也要选在「它真的会害人」的那条路上。 */
console.log("\n⑤ 当前这个工作台打的是它自己那台服务");
{
  const activeDir2 = await pg.$eval('[data-ud="workbench-slot"][data-active]', (n) => n.getAttribute("data-dir"));
  /* 从界面点一次「在访达中显示」那类读不到；改成问**它刚才真的写到哪了**：
     ③ 已经证明新建落在乙。这里换一个方向 —— 在**甲**里再新建一份，
     然后看它落在甲还是乙。切过来之后 core 该跟着换，没换就会落到乙。 */
  const slot2 = pg.locator('[data-ud="workbench-slot"][data-active]');
  await slot2.locator('[data-ud="tree-more"]').first().click();
  await pg.waitForTimeout(400);
  const mk2 = pg.locator('[data-ud="ctxmenu"] button, [data-ud="ctxmenu"] [role="menuitem"]').filter({ hasText: /新建稿件/ }).first();
  await mk2.click();
  await pg.waitForTimeout(600);
  await pg.locator('input[placeholder^="例如"]').first().fill("甲这边的稿");
  await pg.locator('button:has-text("新建")').last().click();
  await pg.waitForTimeout(3000);
  const inA2 = existsSync(join(A, "甲这边的稿.dc.html"));
  const inB2 = existsSync(join(B, "甲这边的稿.dc.html"));
  ok(activeDir2 === A && inA2 && !inB2,
     "**切到甲之后新建落在甲**（core 跟着换了 —— 没换的话它会落到乙）",
     `当前 ${activeDir2 === A ? "甲" : "?"} · 甲里${inA2 ? "有" : "没有"} · 乙里${inB2 ? "✗ 有（拿错项目）" : "没有"}`);
}

/* ── ⑥ 窗口级副作用只有当前那个在跑 ── */
console.log("\n⑥ 窗口级副作用只有当前那个在跑");
{
  /* 标题：四个实例都挂着，但只有当前那个设标题。
     ⚠️ 这一条在浏览器里量的是 `document.title`（`host.setTitle` 的 browser 实现）。 */
  const t = await pg.title();
  ok(/甲/.test(t) && !/乙/.test(t), "**窗口标题是当前那个项目**（隐藏的那个没抢）", t);
}

/* ── ⑧ 刷新之后并存列表还在（M15-1 S3）──
   ⚠️ S2 做完时量到的那条局限：并存那张列表只活在内存里，刷新（⌘R）之后
   **只剩 boot 那一个项目**。量 C=4 的探针当时用 `pg.goto` 开下一个项目，
   于是并存数**永远停在 2** —— 而读数看起来像「开不到第 3 个」。
   ⚠️ **存进 `sessionStorage` 而不是 `localStorage`**：多窗口共享后者，
   窗口 A 的列表会在窗口 B 里被恢复出来。这一条判据顺带钉住那个选择
   （`localStorage` 里不许出现这个键）。 */
console.log("\n⑧ 刷新之后并存列表还在（而且没写进 localStorage）");
{
  const before = await pg.$$eval('[data-ud="workbench-slot"]', (ns) => ns.map((n) => n.getAttribute("data-dir")).sort());
  ok(before.length === 2, "（前提）刷新之前并存着两个", before.length);
  /* ⚠️ 钉住它存在**哪个**容器里 —— 这是这一条的另一半 */
  const stores = await pg.evaluate(() => ({
    session: sessionStorage.getItem("us.windowProjects"),
    local: localStorage.getItem("us.windowProjects"),
  }));
  ok(!!stores.session && stores.local === null,
     "**列表记在 `sessionStorage` 里，`localStorage` 里一个字都没有**（多窗口共享后者）",
     `session: ${(stores.session ?? "").slice(0, 40)} · local: ${stores.local ?? "(没有)"}`);

  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.locator('[data-ud="workbench-slot"][data-active]').waitFor({ timeout: 20000 });
  /* ⚠️ 恢复是异步的（逐个 `open_project`），**要等一会儿再数** ——
     不等的话这条判据测的是「它还没恢复完」，而那和「它不恢复」长得一样。 */
  await pg.waitForTimeout(4000);
  const after = await pg.$$eval('[data-ud="workbench-slot"]', (ns) => ns.map((n) => n.getAttribute("data-dir")).sort());
  ok(after.length === before.length && after.join("|") === before.join("|"),
     "**刷新之后两个都回来了**（原来只剩 boot 那一个）",
     `${before.length} → ${after.length} · ${after.map((d) => d.split("/").pop()).join(" · ")}`);
}

/* ── ⑨ 关项目时「有一轮在跑」要拦住（M15-1 S3 · 取舍 B 的另一半）──
   ⚠️⚠️ **这一条的要点是「谁答得了这个问题」。** 前端 `useChat` 的 `running`
   只在它自己那次 `send` 的生命周期里为真 —— `useChat.ts:174` 自己写着
   「刷新页面、**切项目再切回来**、或者第二个窗口打开同一会话，
   它都是 false 而服务端那一轮还在跑」。
   > **「我这边没在跑」和「没有在跑」是两句话。**
   所以判准走服务端的 `project_busy`（它数的是作业表），而这一节
   **用 `jobs.start` 塞一个慢作业造出「正忙」** —— 和 `apitest` 第一条同一个办法，
   **一条都不调真 AI**。 */
console.log("\n⑨ 关项目时有一轮在跑 → 拦住");
{
  const { start: startJob } = await import(`file://${ROOT}/server/dist/jobs.js`);
  const { projectJobKey } = await import(`file://${ROOT}/server/dist/api.js`);
  /* 往**非当前**那个项目塞一个慢作业（切换器里能关的就是非当前的那几个） */
  const activeNow = await pg.$eval('[data-ud="workbench-slot"][data-active]', (n) => n.getAttribute("data-dir"));
  const target = (await pg.$$eval('[data-ud="workbench-slot"]', (ns) => ns.map((n) => n.getAttribute("data-dir"))))
    .find((d) => d !== activeNow);
  /* ⚠️ **前提不成立就把话说完再跳过，不抛** —— 第一次跑时 ⑧ 红了导致只剩 1 个 slot，
     `target` 是 undefined，`projectJobKey` 当场抛，**后面 5 条一条都不报**（今天第二次）。
     > 产品坏了的时候，判据要照样把话说完。 */
  ok(!!target, "（前提）有一个非当前的项目可以关", target?.split("/").pop() ?? "✗ 只有一个项目 —— 这一节没验到");
  let release = () => {};
  if (!target) { console.log("  · ⑨ 跳过：没有非当前的项目（上一节红了？）"); }
  else {
  startJob("chat", projectJobKey({ dir: target }, "chat::造一个在跑的"),
    () => new Promise((res) => { release = () => res({ ok: true }); }));
  /* ⚠️ **样本自己先成立**：服务端真的认为它在忙吗。
     不验这一条的话，下面「没关掉」可能只是因为关这条路坏了，
     而不是因为那道闸起作用了。 */
  {
    const { runningUnder } = await import(`file://${ROOT}/server/dist/jobs.js`);
    const r = runningUnder(projectJobKey({ dir: target }, ""));
    ok(r.count === 1, "（样本自己先成立）服务端的作业表里这个项目真的有 1 件在跑", JSON.stringify(r));
  }

  /* 从切换器里点那个 × */
  await pg.locator('[data-ud="workbench-slot"][data-active] [aria-haspopup="menu"]').first().click();
  await pg.waitForTimeout(400);
  const closeBtn = pg.locator(`[data-ud="proj-close"][data-dir="${target}"]`);
  ok(await closeBtn.count() > 0, "（前提）非当前那个项目旁边有关掉的那颗 ×");
  await closeBtn.click({ force: true });
  await pg.waitForTimeout(2500);
  const left = await pg.$$eval('[data-ud="workbench-slot"]', (ns) => ns.map((n) => n.getAttribute("data-dir")));
  ok(left.includes(target), "**有一轮在跑 → 没关掉**（取舍 B：拦一句，不悄悄关）",
     `还剩 ${left.length} 个`);
  const said = await pg.evaluate(() => document.body.innerText);
  ok(/还有 1 件在跑/.test(said), "**而且说出了几件在跑**（不是干巴巴一句「关不掉」）",
     (said.match(/还有 \d+ 件在跑[^\n]*/) ?? ["(没说)"])[0].slice(0, 50));

  /* 对照组：跑完之后就关得掉 —— 没有它的话「没关掉」可能只是因为关这条路整个坏了 */
  release();
  await pg.waitForTimeout(1200);
  await pg.locator('[data-ud="workbench-slot"][data-active] [aria-haspopup="menu"]').first().click();
  await pg.waitForTimeout(400);
  await pg.locator(`[data-ud="proj-close"][data-dir="${target}"]`).click({ force: true });
  await pg.waitForTimeout(2000);
  const left2 = await pg.$$eval('[data-ud="workbench-slot"]', (ns) => ns.map((n) => n.getAttribute("data-dir")));
  ok(!left2.includes(target), "**对照组**：那一轮跑完之后同一颗 × 就关掉了（闸不是把功能拆了）",
     `还剩 ${left2.length} 个`);
  }
}

/* ── ⑦ 防复发：产品代码里不许再出现**没有范围**的全局 DOM 查找 ──
   ⚠️⚠️ **这一条是审出来的那 7 处的判据化，而我先前把这笔成本说小了。**
   我原来说这个设计「只要审 3 个 effect」—— 不对，还有 7 处全局 DOM 查找，
   其中最狠的是 `id="chatInput"`：四个工作台同时挂着 → **四个元素同一个 id** →
   `document.getElementById("chatInput")` 返回文档顺序第一个，可能是隐藏那个项目的输入框。
   后果是「带进会话」之后**焦点落在看不见的输入框里，用户打的字进了另一个项目的会话**。

   这一类查找的共同点是：**它们在单项目下不可能错**，所以从来没人给它们加过范围。
   > **「全部挂上」把每一个全局 DOM 查找都变成了一次「选到哪一个」的赌博。**

   所以装一道源码级的闸（和 `captest` 那几道同一个做法）：
   `app/src/` 里出现 `document.getElementById` / `document.querySelector(All)`
   一律红，除了 `main.tsx`（挂根节点，那时候连 slot 都没有）和 `scope.ts` 自己。
   ⚠️ **判准是「有没有经过 `scope.ts`」，不是「写得对不对」** ——
   前者查得出来，后者查不出来。 */
console.log("\n⑦ 防复发：产品代码里没有脱缰的全局 DOM 查找");
{
  const SRC = join(ROOT, "app", "src");
  /* 豁免：`main.tsx` 挂根节点（那时候连 slot 都没有）· `scope.ts` 自己就是那层范围。
     ⚠️ 路径一律用 `/` 比（下面 `rel` 也是用 `/` 拼的）—— 混着 `sep` 比过一次 ESM/CJS 的坑。 */
  const allow = new Set(["main.tsx", "workbench/scope.ts"]);
  const bad = [];
  const walk = (d, pre = "") => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = pre ? `${pre}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(join(d, e.name), rel); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      if (allow.has(rel)) continue;
      const txt = readFileSync(join(d, e.name), "utf8");
      for (const [i, line] of txt.split("\n").entries()) {
        if (/document\.(getElementById|querySelector|querySelectorAll)\s*\(/.test(line)) {
          bad.push(`${rel}:${i + 1}`);
        }
      }
    }
  };
  walk(SRC);
  ok(bad.length === 0,
     "**`app/src/` 里没有不经 `scope.ts` 的全局 DOM 查找**（并存之后它们会选到隐藏的那个工作台）",
     bad.join(" · ") || "0 处（只有 main.tsx 和 scope.ts 自己豁免）");
  /* ⚠️ **先证明这道闸是活的**（纪律④）：它查得出一行真的全局查找吗。
     没有这一条的话「0 处」可能只是因为正则写错了。 */
  const probe = 'const x = document.getElementById("chatInput");';
  ok(/document\.(getElementById|querySelector|querySelectorAll)\s*\(/.test(probe),
     "**（仪器自检）这道闸认得出一行真的全局查找** —— 不然「0 处」可能只是正则写错了");
}

/* ── 收尾 ── */
console.log("\n收尾");
const realAfter = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;
ok(realAfter === realBefore, "**真实的 workspace.json 一个字节都没动**（全程临时 STATE_ROOT）",
   realBefore === null ? "本来就没有" : `${realBefore.length} 字节`);

/* ══════════════════════════════════════════════════════════════════════
   ⑩ 存不回原格式的图片：禁用 + 说出原因 + **给出路**（issue #148 / #132）

   ⚠️ `canvas.toBlob` **实测**只真能编 png / jpeg / webp —— avif / gif / bmp / ico
   全部退回 `image/png`（本轮在 Electron 自带 Chromium 上量过）。
   写回原扩展名就是「扩展名说 GIF、内容是 PNG」，动图还只剩第一帧 ——
   **在本软件里看着正常（浏览器按内容嗅探），拿到别的工具里才坏**。
   #132 为此禁掉了这几种的裁剪，而**那道闸原来一条判据都没有**：
   它接在三处（保存时拒 · 裁剪钮 disabled · tooltip 说原因），
   下一个人把任何一处拆掉都不会有东西红。
   > **一道接在三处的闸，要三条判据** —— 少一条就少守一条路。
   ⚠️ 这一节还钉**出路**那颗钮（geek-99 2026-10-22 定的 (c)）：
   **一个禁用的按钮加一句解释，解决的是「为什么不行」，没解决「那我该怎么办」。**
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑩ 存不回原格式的图片（issue #148 / #132）");
{
  /* 1×1 的 gif 与 png（base64 字面，不依赖任何工具） */
  const GIF = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const { writeFile: wf10 } = await import("node:fs/promises");
  const { Buffer: Buf10 } = await import("node:buffer");
  await wf10(join(A, "动图.gif"), Buf10.from(GIF, "base64"));
  await wf10(join(A, "位图.png"), Buf10.from(PNG, "base64"));

  /* 回到 A 那个项目，刷一次树 */
  await pg.goto(url);
  await pg.waitForTimeout(1500);
  const rowA = pg.locator('[data-ud="project-row"]').first();
  if (await rowA.count()) { await rowA.click(); await pg.waitForTimeout(2000); }

  /** ⚠️ **所有查找都限定在「当前显示的那个工作台」里**。
   *  第一版用全局 `[role="treeitem"]`，而 M15-1 S2 是「**全部挂上、只显示一个**」——
   *  那一行**在 DOM 里但不可见**（它属于隐藏的那个工作台），点它超时 30 秒，
   *  报的是「element is not visible」，看着像产品把文件树藏了。
   *  > 产品侧为这件事做过收口（`app/src/workbench/scope.ts`），
   *  > **而判据侧的同类查找没跟着改** —— 一条教训只修一边，等于只修了一半。 */
  const WB = '[data-ud="workbench-slot"][data-active] ';
  /** 打开一份文件并把编辑栏展开（裁剪钮在编辑栏上） */
  const openAndEdit = async (name) => {
    const r = pg.locator(`${WB}[role="treeitem"]`).filter({ hasText: name }).first();
    if (!(await r.count())) return false;
    await r.click(); await pg.waitForTimeout(900);
    const t = pg.locator(`${WB}[data-ud="toggle-edit"]`);
    if (await t.count() && (await t.getAttribute("aria-pressed")) !== "true") { await t.click(); await pg.waitForTimeout(500); }
    return true;
  };

  /* ── 三处闸**各一条源码级判据**（geek-99 2026-10-22 的要求）──
     ⚠️ 为什么以源码级为主：这三处的价值是「下一个人拆掉任何一处会红」，
     而端到端那一半要**项目里真有一张 gif、树刷出来了、编辑栏展开了**三个前提同时成立。
     前提不成立时它会说「**没验到**」而不是「通过」—— 但那样这道闸就一条判据都没有了。
     > **一条判据如果依赖三个前提，它就有三种「今天恰好没跑到」。**
     所以：闸在不在 → 源码级（必跑）；闸长什么样 → 端到端（跑得到就验）。 */
  const src10 = await readFile(new URL("./src/kinds/image/index.tsx", import.meta.url), "utf8");
  const edit10 = await readFile(new URL("./src/kinds/image/Edit.tsx", import.meta.url), "utf8");
  const code10 = stripComments(src10);
  ok(/export function canEncode/.test(edit10) && /"webp"/.test(edit10) && !/"avif"/.test(edit10.split("return ext ===")[1] ?? ""),
     "**闸① `canEncode` 只放行 png / jpg / jpeg / webp**（实测 canvas 对 avif / gif / bmp / ico 全退回 PNG）");
  ok(/disabled=\{d\.isSvg \|\| !canEncode\(d\.path\)\}/.test(code10),
     "**闸② 裁剪钮按它禁用**");
  ok(/if \(!canEncode\(d\.path\)\)/.test(code10),
     "**闸③ 保存那条路上再拦一次**（钮禁用之外的第三处 —— MCP / 插件够得到那条路）");
  ok(/存不回原格式/.test(src10) && /PNG 字节/.test(src10),
     "**而且 tooltip 说出了原因**（禁用而不解释和「点了没反应」是同一个病）");
  ok(/data-ud="img-to-png"/.test(code10) && /file_convert/.test(code10),
     "**出路那颗钮在，而且走服务端 `file_convert` 不走画布**（画布正是写出错字节的来源）");
  ok(/!d\.isSvg && !canEncode\(d\.path\)/.test(code10),
     "**出路钮只对「存不回去」的那几种出现**（png 上也挂就成了一句谁都有的废话）");

  if (!(await openAndEdit("动图.gif"))) {
    console.log("  · 端到端那两条**没验到**（树里没刷出那张 gif）—— 不是通过");
  } else {
    const crop = pg.locator(`${WB}[data-ud="img-crop-toggle"]`);
    ok(await crop.count() === 1 && await crop.isDisabled(),
       "**gif 的裁剪钮是禁用的**（#132 的闸之一）", `钮 ${await crop.count()} 个 · disabled=${await crop.count() ? await crop.isDisabled() : "n/a"}`);
    const tip = await crop.count() ? (await crop.getAttribute("title")) ?? "" : "";
    ok(/存不回原格式/.test(tip) && /PNG 字节/.test(tip),
       "**而且 tooltip 说出了原因**（禁用而不解释和「点了没反应」是同一个病）", tip.slice(0, 50));
    const topng = pg.locator(`${WB}[data-ud="img-to-png"]`);
    ok(await topng.count() === 1,
       "**「转成 PNG 再编辑」那颗钮出现了**（禁用 + 一句解释没解决「那我该怎么办」）",
       `${await topng.count()} 个`);
    const t2 = await topng.count() ? (await topng.getAttribute("title")) ?? "" : "";
    ok(/原图一个字节都不动/.test(t2), "那颗钮说清了原图不会被动（不然用户不敢点）", t2.slice(0, 40));
  }

  /* ⚠️ **反方向**：png 能存回去，所以裁剪**不该**禁用、那颗出路钮**不该**出现 ——
     不然这道闸就从「拦住存不回去的」变成「谁都不给裁」。 */
  if (await openAndEdit("位图.png")) {
    const crop2 = pg.locator(`${WB}[data-ud="img-crop-toggle"]`);
    ok(await crop2.count() === 1 && !(await crop2.isDisabled()),
       "**png 的裁剪钮不禁用**（别过度拦截 —— 过度拦截和漏放一样是缺陷）");
    ok(await pg.locator(`${WB}[data-ud="img-to-png"]`).count() === 0,
       "**png 上那颗「转成 PNG」不出现**（它成了一句谁都有的废话就没意义了）");
  }

}

/* ══════════════════════════════════════════════════════════════════════
   ⑪ 拖边改宽时 iframe 不许吃掉事件（issue #107）

   ⚠️ 鼠标一旦移到稿的预览 / 插件面板上，`mousemove` 就被 iframe 吃掉 ——
   父文档收不到，那一列卡在半路；而鼠标**在 iframe 里松开**时 `mouseup` 也收不到，
   于是**拖拽状态永远不结束**：光标一直是 `col-resize`、监听器一直挂着，
   下一次点哪儿都在改宽度。
   > **一个「拖拽卡住」的毛病，真正的症状是「松手之后它还在拖」。**

   ⚠️ 判据**真去量 CSS 生效**（动态建一个 iframe 再加 class），
   而不是去源码里找那行字 —— **「规则写了」和「规则对 iframe 生效了」是两件事**，
   而后者才是这条 issue 的内容（`pointer-events` 作用在 iframe **元素**上，
   不受同源策略限制，这一点正是它能替代「盖一层透明遮罩」的原因）。
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑪ 拖边改宽时 iframe 不吃事件（issue #107）");
{
  const pe = await pg.evaluate(() => {
    const f = document.createElement("iframe");
    f.id = "t107"; f.src = "about:blank";
    f.style.cssText = "position:fixed;left:-9999px;width:10px;height:10px";
    document.body.appendChild(f);
    const before = getComputedStyle(f).pointerEvents;
    document.body.classList.add("ud-resizing");
    const during = getComputedStyle(f).pointerEvents;
    document.body.classList.remove("ud-resizing");
    const after = getComputedStyle(f).pointerEvents;
    f.remove();
    return { before, during, after };
  });
  ok(pe.during === "none",
     "**拖拽期间 iframe 的 `pointer-events` 真的是 `none`**（量的是生效的样式，不是源码里有那行字）",
     JSON.stringify(pe));
  /* ⚠️ 两条**反方向**的：拖拽之前和之后都不该是 none ——
     不然这条规则就从「拖拽时让开」变成「iframe 永远点不了」。 */
  ok(pe.before !== "none" && pe.after !== "none",
     "**拖拽之前和之后都不是 `none`**（不然 iframe 就永远点不了了）",
     `before=${pe.before} · after=${pe.after}`);

  /* 松手兜底那一半：`blur` 和 `mouseup` 要走**同一个**收尾函数 ——
     两条退出路径各写一份收尾，迟早有一条忘了清。用源码钉（它是结构不是样式）。 */
  const fr107 = await readFile(new URL("./src/layout/Frame.tsx", import.meta.url), "utf8");
  const code107 = stripComments(fr107);
  ok(/window\.addEventListener\("blur", up\)/.test(code107) && /window\.removeEventListener\("blur", up\)/.test(code107),
     "**窗口失焦也结束拖拽，而且和 `mouseup` 共用同一个 `up`**（拖到窗口外松手 / 切走应用时 `mouseup` 永远不来）");
}

await br.close();
await rm(STATE, { recursive: true, force: true });
await rm(A, { recursive: true, force: true });
await rm(B, { recursive: true, force: true });
console.log(fail === 0 ? `\n✓ 一窗口多项目 ${pass}/${pass + fail}` : `\n✗ 一窗口多项目 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
