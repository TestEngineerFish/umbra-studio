/** 插件动词的挂出 / 收回回归（M13-1 / M13-2，`doc/22` §3.3）。
 *
 *  夹具 `fixtures/插件/com.umbra.verbs`：`play` 标了 `free: true`，`cut` 要授权。测的是：
 *  ① 没授权 → 只挂 `play`；② 签一份许可证 → `cut` 也挂出来，**不重启**；③ 许可证过期 → `cut` 收回而 `play` 还在；
 *  ④ 调没授权的动词 → `E_PLUGIN_UNLICENSED` + `market_url`；⑤ 对外名字是 `<短名>__<动词>`；⑥ 短名撞了退回整个 id；
 *  ⑦ 会话工具表 / HTTP `plugin_verbs` 和这张表一致。
 *
 *  ⚠️ 全程用**自己临时生成的钥匙**签（`UMBRASTUDIO_PUBKEY`）、状态目录也是临时的（`UMBRASTUDIO_STATE_DIR`）——
 *  仓库里的 `keys/publisher.pub` 是真公钥，用户机器上的插件目录是用户的东西，两样都不碰。
 *  环境变量要在 **import 任何核心模块之前**设：`STATE_ROOT` 在 `project.ts` 顶层算一次。
 */
import { mkdtemp, mkdir, cp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign as edSign } from "node:crypto";

/* ⚠️ `realpath`：macOS 的 tmpdir 是 `/var/…` → `/private/var/…` 的符号链接，而沙箱的 `--allow-fs-read` 按真路径放行、
   runner 按 `UD_PLUGIN_DIR` 原样读 —— 两边不一致时插件「import 不到 tools.mjs」（本回归第一版就栽在这）。
   正式环境 STATE_ROOT 是 userData，没有这层链接。 */
const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-verbtest-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
const KEYS = await mkdtemp(join(tmpdir(), "umbra-verbkeys-"));
const pub = join(KEYS, "publisher.pub");
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
await writeFile(pub, publicKey.export({ type: "spki", format: "pem" }));
process.env.UMBRASTUDIO_PUBKEY = pub;

