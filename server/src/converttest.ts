/** 格式转换二期 · Studio 宿主能力 `file.convert` 的回归（2026-10-18）。
 *
 *  **重点和 plugintest 一样：不是「能转」，是「关不关得住」** —— 这件能力是第一件让插件间接用上外部程序的口子。
 *  所以先钉闸：白名单与权限等级 · 越出项目根 · 软链指到外面 · 永不覆盖 · 认不出的目标格式；
 *  再钉「副本和 PC 那份没分叉」；最后本机有 `/usr/bin/sips` 就真转一次 png → jpg。
 *
 *  转换器用假的（写一段带标记的文本），宿主那一层（路径、成品位置、快照、三个门面）是真的。
 *  全在临时项目里跑（`UMBRASTUDIO_STATE_DIR` / `UMBRASTUDIO_NO_GIT` 在 import 核心之前设），不碰 `projects/`。
 */
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath, symlink } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const STATE = await realpath(await mkdtemp(join(tmpdir(), "umbra-converttest-")));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_NO_GIT = "1";
await import("./cap/index.js");
const { allCaps, capsFor } = await import("./cap/registry.js");
const { loadProject, TOOL_ROOT } = await import("./project.js");
const { hostCall, allowedCapNames } = await import("./plugin/host.js");
const { ConvertEngine, setConvertEngine, COPIED_FROM_PC } = await import("./convert/index.js");
const { stopAllVerbSandboxes } = await import("./plugin/verbs.js");
type Converter = import("./convert/types.js").Converter;
type Edge = import("./convert/types.js").Edge;
type ToolStatus = import("./convert/types.js").ToolStatus;

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};
const cap = (name: string) => { const c = allCaps().find((x) => x.name === name); if (!c) throw new Error(`没有能力 ${name}`); return c; };

/** 假转换器：把输入原文加一个标记写到 output（照 UmbraPC tests/convertEngine.test.ts 的 fake） */
function fake(id: string, edges: Edge[], status: ToolStatus = { ok: true }): Converter {
  return {
    id, name: id, edges, maxParallel: 2,
    status: async () => status,
    async convert(step) { await writeFile(step.output, `${await readFile(step.input, "utf-8")}>${id}:${step.to}`); },
  };
}
const CONV_TMP = await mkdtemp(join(STATE, "conv-tmp-"));
setConvertEngine(new ConvertEngine([
  fake("img", [{ from: "png", to: "jpg" }, { from: "png", to: "pdf", note: "只转第 1 页" }]),
  fake("ff", [{ from: "png", to: "webp" }], { ok: false, reason: "没装 FFmpeg", hint: "brew install ffmpeg" }),
], CONV_TMP));

const projDir = join(STATE, "proj");
const OUTSIDE = join(STATE, "外面");
await mkdir(join(projDir, "图"), { recursive: true });
await mkdir(OUTSIDE, { recursive: true });
await writeFile(join(projDir, "project.json"), JSON.stringify({ name: "proj", title: "转换回归" }));
await writeFile(join(projDir, "图", "封面.png"), "png-src");
await writeFile(join(projDir, "图", "封面.jpg"), "我是用户原来就有的 jpg，不许被盖掉");
await writeFile(join(OUTSIDE, "秘密.png"), "项目外的东西");
const project = await loadProject(projDir);

const PLUGIN_RW = { manifest: { id: "com.umbra.convtest", name: "t", version: "1.0.0", hostApi: "^1", surfaces: ["ui"], permissions: { files: ["read", "write"], scope: "project" } } as never, project };
const PLUGIN_RO = { manifest: { id: "com.umbra.convtest.ro", name: "t", version: "1.0.0", hostApi: "^1", surfaces: ["ui"], permissions: { files: ["read"], scope: "project" } } as never, project };
const asAi = { project, via: "mcp" as const };

console.log("格式转换 · 宿主能力 file.convert（2026-10-18）");

