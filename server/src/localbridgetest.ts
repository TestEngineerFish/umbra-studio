/** 本机桥接回归（2026-10-30，契约 `doc/S8` §八）。
 *
 *  **一条真 SketchUp 都不起** —— 对端是一个 node `net` 的假服务，按同一套帧协议说话。
 *  握手文件写进临时目录（`UMBRA_LOCAL_DIR`），授权标记写进临时状态目录
 *  （`UMBRASTUDIO_STATE_DIR`，**要在 import 核心模块之前设**）。
 *
 *  跑：`npm --prefix server run localbridgetest`
 *
 *  ⚠️ **为什么不塞进 `plugintest`**：那一套跑在**真 `STATE_ROOT`** 上，而这里要写
 *  `local/grants/` —— 那是用户的授权记录。写完再删也不行（中断一次他的许可就被改了），
 *  同 `prefstest` 当初从 `filetest` 里分出来的理由。
 */
import { createServer, type Server, type Socket } from "node:net";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "umbra-localbridge-"));
const LOCAL_DIR = join(ROOT, "local");
mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });
process.env.UMBRA_LOCAL_DIR = LOCAL_DIR;
process.env.UMBRASTUDIO_STATE_DIR = join(ROOT, "state");
mkdirSync(process.env.UMBRASTUDIO_STATE_DIR, { recursive: true });

const bridge = await import("./plugin/localbridge.js");
const grants = await import("./plugin/grants.js");
const { hostCall } = await import("./plugin/host.js");
await import("./cap/index.js");

/** ⚠️⚠️ **崩了也要清。**
 *  第一版没有这一段，而第一次跑就崩在一个 `require()` 上（这个文件是 ESM + 顶层 await），
 *  于是临时目录留在盘上 —— 收尾那几行**压根没跑**。
 *  > **「清理必须跑」这条纪律，正常收尾只覆盖了「我跑完了」那一半；
 *  > 「我崩了」那一半要另外兜** —— 而两者在日志里长得一样：都只是输出变短了。
 *  （`packtest` 2026-10-24 为同一件事加了 `uncaughtException` 兜底，`doc/24` §40.4 ③。）*/
const cleanup = (): void => { try { bridge.closeAllLocal(); } catch { /* 尽力 */ } try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* 尽力 */ } };
process.on("uncaughtException", (e) => {
  console.log(`\n✗ 抛出来了 —— 下面是紧急清理\n   ${String(e?.stack ?? e).split("\n").slice(0, 3).join("\n   ")}`);
  cleanup();
  console.log("   · 紧急清理：临时目录与连接已清");
  process.exit(1);
});
process.on("unhandledRejection", (e) => { throw e instanceof Error ? e : new Error(String(e)); });

let pass = 0, fail = 0;
const ok = (good: boolean, what: string, detail?: unknown): void => {
  if (good) { pass++; console.log(`  ✓ ${what}${detail === undefined ? "" : " — " + String(detail)}`); }
  else { fail++; console.log(`  ✗ ${what}${detail === undefined ? "" : " — " + String(detail)}`); }
};

/** 这一轮所有日志都抓下来 —— 第 10 条要证明令牌一次都没出现过 */
const logged: string[] = [];
for (const k of ["log", "error", "warn"] as const) {
  const real = console[k].bind(console);
  console[k] = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); real(...a); };
}

const TOKEN = "tok-" + "x".repeat(28);
const APP = "sketchup";

/* ──────────────────────── 假对端 ──────────────────────── */

interface Fake { srv: Server; port: number; seen: string[]; close: () => Promise<void> }

/** 起一个按同一套帧协议说话的假对端。
 *  `handle(method, params)` 回 `{ result }` / `{ error }` / `"hang"`（不回）/ `"kill"`（断开）/
 *  `{ raw: Buffer }`（自己造帧，给「帧超限」那一条用）。 */
