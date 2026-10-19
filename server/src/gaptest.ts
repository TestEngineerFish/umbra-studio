/** M13-3 通用缺口的回归（`doc/22` §四）：`read_file` 分页 · `search_in_file` · `list_activity` · `list_capabilities`。
 *  全在临时项目里跑（`UMBRASTUDIO_STATE_DIR` 也是临时的），直接调能力表里的 `run`，不起 HTTP。 */
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-gaptest-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
await import("./cap/index.js");
const { allCaps } = await import("./cap/registry.js");
const { loadProject } = await import("./project.js");
const { stopAllVerbSandboxes } = await import("./plugin/verbs.js");

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};
const cap = (name: string) => { const c = allCaps().find((x) => x.name === name); if (!c) throw new Error(`没有能力 ${name}`); return c; };

const projDir = join(STATE, "proj");
await mkdir(projDir, { recursive: true });
await writeFile(join(projDir, "project.json"), JSON.stringify({ name: "proj", title: "缺口测试" }));
const project = await loadProject(projDir);
const asAi = { project, via: "mcp" as const };
const asHuman = { project, via: "http" as const };

console.log("通用缺口（M13-3）");

/* 造两版：第一版经 MCP（记 AI），第二版经 HTTP（记人手改） */
const text = Array.from({ length: 120 }, (_, i) => `第 ${i + 1} 行${i % 10 === 0 ? " 关键词 Keyword" : ""}`).join("\n");
const w1 = await cap("write_file").run({ path: "notes/长文.md", content: text, expectSha256: "0", note: "第一版" } as never, asAi);
ok(w1.ok, "write_file 经 mcp 写第一版", JSON.stringify(w1.errors));
const sha1 = (await cap("read_file").run({ path: "notes/长文.md" } as never, asHuman)).data as { sha256: string };
const w2 = await cap("write_file").run({ path: "notes/长文.md", content: text + "\n第 121 行", expectSha256: sha1.sha256, note: "第二版" } as never, asHuman);
ok(w2.ok, "write_file 经 http 写第二版");

/* ① 分页 */
/* ⚠️ 比对用的是**第二版**整份读出的 sha（issue #150）。原来拿第一版的 `sha1` 比、再 `|| length === 64`，
   前半必假、后半恒真 —— 任何一个 sha256 都能过，分页分支哪天改成按切片现算也测不出来。 */
const full = (await cap("read_file").run({ path: "notes/长文.md" } as never, asHuman)).data as { sha256: string };
const page = (await cap("read_file").run({ path: "notes/长文.md", offset: 11, limit: 5 } as never, asHuman)).data as { content: string; range: { from: number; to: number; total: number; more: boolean }; sha256: string };
ok(page.content.split("\n").length === 5 && page.content.startsWith("第 11 行"), "read_file offset/limit 按行切", page.content.split("\n")[0]);
ok(page.range.from === 11 && page.range.to === 15 && page.range.total === 121 && page.range.more === true, "range 说清 from / to / total / more", JSON.stringify(page.range));
ok(page.sha256 === full.sha256, "分页读的 sha256 仍是整份文件的（与整份读严格相等）");
ok(page.sha256 !== createHash("sha256").update(page.content).digest("hex"), "而且不是那一页切片的 sha（否则拿它去 write_file 会被无故拒）");
const tail = (await cap("read_file").run({ path: "notes/长文.md", offset: 120 } as never, asHuman)).data as { content: string; range: { more: boolean } };
ok(tail.content.split("\n").length === 2 && tail.range.more === false, "只给 offset = 读到末尾");
const beyond = (await cap("read_file").run({ path: "notes/长文.md", offset: 999, limit: 5 } as never, asHuman)).data as { content: string; range: { to: number } };
ok(beyond.content === "" && beyond.range.to === 998, "offset 超过行数回空页，不抛");
const whole = (await cap("read_file").run({ path: "notes/长文.md" } as never, asHuman)).data as { range?: unknown; content: string };
ok(whole.range === undefined && whole.content.split("\n").length === 121, "不给 offset / limit 行为不变（整份、没有 range）");

