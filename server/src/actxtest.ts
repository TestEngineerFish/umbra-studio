/** A 面 `ctx.limits` 与 A 面范围读的**真实验收**（2026-10-19）。
 *
 *  上一轮这两件只过了类型检查：`Surface.tsx` 每次推 ctx 前取 `plugin_limits`、插件 `umbra.call("read_file", { byteOffset, byteLength })`
 *  经前端 `plugin_call` 进服务端 —— 两头各自有单测，**中间那座桥（真 iframe、真 postMessage、真 HTTP）没人走过**。
 *
 *  这里起真 server（临时状态目录 + 临时项目）+ 真浏览器打开 `/__app/`，装一个现写的夹具插件（A 面），
 *  让插件把收到的每一帧 ctx 和范围读的回包写进自己的 DOM，回归从插件 iframe 里数出来（纪律②：不看截图）。
 *  断言三件：① A 面收到的 ctx 里有 limits 且值跟设置走；② A 面范围读拿到正确的段；③ 改设置后下一帧 ctx 的 limits 变了。
 *
 *  找不到浏览器 / app 没构建时整块跳过并说清楚 —— **不算通过**（同 `bridgetest`）。
 *  跑：npm --prefix app run build（一次）→ npm --prefix server run actxtest
 */
import { mkdtemp, mkdir, writeFile, copyFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-actxtest-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_NO_GIT = "1";
const { TOOL_ROOT, loadProject } = await import("./project.js");
const { PLUGINS_DIR } = await import("./plugin/store.js");
const { findBrowser } = await import("./render.js");
const { serveStart, serveStop, appDistReady } = await import("./serve.js");

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};
const MB = 1048576;

const found = findBrowser();
if (!found || !appDistReady()) {
  console.log(`\n⚠️ ${!found ? "找不到 chromium / Chrome" : "app/dist 没构建（先 npm --prefix app run build）"} —— A 面 ctx / 范围读验收整块跳过。`);
  console.log("   这**不算通过**。\n");
  await rm(STATE, { recursive: true, force: true });
  process.exit(0);
}

/* ── 夹具插件（A 面）：认 .uctx，每收到一帧 ctx 就记下来，并对当前文件做一次范围读 ── */
const ID = "com.umbra.actxfx";
const PDIR = join(PLUGINS_DIR, ID, "0.1.0");
await mkdir(PDIR, { recursive: true });
await writeFile(join(PDIR, "manifest.json"), JSON.stringify({
  id: ID, name: "ctx 夹具", version: "0.1.0", hostApi: "^1", surfaces: ["ui"],
  kinds: [{ id: "uctx", label: "ctx 夹具", icon: "▦", ext: [".uctx"], textual: true }],
  permissions: { files: ["read"], scope: "project", net: [] }, ui: "index.html",
}));
await copyFile(join(TOOL_ROOT, "runtime", "umbra-plugin.js"), join(PDIR, "umbra.js"));
await writeFile(join(PDIR, "index.html"), `<!DOCTYPE html><meta charset="utf-8"><title>ctx 夹具</title>
<body><pre id="ctx">[]</pre><pre id="range">{}</pre><pre id="bad">{}</pre>
<script src="./umbra.js"></script><script src="./app.js"></script></body>`);
await writeFile(join(PDIR, "app.js"), `
var frames = [];
umbra.onContext(async function (c) {
  frames.push({ path: c.path, limits: c.limits === undefined ? "（没有这个字段）" : c.limits });
  document.getElementById("ctx").textContent = JSON.stringify(frames);
  var r = await umbra.call("read_file", { path: c.path, byteOffset: 3, byteLength: 5 });
  var seg = r && r.ok && r.data ? atob(r.data.base64) : null;
  document.getElementById("range").textContent = JSON.stringify({ path: c.path, ok: !!(r && r.ok), seg: seg, range: r && r.data ? r.data.range : null, sha: r && r.data ? ("sha256" in r.data) : null });
  var b = await umbra.call("read_file", { path: c.path, byteOffset: 0, byteLength: 4, encoding: "gbk" });
  document.getElementById("bad").textContent = JSON.stringify({ path: c.path, ok: !!(b && b.ok), code: b && b.errors && b.errors[0] ? b.errors[0].code : null });
});
`);

