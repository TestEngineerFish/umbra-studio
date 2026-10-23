/** **`.dc.html` 不再是设计稿之后，打开它会怎样**（M16-7a，2026-10-23）。
 *
 *  sam 定的产品边界（Q82 = C3）：设计稿那一整套删掉，`.dc.html` 只留预览。
 *  这一套钉的是**用户看得见的那一半**：
 *  · 没装插件 → 看**源码**（纯文本），而不是文件卡、不是白屏、不是「打不开」
 *  · 装了 `com.umbra.html` → 能预览（那是 C3 给的出路）
 *  · 走第二条写入口改得动、挪得动，而且留快照
 *
 *  ⚠️ **为什么服务端判据不够**：`kindtest` 能钉「`.dc.html` 的 kind 是 `html`」，
 *  但钉不住「**打开它真的看得见源码**」—— 前端那一半是 `kinds/index.ts` 的
 *  注册表里有没有 dc 模块、以及 `html` 落到哪个模块。
 *  漏了的话它会静静落到 `other` 的文件卡上，**看起来像「这种文件还没做」**。
 *
 *  ⚠️ **自带服务 + 临时 `STATE_ROOT`**：要装 / 卸插件，而那会动 `STATE_ROOT`。
 *  用法：`npm --prefix app run dcgonetest`
 */
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-dcgone-state-")));
const EMPTY_BUNDLED = join(STATE, "没有出厂插件");
await mkdir(EMPTY_BUNDLED, { recursive: true });
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_BUNDLED_DIR = EMPTY_BUNDLED;
process.env.UMBRASTUDIO_NO_GIT = "1";

const realWorkspace = join(process.env.HOME ?? "", "Library", "Application Support", "Umbra Studio", ".umbrastudio", "workspace.json");
const realBefore = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;

const proj = await realpath(await mkdtemp(join(tmpdir(), "umbra-dcgone-proj-")));
await writeFile(join(proj, "project.json"), JSON.stringify({ name: "dc没了", title: "dc没了" }));
/** 一份**真的像稿**的 `.dc.html`：带 `<x-dc>`、带 support.js 引用、带一个洞。
 *  ⚠️ 用真实形状而不是 `<p>hi</p>` —— 差异正好可能落在被测的那一点上
 *  （比如「稿里有 `{{ }}` 会不会让纯文本显示出问题」）。 */
const DC = `<!DOCTYPE html>
<html><head><script src="./support.js"></script></head>
<body><x-dc><h1 data-ud-node="n1">标题</h1><p>{{ 洞 }}</p></x-dc></body></html>
`;
await writeFile(join(proj, "首页.dc.html"), DC);

const { buildProject } = await import(`file://${ROOT}/server/dist/project.js`);
const { serveStart } = await import(`file://${ROOT}/server/dist/serve.js`);
const srv = await serveStart(await buildProject(proj));
const url = `${srv.url.replace(/\/$/, "")}/__app/?token=${encodeURIComponent(srv.token)}`;

const { chromium } = await import(`file://${ROOT}/server/node_modules/playwright-core/index.mjs`);
const br = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
const bad4xx = [];
pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
pg.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 200)));
pg.on("response", (r) => { if (r.status() >= 400) bad4xx.push(`${r.status()} ${r.url().replace(/token=[^&]*/, "token=…").slice(-80)}`); });
let pass = 0, fail = 0;
const ok = (c, what, d = "") => { if (c) { pass++; console.log(`  ✓ ${what}${d ? " — " + d : ""}`); } else { fail++; console.log(`  ✗ ${what}${d ? " — " + d : ""}`); } };

