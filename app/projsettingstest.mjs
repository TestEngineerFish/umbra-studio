/** **「项目设置」那一屏改成原生之后的界面回归**（M16-6，2026-10-23）。
 *
 *  ⚠️ **为什么必须真开浏览器**：这一屏原来是一个 iframe（`S8-项目设置.dc.html?embed=1`），
 *  M16-6 把它搬成三块原生 React。而「搬对了没有」**服务端判据一条都测不到** ——
 *  七件能力早就在、也早就够得着（我动手前核过），缺的从来是界面那一半。
 *  §170.4 那条就是现成的教训：功能全做完、判据全绿，真开浏览器一看
 *  **设置页的邮箱和密码两个输入框完全看不见**（`border: 0` + 白底画在白底弹窗上）。
 *  > **DOM 判据说元素在、功能判据说能用、类型系统说 props 没错 ——
 *  > 只有一个人看一眼才看得出来。**
 *
 *  ⚠️ **自带服务 + 临时 `STATE_ROOT`**，理由不是省事，是**安全**：
 *  这一屏有「危险操作」，而归档 / 删除会**真的搬项目目录**
 *  （落点是 `STATE_ROOT/.archived/`，`project.ts:965`）。用临时 `STATE_ROOT`
 *  就保证它搬不到真东西上，收尾一起删掉。
 *
 *  ⚠️ **三块只在「有项目」时出现**，所以「三块在」本身就证明打开的是**工作台的**设置弹窗
 *  而不是首页那个 —— §171.7 栽过：点项目菜单那一下其实是**导航**，
 *  于是测的是首页的设置面板（那个块在首页也画），**全绿而测错了地方**。
 *
 *  用法：`npm --prefix app run projsettingstest`
 */
import { mkdtemp, mkdir, writeFile, rm, realpath, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-projset-state-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_NO_GIT = "1";

const realWorkspace = join(process.env.HOME ?? "", "Library", "Application Support", "Umbra Studio", ".umbrastudio", "workspace.json");
const realBefore = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;

const proj = await realpath(await mkdtemp(join(tmpdir(), "umbra-projset-proj-")));
await writeFile(join(proj, "project.json"), JSON.stringify({ name: "设置判据", title: "原来的标题" }));
await writeFile(join(proj, "留着的.md"), "# 不动它\n");
await writeFile(join(proj, "要删的.md"), "# 这份会进回收站\n");

const { buildProject } = await import(`file://${ROOT}/server/dist/project.js`);
const { serveStart } = await import(`file://${ROOT}/server/dist/serve.js`);
const srv = await serveStart(await buildProject(proj));
const url = `${srv.url.replace(/\/$/, "")}/__app/?token=${encodeURIComponent(srv.token)}`;

const { chromium } = await import(`file://${ROOT}/server/node_modules/playwright-core/index.mjs`);
const br = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const pg = await br.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
pg.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 200)));
/* ⚠️ **把 4xx 的「哪一个请求」抓出来** —— 「Failed to load resource: 400」这句话
   本身不说是谁，而「控制台干净」那条判据红了之后，没有这个就无从下手
   （uitest 为此专门留了 `bad4xx`）。 */
const bad4xx = [];
pg.on("response", (r) => { if (r.status() >= 400) bad4xx.push(`${r.status()} ${r.url().replace(/token=[^&]*/, "token=…").slice(-90)}`); });
let pass = 0, fail = 0;
const ok = (c, what, d = "") => { if (c) { pass++; console.log(`  ✓ ${what}${d ? " — " + d : ""}`); } else { fail++; console.log(`  ✗ ${what}${d ? " — " + d : ""}`); } };

