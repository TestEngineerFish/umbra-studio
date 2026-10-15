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
const caps = (await cap("list_capabilities").run({} as never, { project: null, via: "http" })).data as { core: Array<{ name: string; source: string }>; verbs: Array<{ tool: string; exposed: boolean }>; failures: Record<string, string> };
ok(caps.core.length >= 70 && caps.core.every((c) => c.source === "core"), "核心能力全在", `${caps.core.length} 件`);
ok(caps.verbs.some((v) => v.tool === "markdown__replace_section" && v.exposed), "动词表里有内置 markdown 的（builtin 挂出）");
ok(["read_file", "search_in_file", "list_activity", "plugin_verbs", "list_capabilities"].every((n) => caps.core.some((c) => c.name === n)), "新加的几件都在表里");

stopAllVerbSandboxes();
await rm(STATE, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "✓" : "✗"} gaptest ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