/* ── ① 白名单与权限等级 ── */
{
  const names = allowedCapNames();
  ok(names.includes("file.convert") && names.includes("list_convert_targets"), "白名单里有 file.convert 和 list_convert_targets", names.filter((n) => /convert/.test(n)).join(" "));
  ok(!names.includes("convert_file"), "插件面只认 file.convert 一个名字（注册表名 convert_file 不另开一个口）");
  const denied = await hostCall(PLUGIN_RO, "file.convert", { path: "图/封面.png", to: "pdf" });
  ok(!denied.ok && /files:"write"/.test(denied.errors[0]?.message ?? ""), "**只声明 read 的插件调不了 file.convert**（它要 write）", denied.errors[0]?.message);
  ok(!existsSync(join(projDir, "图", "封面.pdf")), "被拒的那一次一个文件都没落");
  const ro = await hostCall(PLUGIN_RO, "list_convert_targets", { path: "图/封面.png" });
  ok(ro.ok, "只声明 read 的插件调得到 list_convert_targets（它只读）", JSON.stringify(ro.errors));
  const mcp = capsFor("mcp").map((c) => c.name);
  ok(mcp.includes("convert_file") && mcp.includes("list_convert_targets"), "MCP 面（外部客户端 / 通道 B 的本地 CLI）也有这两件 —— 同一张注册表");
}

/* ── ② 能转成什么：可用的说经由、不可用的说原因和安装命令 ── */
{
  const r = await hostCall(PLUGIN_RO, "list_convert_targets", { path: "图/封面.png" });
  const d = r.data as { from: string; targets: Array<{ to: string; available: boolean; reason?: string; hint?: string; note?: string; via?: string }> };
  const pdf = d.targets.find((t) => t.to === "pdf"), webp = d.targets.find((t) => t.to === "webp");
  ok(d.from === "png" && pdf?.available === true && pdf.note === "只转第 1 页" && pdf.via === "img", "可用的目标带 note / via", JSON.stringify(pdf));
  ok(webp?.available === false && webp.reason === "没装 FFmpeg" && webp.hint === "brew install ffmpeg", "**不可用的说原因 + 一行安装命令**", JSON.stringify(webp));
  const unk = await cap("list_convert_targets").run({ path: "project.json" } as never, asAi);
  ok(!unk.ok && /不认识这个文件的格式/.test(unk.errors[0]?.message ?? ""), "认不出的源格式照实说（不猜文件头）", unk.errors[0]?.message);
}

