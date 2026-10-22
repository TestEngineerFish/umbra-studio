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

await br.close();
await rm(STATE, { recursive: true, force: true });
await rm(A, { recursive: true, force: true });
await rm(B, { recursive: true, force: true });
console.log(fail === 0 ? `\n✓ 一窗口多项目 ${pass}/${pass + fail}` : `\n✗ 一窗口多项目 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