/* ── 临时项目：两份 .uctx ── */
const projDir = join(STATE, "proj");
await mkdir(projDir, { recursive: true });
await writeFile(join(projDir, "project.json"), JSON.stringify({ name: "actx", title: "A 面 ctx 验收" }));
await writeFile(join(projDir, "甲.uctx"), "0123456789ABCDEF");
await writeFile(join(projDir, "乙.uctx"), "abcdefghijklmnop");
const project = await loadProject(projDir);
const s = await serveStart(project);
const api = (route: string) => `${s.url}__ud/${route}?token=${encodeURIComponent(s.token)}`;
const setLimits = async (patch: Record<string, number>) => (await fetch(api("plugin_limits"), {
  method: "POST", headers: { "content-type": "application/json", origin: s.url.replace(/\/$/, "") }, body: JSON.stringify(patch),
})).json() as Promise<{ ok: boolean }>;

const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ executablePath: found.path });
const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

console.log("\nA 面 ctx.limits 与 A 面范围读（真 server + 真插件 iframe）");
type Frame = { path: string; limits: Record<string, unknown> | string | null };
const body = () => pg.frameLocator('iframe[data-role="body"]');
const readJson = async <T,>(sel: string): Promise<T | null> => {
  try { return JSON.parse((await body().locator(sel).textContent({ timeout: 2000 })) ?? "null") as T; } catch { return null; }
};
/** 轮询等插件 DOM 里出现满足条件的值（不是定时等） */
async function until<T>(sel: string, cond: (v: T) => boolean, ms = 15_000): Promise<T | null> {
  const t0 = Date.now();
  let last: T | null = null;
  while (Date.now() - t0 < ms) {
    last = await readJson<T>(sel);
    if (last !== null && cond(last)) return last;
    await pg.waitForTimeout(200);
  }
  return last;
}
const openFile = async (name: string) => {
  const row = pg.locator('[role="treeitem"]').filter({ hasText: name }).first();
  await row.waitFor({ timeout: 15_000 });
  await row.click();
};