/* ── ③ 越出项目根 / 软链指到外面：一律拒，并且一个字节都不落 ── */
{
  const before = (await readdir(OUTSIDE)).sort().join(",");
  const tries: Array<[string, string]> = [
    ["../外面/秘密.png", "..  跨出项目根"],
    [join(OUTSIDE, "秘密.png"), "绝对路径指到项目外"],
    ["图/../../外面/秘密.png", "中间夹 .. 绕出去"],
  ];
  for (const [path, what] of tries) {
    const r = await hostCall(PLUGIN_RW, "file.convert", { path, to: "jpg" });
    ok(!r.ok && r.errors[0]?.code === "E_BAD_INPUT" && /跨出了项目目录/.test(r.errors[0]?.message ?? ""), `拒：${what}`, r.errors[0]?.message);
  }
  /* 软链两种：链到一个文件、链到一个目录。字面上都在项目里，真身在外面 */
  await symlink(join(OUTSIDE, "秘密.png"), join(projDir, "链.png"));
  await symlink(OUTSIDE, join(projDir, "链目录"), "dir");
  for (const [path, what] of [["链.png", "软链指向项目外的文件"], ["链目录/秘密.png", "经由指向项目外的目录"]] as const) {
    const r = await hostCall(PLUGIN_RW, "file.convert", { path, to: "jpg" });
    ok(!r.ok && /指向项目外面的链接/.test(r.errors[0]?.message ?? ""), `**拒：${what}**（按真实路径判，不按字面）`, r.errors[0]?.message);
    const t = await cap("list_convert_targets").run({ path } as never, asAi);
    ok(!t.ok, `list_convert_targets 也拒：${what}`);
  }
  ok((await readdir(OUTSIDE)).sort().join(",") === before, "项目外那个目录里一个文件都没多（成品没落到外面）", before);
  ok(!existsSync(join(projDir, "链.jpg")) && !existsSync(join(projDir, "秘密.jpg")), "项目里也没多出转换产物");
  /* 对照组：项目**里面**的软链（真身也在里面）照常能转 —— 不然上面那几条「拒」分不清是闸在拦还是软链一律不通 */
  await symlink(join(projDir, "图", "封面.png"), join(projDir, "内链.png"));
  const inner = await hostCall(PLUGIN_RW, "file.convert", { path: "内链.png", to: "pdf" });
  const id = inner.data as { output?: string };
  ok(inner.ok && id.output === "图/封面.pdf", "**对照组**：真身在项目里的软链照常转，成品落在真身旁边", JSON.stringify(inner.data));
  /* 文件要真的在 —— 不然拒它的是「没有这个文件」，测不到「工具目录不转」那道闸 */
  await mkdir(join(projDir, ".umbrastudio"), { recursive: true });
  await writeFile(join(projDir, ".umbrastudio", "x.png"), "tool-state");
  const tool = await hostCall(PLUGIN_RW, "file.convert", { path: ".umbrastudio/x.png", to: "jpg" });
  /* ⚠️ **2026-10-21 改准了一次**（Q77）：原来钉的是「工具自己的文件或状态目录」这**九个字**，
     而那一批把拒因按判准分了档（`files.ts` 的 `denyReason`：我们的产物 / `.git` 两套话），
     于是**行为完全没变而这条判据红了** —— 它拒了，只是换了措辞。
     改成钉**那道闸的三件实事**：拒了 · 拒因点名了这个路径 · 成品一个字节都没落。
     措辞不钉（`00` §161.5：判据要钉住它声称的那道闸，不钉措辞）。 */
  ok(!tool.ok && /\.umbrastudio/.test(tool.errors[0]?.message ?? "") && /不转/.test(tool.errors[0]?.message ?? "")
     && !existsSync(join(projDir, ".umbrastudio", "x.jpg")),
    "工具状态目录（.umbrastudio/）里的东西不转", tool.errors[0]?.message);
}

/* ── ④ 成品在源文件旁边、重名顺延、永不覆盖；落盘后记了一版 ── */
{
  const r1 = await hostCall(PLUGIN_RW, "file.convert", { path: "图/封面.png", to: ".JPEG" });
  const d1 = r1.data as { state: string; output: string; via?: string; snapshot: string | null };
  ok(r1.ok && d1.state === "done" && d1.output === "图/封面 (1).jpg", "**旁边已有 封面.jpg → 成品叫 封面 (1).jpg**", JSON.stringify(d1));
  ok(await readFile(join(projDir, "图", "封面.jpg"), "utf8") === "我是用户原来就有的 jpg，不许被盖掉", "原来那份 封面.jpg 一个字节没动");
  ok(await readFile(join(projDir, "图", "封面.png"), "utf8") === "png-src", "源文件一个字节没动");
  ok(await readFile(join(projDir, "图", "封面 (1).jpg"), "utf8") === "png-src>img:jpg", "成品是转换器写的那份", d1.via);
  const r2 = await hostCall(PLUGIN_RW, "file.convert", { path: "图/封面.png", to: "jpg" });
  ok((r2.data as { output: string }).output === "图/封面 (2).jpg", "再转一次顺延到 (2)，不覆盖 (1)");
  const vers = await cap("list_file_versions").run({ path: "图/封面 (1).jpg" } as never, asAi);
  const snaps = (vers.data as { snapshots: Array<{ version: string; src: string; note?: string }> }).snapshots;
  ok(d1.snapshot === "s1" && snaps.length === 1 && snaps[0]!.src === "插件" && /由 图\/封面.png 转换/.test(snaps[0]!.note ?? ""),
    "**成品记了一版快照，来源写「插件」**（版本历史里看得出是谁转的）", JSON.stringify(snaps));
  const ai = await cap("convert_file").run({ path: "图/封面.png", to: "pdf" } as never, asAi);
  const aiv = await cap("list_file_versions").run({ path: (ai.data as { output: string }).output } as never, asAi);
  ok(ai.ok && (aiv.data as { snapshots: Array<{ src: string }> }).snapshots[0]?.src === "AI", "经 MCP 转的记「AI」", (ai.data as { output: string }).output);
  const left = (await readdir(CONV_TMP)).length;
  ok(left === 0, "引擎的临时目录删干净了", `${left} 项`);
}

