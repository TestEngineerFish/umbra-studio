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
ok(all1.filter((v) => v.plugin === "com.umbra.markdown" && v.exposed && v.state === "builtin").length === 2, "内置 markdown 插件的两件动词按 builtin 全挂出（它是第一个真用上 B 面的）");
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

off();
stopAllVerbSandboxes();
await rm(STATE, { recursive: true, force: true });
await rm(KEYS, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "✓" : "✗"} verbtest ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
