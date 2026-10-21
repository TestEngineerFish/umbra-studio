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
import { mkdtemp, writeFile, realpath, rm, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
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