/* ── ⑤ 目标格式：认不出就拒，不猜 ── */
{
  for (const to of ["exe", "", "jpg; rm -rf /", "../pdf"]) {
    const r = await hostCall(PLUGIN_RW, "file.convert", { path: "图/封面.png", to });
    ok(!r.ok && r.errors[0]?.code === "E_BAD_INPUT" && /不认识目标格式/.test(r.errors[0]?.message ?? ""), `拒：目标格式 ${JSON.stringify(to)}`);
  }
  const same = await hostCall(PLUGIN_RW, "file.convert", { path: "图/封面.png", to: "png" });
  ok(!same.ok && (same.data as { state: string }).state === "skipped", "已经是这个格式：skipped 且 ok:false（不假装转了）", JSON.stringify(same.data));
  const none = await hostCall(PLUGIN_RW, "file.convert", { path: "图/封面.png", to: "webp" });
  ok(!none.ok && /没法把 PNG 转成 WebP/.test((none.data as { error: string }).error), "没装工具的目标：failed + 一句人话", (none.data as { error: string }).error);
}

/* ── ⑥ 应用内会话（通道 A / C）的手写工具表也接上了，而且转调的是同一件能力 ── */
{
  const { executeToolCall } = await import("./chat_run.js");
  const out = JSON.parse(await executeToolCall(project, { id: "t1", type: "function", function: { name: "convert_file", arguments: JSON.stringify({ project: "proj", path: "../外面/秘密.png", to: "jpg" }) } } as never));
  ok(out.ok === false && /跨出了项目目录/.test(out.error), "通道 A/C 的 convert_file 走同一道路径闸", out.error);
  const t = JSON.parse(await executeToolCall(project, { id: "t2", type: "function", function: { name: "list_convert_targets", arguments: JSON.stringify({ project: "proj", path: "图/封面.png" }) } } as never));
  ok(t.ok === true && Array.isArray(t.targets) && t.targets.some((x: { to: string }) => x.to === "webp"), "通道 A/C 的 list_convert_targets 回目标清单");
  const src = readFileSync(join(TOOL_ROOT, "server", "src", "chat_run.ts"), "utf8");
  ok(/name: "convert_file"/.test(src) && /name: "list_convert_targets"/.test(src), "两件都进了通道 A/C 的工具表（模型看得见才会调）");
}

