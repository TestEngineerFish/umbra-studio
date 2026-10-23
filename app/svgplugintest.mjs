/** **`svg` 这一族的端到端回归**（2026-10-23）：Q84 把矢量图拆成独立 kind，
 *  而商城里已有的 `com.umbra.svg` 和这个新的内置 id 撞上了。
 *
 *  覆盖两件：① 拆完在界面上还看得见图吗（原来在 `app/svgprobe.mjs`，已并进来）·
 *  ② 商城那个插件装上 / 卸掉之后分别由谁画（geek-99 2026-10-23 要的那条）。
 *  ⚠️ **并成一个文件是因为它自带服务** —— 原来的 `svgprobe.mjs` 要人先起服务再传 URL，
 *  而那种判据的失败模式很隐蔽：忘了起服务 → 整块跳过 → **「跳过」和「通过」长得一样**
 *  （`rendertest` 的文件头专门写过这条）。
 *
 *  ⚠️⚠️ **起因是我的疏漏**：Q84 拆出 `svg` kind 时我没去查「商城里有没有插件在用这个 id」，
 *  而商城里**本来就有** `com.umbra.svg` 1.2.1（清单自己定义 kind `svg`、`ext: [".svg"]`、`priority: 85`）。
 *  这是 `doc/00` §172.6 那次的同形 —— 当时是 `video` / `audio`：
 *  > **内置 id 正好落在第三方插件已经在用的名字上。**
 *  而那条教训就写在 CLAUDE.md 里，我起 id 时没对自己用。
 *
 *  ⚠️ **为什么必须端到端、服务端判据不够**：服务端那一半（`kindtest` ⑩ 节）钉的是
 *  「当成认领、不拒、priority 不生效但结果不受影响」。而真正会炸的是**前端** ——
 *  宿主看图模块原来 `ids: ["image", "svg"]` 直接认领它，插件装上时 `register()`
 *  撞上 `REG` 里已有的那条**当场抛**，被 loader catch 成「这个插件没能接上」。
 *  **插件装着却不起作用，而服务端看一切正常**（§172.6 的原话）。
 *  修法是 `registry.ts` 的 `FALLBACK`：**兜底和认领是两件事**，宿主只兜底，不认领。
 *
 *  自带服务 + 临时 `STATE_ROOT` + 临时空出厂目录，**一个字节都不碰用户的东西**。
 *  用法：`npm --prefix app run svgplugintest`
 */
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-svgplug-state-")));
const EMPTY_BUNDLED = join(STATE, "没有出厂插件");
await mkdir(EMPTY_BUNDLED, { recursive: true });
/* ⚠️ 两个环境变量都要在 import 核心模块**之前**设（`verbtest` 那条教训：
   那些模块在 import 时就算出 `STATE_ROOT` / `BUNDLED_DIR`）。 */
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_BUNDLED_DIR = EMPTY_BUNDLED;
process.env.UMBRASTUDIO_NO_GIT = "1";

/** 收尾要证明真实「最近打开」一条都没碰（纪律⑥ 的状态版，`doc/00` §166）。 */
const realWorkspace = join(process.env.HOME ?? "", "Library", "Application Support", "Umbra Studio", ".umbrastudio", "workspace.json");
const realBefore = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;

const proj = await realpath(await mkdtemp(join(tmpdir(), "umbra-svgplug-proj-")));
await writeFile(join(proj, "project.json"), JSON.stringify({ name: "svg判据", title: "svg判据" }));
await writeFile(join(proj, "图标.svg"),
  '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="70"><rect width="140" height="70" fill="#e8873a"/></svg>\n');

/** 把那份清单**逐字照 plugins 报的那一份**造出来 —— 照抄而不是写一个「差不多的」，
 *  因为差异正好可能落在被测的那一点上（`ext` 和 `priority` 都要在）。 */
const PLUG = "com.umbra.svg";
const plugDir = join(STATE, ".umbrastudio", "plugins", PLUG, "1.2.1");
const installPlugin = async () => {
  await mkdir(plugDir, { recursive: true });
  await writeFile(join(plugDir, "manifest.json"), JSON.stringify({
    id: PLUG, name: "SVG 查看", version: "1.2.1", hostApi: "^1",
    surfaces: ["ui"], ui: "index.html",
    permissions: { files: ["read"], scope: "project", net: [] },
    kinds: [{ id: "svg", label: "SVG", icon: "◇", ext: [".svg"], priority: 85 }],
  }), "utf8");
  /* 插件的 A 面：放一个**认得出来的标记** —— 判据要分清「谁画的」，
     而「插件的 iframe 在不在」比「有没有图」更能说明是谁接住了它。 */
  await writeFile(join(plugDir, "index.html"),
    '<!doctype html><meta charset="utf-8"><body style="margin:0;font:12px system-ui"><p id="by-plugin">svg 插件画的</p></body>', "utf8");
};