const openDc = async () => {
  for (let i = 0; i < 50; i++) { if (await pg.locator('[role="treeitem"]').filter({ hasText: "首页.dc.html" }).count()) break; await pg.waitForTimeout(300); }
  const row = pg.locator('[role="treeitem"]').filter({ hasText: "首页.dc.html" }).first();
  if (!(await row.count())) return null;
  await row.click({ timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  return row;
};

await pg.goto(url, { waitUntil: "domcontentloaded" });
await pg.waitForFunction(() => !!window.__UD_APP, null, { timeout: 30000 }).catch(() => {});
await pg.waitForTimeout(2200);

console.log(".dc.html 不再是设计稿（M16-7a / C3）");

/* ══════════ ① 前提：注册表里没有 dc 模块，而也没有「没人认领」的 kind ══════════ */
console.log("\n① 前提");
/* ⚠️⚠️ **「没有没人认领的 kind」这一条判据钉不住，照实说。**
 *
 *  第一版我写的是 `window.__UD_APP?.auditKinds?.() ?? null` 然后 `null 也算通过` ——
 *  **两层都是假的**：
 *  ① `__UD_APP` 是**服务端注进页面的启动数据**（`serve.ts`），字段只有
 *     `url` / `token` / `dir` —— 它没有 `auditKinds`，取到的永远是 `undefined`；
 *  ② 就算取到了也没用：`auditKindsOrThrow` 开头是 `if (!import.meta.env.DEV) return;`
 *     —— 它**只在 `npm run dev` 时生效**，而判据跑的是 `npm run build` 的产物。
 *  > `?? null` 加上「null 也算通过」，等于**给一个取不到的东西发了一张通行证**。
 *
 *  而这件事在生产里**本来就测不到**：没人认领的 kind 会静静回落到通用文件卡，
 *  而那和「这种类型本来就该落文件卡」**长得一样**
 *  （`auditKindsOrThrow` 的注释自己写着「看起来只是『这种文件还没做』，
 *  而真相是『做了一半』」）。
 *  所以这里**不留那条判据** —— 真正该钉的是下面那条：**正文看得见**。
 *  那是用户关心的那件事，而且它在落错模块时会红。 */
{
  /* 前端算出来的 kind：**从服务端那一面问**（`list_files` 给的 `kind` 就是它），
     而不是指望页面上挂着一个 `kindOf`。 */
  const k = await pg.evaluate(async () => {
    const a = window.__UD_APP;
    const u = (x) => `${a.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(a.token)}`;
    const ls = await (await fetch(u("files"))).json();
    return (ls.data?.entries ?? []).find((e) => e.name === "首页.dc.html")?.kind ?? null;
  });
  ok(k === "html", "**它的 kind 是 `html`**（前后端同一份表，`list_files` 给的就是它）", String(k));
}

/* ══════════ ② 没装插件：看源码 ══════════ */
console.log("\n② 没装任何插件时打开它");
const row = await openDc();
ok(!!row, "树里有它，点得开");
{
  /* ⚠️ 树里的图标要是 `html` 那一个（`◻`），不是 dc 的 `◧`、也不是 other 的 `▢` */
  const rowTxt = (await row?.innerText().catch(() => "") ?? "").replace(/\s+/g, " ");
  ok(rowTxt.includes("◻"), "**树里的图标是网页那一个（◻）**（`◧` = 还当设计稿 · `▢` = 落到 other 兜底）", rowTxt.slice(0, 40));
  /* ⚠️⚠️ **这一条是整件事的核心承诺**：看得见**正文**。
     没装插件时它该落到通用兜底（纯文本），而正文要真的在页面上。
     钉「页面上出现稿里那一行字」而不是「有个 pre 元素」——
     §165 那条：在不在 DOM / 看不看得见 / 碰不碰得到是三个不同的问题。 */
  /* ⚠️ 选择器是 `[data-ud="fallback-text"]`（`fallback-card.tsx:71` 那个 `<pre>`）。
     第一版我写了 `[data-ud="file-body"]` —— **全仓零命中，我凭印象编了一个**。
     而那条判据因此红了，报的是「看不见源码」—— **指向产品，而错在判据**。 */
  const pre = pg.locator('[data-ud="fallback-text"]').first();
  ok(await pre.count() > 0, "**落到通用文件卡的纯文本那一档**（`html` 没有前端模块，回落到 `other`）");
  const shown = (await pre.innerText().catch(() => "")) || "";
  ok(/<x-dc>|data-ud-node|support\.js/.test(shown),
     "**看得见源码**（稿里那几行真的出现在页面上，不是空白、不是「打不开」）", shown.replace(/\s+/g, " ").slice(0, 70));
  ok(await pre.isVisible().catch(() => false), "而且那一段真的可见（不是高度 0 / 被裁掉）");
  /* ⚠️ **反面**：不许还画出 dc 的画布。那是「摘掉注册」有没有生效的直接证据。 */
  const canvas = await pg.locator('[data-ud="dc-canvas"], [data-ud="addr-bar"], [data-ud="pins"]').count();
  ok(canvas === 0, "**而且没有 dc 的画布 / 地址栏 / 评论钉**（摘掉注册真的生效了）", `${canvas} 个`);
}

/* ══════════ ③ 走第二条写入口：改得动、挪得动、留快照 ══════════ */
console.log("\n③ 它现在是一份普通文件");
{
  const r = await pg.evaluate(async () => {
    const a = window.__UD_APP;
    const u = (x) => `${a.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(a.token)}`;
    const rd = await (await fetch(u("file?path=" + encodeURIComponent("首页.dc.html")))).json();
    const sha = rd.data?.sha256;
    const w = await (await fetch(u("file_write"), { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "首页.dc.html", content: "<!doctype html><p>改过了</p>\n", expectSha256: sha }) })).json();
    const vs = await (await fetch(u("file_versions?path=" + encodeURIComponent("首页.dc.html")))).json();
    const mv = await (await fetch(u("file_move"), { method: "POST", headers: { "content-type": "application/json" },
      /* ⚠️ 入参是 `{ from, to }` 不是 `{ path, to }` —— 第一版写错了，
         服务端回 400 `Cannot read properties of undefined (reading 'split')`，
         而那条 400 还把「控制台干净」和「没有 4xx」两条判据一起弄红。 */
      body: JSON.stringify({ from: "首页.dc.html", to: "挪过的.dc.html" }) })).json();
    /* ⚠️ **挪完挪回去。**
       不挪回去的话，下一节刷新页面时前端会按「上次打开的文件」（`us.lastDraft.<dir>`）
       去请求 `首页.dc.html` —— 而它已经不在了 → **一条 400 进控制台**，
       把「控制台干净」和「没有 4xx」两条判据弄红。
       > 那是**判据自己造的状态**，不是产品的毛病（而「上次打开的文件不在了会发一条 400」
       > 是既存行为，和 C3 无关，另记）。 */
    const back = await (await fetch(u("file_move"), { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "挪过的.dc.html", to: "首页.dc.html" }) })).json();
    return { readOk: !!rd.data?.content, hasSha: !!sha, wrote: w.ok, nVers: (vs.data?.snapshots ?? []).length,
             moved: mv.ok && back.ok, wErr: w.errors?.[0]?.message, mErr: mv.errors?.[0]?.message ?? back.errors?.[0]?.message };
  });
  ok(r.readOk && r.hasSha, "**读得到正文和 sha256**（它是文本）");
  ok(r.wrote, "**走 `write_file` 改得动**（原来这条路拒它并指向 `write_draft`）", r.wErr ?? "");
  ok(r.nVers >= 1, "**而且留了快照**（历史那一层对任何文件都成立）", `${r.nVers} 版`);
  ok(r.moved, "**走 `move_file` 挪得动**（原来这条路也拒它；挪过去再挪回来，不给下一节留状态）", r.mErr ?? "");
}