/* ── ⑦ 副本和 PC 那份有没有分叉 ──
   `server/src/convert/` 是从 UmbraPC `electron/core/convert/` 拷来的。两边改了一边，这里要红。
   比的是「逻辑部分」：去掉 import 行（路径和 `.js` 后缀两边本来就不同）、副本头上那行「来源：」、
   以及后缀 `!` 非空断言（Studio 开了 noUncheckedIndexedAccess、PC 没开 —— 这是两边唯一的必要差异）。
   PC 仓不在旁边就整块跳过（CI / 别人的机器上没有它），**跳过要说出来**，不能和「比过了一致」长得一样。 */
{
  const PC = join(TOOL_ROOT, "..", "UmbraPC", "electron", "core", "convert");
  const HERE = join(TOOL_ROOT, "server", "src", "convert");
  const norm = (s: string) => s.split("\n")
    .filter((l) => !/^import\s/.test(l) && !/^\/\/ 来源：UmbraPC /.test(l))
    .map((l) => l.replace(/(?<=[\w)\]])!(?!=)/g, "").replace(/\s+$/, ""))
    .join("\n").trim();
  /* 登记表要全：副本目录里除了 Studio 自己的 index.ts / util.ts，每一份都得在 COPIED_FROM_PC 里，漏登记的不会被比 */
  const onDisk: string[] = [];
  const walk = (d: string, pre = "") => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name), `${pre}${e.name}/`);
      else if (e.name.endsWith(".ts")) onDisk.push(pre + e.name);
    }
  };
  walk(HERE);
  const unregistered = onDisk.filter((f) => !COPIED_FROM_PC.includes(f) && f !== "index.ts" && f !== "util.ts");
  ok(unregistered.length === 0, "副本目录里的每一份都登记在 COPIED_FROM_PC（漏登记的不会被比）", unregistered.join(" · ") || `${onDisk.length} 份`);
  const heads = COPIED_FROM_PC.filter((f) => !readFileSync(join(HERE, f), "utf8").startsWith(`// 来源：UmbraPC electron/core/convert/${f}（`));
  ok(heads.length === 0, "每份副本第一行写着来源（文件 + 日期 + 提交）", heads.join(" · ") || "都有");
  if (!existsSync(PC)) {
    console.log(`  · 跳过「副本与 PC 来源一致」：旁边没有 UmbraPC 仓（${PC}）`);
  } else {
    /* 先证明仪器不是零：改一个字，比对必须报不一致（纪律④） */
    const sample = readFileSync(join(HERE, "route.ts"), "utf8");
    ok(norm(sample) !== norm(sample.replace("MAX_STEPS = 3", "MAX_STEPS = 4")) && norm(sample).length > 1000,
      "**比对仪器本身是活的**：改一个数字就判不一致（不然「一致」可能只是什么都没比）");
    const drift: string[] = [];
    for (const f of COPIED_FROM_PC) {
      const a = norm(readFileSync(join(HERE, f), "utf8")).split("\n");
      let b: string[];
      try { b = norm(readFileSync(join(PC, f), "utf8")).split("\n"); }
      catch { drift.push(`${f}：PC 那边没有这个文件了`); continue; }
      const i = a.findIndex((l, k) => l !== b[k]);
      if (i >= 0 || a.length !== b.length) {
        const k = i >= 0 ? i : Math.min(a.length, b.length);
        drift.push(`${f} 第 ${k + 1} 行（规范化后）：Studio「${(a[k] ?? "∅").slice(0, 60)}」≠ PC「${(b[k] ?? "∅").slice(0, 60)}」`);
      }
    }
    ok(drift.length === 0, "**副本与 PC 来源的逻辑部分一致**（不一致 = 有一边改了，请同步另一边并更新副本头上的提交号）",
      drift.length ? drift.join(" · ") : `${COPIED_FROM_PC.length} 份都一致`);
  }
}

/* ── ⑧ 真转一次：本机有 /usr/bin/sips 才跑（macOS 自带），png → jpg ── */
if (process.platform === "darwin" && existsSync("/usr/bin/sips")) {
  setConvertEngine(null);   // 换回真引擎
  await writeFile(join(projDir, "图", "真图.png"), tinyPng(4, 3));
  const r = await hostCall(PLUGIN_RW, "file.convert", { path: "图/真图.png", to: "jpg", quality: 80 });
  const d = r.data as { state: string; output?: string; via?: string; error?: string };
  const jpg = d.output ? await readFile(join(projDir, d.output)).catch(() => Buffer.alloc(0)) : Buffer.alloc(0);
  ok(r.ok && d.output === "图/真图.jpg" && jpg[0] === 0xff && jpg[1] === 0xd8 && jpg[2] === 0xff,
    "**真转换：sips 把 png 转成了 jpg**（成品以 FF D8 FF 开头）", `${d.via ?? d.error} · ${jpg.length} 字节`);
} else {
  console.log("  · 跳过真转换：这台机器上没有 /usr/bin/sips");
}

