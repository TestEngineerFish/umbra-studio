/** 插件沙箱限额的回归（2026-10-19，`plugin/limits.ts`）。
 *
 *  测四件：① 设置读写（默认值 / 读时夹范围 / 写时拒越界）；② runner 真按 init 给的限额跑
 *  （内存、期限、`host.limits`）；③ 宿主那条 RPC 超时 = 期限 + 5 秒；④ 改了设置之后池子里的沙箱被换掉、按新值重开。
 *
 *  ⚠️ 状态目录是临时的（`UMBRASTUDIO_STATE_DIR`，要在 import 核心模块之前设）—— 不碰本机真的 `plugin_limits.json`。
 *  夹具插件也是现写进临时目录的（`realpath` 过：macOS 的 tmpdir 是符号链接，见 `verbtest` 头注）。
 */
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-limitstest-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
const { getPluginLimits, setPluginLimits, getPluginLimitsView, limitsView, DEFAULT_LIMITS } = await import("./plugin/limits.js");
const { PluginSandbox } = await import("./plugin/sandbox.js");
const { allVerbs, invokeVerb, stopAllVerbSandboxes } = await import("./plugin/verbs.js");
const { PLUGINS_DIR } = await import("./plugin/store.js");
const { TEXT_MAX } = await import("./files.js");
const { loadProject } = await import("./project.js");

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};
const MB = 1048576;
const FILE = join(STATE, ".umbrastudio", "plugin_limits.json");

console.log("插件沙箱限额");

/* ══ ① 设置读写 ══ */
{
  const d = await getPluginLimits();
  ok(d.memoryMB === 512 && d.deadlineSec === 30 && d.binaryReadMaxMB === 100 && d.textReadMaxMB === 2, "没文件 → 默认 512 MB / 30 秒 / 100 MB / 文本 2 MB", JSON.stringify(d));
  const v = await getPluginLimitsView();
  ok(v.memoryBytes === 512 * MB && v.deadlineMs === 30_000 && v.binaryReadMax === 100 * MB && v.textReadMax === TEXT_MAX && v.rangeRead === true,
    "派生给插件的那份：字节 / 毫秒、textReadMax 默认 = TEXT_MAX（2 MB）、rangeRead: true", JSON.stringify(v));

  /* 手改坏了的文件：读的时候夹 / 回落，不让插件因为一份坏配置全体起不来 */
  await mkdir(join(STATE, ".umbrastudio"), { recursive: true });
  await writeFile(FILE, JSON.stringify({ memoryMB: 99999, deadlineSec: "很久", binaryReadMaxMB: 3.4, textReadMaxMB: 500 }));
  const c = await getPluginLimits();
  ok(c.memoryMB === 2048 && c.deadlineSec === 30 && c.binaryReadMaxMB === 10 && c.textReadMaxMB === 64, "读：越界夹到范围、非数字回落默认", JSON.stringify(c));
  await writeFile(FILE, "{ 这不是 JSON");
  ok(JSON.stringify(await getPluginLimits()) === JSON.stringify(DEFAULT_LIMITS), "读：坏 JSON → 整份默认");
  await rm(FILE);

  /* 写的时候拒 —— 界面上填 4096 却悄悄存成 2048，用户会以为自己存进去了 */
  const rejects = async (patch: unknown, what: string) => {
    let code = "";
    try { await setPluginLimits(patch); } catch (e) { code = (e as { diagnostic?: { code?: string } }).diagnostic?.code ?? (e as Error).message; }
    ok(code === "E_BAD_INPUT", `写：${what} → E_BAD_INPUT`, code || "没拒");
  };
  await rejects({ memoryMB: 4096 }, "memoryMB 超上限");
  await rejects({ memoryMB: 32 }, "memoryMB 低于下限");
  await rejects({ deadlineSec: 121 }, "deadlineSec 超上限");
  await rejects({ binaryReadMaxMB: 5 }, "binaryReadMaxMB 低于下限");
  await rejects({ deadlineSec: 7.5 }, "不是整数");
  await rejects({ textReadMaxMB: 0 }, "textReadMaxMB 低于下限（1）");
  await rejects({ textReadMaxMB: 65 }, "textReadMaxMB 超上限（64）");
  await rejects({ memoryMB: "512" }, "字符串（门面不跑 zod，类型在这里核）");
  await rejects({ cpu: 4 }, "不认识的键");
  await rejects(null, "不是对象");
  let exists = true;
  try { await readFile(FILE); } catch { exists = false; }
  ok(!exists, "拒了的那几次一个字节都没写盘");

  const n = await setPluginLimits({ memoryMB: 256 });
  ok(n.memoryMB === 256 && n.deadlineSec === 30 && n.binaryReadMaxMB === 100 && n.textReadMaxMB === 2, "写一项，别的原样保留", JSON.stringify(n));
  const t = await setPluginLimits({ textReadMaxMB: 16 });
  ok(t.textReadMaxMB === 16 && (await getPluginLimitsView()).textReadMax === 16 * MB && t.memoryMB === 256,
    "**textReadMaxMB 进设置：写 16 → 派生的 textReadMax = 16 MB**", JSON.stringify(t));
  const disk = JSON.parse(await readFile(FILE, "utf8"));
  ok(disk.memoryMB === 256 && (await getPluginLimits()).memoryMB === 256, "落了盘，下一次现读就是新值");
  await setPluginLimits({ ...DEFAULT_LIMITS });
}