async function fake(handle: (m: string, p: unknown) => unknown, opts: { token?: string } = {}): Promise<Fake> {
  const seen: string[] = [];
  const srv = createServer((sock: Socket) => {
    const reader = new bridge.FrameReader();
    sock.on("data", (chunk: Buffer) => {
      let frames: unknown[];
      try { frames = reader.push(chunk); } catch { sock.destroy(); return; }
      for (const f of frames) {
        const r = f as { id: number; method: string; token?: string; params?: unknown };
        seen.push(r.method);
        /* ⚠️⚠️ **假对端照 Ruby 扩展那一版：每一帧都要带顶层 `token`，不带 / 不对就
           回 -32001 并断开**（它的 `offline_test.rb` 三条钉着这件事）。
           第一版我这里是「只在 hello 核一次」—— 比真对端**宽松**，
           于是宿主那边「只在 hello 带令牌」的写法在这个假对端上**照样全绿**。
           > **一个比真对端宽松的假对端，会让判据对着一个不存在的世界说「通过」** ——
           > 而这正是跨仓协议最容易在集成那天才炸的地方。 */
        if (r.token !== (opts.token ?? TOKEN)) {
          sock.write(bridge.encodeFrame({ jsonrpc: "2.0", id: r.id, error: { code: -32001, message: "bad token" } }));
          sock.destroy();
          return;
        }
        if (r.method === "hello") {
          sock.write(bridge.encodeFrame({ jsonrpc: "2.0", id: r.id, result: { bridge: "0.1.0-test", app: APP, tools: ["ping"] } }));
          continue;
        }
        const out = handle(r.method, r.params);
        if (out === "hang") continue;                       // 不回 —— 让它超时
        if (out === "kill") { sock.destroy(); return; }
        if (out && typeof out === "object" && "raw" in (out as object)) { sock.write((out as { raw: Buffer }).raw); continue; }
        sock.write(bridge.encodeFrame({ jsonrpc: "2.0", id: r.id, ...(out as object) }));
      }
    });
    sock.on("error", () => { /* 对端断了是判据造的，不吵 */ });
  });
  await new Promise<void>((res) => srv.listen(0, "127.0.0.1", res));
  const port = (srv.address() as { port: number }).port;
  return { srv, port, seen, close: () => new Promise<void>((res) => srv.close(() => res())) };
}

/** 写握手文件。`mode` 给 0o644 之类来测权限那一条。 */
function handshake(endpoint: string, port: number, extra: Record<string, unknown> = {}, mode = 0o600): string {
  const f = join(LOCAL_DIR, `${endpoint}.json`);
  /* ⚠️ 第一版这里用 `require("node:fs")` 读回来再合并 extra —— 而这个文件是 ESM
     且有顶层 await，Node 当场报 `ERR_AMBIGUOUS_MODULE_SYNTAX`。一次合成就好，不用读回来。 */
  const body = { app: APP, version: "2024.0.1", pid: process.pid, port, token: TOKEN, startedAt: new Date().toISOString(), ...extra };
  writeFileSync(f, JSON.stringify(body, null, 1) + "\n", "utf8");
  chmodSync(f, mode);
  return f;
}

/** 造一个插件上下文。`local` 给 null = 清单里没声明。 */
const ctxOf = (id: string, local: Array<{ id: string; transport: "tcp-jsonrpc"; label: string }> | null) =>
  ({ manifest: { id, permissions: { files: ["read"], scope: "project", ...(local ? { local } : {}) } }, project: null } as never);

const EP = [{ id: "sketchup", transport: "tcp-jsonrpc" as const, label: "本机的 SketchUp" }];
const PLUG = "com.umbra.sketchup";
const call = (c: unknown, input: unknown) => hostCall(c as never, "local.call", input);

console.log("本机桥接");