try {
  /* 先改一次设置（非默认值）：A 面第一帧就该带这份，而不是默认值 */
  const set1 = await setLimits({ memoryMB: 300, deadlineSec: 12, binaryReadMaxMB: 20, textReadMaxMB: 3 });
  ok(set1.ok, "改设置（300 MB / 12 秒 / 二进制 20 MB / 文本 3 MB）");
  await pg.goto(`${s.url}__app/?token=${encodeURIComponent(s.token)}`, { waitUntil: "domcontentloaded" });
  /* 字符串形式：server 的 tsconfig 没有 DOM lib（同 bridgetest） */
  await pg.waitForFunction(`document.querySelectorAll('[role="treeitem"]').length > 0`, null, { timeout: 30_000 });

  await openFile("甲.uctx");
  await pg.locator('iframe[data-role="body"]').waitFor({ timeout: 15_000 });
  ok(await pg.locator('iframe[data-role="body"]').count() === 1, ".uctx 交给了夹具插件画（详情区是插件的 iframe）");

  const f1 = await until<Frame[]>("#ctx", (v) => v.some((x) => x.path === "甲.uctx"));
  const l1 = f1?.filter((x) => x.path === "甲.uctx").pop()?.limits as Record<string, unknown> | undefined;
  ok(!!l1 && typeof l1 === "object", "**A 面收到的 ctx 里有 limits**", JSON.stringify(l1 ?? f1));
  ok(!!l1 && l1.memoryBytes === 300 * MB && l1.deadlineMs === 12_000 && l1.binaryReadMax === 20 * MB && l1.textReadMax === 3 * MB && l1.rangeRead === true,
    "**limits 的值跟设置走**（300 MB / 12 000 ms / 20 MB / 文本 3 MB / rangeRead）", JSON.stringify(l1));

  type Range = { path: string; ok: boolean; seg: string | null; range: { byteOffset: number; byteLength: number; size: number; more: boolean } | null; sha: boolean | null };
  const r1 = await until<Range>("#range", (v) => v.path === "甲.uctx");
  ok(!!r1 && r1.ok && r1.seg === "34567", "**A 面 umbra.call(\"read_file\", { byteOffset: 3, byteLength: 5 }) 拿到正确的段**", JSON.stringify(r1));
  ok(!!r1?.range && r1.range.byteOffset === 3 && r1.range.byteLength === 5 && r1.range.size === 16 && r1.range.more === true && r1.sha === false,
    "回包 range = { 3, 5, size 16, more:true }，没有 sha256", JSON.stringify(r1?.range));
  const b1 = await until<{ path: string; ok: boolean; code: string | null }>("#bad", (v) => v.path === "甲.uctx");
  ok(!!b1 && !b1.ok && b1.code === "E_BAD_INPUT", "A 面范围读 + encoding: gbk → E_BAD_INPUT（拒绝而不是悄悄忽略）", JSON.stringify(b1));

  /* 改设置 → 下一帧 ctx（换到另一份文件）带新值 */
  const set2 = await setLimits({ memoryMB: 640, deadlineSec: 45, binaryReadMaxMB: 50, textReadMaxMB: 9 });
  ok(set2.ok, "再改一次设置（640 MB / 45 秒 / 50 MB / 文本 9 MB）");
  await openFile("乙.uctx");
  const f2 = await until<Frame[]>("#ctx", (v) => v.some((x) => x.path === "乙.uctx"));
  const l2 = f2?.filter((x) => x.path === "乙.uctx").pop()?.limits as Record<string, unknown> | undefined;
  ok(!!l2 && l2.memoryBytes === 640 * MB && l2.deadlineMs === 45_000 && l2.binaryReadMax === 50 * MB && l2.textReadMax === 9 * MB,
    "**改设置后下一帧 ctx 的 limits 变了**（不用重开 Studio）", JSON.stringify(l2));
  ok(!!l1 && !!l2 && JSON.stringify(l1) !== JSON.stringify(l2), "前后两帧的 limits 不同（不是缓存了第一次的）");
  const r2 = await until<Range>("#range", (v) => v.path === "乙.uctx");
  ok(!!r2 && r2.ok && r2.seg === "defgh", "换文件后的范围读读的是新文件那一段", JSON.stringify(r2?.seg));

  /* ── 设置页「插件沙箱」：第四项「文本读取上限」在、校验、存、恢复默认（真界面，不只是类型检查）── */
  console.log("\n设置 › 插件沙箱（文本读取上限）");
  const getCfg = async () => ((await (await fetch(api("plugin_limits"))).json()) as { data: { config: Record<string, number> } }).data.config;
  await pg.locator('[role="treeitem"]').filter({ hasText: "乙.uctx" }).first().click();
  /* 走项目菜单的「项目设置…」（⌘, 是壳菜单的快捷键，浏览器里没有） */
  await pg.locator('header button[aria-haspopup="menu"]').first().click();
  await pg.locator('[role="menu"]').getByText("项目设置…").click();
  const sec = pg.locator("section", { has: pg.locator("h3", { hasText: "插件沙箱" }) });
  await sec.waitFor({ timeout: 10_000 }).catch(() => undefined);
  ok(await sec.count() === 1, "项目菜单 › 项目设置… 打开设置，有「插件沙箱」一块");
  ok(await sec.locator('input[type="number"]').count() === 4, "**四项**（内存 / 时限 / 二进制 / 文本）", `${await sec.locator('input[type="number"]').count()} 项`);
  const row = sec.locator("div.flex-col.gap-1", { has: pg.locator("span", { hasText: "文本读取上限" }) });
  const inp = row.locator("input");
  ok(await inp.inputValue().catch(() => "") === "9", "「文本读取上限」显示当前设置 9", await inp.inputValue().catch(() => "（没找到）"));
  ok(/范围 1–64，默认 2/.test(await row.innerText().catch(() => "")), "范围 / 默认值由服务端给（1–64，默认 2）");
  await inp.fill("65"); await inp.press("Enter");
  await pg.waitForTimeout(300);
  ok(/超出范围 1–64/.test(await row.innerText()) && (await getCfg()).textReadMaxMB === 9, "填 65 → 界面拦下（超出范围），盘上不变");
  await inp.fill("5"); await inp.press("Enter");
  let saved = 0;
  for (let i = 0; i < 25 && saved !== 5; i++) { await pg.waitForTimeout(200); saved = (await getCfg()).textReadMaxMB ?? 0; }
  ok(saved === 5, "填 5 回车 → 存上了（plugin_limits 读回 5）", String(saved));
  await sec.locator("button", { hasText: "恢复默认" }).click();
  let c: Record<string, number> = {};
  for (let i = 0; i < 25; i++) { await pg.waitForTimeout(200); c = await getCfg(); if (c.textReadMaxMB === 2 && c.memoryMB === 512) break; }
  ok(c.memoryMB === 512 && c.deadlineSec === 30 && c.binaryReadMaxMB === 100 && c.textReadMaxMB === 2, "「恢复默认」四项都回到出厂值（含文本 2 MB）", JSON.stringify(c));
} finally {
  await browser.close();
  try { serveStop(project.dir); } catch { /* 进程结束时一起走 */ }
  await rm(STATE, { recursive: true, force: true });
}

console.log(`\n${fail === 0 ? "✓" : "✗"} actxtest ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