/* ② 文件内搜 */
const s1 = (await cap("search_in_file").run({ path: "notes/长文.md", query: "关键词" } as never, asHuman)).data as { hits: Array<{ line: number; col: number }>; total: number; more: boolean };
ok(s1.total === 12 && s1.hits[0]!.line === 1 && s1.hits[1]!.line === 11, "search_in_file 回行号（第 1、11、21… 行）", `${s1.total} 处`);
const s2 = (await cap("search_in_file").run({ path: "notes/长文.md", query: "keyword", ignoreCase: true, limit: 3 } as never, asHuman)).data as { hits: unknown[]; total: number; more: boolean };
ok(s2.hits.length === 3 && s2.total === 12 && s2.more === true, "ignoreCase + limit：回 3 处、total 12、more");
const s3 = (await cap("search_in_file").run({ path: "notes/长文.md", query: "没有这个词" } as never, asHuman)).data as { total: number };
ok(s3.total === 0, "找不到回 0，不报错");

/* ③ 最近改动 */
const act = (await cap("list_activity").run({} as never, asHuman)).data as { rows: Array<{ path: string; version: string; origin: string }>; total: number };
ok(act.total === 2 && act.rows.every((r) => r.path === "notes/长文.md"), "list_activity 看到两版", JSON.stringify(act.rows.map((r) => [r.version, r.origin])));
ok(act.rows[0]!.version === "s2" && act.rows[1]!.version === "s1", "按时间倒序（新的在前）");
const onlyAi = (await cap("list_activity").run({ origin: "AI" } as never, asHuman)).data as { rows: Array<{ origin: string; version: string }> };
ok(onlyAi.rows.length === 1 && onlyAi.rows[0]!.version === "s1" && onlyAi.rows[0]!.origin === "AI", "origin=AI 只剩经 mcp 写的那一版（外部模型客户端记作 AI）");
const old = (await cap("list_activity").run({ since: new Date(Date.now() + 3600e3).toISOString() } as never, asHuman)).data as { rows: unknown[] };
ok(old.rows.length === 0, "since 在未来 → 空");
const bad = await cap("list_activity").run({ since: "昨天" } as never, asHuman);
ok(!bad.ok, "since 不是时间 → 报错不猜");