/* ── ① 配对：握手文件 + 授权 → status 说 paired，call 拿到 result ── */
{
  const f = await fake((m) => (m === "ping" ? { result: { pong: m } } : { error: { code: -32601, message: "no" } }));
  handshake("sketchup", f.port);
  const st0 = bridge.localStatus("sketchup");
  ok(st0.paired === true && st0.connected === false && st0.app === APP,
     "① 握手文件读得到，`paired` 为真而**还没连**（status 不会去连）", JSON.stringify(st0));
  grants.grantLocal(PLUG, "sketchup", APP, "2024.0.1");
  const r = await call(ctxOf(PLUG, EP), { endpoint: "sketchup", method: "ping", params: {} });
  ok(r.ok === true && (r.data as { pong?: string })?.pong === "ping", "① 授权之后 `local.call` 拿到 result", JSON.stringify(r.data ?? r.errors?.[0]?.message));
  ok(f.seen[0] === "hello", "① **第一帧是 hello**（连上之后先核一下「是它」）", f.seen.join(" → "));
  /* ⚠️⚠️ 这一条钉的是 2026-10-30 那次协议对齐：**每一帧都带顶层 `token`**。
     假对端照 Ruby 扩展那一版，任何一帧不带就 -32001 + 断开 —— 所以上面那次
     `ping` 能拿到 result，本身就证明第二帧也带了令牌。这里再把它写成一条明的：
     > **一条「两边都实现了同一个协议」的判据，要让假的那一侧和真的那一侧一样严。** */
  ok(f.seen.includes("ping") && f.seen.length === 2,
     "① **第二帧也带着令牌过了**（假对端照真扩展：任何一帧不带令牌就 -32001 并断开）", f.seen.join(" → "));
  bridge.closeAllLocal();
  await f.close();
}

/* ── ② 切帧：一帧跨两个包、两帧挤一个包 ── */
{
  const rd = new bridge.FrameReader();
  const a = bridge.encodeFrame({ jsonrpc: "2.0", id: 1, result: 1 });
  const b = bridge.encodeFrame({ jsonrpc: "2.0", id: 2, result: 2 });
  ok(rd.push(a.subarray(0, 3)).length === 0 && rd.push(a.subarray(3)).length === 1,
     "② 一帧跨两个 TCP 包：前半截不出帧，后半截补齐才出一帧");
  const rd2 = new bridge.FrameReader();
  const two = rd2.push(Buffer.concat([a, b]));
  ok(two.length === 2 && (two[1] as { id: number }).id === 2, "② 两帧挤在一个包里：一次切出两帧", `切出 ${two.length} 帧`);
  const rd3 = new bridge.FrameReader();
  const half = Buffer.concat([a, b.subarray(0, 5)]);
  ok(rd3.push(half).length === 1 && rd3.push(b.subarray(5)).length === 1,
     "② 一个包里「一整帧 + 半截」：先出一帧，剩下的攒着");
}

/* ── ③ 超时：对端不回 → E_LOCAL_TIMEOUT，而且连接被关掉 ── */
{
  const f = await fake(() => "hang");
  handshake("sketchup", f.port);
  grants.grantLocal(PLUG, "sketchup", APP, "2024.0.1");
  const r = await call(ctxOf(PLUG, EP), { endpoint: "sketchup", method: "slow", timeoutMs: 400 });
  ok(r.ok === false && r.errors?.[0]?.code === bridge.LOCAL_CODES.TIMEOUT, "③ 对端不回 → `E_LOCAL_TIMEOUT`", r.errors?.[0]?.code);
  ok(bridge.localStatus("sketchup").connected === false,
     "③ **超时之后连接被关掉** —— 超时意味着我们不知道流走到哪了，下一帧可能是上一次那半截");
  await f.close();
}