/** 打开设置弹窗。⚠️ 走项目菜单，**不按 `⌘,`** —— uitest 实测那个快捷键在这里打不开。 */
const openSettings = async () => {
  await pg.locator('button[aria-haspopup="menu"]').first().click({ timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(400);
  await pg.locator('[role="menu"]').getByText("项目设置…").click({ timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(1200);
};
/** 一个元素**真的看得见**（不是只在 DOM 里）—— §165 那条：
 *  「在不在 DOM 里 / 看不看得见 / 碰不碰得到是三个不同的问题，而用户关心第三个」。 */
const reachable = async (sel) => {
  const l = pg.locator(sel).first();
  if (!(await l.count())) return false;
  return await l.click({ trial: true, timeout: 3000 }).then(() => true).catch(() => false);
};

await pg.goto(url, { waitUntil: "domcontentloaded" });
await pg.waitForFunction(() => !!window.__UD_APP, null, { timeout: 30000 }).catch(() => {});
await pg.waitForTimeout(2200);

console.log("项目设置那一屏（M16-6）");

/* ══════════ ① 前提：打开的是工作台的设置，而且三块都在 ══════════ */
console.log("\n① 前提：三块都在（它们只在有项目时出现，所以这也证明打开的不是首页那个设置）");
await openSettings();
const nBasic = await pg.locator('[data-ud="proj-basic"]').count();
const nTrash = await pg.locator('[data-ud="proj-trash"]').count();
const nDanger = await pg.locator('[data-ud="proj-danger"]').count();
ok(nBasic === 1 && nTrash === 1 && nDanger === 1,
   "**基本信息 / 回收站 / 危险操作三块都在**", `${nBasic} / ${nTrash} / ${nDanger}`);
/* ⚠️ **而那两块要确认它们不在** —— geek-99 定甲：入口直接去掉。
   少了这一条，「只实现三块」和「五块都实现了」在读数里长得一样。 */
const bodyTxt = (await pg.locator('[role="dialog"], [data-ud="sheet"]').first().innerText().catch(() => "")) || (await pg.locator("body").innerText());
ok(!/设计系统浏览器|@ds|元素数限额/.test(bodyTxt),
   "**设计系统 / 元素数限额两块的入口没了**（Q84…不，M16-6 定甲 —— 它们在 M16-7 之后没有对象）");
/* ⚠️ 原来那个 iframe 要确认真的去掉了，不然会出现「新三块画出来了而老 iframe 还在下面」 */
ok(await pg.locator('iframe[title="项目设置"]').count() === 0, "**原来那个 S8 的 iframe 没了**（不是三块画在它上面）");

/* ══════════ ② 基本信息：改标题 ══════════ */
console.log("\n② 基本信息");
ok(await reachable('[data-ud="proj-title"]'), "**标题输入框碰得到**（§170.4：看不见的输入框 DOM 判据也说「在」）");
const nameRO = await pg.locator('[data-ud="proj-basic"] input').first().isEditable().catch(() => true);
ok(!nameRO, "项目名那一格是只读的（目录名决定它）");
await pg.locator('[data-ud="proj-title"]').fill("改过的标题");
await pg.waitForTimeout(300);
ok(await reachable('[data-ud="proj-title-save"]'), "有改动之后「保存标题」能点");
await pg.locator('[data-ud="proj-title-save"]').click({ timeout: 8000 }).catch(() => {});
await pg.waitForTimeout(1200);
/* ⚠️ **把 toast 抓出来** —— 产品已经把失败原因放在那里了（`toast("没存上", …)`）。
   不抓的话「标题没存上」这条红只告诉我「没存上」，不告诉我**为什么**。 */
const saveToast = (await pg.locator('[data-ud="toast"]').allInnerTexts().catch(() => [])).join(" | ");
if (saveToast) console.log(`  · 保存时的 toast：${saveToast.replace(/\s+/g, " ").slice(0, 120)}`);
await pg.waitForTimeout(600);
/* ⚠️ **去服务端读回来**，不看界面 —— 界面可能只是本地 state 变了而没存上。 */
const savedTitle = await pg.evaluate(async () => {
  const a = window.__UD_APP;
  const u = (x) => `${a.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(a.token)}`;
  return (await (await fetch(u("project_settings"))).json()).data?.title ?? null;
});
ok(savedTitle === "改过的标题", "**标题真存进服务端了**（读回来对账，不看界面上显示什么）", String(savedTitle));

/* ══════════ ③ 回收站 ══════════ */
console.log("\n③ 回收站");
/* 先造一项：删掉那份 `.md`（走 `trash_file`，就是用户在树里删文件走的那条路） */
const trashed = await pg.evaluate(async () => {
  const a = window.__UD_APP;
  const u = (x) => `${a.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(a.token)}`;
  const r = await fetch(u("file_trash"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "要删的.md" }) });
  return (await r.json()).ok;
});
ok(trashed, "造一项：把「要删的.md」删进回收站（走 `file_trash`）");
/* 设置弹窗要重开一次才会重新读 —— `get_project` 是打开时读的 */
await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
await openSettings();
{
  const list = pg.locator('[data-ud="trash-list"] li');
  const n = await list.count();
  ok(n === 1, "**回收站里列出那一项**", `${n} 项`);
  const txt = (await list.first().innerText().catch(() => "")).replace(/\s+/g, " ");
  ok(txt.includes("要删的.md"), "写出原来的文件名", txt.slice(0, 50));
  /* ⚠️⚠️ **这一条第一版是黑名单，而黑名单漏了东西。**
     我写的是 `!/undefined|NaN/`，于是界面上明明写着「删于 **Invalid Date**」而它照旧绿 ——
     因为 `Invalid Date` 不在我列的那两个词里。
     > 这是 M14-3 那条「**安全线是白名单不是黑名单**」在判据层的翻版：
     > 列「不许出现什么」只能挡住我想到的那几种。
     改成**白名单**：断言它是一个**合法的相对时间说法**（`timeAgo` 的输出集合）。 */
  ok(/删于\s*(刚刚|\d+\s*(分钟|小时|天)前|\d{4}\/\d{1,2}\/\d{1,2})/.test(txt),
     "**写出什么时候删的，而且是一句人话**（白名单：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期）", txt.slice(0, 54));
  /* 原稿有 `{{ item.size }}` 而 `listTrash` 真实返回的四个字段里没有 size ——
     画一个取不到的字段，界面上就是一个 `undefined`。这一条留着当第二道。 */
  ok(!/undefined|NaN|Invalid/.test(txt), "而且整行没有 `undefined` / `Invalid`", txt.slice(0, 54));
  /* 恢复 */
  await list.first().locator('button:has-text("恢复")').click({ timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  const back = await pg.evaluate(async () => {
    const a = window.__UD_APP;
    const u = (x) => `${a.url.replace(/\/$/, "")}/__ud/${x}${x.includes("?") ? "&" : "?"}token=${encodeURIComponent(a.token)}`;
    /* ⚠️ **不传空的 `dir=`** —— 服务端拒它（400），而那条 400 会进浏览器控制台，
       把「控制台干净」那条判据弄红。又一次判据自己制造的噪声。
       项目根就是不带这个参数。 */
    const ls = await (await fetch(u("files"))).json();
    return (ls.data?.entries ?? []).some((e) => e.name === "要删的.md");
  });
  ok(back, "**点「恢复」真的把文件放回去了**（去服务端的文件列表里查，不看界面）");
}

/* ══════════ ④ 危险操作 ══════════ */
console.log("\n④ 危险操作");
{
  for (const [key, label] of [["rename", "重命名项目"], ["move", "移动项目"], ["archive", "归档项目"], ["delete", "删除项目"]]) {
    ok(await pg.locator(`[data-ud="danger-${key}"]`).count() === 1, `「${label}」那一项在`);
  }
  /* ⚠️ **灰掉而不是藏起来，而且写了出路** —— 这两件后端压根没有能力。
     §100：**看起来能用但其实是假的，比明说还没做糟得多**；
     而藏起来又会让用户以为「这个功能不该有」，于是去别处找。 */
  for (const key of ["rename", "move"]) {
    const btn = pg.locator(`[data-ud="danger-${key}"] button`).first();
    ok(await btn.isDisabled().catch(() => false), `「${key}」那颗钮是灰的（后端没有这个操作）`);
    const t = (await pg.locator(`[data-ud="danger-${key}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(/后端还没有这个操作/.test(t) && /(文件管理器|基本信息)/.test(t),
       `**而且说了「还没有」并给了出路**（不是一颗没人知道为什么点不动的灰钮）`, t.slice(0, 56));
  }
  /* 删除：要敲项目名才放行 */
  await pg.locator('[data-ud="danger-delete"] button').first().click({ timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(400);
  const go = pg.locator('[data-ud="danger-go-delete"]');
  ok(await go.count() === 1, "点「删除」先出确认框，不直接动手");
  ok(await go.isDisabled().catch(() => false), "**没敲项目名时放行按钮是灰的**（防手滑）");
  /* ⚠️ 按钮文案要是「确认移走」而不是「确认删除」—— `delete_project` 的 summary
     自己写着「实际上也是移到 .archived/ —— 我们不真删用户的目录」。
     > **一个说「删除」而其实没删的按钮，会让人以为自己已经清理掉了。** */
  ok(/确认移走/.test(await go.innerText().catch(() => "")),
     "**放行按钮写「确认移走」不是「确认删除」**（它实际上是归档，不真删）", await go.innerText().catch(() => ""));
  const dtxt = (await pg.locator('[data-ud="danger-delete"]').innerText().catch(() => "")).replace(/\s+/g, " ");
  ok(/归档|\.archived/.test(dtxt), "**而且正文里就说清了「删除」其实是归档**", dtxt.slice(0, 60));
  /* 敲对了就放行 */
  await pg.locator('[data-ud="danger-typed"]').fill("设置判据");
  await pg.waitForTimeout(300);
  ok(!(await go.isDisabled().catch(() => true)), "敲对项目名之后才能点");
  /* ⚠️ 敲**错**的也要试一次 —— 少了这一条，「敲对了能点」可能只是因为「随便敲点什么都能点」 */
  await pg.locator('[data-ud="danger-typed"]').fill("设置判据x");
  await pg.waitForTimeout(300);
  ok(await go.isDisabled().catch(() => false), "**敲错一个字就又灰回去**（否则上一条可能只是「随便敲都能点」）");
}

/* ══════════ ⑤ 真点一次归档：它会动目录，所以放最后 ══════════ */
console.log("\n⑤ 真归档一次（落点是临时 STATE_ROOT/.archived/，碰不到真东西）");
await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
await openSettings();
await pg.locator('[data-ud="danger-archive"] button').first().click({ timeout: 8000 }).catch(() => {});
await pg.waitForTimeout(400);
await pg.locator('[data-ud="danger-go-archive"]').click({ timeout: 8000 }).catch(() => {});
await pg.waitForTimeout(2500);
{
  const archived = join(STATE, ".archived");
  const names = existsSync(archived) ? await readdir(archived) : [];
  ok(names.length === 1, "**项目目录真的搬进了 `.archived/`**", names.join(" ") || "空的");
  ok(!existsSync(join(proj, "project.json")), "**而原来那个位置空了**（是搬走不是复制）");
  /* ⚠️ 归档的承诺是「目录还在，手动搬回来就能恢复」—— 所以那份稿要还在新位置 */
  const inner = names.length ? await readdir(join(archived, names[0])) : [];
  ok(inner.includes("留着的.md"), "**文件随目录一起搬过去了，没销毁**（归档的承诺就是这个）", inner.join(" "));
  /* ⚠️⚠️ **这一条是实测抓出来的那个缺口**：稿里写着「归档后这个项目会**从应用里关闭**」，
     而我第一版把成功回调接成了 `onClose`（**关设置弹窗**）—— 于是工作台还开着一个
     已经不在盘上的项目，继续请求 `drafts` → **400**。
     > 一个回调叫 `onClosed`，而「关什么」有两个可能的答案 ——
     > **我接了手边那个，没问它该是哪个。**
     钉法是**回到首页**（没有别的项目开着时就该是首页），而不是查某个内部状态。 */
  await pg.waitForTimeout(1500);
  const backHome = await pg.locator('[data-ud="home"], text=还没有项目').first().isVisible().catch(() => false)
    || (await pg.locator('[role="treeitem"]').count()) === 0;
  ok(backHome, "**归档之后这个项目真的从应用里关闭了**（稿里明说的承诺；没关掉的话它会继续请求一个不存在的项目 → 400）");
}

/* ══════════ ⑥ 收尾 ══════════ */
console.log("\n⑥ 收尾");
const realAfter = existsSync(realWorkspace) ? readFileSync(realWorkspace, "utf8") : null;
ok(realBefore === realAfter, "真实的「最近打开」一个字节没碰");
const real = errs.filter((e) => !/favicon|ERR_ABORTED|attribute d: Expected moveto/i.test(e));
ok(real.length === 0, "控制台没有报错", real.slice(0, 2).join(" | "));
ok(bad4xx.length === 0, "**没有 4xx 请求**（有的话把是哪一个打出来 —— 不然「400」这句话无从下手）",
   [...new Set(bad4xx)].slice(0, 3).join(" · "));
await br.close();
try { await srv.stop?.(); } catch { /* 进程退出会带走它 */ }
await rm(STATE, { recursive: true, force: true });
await rm(proj, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "✓" : "✗"} 项目设置三块：${pass} 过 / ${fail} 不过`);
process.exit(fail === 0 ? 0 : 1);