/* ══ ② runner 按 init 给的限额跑 ══ */
const PDIR = join(STATE, "fixture-plugin");
await mkdir(PDIR, { recursive: true });
const manifest = {
  id: "com.umbra.limitsfx", name: "限额夹具", version: "0.1.0", hostApi: "^1",
  surfaces: ["tools"], permissions: { files: ["read"], scope: "project" }, tools: "tools.mjs",
};
await writeFile(join(PDIR, "manifest.json"), JSON.stringify(manifest));
await writeFile(join(PDIR, "tools.mjs"), `
/* 每个进程一个身份：池子被换掉之后它会变 */
const boot = String(Math.random());
export default function register(host) {
  const cap = (name, run) => host.defineCap({ name: "com.umbra.limitsfx." + name, title: name, summary: name, input: {}, free: true, run });
  /* 分配 mb 兆字节并真写进去（只 new 不写的话有的引擎会偷懒） */
  cap("alloc", ({ mb }) => { const b = new Uint8Array(mb * 1048576); for (let i = 0; i < b.length; i += 4096) b[i] = 1; return b.length; });
  cap("spin", ({ ms }) => { const t = Date.now(); while (Date.now() - t < ms) { /* 转 */ } return "转完了"; });
  cap("limits", () => {
    let frozen = false;
    try { host.limits.memoryBytes = 1; } catch { /* 严格模式下改冻住的对象会抛 */ }
    frozen = host.limits.memoryBytes !== 1 && Object.isFrozen(host.limits);
    return { limits: host.limits, frozen, boot };
  });
  /* 慢调用 + 跑完之后回调一次宿主：优雅换池时它在旧进程里，回调要照样通（上下文按进程分） */
  cap("slowhost", async ({ ms }) => {
    const t = Date.now(); while (Date.now() - t < ms) { /* 转 */ }
    const r = await host.call("count_file_types", {});
    return { boot, hostOk: !!(r && r.ok), limits: host.limits };
  });
  /* 永远不 resolve：runner 那头一直在等，只有宿主那条 RPC 超时能让调用方落地 */
  cap("hang", () => new Promise(() => {}));
}
`);
const projDir = join(STATE, "proj");
await mkdir(projDir, { recursive: true });
await writeFile(join(projDir, "project.json"), JSON.stringify({ name: "proj", title: "限额测试" }));
const project = await loadProject(projDir);
const cap = (n: string) => `com.umbra.limitsfx.${n}`;
const errOf = (p: Promise<unknown>) => p.then(() => "", (e) => (e as Error).message);

{
  /* 内存：64 MB 时分配 100 MB 抛 out of memory；512 MB 时同一件照常 */
  const small = new PluginSandbox(manifest as never, PDIR, { limits: limitsView({ memoryMB: 64, deadlineSec: 30, binaryReadMaxMB: 100, textReadMaxMB: 2 }) });
  await small.start();
  const why = await errOf(small.invoke(cap("alloc"), { mb: 100 }, project));
  ok(/out of memory/i.test(why), "**给 64 MB 时分配 100 MB → out of memory**", why.slice(0, 60));
  const tiny = await small.invoke(cap("alloc"), { mb: 8 }, project).catch((e) => (e as Error).message);
  ok(tiny === 8 * MB, "（对照）同一个沙箱里分配 8 MB 照常 —— 拒的是「超了」，不是「坏了」", String(tiny));
  small.stop();

  const big = new PluginSandbox(manifest as never, PDIR, { limits: limitsView({ memoryMB: 512, deadlineSec: 30, binaryReadMaxMB: 100, textReadMaxMB: 2 }) });
  await big.start();
  const got = await big.invoke(cap("alloc"), { mb: 100 }, project).catch((e) => (e as Error).message);
  ok(got === 100 * MB, "**给 512 MB 时分配 100 MB 照常**", String(got));
  big.stop();
}