/* ── ④ 断线：对端中途 destroy → E_LOCAL_DISCONNECTED，不挂住 ── */
{
  const f = await fake(() => "kill");
  handshake("sketchup", f.port);
  const t0 = Date.now();
  const r = await call(ctxOf(PLUG, EP), { endpoint: "sketchup", method: "boom", timeoutMs: 5_000 });
  const ms = Date.now() - t0;
  ok(r.ok === false && r.errors?.[0]?.code === bridge.LOCAL_CODES.DISCONNECTED, "④ 对端断了 → `E_LOCAL_DISCONNECTED`", r.errors?.[0]?.code);
  /* ⚠️ **这一条要的是「不等到超时」** —— 只验错误码的话，一个「什么都不管、等 5 秒再报断线」
     的实现也会绿，而那正是「卡住解释器」那件事。 */
  ok(ms < 2_000, "④ 而且**立刻就报**，不是等到超时（断线不该让插件干等）", `${ms} ms`);
  await f.close();
}

/* ── ⑤⑥ 没声明 / 没授权：两种拒分得开 ── */
{
  const f = await fake(() => ({ result: 1 }));
  handshake("sketchup", f.port);
  const r5 = await call(ctxOf("com.umbra.nolocal", null), { endpoint: "sketchup", method: "ping" });
  ok(r5.ok === false && /没声明 permissions.local/.test(r5.errors?.[0]?.message ?? ""),
     "⑤ 清单里没声明 `local` → 关② 拒，而且说得出要去改清单", r5.errors?.[0]?.message);
  grants.revokeLocal(PLUG, "sketchup");
  const r6 = await call(ctxOf(PLUG, EP), { endpoint: "sketchup", method: "ping" });
  ok(r6.ok === false && r6.errors?.[0]?.code === bridge.LOCAL_CODES.NOT_GRANTED,
     "⑥ 声明了但用户没授权 → `E_LOCAL_NOT_GRANTED`（和 ⑤ **分得开**）", r6.errors?.[0]?.code);
  ok(/设置/.test(r6.errors?.[0]?.fix ?? ""), "⑥ 拒因里有出路（去设置里允许）", r6.errors?.[0]?.fix?.slice(0, 30));
  /* ⚠️ 没授权时**一帧都不该发出去** —— 授权要在连接之前核 */
  ok(!f.seen.length, "⑥ 而且没授权时**一帧都没发出去**（授权在连接之前核）", `对端收到 ${f.seen.length} 帧`);
  await f.close();
}

/* ── ⑦ 帧超限：两个方向各一条 ── */
{
  let threw = "";
  try { bridge.encodeFrame({ big: "x".repeat(bridge.FRAME_MAX + 10) }); } catch (e) { threw = (e as Error).message; }
  ok(/超过上限/.test(threw), "⑦ 要发的帧超 8 MB → 发之前就拒", threw.slice(0, 50) || "✗ 没抛");
  /* 回来的方向：直接给 reader 一个超大的长度前缀。
     ⚠️ **长度先判上限再等字节** —— 不然对端报 4 GB，我们会一直攒到内存炸。 */
  const rd = new bridge.FrameReader();
  const head = Buffer.allocUnsafe(4); head.writeUInt32BE(bridge.FRAME_MAX + 1, 0);
  let threw2 = "";
  try { rd.push(head); } catch (e) { threw2 = (e as Error).message; }
  ok(/超过上限/.test(threw2) && /帧长/.test(threw2),
     "⑦ 对端**报**一个超限的帧长 → 当场拒，不等那些字节到齐", threw2.slice(0, 60) || "✗ 没抛");
}