/* ── ⑧ 「能转成什么」只列对用户有意义的成品（2026-10-22，同步 PC b6874dc）──
   起因是 sam 在 PC 上实测：右键一张 PNG 列出近 30 种，含 mp3 / wav / mp4 / epub / odt；
   PNG + WAV 多选交集出来 6 种音频。**病根是「可达」按传递闭包算** ——
   `reachable()` 把 `png → gif → mp4 → mp3` 这种串得通的多步链路也算够得着。
   > **「技术上转得到」和「有人要这个成品」是两件事，而只有前者是算得出来的。**

   ⚠️ **Studio 这边是同一个病**：`list_convert_targets` → `convertEngine().targets()`
   → `engine.ts` 那一行，**唯一一条路**，没有第二处自己算可达格式的地方（已 grep 确认）。
   所以同步 `engine.ts` 就把它一起修掉了，而判据要留在这边 ——
   **PC 的测试跑不到 Studio 的能力面上**。

   ⚠️ 判据用**最坏情况的边表**（一个「什么都能直转什么」的假转换器），理由和 PC 那份一样：
   Studio 真实的转换器集比 PC 窄（不带 builtin），拿真实集去测的话
   「png 的目标里没有音频」**可能只是因为这台机器压根没有那条边** ——
   那又是一条「今天恰好没事」。 */
console.log("\n⑧ 「能转成什么」只列有意义的成品（PC b6874dc 同步）");
{
  const { sensible } = await import("./convert/engine.js");
  const { FORMATS: FMTS, formatById: fbi } = await import("./convert/formats.js");
  const ids = FMTS.map((f) => f.id);
  /* 最坏情况：一个转换器声称**任何格式都能直接转成任何格式**。
     这样「列出来的少」只可能是 `sensible()` 筛掉的，不可能是「图上没路」。 */
  const widest = fake("最宽", ids.flatMap((f) => ids.filter((t) => t !== f).map((t) => ({ from: f, to: t }))));
  const wideTmp = await mkdtemp(join(STATE, "conv-wide-"));
  const wideEngine = new ConvertEngine([widest], wideTmp);
  const sampleDir = await mkdtemp(join(STATE, "conv-sample-"));
  const mkSample = async (name: string) => { const q = join(sampleDir, name); await writeFile(q, "x"); return q; };
  const listed = async (...names: string[]) =>
    (await wideEngine.targets(await Promise.all(names.map(mkSample)))).targets.map((t) => t.to);
  const catOf = (id: string) => fbi(id)?.category;

  /* ⚠️ **先证明仪器不是零**：这张最宽的边表真的能把所有格式都算成可达 ——
     不然「没列出音频」可能只是因为 `targets()` 整个回了空（纪律④）。 */
  const rawReach = (await import("./convert/route.js")).reachable([widest], "png");
  ok(rawReach.size > 20 && [...rawReach].some((t) => catOf(t) === "audio"),
     "**（仪器自检）这张最宽的边表确实让 png 够得着音频** —— 所以下面「没列音频」是筛掉的，不是没路",
     `可达 ${rawReach.size} 种，含音频 ${[...rawReach].filter((t) => catOf(t) === "audio").length} 种`);

  for (const name of ["a.png", "a.jpg", "a.heic", "a.webp"]) {
    const to = await listed(name);
    const bad = to.filter((t) => ["audio", "video", "document", "ebook", "text", "sheet", "slides"].includes(catOf(t) ?? ""));
    ok(to.length > 0 && bad.length === 0 && to.includes("pdf"),
       `图片 ${name}：目标里没有音视频 / 文档 / 电子书 / 纯文本，但有 pdf`,
       bad.length ? `✗ 还列着 ${bad.join(" · ")}` : to.join(" · "));
  }
  ok((await listed("a.png", "b.wav")).length === 0,
     "**PNG + WAV 多选：交集是空的**（原来冒出 6 种音频）", JSON.stringify(await listed("a.png", "b.wav")));
  {
    const to = await listed("说明.txt");
    ok(["pdf", "jpg", "docx"].every((x) => to.includes(x)) && to.filter((t) => ["audio", "video"].includes(catOf(t) ?? "")).length === 0,
       "**多步链路该留的留住**：txt → pdf / jpg / docx 还在（txt → JPG 是一张整页图，有用），但不转音视频", to.join(" · "));
  }
  ok((await listed("a.wav")).every((t) => catOf(t) === "audio"), "音频只到音频", (await listed("a.wav")).join(" · "));
  {
    const v = await listed("a.mp4");
    ok(["mov", "mp3", "gif"].every((x) => v.includes(x)) && !v.includes("png") && !v.includes("pdf"),
       "视频到视频 / 音频 / gif，**不到 png**（「第一帧」没人要）", v.join(" · "));
  }
  ok((await listed("a.gif")).includes("mp4"), "gif 能转视频（它是图片类，但这是常用需求 —— 类别表之外单列的那一条）");
  /* `sensible()` 本身那张表 —— 照 PC `tests/convertTargetsMeaningful.test.ts` 最后一节逐条对 */
  const table: Array<[string, string, boolean]> = [
    ["png", "mp3", false], ["png", "mp4", false], ["png", "epub", false], ["png", "pdf", true],
    ["txt", "jpg", true], ["pdf", "docx", true], ["xlsx", "pdf", true], ["pptx", "png", true],
    ["docx", "mp4", false], ["gif", "mp4", true], ["mp4", "gif", true], ["mp4", "png", false],
  ];
  const wrong = table.filter(([f, t, want]) => sensible(f, t) !== want).map(([f, t, want]) => `${f}→${t} 应 ${want}`);
  ok(wrong.length === 0, "`sensible()` 那张类别表逐条对得上 PC 的测试（12 条）", wrong.join(" · ") || "12/12");
}