/* ④ 能力总表 */
/* ── 二进制文件：插件读要按字节给（2026-10-17 用户报 PDF 插件「宿主回的内容里既没有 base64 也没有 content」）── */
{
  const { hostCall } = await import("./plugin/host.js");
  const { createHash } = await import("node:crypto");
  /* 带非 UTF-8 字节的「PDF」：按文本往返一定会坏，按字节才对得上 */
  const bin = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x9c, 0xe2]), Buffer.from("\n%%EOF\n")]);
  await writeFile(join(projDir, "纪要.pdf"), bin);
  const man = { id: "com.umbra.pdftest", name: "t", version: "1.0.0", hostApi: "^1", surfaces: ["ui"], permissions: { files: ["read"], scope: "project" } } as never;
  const viaPlugin = await hostCall({ manifest: man, project }, "read_file", { path: "纪要.pdf" });
  const d = viaPlugin.data as { content: null; encoding?: string; base64?: string; size: number; sha256: string };
  const back = d.base64 ? Buffer.from(d.base64, "base64") : Buffer.alloc(0);
  ok(viaPlugin.ok && d.content === null && d.encoding === "base64" && back.equals(bin),
    "**插件（经 hostCall）读二进制：content null + encoding base64 + 原样字节**", `${back.length}/${bin.length} 字节`);
  ok(d.size === bin.length && d.sha256 === createHash("sha256").update(bin).digest("hex"), "size / sha256 按原始字节算（插件拿它核「是不是只给了一半」）");
  const viaAi = (await cap("read_file").run({ path: "纪要.pdf" } as never, asAi)).data as { content: null; base64?: string; why?: string };
  ok(viaAi.content === null && viaAi.base64 === undefined && /不是文本文件/.test(viaAi.why ?? ""), "**模型 / MCP 读同一份：不给 base64**（一份 PDF 的 base64 会撑爆上下文）", viaAi.why);
  const viaHttp = (await cap("read_file").run({ path: "纪要.pdf" } as never, asHuman)).data as { base64?: string };
  ok(viaHttp.base64 === undefined, "前端自己（http）读也不给 —— 只有插件要");

  /* ── 按字节范围读（2026-10-19）：插件读大文件（大 .gltf / .obj / 视频）用，只读那一段、不算 sha256 ── */
  const { randomBytes } = await import("node:crypto");
  const { setPluginLimits } = await import("./plugin/limits.js");
  const blob = randomBytes(10_000);
  await writeFile(join(projDir, "模型.bin"), blob);
  type Ranged = { path: string; content: null; encoding: string; base64: string; size: number; kind: string; updatedAt: string; sha256?: string;
    range: { byteOffset: number; byteLength: number; size: number; more: boolean } };
  const rr = async (input: Record<string, unknown>) => hostCall({ manifest: man, project }, "read_file", input);
  const seg = await rr({ path: "模型.bin", byteOffset: 100, byteLength: 1000 });
  const sd = seg.data as Ranged;
  ok(seg.ok && sd.content === null && sd.encoding === "base64" && Buffer.from(sd.base64, "base64").equals(blob.subarray(100, 1100)),
    "**范围读：正常一段，字节对得上**", `${Buffer.from(sd.base64 ?? "", "base64").length} 字节`);
  ok(JSON.stringify(sd.range) === JSON.stringify({ byteOffset: 100, byteLength: 1000, size: 10_000, more: true }), "range = { byteOffset, byteLength, size, more }", JSON.stringify(sd.range));
  ok(!("sha256" in sd) && sd.size === 10_000 && sd.path === "模型.bin" && typeof sd.updatedAt === "string",
    "**范围读的回包没有 sha256**（只读了一段，算不出整份的），size / path / updatedAt 照给", Object.keys(sd).join(","));
  const last = (await rr({ path: "模型.bin", byteOffset: 9_500, byteLength: 1000 })).data as Ranged;
  ok(last.range.byteLength === 500 && last.range.more === false && Buffer.from(last.base64, "base64").equals(blob.subarray(9_500)),
    "末段：要 1000 给 500（实际读到的），more:false", JSON.stringify(last.range));
  const empty = await rr({ path: "模型.bin", byteOffset: 10_000, byteLength: 10 });
  const ed = empty.data as Ranged;
  ok(empty.ok && ed.base64 === "" && ed.range.byteLength === 0 && ed.range.more === false, "offset = size → 空段，不报错", JSON.stringify(ed.range));
  const rejected = async (input: Record<string, unknown>, what: string) => {
    const r = await rr(input);
    ok(!r.ok && r.errors[0]?.code === "E_BAD_INPUT", `拒：${what}`, r.errors[0]?.message ?? "没拒");
  };
  await rejected({ path: "模型.bin", byteOffset: 10_001, byteLength: 10 }, "byteOffset 超过 size");
  await rejected({ path: "模型.bin", byteOffset: 0 }, "只给 byteOffset");
  await rejected({ path: "模型.bin", byteLength: 10 }, "只给 byteLength");
  await rejected({ path: "模型.bin", byteOffset: 0, byteLength: 10, offset: 1 }, "和 offset（按行分页）同时给");
  await rejected({ path: "模型.bin", byteOffset: 0, byteLength: 10, limit: 5 }, "和 limit 同时给");
  await rejected({ path: "模型.bin", byteOffset: 0, byteLength: 0 }, "byteLength = 0");
  await rejected({ path: "模型.bin", byteOffset: -1, byteLength: 10 }, "byteOffset 负数");
  await rejected({ path: "模型.bin", byteOffset: 1.5, byteLength: 10 }, "byteOffset 小数（插件这条路不跑 zod，手工核）");
  await rejected({ path: "模型.bin", byteOffset: "0", byteLength: 10 }, "byteOffset 是字符串");
  await rejected({ path: "模型.bin", byteOffset: 0, byteLength: 100 * 1048576 + 1 }, "byteLength 超过二进制读取上限");

  /* 文本类文件也能按字节读：按原始字节，不解码（大 .gltf 靠它）。多字节字符切在半中间也照给 */
  const mdBytes = Buffer.from(text + "\n第 121 行", "utf8");
  const tx = await rr({ path: "notes/长文.md", byteOffset: 1, byteLength: 7 });
  const td = tx.data as Ranged;
  ok(tx.ok && td.kind !== "binary" && Buffer.from(td.base64, "base64").equals(mdBytes.subarray(1, 8)) && td.content === null,
    "**文本类文件（.md）也能按字节读**，给的是原始字节（切在汉字中间也不改）", `kind=${td.kind}`);

  /* 非插件来源不开放 */
  const mcpR = await cap("read_file").run({ path: "模型.bin", byteOffset: 0, byteLength: 10 } as never, asAi);
  ok(!mcpR.ok && mcpR.errors[0]?.code === "E_BAD_INPUT" && /只对插件开放/.test(mcpR.errors[0]?.message ?? ""), "**模型 / MCP 给了 byteOffset → E_BAD_INPUT（只对插件开放）**");
  const httpR = await cap("read_file").run({ path: "模型.bin", byteOffset: 0, byteLength: 10 } as never, asHuman);
  ok(!httpR.ok && httpR.errors[0]?.code === "E_BAD_INPUT", "前端（http）给了也拒");

  /* 二进制整份读的上限跟着设置走 */
  const big = randomBytes(11 * 1048576);
  await writeFile(join(projDir, "大.bin"), big);
  const whole1 = (await rr({ path: "大.bin" })).data as { base64?: string; why?: string };
  ok(whole1.base64 !== undefined && Buffer.from(whole1.base64, "base64").length === big.length, "默认上限 100 MB：11 MB 整份给");
  await setPluginLimits({ binaryReadMaxMB: 10 });
  const whole2 = (await rr({ path: "大.bin" })).data as { base64?: string; why?: string };
  ok(whole2.base64 === undefined && /上限 10 MB/.test(whole2.why ?? "") && /byteOffset/.test(whole2.why ?? ""),
    "**设置改成 10 MB：同一份整份读被拒，原因里指了范围读这条路**", whole2.why);
  const part = (await rr({ path: "大.bin", byteOffset: 10 * 1048576, byteLength: 10 * 1048576 })).data as Ranged;
  ok(part.range.byteLength === 1048576 && part.range.more === false && Buffer.from(part.base64, "base64").equals(big.subarray(10 * 1048576)),
    "同一份按段读得到（第二段 1 MB，more:false）", JSON.stringify(part.range));
  await rejected({ path: "大.bin", byteOffset: 0, byteLength: 10 * 1048576 + 1 }, "byteLength 超过改小后的上限");
  await setPluginLimits({ binaryReadMaxMB: 100 });

  /* 文本整份读的上限（textReadMaxMB，2026-10-19）：**只管插件来源**，模型 / MCP / HTTP 仍是 2 MB 常量 */
  const log = ("一行日志 0123456789abcdef\n").repeat(Math.ceil(3 * 1048576 / 30));
  await writeFile(join(projDir, "大.txt"), log);
  type Whole = { content: string | null; why?: string; sha256?: string };
  const t1 = (await rr({ path: "大.txt" })).data as Whole;
  ok(t1.content === null && /超过 2 MB 上限/.test(t1.why ?? "") && /byteOffset/.test(t1.why ?? ""),
    "默认 2 MB：插件整份读 3 MB 的文本 → 只给元数据，原因里指了范围读", t1.why);
  await setPluginLimits({ textReadMaxMB: 4 });
  const t2 = (await rr({ path: "大.txt" })).data as Whole;
  ok(t2.content === log && typeof t2.sha256 === "string", "**设置改成 4 MB：插件整份读得到 3 MB 的文本**", `${(t2.content ?? "").length} 字`);
  const tAi = (await cap("read_file").run({ path: "大.txt" } as never, asAi)).data as Whole;
  const tHttp = (await cap("read_file").run({ path: "大.txt" } as never, asHuman)).data as Whole;
  ok(tAi.content === null && /超过 2 MB 上限/.test(tAi.why ?? "") && tHttp.content === null,
    "**同一设置下模型 / MCP 和前端（http）仍按 2 MB 拒**（不让大文件进模型上下文）", tAi.why);
  const tSearch = await cap("search_in_file").run({ path: "大.txt", query: "日志" } as never, asAi);
  ok(!tSearch.ok, "search_in_file 也不跟插件设置走（仍是 2 MB）");
  const tPage = (await rr({ path: "大.txt", offset: 2, limit: 3 })).data as Whole & { range?: { from: number; to: number } };
  ok(tPage.content === "一行日志 0123456789abcdef\n一行日志 0123456789abcdef\n一行日志 0123456789abcdef" && tPage.range?.to === 4,
    "插件按行分页读大文本也按设置的上限（4 MB 内能分页）", JSON.stringify(tPage.range));
  await setPluginLimits({ textReadMaxMB: 2 });
}

const caps = (await cap("list_capabilities").run({} as never, { project: null, via: "http" })).data as { core: Array<{ name: string; source: string }>; verbs: Array<{ tool: string; exposed: boolean }>; failures: Record<string, string> };
ok(caps.core.length >= 70 && caps.core.every((c) => c.source === "core"), "核心能力全在", `${caps.core.length} 件`);
ok(caps.verbs.some((v) => v.tool === "markdown__replace_section" && v.exposed), "动词表里有内置 markdown 的（builtin 挂出）");
ok(["read_file", "search_in_file", "list_activity", "plugin_verbs", "list_capabilities"].every((n) => caps.core.some((c) => c.name === n)), "新加的几件都在表里");

stopAllVerbSandboxes();
await rm(STATE, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "✓" : "✗"} gaptest ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