{
  /* 期限：给 5 秒时 6 秒的死循环被打断；沙箱还活着 */
  const v5 = limitsView({ memoryMB: 128, deadlineSec: 5, binaryReadMaxMB: 100, textReadMaxMB: 2 });
  const sb = new PluginSandbox(manifest as never, PDIR, { limits: v5 });
  await sb.start();
  const t0 = Date.now();
  const why = await errOf(sb.invoke(cap("spin"), { ms: 6000 }, project));
  const ms = Date.now() - t0;
  ok(!!why && ms >= 4500 && ms < 6000, "**给 5 秒时 6 秒的死循环被打断**（在 VM 里，早于 6 秒）", `${ms}ms · ${why.slice(0, 40)}`);
  const lim = await sb.invoke(cap("limits"), {}, project) as { limits: Record<string, unknown>; frozen: boolean };
  ok(JSON.stringify(lim.limits) === JSON.stringify(v5), "**VM 里 `host.limits` 读得到，就是宿主派生的那一份**", JSON.stringify(lim.limits));
  ok(lim.frozen, "`host.limits` 是冻住的快照（插件改不动）");

  /* RPC 超时 = 期限 + 5 秒：插件返回一个永不落地的 promise，只有宿主那条超时兜得住 */
  ok(sb.rpcTimeoutMs === 10_000, "RPC 超时随期限变：5 秒 → 10 秒", String(sb.rpcTimeoutMs));
  const t1 = Date.now();
  const hung = await errOf(sb.invoke(cap("hang"), {}, project));
  const ms1 = Date.now() - t1;
  ok(/超时（10s）/.test(hung) && ms1 >= 9500 && ms1 < 12_000, "**永不返回的调用在 10 秒（不是写死的 15 秒）落地**", `${ms1}ms · ${hung.slice(0, 50)}`);
  /* 超时那一下沙箱被停掉了（#123），下一次调用要能自己重开 */
  const back = await sb.invoke(cap("limits"), {}, project).catch((e) => ({ err: (e as Error).message })) as { limits?: { deadlineMs: number } };
  ok(back.limits?.deadlineMs === 5000, "超时停掉之后下一次调用照常重开，限额不变", JSON.stringify(back).slice(0, 60));
  sb.stop();

  const v30 = new PluginSandbox(manifest as never, PDIR, { limits: limitsView(DEFAULT_LIMITS) });
  await v30.start();
  const done = await v30.invoke(cap("spin"), { ms: 6000 }, project).catch((e) => (e as Error).message);
  ok(done === "转完了" && v30.rpcTimeoutMs === 35_000, "（对照）默认 30 秒时同一个 6 秒循环跑完；RPC 超时 35 秒", String(done));
  v30.stop();
}

{
  /* 不钉限额的沙箱：fork 那一刻现读设置 */
  await setPluginLimits({ deadlineSec: 7, memoryMB: 300 });
  const sb = new PluginSandbox(manifest as never, PDIR);
  await sb.start();
  const r = await sb.invoke(cap("limits"), {}, project) as { limits: { deadlineMs: number; memoryBytes: number; binaryReadMax: number } };
  ok(r.limits.deadlineMs === 7000 && r.limits.memoryBytes === 300 * MB && sb.rpcTimeoutMs === 12_000,
    "不钉限额 = 起进程时现读设置（7 秒 / 300 MB → RPC 12 秒）", JSON.stringify(r.limits));
  sb.stop();
  await setPluginLimits({ ...DEFAULT_LIMITS });
}

/* ══ ④ 改了设置 → 池子里的沙箱被换掉，按新值重开 ══ */
{
  await mkdir(join(PLUGINS_DIR, manifest.id), { recursive: true });
  const { cp } = await import("node:fs/promises");
  await cp(PDIR, join(PLUGINS_DIR, manifest.id, "0.1.0"), { recursive: true });
  const verbs = await allVerbs();
  const v = verbs.find((x) => x.plugin === manifest.id && x.cap === cap("limits"));
  ok(!!v && v.exposed, "夹具插件装进了池子（free 的动词挂出）", v?.tool ?? verbs.map((x) => x.tool).join(" "));
  if (v) {
    const a = await invokeVerb(v.tool, {}, project);
    const da = (a.ok ? a.data : null) as { limits: { deadlineMs: number }; boot: string } | null;
    ok(da?.limits.deadlineMs === 30_000, "改之前：池子里那个沙箱是 30 秒", JSON.stringify(a).slice(0, 80));
    await setPluginLimits({ deadlineSec: 9 });
    const b = await invokeVerb(v.tool, {}, project);
    const db = (b.ok ? b.data : null) as { limits: { deadlineMs: number }; boot: string } | null;
    ok(db?.limits.deadlineMs === 9000, "**setPluginLimits 之后下一次调用就是新限额**（不用重启 Studio）", JSON.stringify(b).slice(0, 80));
    ok(!!da && !!db && da.boot !== db.boot, "而且是换了一个进程（插件模块里的身份变了）", `${da?.boot.slice(0, 6)} → ${db?.boot.slice(0, 6)}`);
    const c = await invokeVerb(v.tool, {}, project);
    ok(c.ok && (c.data as { boot: string }).boot === db?.boot, "之后不再换（只在改设置时重开一次）");
  }
}