/* ══════════ ④ 装上 html 插件：能预览（C3 给的出路）══════════ */
console.log("\n④ 装上网页预览插件之后");
{
  const dir = join(STATE, ".umbrastudio", "plugins", "com.umbra.html", "1.2.0");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify({
    id: "com.umbra.html", name: "网页预览", version: "1.2.0", hostApi: "^1",
    surfaces: ["ui"], ui: "index.html",
    permissions: { files: ["read"], scope: "project", net: [] },
    kinds: [{ id: "html", label: "网页", icon: "◻" }],
  }), "utf8");
  await writeFile(join(dir, "index.html"), '<!doctype html><meta charset="utf-8"><body><p id="by-html-plugin">网页插件画的</p></body>', "utf8");
  await pg.goto(url, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__UD_APP, null, { timeout: 30000 }).catch(() => {});
  await pg.waitForTimeout(1600);
  const toast = (await pg.locator('[data-ud="toast"]').allInnerTexts().catch(() => [])).join(" | ");
  ok(!/没能接上/.test(toast), "插件接上了（没有「没能接上」那条 toast）", toast.slice(0, 70) || "（没有任何 toast）");
  await pg.waitForTimeout(600);
  await openDc();
  const byPlugin = await pg.frameLocator('iframe[data-role="body"]').locator("#by-html-plugin").isVisible().catch(() => false);
  ok(byPlugin, "**装了网页预览插件就由它打开 `.dc.html`** —— 这是 C3 给的那条出路");
}

/* ══════════ ⑤ 收尾 ══════════ */
console.log("\n⑤ 收尾");
const realAfter = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;
ok(realBefore === realAfter, "真实的「最近打开」一个字节没碰");
const real = errs.filter((e) => !/favicon|ERR_ABORTED|attribute d: Expected moveto/i.test(e));
ok(real.length === 0, "控制台没有报错", real.slice(0, 2).join(" | "));
ok(bad4xx.length === 0, "没有 4xx 请求", [...new Set(bad4xx)].slice(0, 3).join(" · "));
await br.close();
try { await srv.stop?.(); } catch { /* 进程退出会带走它 */ }
await rm(STATE, { recursive: true, force: true });
await rm(proj, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "✓" : "✗"} .dc.html 不再是设计稿：${pass} 过 / ${fail} 不过`);
process.exit(fail === 0 ? 0 : 1);