/* ── ⑧ 握手文件的权限核查（POSIX 才跑）── */
{
  const win = process.platform === "win32";
  if (win) {
    console.log("  · ⑧ 这一组在 Windows 上跳过 —— Node 那里 uid 报 0、mode 报 0666，照 POSIX 核会永远配不上对（S8 §四 标着）");
  } else {
    const f = await fake(() => ({ result: 1 }));
    handshake("sketchup", f.port, {}, 0o644);
    const st = bridge.localStatus("sketchup");
    ok(st.paired === false && /权限太松/.test(st.why ?? ""), "⑧ group / other 可读 → 不算配对，而且 `why` 说得出是哪一条", st.why);
    /* ⚠️⚠️ **删链接要用 `unlinkSync`，不能用 `rmSync(..., { force: true })`** ——
       2026-10-30 实测：`rmSync` 对一条**悬空**符号链接**什么都不做**（它按
       `existsSync` 判，而那一件**跟随链接**、于是说「不存在」，在 `force` 模式下直接返回），
       而 `lstatSync` 说链接还在。
       第一版就栽在这里：下一条判据的 `writeFileSync` 顺着那条链接写到了别处，
       于是 `sketchup.json` 还是链接，读数是「握手文件是一条符号链接」——
       **而那是上一条判据的样本，不是这一条的**。
       > **`existsSync` 跟随链接，`lstatSync` 不跟随 —— 一个「它不存在」的读数，
       > 在悬空链接上是假的。** 而删不掉这件事没有任何东西会报错。 */
    const drop = (f2: string) => { try { unlinkSync(f2); } catch { /* 本来就没有 */ } };
    drop(join(LOCAL_DIR, "sketchup.json"));
    symlinkSync(join(ROOT, "nowhere.json"), join(LOCAL_DIR, "sketchup.json"));
    const st2 = bridge.localStatus("sketchup");
    ok(st2.paired === false && /符号链接/.test(st2.why ?? ""), "⑧ 握手文件是符号链接 → 不认", st2.why);
    drop(join(LOCAL_DIR, "sketchup.json"));
    ok(bridge.localStatus("sketchup").why?.includes("找不到握手文件") === true,
       "（样本有效性）那条链接真的删掉了 —— 不然下一条测的是上一条的样本", bridge.localStatus("sketchup").why);
    handshake("sketchup", f.port, { port: 0 });
    const st3 = bridge.localStatus("sketchup");
    ok(st3.paired === false && /port/.test(st3.why ?? ""), "⑧ `port` 不合法 → 不认", st3.why);
    await f.close();
  }
}

/* ── ⑨ 授权的身份：app / 主版本变了要重问，小版本不问 ── */
{
  const f = await fake(() => ({ result: 1 }));
  handshake("sketchup", f.port);
  grants.grantLocal(PLUG, "sketchup", APP, "2024.0.1");
  ok(grants.localGranted(PLUG, "sketchup", APP, "2024.0.9").ok === true,
     "⑨ **小版本升级不重问**（2024.0.1 → 2024.0.9）—— 端口和令牌每次都变，拿它们当身份只会每次都弹窗");
  const g2 = grants.localGranted(PLUG, "sketchup", APP, "2025.0.0");
  ok(g2.ok === false && /大版本/.test((g2 as { why: string }).why), "⑨ 主版本变了 → 重问", (g2 as { why?: string }).why);
  const g3 = grants.localGranted(PLUG, "sketchup", "blender", "2024.0.1");
  ok(g3.ok === false && /blender/.test((g3 as { why: string }).why), "⑨ app 变了 → 重问（而且说得出现在在跑的是哪个）", (g3 as { why?: string }).why);
  ok(grants.localGranted(PLUG, "sketchup", APP, undefined).ok === true,
     "⑨ **对端没报版本时不拿它当否决条件** —— 读不到不等于不一样（同 `tokentest` 那条口径）");
  await f.close();
}

/* ── ⑩ 令牌不对 → 断开；而且令牌一次都不许出现在日志里 ── */
{
  const f = await fake(() => ({ result: 1 }), { token: "另一个令牌" });
  handshake("sketchup", f.port);
  grants.grantLocal(PLUG, "sketchup", APP, "2024.0.1");
  const r = await call(ctxOf(PLUG, EP), { endpoint: "sketchup", method: "ping", timeoutMs: 2_000 });
  ok(r.ok === false && r.errors?.[0]?.code === bridge.LOCAL_CODES.NOT_PAIRED,
     "⑩ 对端不认这个口令 → `E_LOCAL_NOT_PAIRED`（不是「超时」，也不是「断线」）", r.errors?.[0]?.code);
  /* ⚠️ **这是一条反面判据**：抓这一轮全部日志 + 全部回给插件的东西，令牌一次都不许出现。
     > 一个「不打印令牌」的承诺，只有数过一遍才算读数。 */
  const everything = [...logged, JSON.stringify(r)].join("\n");
  ok(!everything.includes(TOKEN), "⑩ **令牌一次都没出现在日志或回包里**（数过这一轮的全部输出）",
     everything.includes(TOKEN) ? "✗ 出现了" : "一次都没有");
  await f.close();
}