/* ══ ⑤ 优雅换池：改设置时正在跑的调用照常返回，下一次调用走新进程、新限额 ══ */
{
  const verbs = await allVerbs();
  const vLim = verbs.find((x) => x.plugin === manifest.id && x.cap === cap("limits"));
  const vSlow = verbs.find((x) => x.plugin === manifest.id && x.cap === cap("slowhost"));
  ok(!!vLim && !!vSlow, "夹具的 limits / slowhost 两件动词都在");
  if (vLim && vSlow) {
    const a = await invokeVerb(vLim.tool, {}, project);
    const boot0 = ((a.ok ? a.data : null) as { boot: string }).boot;
    let slowDone = false;
    const slow = invokeVerb(vSlow.tool, { ms: 2500 }, project).then((r) => { slowDone = true; return r; });
    await new Promise((r) => setTimeout(r, 400));
    await setPluginLimits({ deadlineSec: 11 });
    const n = await invokeVerb(vLim.tool, {}, project);
    const dn = (n.ok ? n.data : null) as { limits: { deadlineMs: number }; boot: string } | null;
    ok(!!dn && dn.limits.deadlineMs === 11_000 && dn.boot !== boot0,
      "**改设置时有慢调用在跑：下一次调用走新进程、新限额（11 秒）**", JSON.stringify(n).slice(0, 90));
    ok(!slowDone, "而且不用等旧进程那一次跑完（新进程另起，两个同时在）");
    const sr = await slow;
    const ds = (sr.ok ? sr.data : null) as { boot: string; hostOk: boolean; limits: { deadlineMs: number } } | null;
    ok(sr.ok && ds?.boot === boot0 && ds.limits.deadlineMs === 9000,
      "**那个慢调用正常返回**（原来会落地成「沙箱被停掉了」）—— 跑在旧进程、旧限额上", JSON.stringify(sr).slice(0, 120));
    ok(ds?.hostOk === true, "旧进程跑完后回调宿主（count_file_types）照样通 —— 上下文按进程分，没被新调用顶掉");
    const again = await invokeVerb(vLim.tool, {}, project);
    ok(again.ok && ((again.ok ? again.data : null) as { boot: string }).boot === dn?.boot, "之后的调用都在新进程上");
  }
}

{
  /* 直接对 PluginSandbox：退役进程手上有活时留着，活落地就退；手上没活的当场退 */
  const sb = new PluginSandbox(manifest as never, PDIR, { limits: limitsView({ ...DEFAULT_LIMITS, deadlineSec: 5 }) });
  await sb.start();
  const b0 = ((await sb.invoke(cap("limits"), {}, project)) as { boot: string }).boot;
  const slow = sb.invoke(cap("spin"), { ms: 1500 }, project);
  await new Promise((r) => setTimeout(r, 200));
  sb.retire();
  ok(sb.drainingCount === 1, "retire：手上有调用的旧进程进退役名单，不当场杀", String(sb.drainingCount));
  const b1 = ((await sb.invoke(cap("limits"), {}, project)) as { boot: string }).boot;
  ok(b1 !== b0, "retire 之后的调用起了新进程");
  ok(await slow.catch((e) => (e as Error).message) === "转完了", "退役进程手上那一次照常跑完");
  await new Promise((r) => setTimeout(r, 300));
  ok(sb.drainingCount === 0, "活落地之后旧进程退掉了", String(sb.drainingCount));
  sb.retire();
  ok(sb.drainingCount === 0, "手上没活的进程 retire 当场退");
  /* 退役进程卡死：到它自己的 RPC 超时（期限 5 秒 + 5 秒）就不等了，不会永远挂着 */
  await sb.start();
  const t0 = Date.now();
  const hung = sb.invoke(cap("hang"), {}, project).catch((e) => (e as Error).message);
  await new Promise((r) => setTimeout(r, 200));
  sb.retire();
  const why = await hung;
  ok(/超时（10s）/.test(String(why)) && Date.now() - t0 < 12_000 && sb.drainingCount === 0,
    "**退役进程卡死：到它自己的时限（10 秒）落地并退掉**", `${Date.now() - t0}ms · ${String(why).slice(0, 40)}`);
  sb.stop();
}

stopAllVerbSandboxes();
await rm(STATE, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "✓" : "✗"} limitstest ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
