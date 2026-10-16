#!/usr/bin/env node
/** 校验器自己的回归：几份**故意写坏**的清单 / 插件目录，validate 必须红在对的那条上。
 *  「量到零」有两种可能 —— 世界是零，或者仪器是零；这份是给仪器的。每条样本钉一条规则编号（PLUGIN-SPEC §六）。 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePlugin } from "./lib/validate-plugin.mjs";

const good = {
  id: "com.example.t", name: "t", version: "0.1.0", hostApi: "^1", surfaces: ["ui", "tools"],
  kinds: [{ id: "tk", label: "T", icon: "•", ext: [".tk"], textual: true }],
  permissions: { files: ["read", "write"], scope: "project", net: [] },
  ui: "index.html", tools: "tools.mjs",
};
const files = {
  "index.html": `<!DOCTYPE html><link rel="stylesheet" href="./theme.css"><script src="./umbra.js"></script><script type="module" src="./app.mjs"></script>`,
  "app.mjs": `umbra.onContext(async (c) => { await umbra.call("read_file", { path: c.path }); });`,
  "tools.mjs": `import { h } from "./lib.mjs";\nexport default function register(host) { host.defineCap({ name: "com.example.t.echo", title: "e", summary: "e", input: { path: "string" }, async run({ path }) { return h(await host.call("read_file", { path })); } }); }`,
  "lib.mjs": `export const h = (x) => x;`,
};

let n = 0, bad = 0;
const ok = (c, w, d = "") => { n++; console.log(`${c ? "✓" : "✗"} ${w}${d ? " — " + d : ""}`); if (!c) bad++; };
const root = await mkdtemp(join(tmpdir(), "umbra-validate-"));

async function make(id, manifest, extra = {}) {
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  const all = { ...files, ...extra };
  for (const [k, v] of Object.entries(all)) if (v !== null) { await mkdir(join(dir, k, ".."), { recursive: true }); await writeFile(join(dir, k), v); }
  await writeFile(join(dir, "manifest.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest, null, 2));
  return validatePlugin(dir);
}
const hits = (r, rule, text) => r.errors.some((e) => e.startsWith(`[${rule}]`) && (!text || e.includes(text)));

let r = await make("com.example.t", good);
ok(r.errors.length === 0, "对照组：一个合法插件零 error", r.errors.join(" | "));

r = await make("com.example.t", { ...good, id: "Com.Example" });
ok(hits(r, "V1", "$.id") && hits(r, "V2"), "V1/V2 大写 id：schema 红 + 目录名对不上");
r = await make("com.example.t", { ...good, version: "../.." });
ok(hits(r, "V1", "$.version"), "V1 version 不合形状（兼做目录名）");
r = await make("com.example.t", { ...good, hostApi: "^2" });
ok(hits(r, "V1", "$.hostApi"), "V1 hostApi ^2 被拒");
r = await make("com.example.t", { ...good, kinds: [{ ...good.kinds[0], priority: 96 }] });
ok(hits(r, "V1", "priority"), "V1 priority 96 > 95");
r = await make("com.example.t", `{"id":"com.example.t","name":"t","version":"0.1.0","hostApi":"^1","surfaces":["ui"],"kinds":[{"id":"tk","label":"T","icon":"x","ext":[".tk"],"priority":50.0}],"permissions":{},"ui":"index.html"}`);
ok(hits(r, "V1", "浮点"), "V1 浮点字面量 50.0 被拒（跨语言 canonical）");
r = await make("com.example.t", { ...good, permissions: { files: ["read"], exec: ["ffmpeg"] } });
ok(hits(r, "V1", "exec"), "V1 permissions.exec 连槽位都不留");
r = await make("com.example.t", { ...good, kinds: [{ id: "newkind", label: "N", icon: "n", ext: [] }] });
ok(hits(r, "V1", "ext"), "V1 定义新类型却没有 ext");
r = await make("com.example.t", { ...good, kinds: [{ id: "dc", label: "D", icon: "d", ext: [] }] });
ok(hits(r, "V9", "dc"), "V9 认领 dc 被拒");
r = await make("com.example.t", { ...good, ui: "../index.html" });
ok(hits(r, "V1", "$.ui"), "V1 ui 路径带 ..");
r = await make("com.example.t", { ...good, surfaces: ["ui"], tools: undefined });
ok(r.errors.length === 0, "只有 ui 面时不要求 tools");
r = await make("com.example.t", { ...good, surfaces: ["tools"], ui: undefined });
ok(r.errors.length === 0 && r.warnings.length === 0, "只有 tools 面时不要求 ui，也不报 kinds 警告", r.warnings.join(" | "));

r = await make("com.example.t", good, { "tools.mjs": `import fs from "node:fs";\nexport default function register(host) { host.defineCap({ name: "com.example.t.x", run() {} }); }` });
ok(hits(r, "V6", "node:fs"), "V6 B 面 import 外部模块");
r = await make("com.example.t", good, { "tools.mjs": `const x = require("fs");\nexport default function register(host) { host.defineCap({ name: "com.example.t.x", run() {} }); }` });
ok(hits(r, "V6", "require"), "V6 B 面 require");
r = await make("com.example.t", good, { "tools.mjs": `import { h } from "../other/lib.mjs";\nexport default function register(host) { host.defineCap({ name: "com.example.t.x", run() {} }); }` });
ok(hits(r, "V6", "目录外"), "V6 B 面 import 跑到插件目录外");
r = await make("com.example.t", good, { "tools.mjs": `export default function register(host) { host.defineCap({ name: "echo", run() {} }); }` });
ok(hits(r, "V7", "echo"), "V7 能力名没带插件 id 前缀");
r = await make("com.example.t", good, { "tools.mjs": `export default function register(host) { host.defineCap({ name: "com.example.t.x", run() { return fetch("https://x"); } }); }` });
ok(r.warnings.some((w) => w.includes("fetch")), "V6 B 面用 fetch 给 warning（QuickJS 里是 undefined）");
r = await make("com.example.t", { ...good, permissions: { files: ["read"] } });
ok(hits(r, "V8", "write_file") === false && r.errors.length === 0, "对照组：没调 write_file 时只声明 read 也行");
r = await make("com.example.t", { ...good, permissions: { files: ["read"] } }, { "app.mjs": `umbra.call("write_file", { path: "a" });` });
ok(hits(r, "V8", "write_file"), "V8 调 write_file 却没声明 write");
r = await make("com.example.t", good, { "app.mjs": `umbra.call("write_draft", {});` });
ok(hits(r, "V8", "write_draft"), "V8 调白名单外的能力");
r = await make("com.example.t", good, { "index.html": `<script src="./nope.js"></script>` });
ok(hits(r, "V5", "nope.js"), "V5 HTML 引用了不存在的本地文件");
r = await make("com.example.t", good, { "资源.txt": "x" });
ok(hits(r, "V3", "资源.txt"), "V3 非 ASCII 文件名");
r = await make("com.example.t", good, { "7": "x" });
ok(hits(r, "V3", "纯数字"), "V3 纯数字路径段");
r = await make("com.example.t", { ...good, kinds: [], surfaces: ["ui"], tools: undefined });
ok(r.warnings.some((w) => w.startsWith("[V5]") && w.includes("kinds")), "V5 有 ui 面却没 kinds 给 warning");

await rm(root, { recursive: true, force: true });
console.log(bad ? `\n✗ 校验器回归 ${n - bad}/${n}` : `\n✓ 校验器回归 ${n}/${n}`);
process.exit(bad ? 1 : 0);