const { allVerbs, listVerbs, invokeVerb, toolNameOf, jsonSchemaOf, stopAllVerbSandboxes, onVerbsChanged } = await import("./plugin/verbs.js");
const { PLUGINS_DIR } = await import("./plugin/store.js");
const { STATE_ROOT } = await import("./project.js");
const { emit } = await import("./events.js");
await import("./cap/index.js");                 // 把全部能力注册进来（plugin_verbs 在 cap/plugins.ts）
const { allCaps } = await import("./cap/registry.js");

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};
const day = (offset: number) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);
const sign = (lic: unknown) => {
  const payload = JSON.stringify(lic);
  return JSON.stringify({ payload, signature: edSign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64") });
};
const licFile = join(STATE_ROOT, ".umbrastudio", "license.json");
await mkdir(join(STATE_ROOT, ".umbrastudio"), { recursive: true });

console.log("插件动词（M13-1 / M13-2）");
ok(STATE_ROOT === STATE, "状态目录是临时的（没碰用户的插件目录）", STATE_ROOT);

/* 装夹具：直接拷进临时状态目录的插件目录（未签名 —— 动词表不看签名，和界面一致） */
const FIX = join(process.cwd(), "..", "fixtures", "插件", "com.umbra.verbs");
await mkdir(join(PLUGINS_DIR, "com.umbra.verbs"), { recursive: true });
await cp(FIX, join(PLUGINS_DIR, "com.umbra.verbs", "0.1.0"), { recursive: true });

/* 一个假项目给 invoke 用（动词夹具不碰文件，只要有个目录） */
const projDir = join(STATE, "proj");
await mkdir(projDir, { recursive: true });
await writeFile(join(projDir, "project.json"), JSON.stringify({ name: "proj", title: "动词测试" }));
const { loadProject } = await import("./project.js");
const project = await loadProject(projDir);

/* ⑤ 名字 */
ok(toolNameOf("com.umbra.markdown", "com.umbra.markdown.replace_section") === "markdown__replace_section", "对外名 = <短名>__<动词>");
ok(toolNameOf("com.a.video", "com.a.video.cut", new Map([["video", 2]])) === "com_a_video__cut", "短名撞了退回整个 id（点换下划线）");
ok(toolNameOf("com.x.y", "weird.name!") === "y__weird_name_", "名字里不合法的字符一律换成下划线（OpenAI / MCP 只认 [A-Za-z0-9_-]）");
const schema = jsonSchemaOf({ path: "string", from: "number", note: "string?" }) as { required: string[]; properties: Record<string, { type: string }> };
ok(schema.required.join(",") === "path,from" && schema.properties.note!.type === "string", "入参表 → JSON Schema，尾巴带 ? 的不进 required");

/* ① 没授权：只挂 free 的 */
let changes = 0;
const off = onVerbsChanged(() => { changes++; });
const mine = (vs: Array<{ plugin: string; tool: string }>) => vs.filter((v) => v.plugin === "com.umbra.verbs").map((v) => v.tool).sort();
const all1 = await allVerbs();
ok(mine(all1).join(",") === "verbs__cut,verbs__play", "夹具的两件动词都扫到了", mine(all1).join(" "));
/* 不数件数：内置 markdown 跟着插件仓同步（S4），1.1.0 起是四件（多了 search / insert_after_section）。
   钉的是「它的动词**全部**按 builtin 挂出、最早那两件在」—— 写死「2 件」的话，插件仓每加一件这里就红一次。 */
const md1 = all1.filter((v) => v.plugin === "com.umbra.markdown");
ok(md1.length >= 2 && md1.every((v) => v.exposed && v.state === "builtin")
  && ["markdown__outline", "markdown__replace_section"].every((t) => md1.some((v) => v.tool === t)),
  "内置 markdown 插件的动词按 builtin 全挂出（它是第一个真用上 B 面的）", md1.map((v) => v.tool).join(" "));
const exposed1 = mine(await listVerbs());
ok(exposed1.join(",") === "verbs__play", "**没授权只挂 free 的那件**（play 在、cut 不在）", exposed1.join(" "));
ok(all1.find((v) => v.tool === "verbs__cut")?.exposed === false && all1.find((v) => v.tool === "verbs__cut")?.state === "unlicensed", "cut 在全表里标 exposed:false / unlicensed");

/* ④ 调没授权的 */
const r1 = await invokeVerb("verbs__cut", { path: "a.mp4", from: 1, to: 2 }, project);
ok(!r1.ok && r1.code === "E_PLUGIN_UNLICENSED" && !!r1.market_url && r1.market_url.endsWith("com.umbra.verbs"), "调没授权的动词 → E_PLUGIN_UNLICENSED + 去市场的地址", r1.ok ? "" : r1.message);
const r2 = await invokeVerb("verbs__play", { path: "a.mp4" }, project);
ok(r2.ok && (r2.data as { played: string }).played === "a.mp4", "免费动词没授权也真能调（在沙箱里跑了）");
const r3 = await invokeVerb("verbs__nope", {}, project);
ok(!r3.ok && r3.code === "E_VERB_UNKNOWN", "不存在的动词 → E_VERB_UNKNOWN");

/* ② 签许可证 → 不重启，cut 挂出来 */
await writeFile(licFile, sign({ sub: "u1", grants: [{ plugin: "com.umbra.verbs", from: day(-1), until: day(7), src: "purchase" }] }));
emit("plugin", null, { what: "license", id: "*" });          // `set_license` 那条能力发的就是这个
ok(changes >= 1, "许可证变动的事件让订阅者收到了通知");
const exposed2 = mine(await listVerbs());
ok(exposed2.join(",") === "verbs__cut,verbs__play", "**签了许可证 cut 当场挂出来**（没重启、没重开沙箱）", exposed2.join(" "));
const r4 = await invokeVerb("verbs__cut", { path: "a.mp4", from: 1, to: 2 }, project);
ok(r4.ok && (r4.data as { to: number }).to === 2, "授权后 cut 真能调");

/* ③ 过期 → cut 收回，play 还在；列表是快照、调用再验 */
await writeFile(licFile, sign({ sub: "u1", grants: [{ plugin: "com.umbra.verbs", from: day(-30), until: day(-1), src: "promo" }] }));
const r5 = await invokeVerb("verbs__cut", { path: "a.mp4", from: 1, to: 2 }, project);
ok(!r5.ok && r5.code === "E_PLUGIN_UNLICENSED" && r5.state === "expired", "**列表还没刷新时调用也被拦**（调用进门重算授权）", r5.ok ? "" : String(r5.state));
emit("plugin", null, { what: "license", id: "*" });
const exposed3 = mine(await listVerbs());
ok(exposed3.join(",") === "verbs__play", "过期后 cut 收回、play 还在", exposed3.join(" "));

/* ⑦ HTTP / MCP 共用的 plugin_verbs 能力和这张表一致 */
const cap = allCaps().find((c) => c.name === "plugin_verbs");
ok(!!cap, "plugin_verbs 能力在注册表里");
if (cap) {
  const env = await cap.run({} as never, { project: null, via: "http" });
  const d = env.data as { verbs: Array<{ tool: string; exposed: boolean }>; failures: Record<string, string> };
  const mineRows = d.verbs.filter((v) => v.tool.startsWith("verbs__"));
  ok(env.ok && mineRows.length === 2 && mineRows.filter((v) => v.exposed).length === 1 && Object.keys(d.failures).length === 0, "plugin_verbs 回全表 + exposed 与 listVerbs 一致、没有起不来的沙箱", JSON.stringify(env.stats));
}

/* 反向：卸掉插件后动词全没，沙箱也停 */
await rm(join(PLUGINS_DIR, "com.umbra.verbs"), { recursive: true, force: true });
emit("plugin", null, { what: "uninstall", id: "com.umbra.verbs" });
ok(mine(await allVerbs()).length === 0, "卸载后它的动词全没（孤儿沙箱一起停）");

/* ── 跨进程：另一个进程（Studio 窗口）改了磁盘，这个 stdio 核心自己发现（issue #144 / #146）──
   秘书和编码 CLI 连的是各自 spawn 的 stdio 核心，和 Studio 窗口不是同一个进程，`plugin` 事件传不过去。
   这里在**父进程**里只改磁盘、**不发任何事件**，断言子进程发来 `tools/list_changed` 且工具表跟着变：
   ① 落一份新许可证 → cut 挂出来；② 切到新版（同名动词多一个参数）→ MCP 上的 inputSchema 换成新的、带新参数调用插件收得到（#146）；
   ③ 删插件目录 → 动词收回、再调就不认。 */
{
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const { ToolListChangedNotificationSchema } = await import("@modelcontextprotocol/sdk/types.js");
  const { readFile } = await import("node:fs/promises");
  const vdir = join(PLUGINS_DIR, "com.umbra.verbs");
  await mkdir(vdir, { recursive: true });
  await cp(FIX, join(vdir, "0.1.0"), { recursive: true });
  /* 先回到「没授权」：上面那段最后留的是过期的许可证 */
  await rm(licFile, { force: true });
  const tr = new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), "dist", "index.js")],
    env: { ...process.env } as Record<string, string>, stderr: "pipe" });
  const c = new Client({ name: "verbtest-x", version: "0" });
  let notified = 0;
  c.setNotificationHandler(ToolListChangedNotificationSchema, async () => { notified++; });
  await c.connect(tr);
  type T = { name: string; inputSchema: { properties?: Record<string, unknown> } };
  const tools = async () => ((await c.listTools()).tools as T[]).filter((t) => t.name.startsWith("verbs__"));
  const names = async () => (await tools()).map((t) => t.name).sort().join(",");
  const waitFor = async (pred: () => Promise<boolean>, ms = 12000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await pred()) return true; await new Promise((r) => setTimeout(r, 300)); }
    return false;
  };
  const text = (r: unknown) => ((r as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "");
  ok((await names()) === "verbs__play", "（前提）子进程起来时没授权，只挂 play", await names());

  const n0 = notified;
  await writeFile(licFile, sign({ sub: "u1", grants: [{ plugin: "com.umbra.verbs", from: day(-1), until: day(7), src: "purchase" }] }));
  const got1 = await waitFor(async () => notified > n0 && (await names()) === "verbs__cut,verbs__play");
  ok(got1, "**父进程只落许可证、不发事件 → 子进程发 list_changed，cut 挂出来**（#144）", `${await names()} · 通知 ${notified - n0} 次`);
  const rc = await c.callTool({ name: "verbs__cut", arguments: { project: projDir, path: "a.mp4", from: 1, to: 2 } });
  ok(/"to":\s*2/.test(text(rc)), "子进程里 cut 真能调", text(rc).slice(0, 80));

  /* ② 切版本：0.2.0 的 play 多一个 speed 参数、描述也变了 */
  const v2 = join(vdir, "0.2.0");
  await cp(FIX, v2, { recursive: true });
  const man = JSON.parse(await readFile(join(v2, "manifest.json"), "utf8")) as Record<string, unknown>;
  await writeFile(join(v2, "manifest.json"), JSON.stringify({ ...man, version: "0.2.0" }));
  const src = await readFile(join(v2, "tools.mjs"), "utf8");
  await writeFile(join(v2, "tools.mjs"), src
    .replace('input: { path: "string" },', 'input: { path: "string", speed: "number" },')
    .replace('summary: "免费动词：没买也能用。",', 'summary: "免费动词 v2：能调速。",')
    .replace("async run({ path }) { return { played: path }; },", "async run({ path, speed }) { return { played: path, speed }; },"));
  await writeFile(join(vdir, "current"), "0.2.0");
  const n1 = notified;
  const got2 = await waitFor(async () => notified > n1 && !!(await tools()).find((t) => t.name === "verbs__play")?.inputSchema.properties?.speed);
  ok(got2, "**切到新版后 MCP 上同名动词的 inputSchema 换成新的**（多了 speed，#146）",
     JSON.stringify(Object.keys((await tools()).find((t) => t.name === "verbs__play")?.inputSchema.properties ?? {})));
  const rp = await c.callTool({ name: "verbs__play", arguments: { project: projDir, path: "b.mp4", speed: 2 } });
  ok(/"speed":\s*2/.test(text(rp)), "**带新参数调用，插件收到了**（原来被旧 schema 剥掉）", text(rp).slice(0, 80));

  /* ③ 卸载：删目录 */
  const n2 = notified;
  await rm(vdir, { recursive: true, force: true });
  const got3 = await waitFor(async () => notified > n2 && (await names()) === "");
  ok(got3, "**父进程删插件目录 → 子进程的动词全部收回**", (await names()) || "(空)");
  const rg = await c.callTool({ name: "verbs__play", arguments: { project: projDir, path: "a.mp4" } }).catch((e: Error) => ({ isError: true, content: [{ text: e.message }] }));
  ok((rg as { isError?: boolean }).isError === true, "卸掉的动词再调：不认（不再跑旧代码）", text(rg).slice(0, 80));
  await c.close();
}

off();
stopAllVerbSandboxes();
await rm(STATE, { recursive: true, force: true });
await rm(KEYS, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "✓" : "✗"} verbtest ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