const { buildProject } = await import(`file://${ROOT}/server/dist/project.js`);
const { serveStart } = await import(`file://${ROOT}/server/dist/serve.js`);
const srv = await serveStart(await buildProject(proj));
const url = `${srv.url.replace(/\/$/, "")}/__app/?token=${encodeURIComponent(srv.token)}`;

const { chromium } = await import(`file://${ROOT}/server/node_modules/playwright-core/index.mjs`);
const br = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
pg.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 200)));
let pass = 0, fail = 0;
const ok = (c, what, d = "") => { if (c) { pass++; console.log(`  ✓ ${what}${d ? " — " + d : ""}`); } else { fail++; console.log(`  ✗ ${what}${d ? " — " + d : ""}`); } };

const openSvg = async () => {
  for (let i = 0; i < 50; i++) { if (await pg.locator('[role="treeitem"]').filter({ hasText: "图标.svg" }).count()) break; await pg.waitForTimeout(300); }
  const row = pg.locator('[role="treeitem"]').filter({ hasText: "图标.svg" }).first();
  if (!(await row.count())) return false;
  await row.click({ timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(2200);
  return true;
};
/** 谁画了它：插件的 A 面 iframe，还是宿主的看图模块。 */
const whoDrew = async () => {
  const byPlugin = await pg.frameLocator('iframe[data-role="body"]').locator("#by-plugin").isVisible().catch(() => false);
  const hostImg = await pg.locator('[data-ud="file-body"] img, img[src*=".svg"]').first().isVisible().catch(() => false);
  return { byPlugin, hostImg };
};

console.log("com.umbra.svg 撞上内置 svg id（端到端）");

/* ══════════ ① 没装插件：宿主看图模块兜住它 ══════════ */
console.log("\n① 没装那个插件时");
await pg.goto(url, { waitUntil: "domcontentloaded" });
await pg.waitForFunction(() => !!window.__UD_APP, null, { timeout: 30000 }).catch(() => {});
await pg.waitForTimeout(2000);
/* ⚠️ **这一条要排在最前面**：`auditKinds()` 找出「声明了 kind 却没有模块认领的」，
   而**新加一种 kind 最容易漏的正是前端那一半**（漏了它会静静落到 `other` 的文件卡上，
   看起来像「这种文件还没做」而真相是「做了一半」）。
   ⚠️ Q84 之后 `svg` **没有专属模块**（看图模块只兜底不认领），所以这条自检
   必须认兜底 —— `kinds/index.ts` 里加了 `!hasFallback(k)`。
   **它为假的话，整件事就是另一个样子了**，所以先钉它。 */
{
  const unclaimed = await pg.evaluate(() => (window.__UD_APP?.auditKinds?.() ?? null));
  ok(unclaimed === null || unclaimed.length === 0,
     "**没有「声明了 kind 却没人认领」的类型**（`svg` 靠兜底，自检要认它）", JSON.stringify(unclaimed));
}
ok(await openSvg(), "打开那份 svg");
{
  /* 树里显示的是 **icon + 文件名**，没有类型名文字 —— 钉 icon：
     `◇` 是矢量图的，`▣` 是栅格图的，`▢` 是 other 兜底的，三个分得开。 */
  const rowTxt = (await pg.locator('[role="treeitem"]').filter({ hasText: "图标.svg" }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ");
  ok(rowTxt.includes("◇"), "**树里的图标是矢量图那一个（◇）**（`▣` = 当成栅格图 · `▢` = 落到 other 兜底）", rowTxt.slice(0, 40));
  const w = await whoDrew();
  /* ⚠️ 这一条是 geek-99 定的甲的核心承诺：**没装插件时它也看得见图**
     （sam 的边界「图片能显示就显示」）。 */
  ok(w.hostImg && !w.byPlugin, "**宿主的看图模块兜住了它**（`FALLBACK: svg → image`，而看图模块并不「认领」svg）", JSON.stringify(w));
  const box = await pg.locator('[data-ud="file-body"] img, img[src*=".svg"]').first().boundingBox().catch(() => null);
  ok(!!box && box.width > 4, "**而且真的画出来了**（不是 0×0 占位）", box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "量不到");
}

/* ══════════ ② 装上插件：由它打开 ══════════ */
console.log("\n② 装上 com.umbra.svg 之后");
await installPlugin();
/* ⚠️ **刷新页面，而不是去调一条「重新扫插件」的路由** —— 核过了，没有那条路由：
   真装插件走的是 `plugin_install`，它内部会调 `registerPluginKinds`。
   而这条判据是**直接往盘上拷插件目录**（模拟「它已经装着」），所以刷新一次就到位。
   ⚠️ 第一版我试调了一个猜的 `plugins_reload`，它回 404 —— 于是**浏览器控制台多了一条
   404，把「控制台干净」那条判据弄红了**。又一次「判据自己制造的噪声」：
   > **一条判据去试一个它已经能查清在不在的东西，那就不是探测，是制造噪声。**
   「装插件时界面当场变」（迟到注册）是另一件事，由别的判据管，不是这一条。 */
await pg.goto(url, { waitUntil: "domcontentloaded" });
await pg.waitForFunction(() => !!window.__UD_APP, null, { timeout: 30000 }).catch(() => {});
/* ⚠️⚠️ **toast 必须在这里抓，不能等打开文件之后** —— 它只活 **3200ms**
   （`ui/Toast.tsx:10`），而「轮询等树刷出来 + 点开 + 等 2200ms」早就超过了。
   第一版我在打开文件之后才查，于是反向验证装回缺陷时**那条判据照旧绿** ——
   而它绿是因为**那条 toast 已经消失了**，不是因为它没出现过。
   > **一条判据去查一个会自己消失的东西，就必须在它还在的时候查。**
   > 否则它测的是「我查得够不够快」，而不是「产品说了没说」。 */
await pg.waitForTimeout(1600);
const attachToast = (await pg.locator('[data-ud="toast"]').allInnerTexts().catch(() => [])).join(" | ");
await pg.waitForTimeout(700);
ok(await openSvg(), "再打开那份 svg");
{
  const w = await whoDrew();
  ok(w.byPlugin, "**装了插件就由插件打开**（它的 A 面 iframe 画出来了）", JSON.stringify(w));
  /* ⚠️ **这一条是整件事的要害**：插件装上时**不许**出现「没能接上」。
     原来宿主看图模块直接认领 `svg`，`register()` 会撞上它当场抛 ——
     而 loader 把那个异常 catch 成「这个插件没能接上」，**服务端看一切正常**。
     ⚠️⚠️ **第一版这条查的是控制台，而它钉不住** —— 反向验证装回「直接认领」之后
     上面那条红了，**这一条照旧绿**。查下去：`loader.ts` 的 catch 是
     `off.push({ id, why })`，**不打控制台**，而 `App.tsx:120` 把它变成一个
     **toast**（`插件 X 没能接上`）。
     > **判据要查产品真正告诉用户的那个地方。**
     > 查错地方的判据在缺陷存在时也绿 —— 而它看起来和一条好判据一模一样。 */
  const failedToAttach = /没能接上/.test(attachToast) || errs.some((e) => /注册了两次|被注册/.test(e));
  ok(!failedToAttach, "**而且没有「这个插件没能接上」那条 toast**（§172.6 那次就是在这里炸的）",
     attachToast.slice(0, 90) || "（没有任何 toast）");
}

/* ══════════ ③ 卸掉插件：退回宿主看图 ══════════ */
console.log("\n③ 卸掉插件之后");
await rm(join(STATE, ".umbrastudio", "plugins", PLUG), { recursive: true, force: true });
await pg.goto(url, { waitUntil: "domcontentloaded" });
await pg.waitForFunction(() => !!window.__UD_APP, null, { timeout: 30000 }).catch(() => {});
await pg.waitForTimeout(2200);
ok(await openSvg(), "第三次打开那份 svg");
{
  const w = await whoDrew();
  /* ⚠️ **「卸了退回看图」是 Q84 选甲（而不是让插件自己定义一个 kind）换来的保证** ——
     插件挂了 / 卸了，用户照样看得到图。 */
  ok(w.hostImg && !w.byPlugin, "**卸了退回宿主看图**，不是变成文件卡或源码", JSON.stringify(w));
}

/* ══════════ ④ 收尾 ══════════ */
console.log("\n④ 收尾");
const realAfter = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;
ok(realBefore === realAfter, "真实的「最近打开」一个字节没碰（全程用临时 STATE_ROOT）");
const real = errs.filter((e) => !/favicon|ERR_ABORTED|attribute d: Expected moveto/i.test(e));
ok(real.length === 0, "控制台没有别的报错", real.slice(0, 2).join(" | "));
await br.close();
try { await srv.stop?.(); } catch { /* 没有 stop 就算了，进程退出会带走它 */ }
await rm(STATE, { recursive: true, force: true });
await rm(proj, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "✓" : "✗"} svg 插件端到端：${pass} 过 / ${fail} 不过`);
process.exit(fail === 0 ? 0 : 1);