/* ── ⑪ 两件桥能力**不在 MCP / HTTP 两个门面上** ── */
{
  const { allCaps, capsFor } = await import("./cap/registry.js");
  const names = allCaps().map((c) => c.name);
  ok(names.includes("local.status") && names.includes("local.call"), "⑪（前提）两件桥能力注册了", "都在");
  /* ⚠️⚠️ 这一条钉的是整段里最该想清楚的那个决定：
     许可是按 `(插件, 端点)` 发的，而**模型和前端不是插件，它们不在那张授权表里**。
     给它们开个面，等于「用户允许了插件 A 连 SketchUp」顺带变成「谁都能连」。
     > **一张按身份发的许可，只要有一个不带身份的入口，就等于没发。** */
  for (const face of ["mcp", "http"] as const) {
    const on = capsFor(face).map((c) => c.name).filter((n) => n.startsWith("local."));
    ok(on.length === 0, `⑪ **\`local.*\` 不在 ${face} 面上**（faces: []）—— 模型和前端不在那张授权表里`, on.join(" ") || "一件都没有");
  }
  /* 而管授权那三件**要**在 HTTP 面（设置页调它），但**不许**上 MCP：
     插件自己给自己发许可，这道闸就不存在了；而模型也不该代用户点那一下。 */
  const mcpNames = capsFor("mcp").map((c) => c.name);
  const admin = ["list_local_requests", "grant_local", "revoke_local"];
  ok(admin.every((n) => !mcpNames.includes(n)), "⑪ 管授权那三件**不在 MCP 面上**（模型不该代用户点那一下）",
     admin.filter((n) => mcpNames.includes(n)).join(" ") || "一件都没有");
  const httpNames = capsFor("http").map((c) => c.name);
  ok(admin.every((n) => httpNames.includes(n)), "⑪（对照）但它们在 HTTP 面上 —— 设置页要调得到",
     admin.filter((n) => !httpNames.includes(n)).join(" ") || "三件都在");
}

/* ── ⑫ 卸插件要把许可一起清掉 ── */
{
  grants.grantLocal("com.umbra.gone", "sketchup", APP, "2024.0.1");
  ok(grants.localGranted("com.umbra.gone", "sketchup", APP, "2024.0.1").ok === true, "⑫（前提）先给它发一张许可");
  const n = grants.dropGrantsOf("com.umbra.gone");
  ok(n === 1 && grants.localGranted("com.umbra.gone", "sketchup", APP, "2024.0.1").ok === false,
     "⑫ **卸载清掉它的许可** —— 不清的话卸了再装回同一个 id 会静默继承上一次的许可，而重装的那一份可以是另一个作者的同名包", `清掉 ${n} 张`);
  /* ⚠️ 反面：不许连带清掉别人的 */
  grants.grantLocal(PLUG, "sketchup", APP, "2024.0.1");
  grants.grantLocal("com.umbra.other", "sketchup", APP, "2024.0.1");
  grants.dropGrantsOf(PLUG);
  ok(grants.localGranted("com.umbra.other", "sketchup", APP, "2024.0.1").ok === true,
     "⑫ 而**只清它自己那张**，别的插件的许可不动");
}

/* ── 收尾（和崩溃那一路走同一个 `cleanup`，一处实现）── */
cleanup();
console.log(`\n${fail ? "✗" : "✓"} 本机桥接 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
