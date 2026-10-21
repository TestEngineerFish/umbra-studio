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

stopAllVerbSandboxes();
await rm(STATE, { recursive: true, force: true });
console.log(fail === 0 ? `\n✓ 格式转换 ${pass}/${pass + fail}` : `\n✗ 格式转换 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