/** 一张 w×h 的纯色 PNG（手拼：签名 + IHDR + IDAT + IEND，CRC 自己算） */
function tinyPng(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;   // 8 位 RGB
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/* ══════════════════════════════════════════════════════════════════════
   ⑮ 转换工具不许读文档里引用的项目外文件（issue #172 / PC #126）

   `cap/convert.ts` 自己写明了这条线：「不判这一条，`file.convert("链/id_rsa","txt")`
   就能把项目外的文件转一份放进项目 —— **等于读了它**」。
   而 `resolveSource` 只核了**源文件本身**的真实路径 ——
   可转换工具会按**文档里的引用**自己去读别的文件，**那一步宿主看不见**：
   pandoc 把 `![](任意路径)` 嵌进 docx、LibreOffice 把 `file:///…` 的链接图片渲染进 pdf。

   ⚠️⚠️ **三样加固的代码 2026-10-22 已经同步进来了（PC #126），而这边一条判据都没有。**
   `office.ts` 的注释甚至写着「测试钉着 `--sandbox` 在里面」—— **那句话当时是假的**。
   > **把一条不存在的判据写进注释，等于给未来的人一个假的安全感。**
   后果不是今天错，是「下次有人顺手把 `--sandbox` 优化掉，全套回归照旧全绿」。

   ⚠️ 全是**纯函数**判据：不需要机器上真装 pandoc / LibreOffice。
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑮ 转换工具不许读文档里引用的项目外文件（issue #172）");
{
  const O = await import("./convert/converters/office.js");
  const M = await import("./convert/converters/mac.js");

  /* ── pandoc：`--sandbox` 一律在，而且**排在最前面** ── */
  const pa = O.pandocArgs("md", "docx", "/项目/x.md", "/项目/x.docx");
  ok(pa.includes("--sandbox"), "**pandoc 参数里有 `--sandbox`**（不然 md 里 `![](任意路径)` 会被读进成品）", pa.join(" "));
  ok(pa[0] === "--sandbox", "而且排在最前面（放在 `-f` 之后也行，但定下来比留着歧义好）", String(pa[0]));
  /* 四条边都要有 —— 一条漏了就是一条没关的门 */
  const allEdges = (["docx", "odt", "epub"] as const).every((to) => O.pandocArgs("md", to, "i", "o").includes("--sandbox"))
    && O.pandocArgs("html", "docx", "i", "o").includes("--sandbox");
  ok(allEdges, "md→docx/odt/epub 与 html→docx **每一条边**都带它（漏一条就是一扇没关的门）");

  /* ── 版本太旧不退回「不加 sandbox 的跑法」──
     ⚠️ 这一条是**反方向**的：它要求「做不到就不做」，而不是「做不到就凑合」。
     凑合的代价是悄悄回到有洞的那条路，而用户看不出区别。 */
  ok(O.pandocHasSandbox([2, 15, 0]) && O.pandocHasSandbox([3, 1, 0]), "2.15 / 3.1 认得出支持 sandbox");
  ok(!O.pandocHasSandbox([2, 14, 2]) && !O.pandocHasSandbox([1, 19, 0]),
     "**2.14 / 1.19 判成不支持** —— 这几条边干脆不登记，不退回不加 sandbox 的跑法");
  ok(/2\.15/.test(O.pandocTooOld("2.14.2")) && /2\.14\.2/.test(O.pandocTooOld("2.14.2")),
     "版本太旧的话**把要求和现状都说出来**（只说「太旧」用户不知道该升到哪）", O.pandocTooOld("2.14.2"));
  ok(O.parsePandocVersion("pandoc 3.1.11\nFeatures: …")?.[0] === 3, "版本号解析得出来", JSON.stringify(O.parsePandocVersion("pandoc 3.1.11")));

  /* ── LibreOffice：加固项真写进 registrymodifications.xcu，而且**别的项照留** ── */
  const names = O.LO_HARDENING.map((h) => h[1]);
  ok(names.includes("BlockUntrustedRefererLinks"), "加固清单里有 `BlockUntrustedRefererLinks`（禁止加载外部链接资源）", names.join(" · "));
  ok(names.includes("MacroSecurityLevel"), "也把宏安全级拉到最高", names.join(" · "));
  const fresh = O.hardenXcu(null);
  ok(names.every((n) => fresh.includes(n)), "没有现成配置时**新建一份**，清单里每一项都在");
  /* ⚠️ 这一条是分寸所在：我们**不碰用户自己那份 LibreOffice 配置**里别的东西 */
  const mine = '<?xml version="1.0"?><oor:items xmlns:oor="x"><item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="用户自己的项" oor:op="fuse"><value>42</value></prop></item></oor:items>';
  const merged = O.hardenXcu(mine);
  ok(merged.includes("用户自己的项") && names.every((n) => merged.includes(n)),
     "**合并而不是覆盖** —— 用户自己那份配置里别的项一个不动");
  /* ⚠️ **第一版判准是错的**：我写的是「每个名字在结果里恰好出现一次」，
     而 `LO_HARDENING` 里**有两个 `Link`**（`/…/Security` 和 `/…/Filter` 下的同名项，
     读数一眼看得出：`… · Link · Link · …`）—— 于是它红了，而产品是对的。
     > **「幂等」的定义是「做两次等于做一次」，不是「每个名字只出现一次」** ——
     > 我测的是后者，而那是我顺手想出来的一个**近似**，它在样本里不成立。 */
  const twice = O.hardenXcu(merged);
  ok(twice === merged, "**幂等** —— 合并两次和合并一次结果一模一样（不会把同一项写两遍）",
     twice === merged ? `${merged.length} 字节` : `${merged.length} → ${twice.length} 字节`);

  /* ── textutil：html 进来带 `-noload` ── */
  const ta = M.textutilArgs("html", "docx", "i", "o");
  ok(ta.includes("-noload"), "**textutil 转 html 时带 `-noload`**（不去取页面引用的资源）", ta.join(" "));
  ok(!M.textutilArgs("rtf", "docx", "i", "o").includes("-noload"),
     "非 html 的源不带它（那个开关只对 html 有意义，乱加等于让别的边跟着变）");
}

stopAllVerbSandboxes();
await rm(STATE, { recursive: true, force: true });
console.log(fail === 0 ? `\n✓ 格式转换 ${pass}/${pass + fail}` : `\n✗ 格式转换 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
