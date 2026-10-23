import { z } from "zod";
import { envelope, err, ToolError } from "../envelope.js";
import { X } from "../codes.js";
import { getPluginLimits } from "../plugin/limits.js";
import { countTypes, denyReason, fileSizeOf, isTextual, lineDelta, listFiles, listSnapshotMeta, moveFile, normalizeRel, readAnyFile, readFileRange, readSnapshotBytes, readSnapshotContent, referencesOf, revertFile, sha256, trashFile, writeAnyFile } from "../files.js";
import { writeDraft } from "../write.js";
import { draftKindOf, parseDraft } from "../draft.js";
import { isEditable, markEditable } from "../records.js";
import { isInside } from "../pathguard.js";
import { existsSync } from "node:fs";
import { readFile as readFileP, readdir as readdirP, stat as statP } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { gitFallbackOf } from "../gitkeep.js";
import { clearStagedDraft, getStagedDraft, listStagedDrafts, stageDraft } from "../staged.js";
import { defineCap } from "./registry.js";
import { originOf, type CapCtx } from "./types.js";

/** 泛型文件层的能力（M11-1 第一批）。
 *
 *  **为什么先搬这一组**：插件要做的就是「给某种格式加编辑方式」（Q37），
 *  而任何格式的编辑最后都落在这几件上 —— 列、读、写、改名、看版本、回退、扔、查引用。
 *  这一组定下来，插件面需要什么就清楚了。
 *
 *  ⚠️ **这里只有声明，没有实现** —— 实现在 `files.ts`，两个门面以前各包装了它一遍。
 *  这一层要做的就是把那两层样板合成一份。
 */
const p = (c: CapCtx) => c.project!;    // scope: "project" 的能力，门面保证不为 null

/** 把调用方给的 `content` 变成要落盘的东西（#108）。
 *
 *  ⚠️ **base64 不合法要当场拒**，不能让 `Buffer.from` 悄悄吃掉。
 *  `Buffer.from(x, "base64")` 对非法输入**不报错**，它跳过认不出的字符
 *  —— 于是一个打错的 base64 会写出一个**体积不对但确实存在**的文件，
 *  而用户看到的是「保存成功了，图打不开」。
 *  **静默损坏比报错糟得多**（§161.3「假成功」同一条）。 */
function decodeContent(content: string, encoding?: "utf8" | "base64"): string | Buffer {
  /* ⚠️⚠️ **这里必须按白名单判，不能写 `if (encoding !== "base64") return content`**
     （2026-10-23 核 Q80 时查出来的，而它不是 Q80 引入的 —— #108 那轮就埋下了）。
     类型签名说 `encoding` 只有两个值，**而插件这条路不跑 zod**：
     `plugin/host.ts` 最后一行是 `cap.run(input as never, …)`，
     `gaptest` 里也写着「插件这条路不跑 zod，手工核」。
     于是一个插件给 `"BASE64"` / `"b64"` / `0` 都能进来，
     而 `!== "base64"` 会把它们**当 utf8 文本写进去** ——
     **一张花掉的图片，而回执说写成功。**
     > **「写坏了」和「没写」长得完全不一样，而前者更难发现**（#108 自己记着的那条）。
     ⚠️ 修在这里而**不是**在 `hostCall` 里补一道 zod：问题是「插件这条路**一律**不跑 zod」，
     只给这一条路加闸，下一件收 enum 的能力照样漏（#75「一道闸只守住一条路等于没守」同族）。
     ⚠️ 判准是**白名单**（列出认的）而不是黑名单（列出不认的）——
     黑名单的话「以后多一种 encoding」会被静默当 utf8，而**没有判据会红**（M14-3 那条）。 */
  if (encoding === undefined || encoding === "utf8") return content;
  if (encoding !== "base64") {
    throw new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name: "encoding" },
      `认不出的 encoding：${JSON.stringify(encoding)}`,
      { fix: `encoding 只能不给、给 "utf8"（写文本）或给 "base64"（写二进制）。不给就是 utf8。` }));
  }
  const clean = content.replace(/^data:[^,]*,/, "").trim();   // 顺手吃掉 data URL 前缀
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean.replace(/\s+/g, ""))) {
    throw new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name: "content" },
      "这不是合法的 base64",
      { fix: "encoding 给了 base64，而 content 里有 base64 之外的字符。要写文本就别给 encoding。" }));
  }
  return Buffer.from(clean.replace(/\s+/g, ""), "base64");
}


defineCap({
  name: "list_files", title: "列目录", scope: "project",
  summary: "列一个目录下的文件与子目录（含类型、大小、改动时间）。不递归 —— 要看深层就再调一次。",
  input: { dir: z.string().optional().describe("相对项目根的子目录，不给就是项目根"), limit: z.number().optional() },
  http: { route: "files", method: "GET" },
  run: async ({ dir, limit }, c) => envelope(await listFiles(p(c), dir ?? "", limit)),
});

defineCap({
  name: "read_file", title: "读一个文件（非设计稿）", scope: "project",
  summary: [
    "读文本文件，返回内容与 sha256。**写回去要把这个 sha256 原样带上** —— 盘上被别人改过就会被拒绝，不会把改动盖掉。",
    "二进制文件（PDF / 表格 / 压缩包…）不给正文（`content: null`）；**插件调用时**另给 `encoding: \"base64\"` + `base64` 原样字节（上限见设置 → 插件沙箱，默认 100 MB）。**插件调用时**文本整份读的上限也跟设置走（默认 2 MB）；别的来源一律 2 MB。",
    "**插件调用时**还能按字节范围读：`byteOffset` + `byteLength` 两个都给（非负整数，`byteLength` 1..上限，`byteOffset` ≤ size），任何文件都按原始字节读、只读那一段，"
      + "回 `content: null` + `encoding: \"base64\"` + `base64` + `range: { byteOffset, byteLength(实际读到的), size, more }`。"
      + "⚠️ **范围读不给 sha256**（只读了一段，算不出整份的）—— 要写回请整份读。不能和 offset / limit（按行分页）同时给。`encoding` 只能不给或给 `\"base64\"`（范围读不解码），给别的回 E_BAD_INPUT。模型 / MCP / 前端调用不开放。",
    "`encoding` 给别的编码时**只换读法，盘上那份一个字节都没动**（M10-5，中文 CSV 常被当成 UTF-8 读成乱码）。",
    "⚠️ `sha256` 永远是**原始字节**的，不随编码变 —— 所以按 GBK 读出来的文本，拿这个 sha 回去校验仍然对得上。",
    "**类型表不认得的扩展名**（`.log` / `.conf` / `.env.example` …）会自动嗅探：没有 NUL 字节且解得出 UTF-8 就当文本给正文；超过上限时给**开头一段**并带 `truncated: true`。嗅探判错时加 `asText: true` 强制按文本读。",
  ].join("\n"),
  input: {
    path: z.string().describe("相对项目根的文件路径"),
    encoding: z.string().optional().describe("按哪种编码读；不给就是 utf-8。能用的：gbk / gb18030 / big5 / shift_jis / utf-16le / windows-1252"),
    /* 分页（M13-3）：大文件整读会把模型上下文撑爆。按**行**切，1 起算。
       ⚠️ 切过的 `content` 不能原样 `write_file` 回去（那会把文件写成一页）—— `range` 字段在就说明是一页，回包里也写明。 */
    offset: z.number().int().min(1).optional().describe("从第几行起（1 起算）。给了就按行分页"),
    limit: z.number().int().min(1).max(5000).optional().describe("最多给几行。只给 limit 不给 offset = 从第 1 行起"),
    /* 按字节范围读（2026-10-19）：**只对插件开放**，模型 / MCP / 前端给了就拒（见 run 里）。 */
    byteOffset: z.number().int().min(0).optional().describe("（仅插件）按字节读：从第几个字节起（0 起算）。要和 byteLength 一起给"),
    byteLength: z.number().int().min(1).optional().describe("（仅插件）按字节读：读多少字节（1..上限）。要和 byteOffset 一起给"),
    /* M14-11 / Q76：「用纯文本打开」那颗钮。⚠️ **只对 `other`（类型表不认得的）有意义** ——
       它跳过的是嗅探，不是类型表：`.png` 给了 asText 也不会按文本读。 */
    asText: z.boolean().optional().describe("未知扩展名：跳过「看着像不像文本」的嗅探，直接按文本读。嗅探判错时的出路"),
  },
  http: { route: "file", method: "GET" },
  run: async ({ path, encoding, offset, limit, byteOffset, byteLength, asText }, c) => {
    /* ⚠️ **插件这条路不跑 zod**（`host.ts` 直接 `cap.run`，HTTP 门面也不跑）—— 上面那几个 `.int().min()` 对插件不算数，
       字节范围的入参在这里手工核。核不过一律回 E_BAD_INPUT 信封，**不抛**：`hostCall` 会把抛出来的东西包成 E_IO，
       插件就分不清「我参数给错了」和「盘坏了」。 */
    if (byteOffset !== undefined || byteLength !== undefined) {
      const no = (name: string, why: string, fix?: string) =>
        envelope(null, [err(X.BAD_INPUT, "(input)", { kind: "key", name }, why, fix ? { fix } : undefined)]);
      /* 非插件来源不开放：模型拿到一段 base64 读不懂、只占上下文；前端有自己的读法 */
      if (c.via !== "plugin") return no("byteOffset", "按字节范围读（byteOffset / byteLength）只对插件开放", "要文本就去掉这两个参数；大文件按行分页用 offset / limit");
      if (byteOffset === undefined || byteLength === undefined) {
        return no(byteOffset === undefined ? "byteOffset" : "byteLength", "byteOffset 和 byteLength 要一起给（只给了一个）",
          "从头读就给 byteOffset: 0");
      }
      if (offset !== undefined || limit !== undefined) {
        return no("offset", "按字节读（byteOffset / byteLength）和按行分页（offset / limit）不能同时给", "二选一：二进制或大文件按字节，文本按行");
      }
      /* 范围读一律回原始字节（base64），不解码 —— 给了别的 `encoding` 原来**被悄悄忽略**，插件以为拿到的是按 GBK 解好的文本。
         拒绝而不是忽略：`"base64"` 和回包的形状一致，允许；别的（含 utf-8 / gbk / null）一律 E_BAD_INPUT。 */
      if (encoding !== undefined && encoding !== "base64") {
        return no("encoding", `按字节范围读只回原始字节（base64），不按 encoding 解码；收到的 encoding 是 ${JSON.stringify(encoding)}`,
          "去掉 encoding，或给 \"base64\"；要按编码解成文本就整份读（不带 byteOffset / byteLength）");
      }
      const isNat = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
      if (!isNat(byteOffset)) return no("byteOffset", `byteOffset 要是非负整数，收到的是 ${JSON.stringify(byteOffset)}`);
      const max = (await getPluginLimits()).binaryReadMaxMB * 1048576;
      if (!isNat(byteLength) || byteLength < 1 || byteLength > max) {
        return no("byteLength", `byteLength 要是 1..${max} 的整数（上限 = 设置里的二进制读取上限 ${max / 1048576} MB），收到的是 ${JSON.stringify(byteLength)}`,
          "大文件分几段读：每段不超过上限，按回包 range.more 决定要不要读下一段");
      }
      const size = fileSizeOf(p(c), path);
      if (byteOffset > size) return no("byteOffset", `byteOffset ${byteOffset} 超过文件大小 ${size}`, "byteOffset 最大等于 size（那时回空段）");
      return envelope(await readFileRange(p(c), path, byteOffset, byteLength));
    }
    /* ⚠️ **插件调用时二进制按字节给**（2026-10-17 用户报：PDF 插件「宿主回的内容里既没有 base64 也没有 content」）。
       插件 SDK 的约定是二进制回 `encoding: "base64"` + `base64`，pdf / xlsx / zip 三个插件都按它写，而这里从来没给过。
       只对 `via === "plugin"` 打开：模型 / MCP 拿到一份 PDF 的 base64 只会撑爆上下文。
       上限以设置为准（`plugin/limits.ts`），只在插件这条路上读设置。 */
    const plugin = c.via === "plugin";
    /* 文本整份读的上限也只在插件这条路上读设置（`textReadMaxMB`）：模型 / MCP / HTTP 照旧 `TEXT_MAX`（2 MB），
       不让「设置里调大了」把一份大日志整个塞进模型上下文。 */
    const lim = plugin ? await getPluginLimits() : null;
    const r = await readAnyFile(p(c), path, encoding, lim
      ? { binary: true, binaryMax: lim.binaryReadMaxMB * 1048576, textMax: lim.textReadMaxMB * 1048576, asText }
      : { asText });
    if ((offset === undefined && limit === undefined) || r.content === null) return envelope(r);
    const lines = r.content.split("\n");
    const from = offset ?? 1;
    const to = Math.min(lines.length, from - 1 + (limit ?? lines.length));
    return envelope({
      ...r, content: from > lines.length ? "" : lines.slice(from - 1, to).join("\n"),
      /** 这是一页：`from`–`to` 行，共 `total` 行。**整份写回要先把整份读下来**（不带 offset / limit）。 */
      range: { from, to: Math.max(from - 1, to), total: lines.length, more: to < lines.length },
    });
  },
});

defineCap({
  name: "search_in_file", title: "在一个文件里找", scope: "project",
  summary: "按子串（可忽略大小写）在一个文本文件里找，回每处的行号与整行。要「这个词在这份文档哪几行」时用它，别把整份读进来翻。全项目找用 global_search。",
  input: {
    path: z.string(), query: z.string().min(1),
    ignoreCase: z.boolean().optional().describe("默认区分大小写"),
    limit: z.number().int().min(1).max(500).optional().describe("最多回几处，默认 50"),
    encoding: z.string().optional().describe("同 read_file"),
  },
  http: { route: "file_search", method: "GET" },
  run: async ({ path, query, ignoreCase, limit, encoding }, c) => {
    const r = await readAnyFile(p(c), path, encoding);
    if (r.content === null) {
      return envelope({ path, hits: [], total: 0 }, [err(X.BAD_INPUT, "(input)", { kind: "key", name: "path" }, `这个文件没有可搜的文本：${r.why ?? r.kind}`)]);
    }
    const q = ignoreCase ? query.toLowerCase() : query;
    const hits: Array<{ line: number; col: number; text: string }> = [];
    let total = 0;
    const max = limit ?? 50;
    r.content.split("\n").forEach((text, i) => {
      const hay = ignoreCase ? text.toLowerCase() : text;
      let at = hay.indexOf(q);
      while (at >= 0) {
        total++;
        if (hits.length < max) hits.push({ line: i + 1, col: at + 1, text: text.length > 300 ? text.slice(0, 300) + "…" : text });
        at = hay.indexOf(q, at + q.length);
      }
    });
    return envelope({ path, query, hits, total, more: total > hits.length }, [], { total });
  },
});

defineCap({
  name: "write_file", title: "写一个文件（非设计稿）", scope: "project",
  summary: [
    "写文本文件，顺序是：写前 sha256 校验 → 存旧版快照 → 原子写 → 存新版快照 → 返回快照号。",
    "**不归一化、不改编码、不动换行、不碰 frontmatter** —— 写进去什么样，盘上就什么样。",
    "expectSha256 传 read_file 给的那个值：盘上被别人改过就拒绝。新建文件传 \"0\"。",
    "`.dc.html` 会被拒绝并指向 write_draft（那是另一条写入口，要做归一化与资源注入）。",
    "写二进制（图片这类）给 `encoding: \"base64\"`，`content` 就是 base64 原文。",
  ].join("\n"),
  input: {
    path: z.string(), content: z.string(),
    /* ⚠️ **加一档而不是再开一条写入口**（#108，2026-10-07）：
       第二条写入口的全部价值在于「写非设计稿只有这一条路」——
       为二进制再开一件 `write_binary_file` 等于把那句话变成两条路，
       而两条路迟早会在「写前校验 / 快照 / 回退」上分叉（纪律① 的同一条道理）。 */
    encoding: z.enum(["utf8", "base64"]).optional().describe("content 怎么解。默认 utf8（文本）；写图片这类二进制给 base64"),
    expectSha256: z.string().optional().describe("read_file 返回的 sha256；新建文件给 \"0\"。不给就不做写前校验"),
    note: z.string().optional().describe("这一版为什么改，记进快照元数据"),
  },
  http: { route: "file_write", method: "POST" },
  /* `origin` 就是两个门面唯一的真实差异，现在它从 `via` 来，不再各写一遍 */
  run: async ({ path, content, encoding, expectSha256, note }, c) =>
    envelope(await writeAnyFile(p(c), path, decodeContent(content, encoding), { expectSha256, origin: originOf(c.via), note })),
});

/* ══════════ 把外部的文件复制进项目（M14-5 下半 · 场景 ③，2026-10-22）══════════ */

/** 一次最多复制几个文件。
 *  拖一个几千个文件的文件夹进来，排队慢慢复制不是不行，但**在一个确认框后面**
 *  做几千次写入口调用（每次都有写前校验 + 快照）不该是默认行为。
 *  超了就照实说数，让用户自己拆开拖。 */
const COPY_MAX_FILES = 200;

/** 复制进来的落点：重名顺延，**永不覆盖**。
 *  ⚠️ 和 `convert/output.ts` 的 `reserveOutput` 同一个口径（「成品在源文件旁、
 *  重名顺延、永不覆盖」）—— **两处同一个承诺就该是同一个算法**，
 *  不然用户会发现「转换不覆盖，而拖进来覆盖了」。 */
function freeName(dirAbs: string, base: string): string {
  const dot = base.indexOf(".", base.startsWith(".") ? 1 : 0);
  const stem = dot < 0 ? base : base.slice(0, dot);
  const ext = dot < 0 ? "" : base.slice(dot);
  if (!existsSync(join(dirAbs, base))) return base;
  for (let i = 1; i < 1000; i++) {
    const cand = `${stem} (${i})${ext}`;
    if (!existsSync(join(dirAbs, cand))) return cand;
  }
  throw new ToolError(err(X.IO, base, { kind: "file", name: base },
    "这个名字后面一千个顺延号都占着了", { fix: "换个目标目录，或者先清一下。" }));
}

/** 把一个源路径摊平成「相对它自己的那一层」的文件清单（目录就递归）。 */
async function flattenSource(abs: string): Promise<Array<{ abs: string; rel: string; size: number }>> {
  const st = await statP(abs);
  if (!st.isDirectory()) return [{ abs, rel: basename(abs), size: st.size }];
  const top = basename(abs);
  const out: Array<{ abs: string; rel: string; size: number }> = [];
  const walk = async (d: string, pre: string): Promise<void> => {
    for (const e of await readdirP(d, { withFileTypes: true })) {
      const q = join(d, e.name);
      if (e.isDirectory()) await walk(q, `${pre}/${e.name}`);
      else if (e.isFile()) out.push({ abs: q, rel: `${pre}/${e.name}`, size: (await statP(q)).size });
      /* 软链一律跳过：它指到哪儿是源那边的事，跟过来只会在用户项目里留一条断链 */
    }
  };
  await walk(abs, top);
  return out;
}

defineCap({
  name: "copy_into_project", title: "把外部的文件复制进这个项目", scope: "project",
  summary: [
    "把项目**外面**的文件或文件夹复制到项目里的某个目录（拖拽进文件列那一下走它）。",
    "⚠️ 这是整个工具里**唯一一处会复制用户文件**的能力，而它成立的理由只有一条：**复制是用户自己点的，落点也是他自己的项目目录**。",
    "重名顺延（`图 (1).png`），**永不覆盖**。设计稿走 write_draft，别的走 write_file —— 两条都是写入口，所以复制进来的文件一样有 v1 快照、一样能回退。",
  ].join("\n"),
  input: {
    sources: z.array(z.string()).describe("源的**绝对**路径，可以是文件也可以是文件夹"),
    destDir: z.string().optional().describe("项目里的目标目录（相对项目根），不给就是项目根"),
  },
  http: { method: "POST" },
  run: async ({ sources, destDir }, c) => {
    const proj = p(c);
    /* ⚠️ **空的 `destDir` 就是项目根**，而 `normalizeRel` 对空串是抛「路径是空的」——
       它是给「要读写哪个文件」用的，那里空串确实是错；这里空串是一个合法的落点。
       判据第一次跑就在这上面红了四条（「拖一个文件夹进来」连 destDir 都没给）。
       > **同一个归一化函数，在「文件」和「目录」两种问法下对空串的答案是相反的。** */
    const dest = (destDir ?? "").trim() ? normalizeRel(proj, destDir!) : "";
    const destAbs = dest ? join(proj.dir, dest.split("/").join(sep)) : proj.dir;
    /* ⚠️ **目标那一头要守两道，不是一道**：
       ① 必须在项目里（`isInside`）—— 不然 `destDir: "../.."` 把文件复制到用户主目录；
       ② 必须是**能写的**那一层（`denyReason`）—— `.git/` 列得出来但不许写（Q77）。
       只守①的话「复制进 `.git/`」是通的，而那会弄坏他的仓库。 */
    /* ⚠️ **这一道今天走不到，故意留着**：`normalizeRel` 的 `clean()` 会把 `..` 段
       整个剥掉（`../../偷偷放外面` → `偷偷放外面`），所以跨出项目在它之后已经不可能。
       留着的理由和 `purge.refuseIfDangerous` 一样：**防的是「以后有人换掉上面那个归一化」**。
       ⚠️ 判据因此不能钉这句话的措辞 —— 要钉**结果**（项目外面没多出东西）。 */
    if (!isInside(proj.dir, destAbs)) {
      throw new ToolError(err(X.BAD_INPUT, dest, { kind: "path", name: dest },
        "目标目录跨出了项目", { fix: "destDir 要指向这个项目里的一个目录。" }));
    }
    const noWrite = dest ? denyReason(dest) : null;
    if (noWrite) {
      throw new ToolError(err(X.IO, dest, { kind: "path", name: dest },
        `${noWrite.why}，不能往这里复制`, { fix: noWrite.fix }));
    }
    if (!existsSync(destAbs) || !(await statP(destAbs)).isDirectory()) {
      throw new ToolError(err(X.BAD_INPUT, dest, { kind: "path", name: dest },
        "目标不是一个已有的目录", { fix: "先建这个目录，或者把 destDir 指向一个已有的目录。" }));
    }

    /* ⚠️ **源不许就是项目里的东西**：那不是「复制进来」，那是「在项目里复制」——
       有 `duplicate_draft` 管那件，而走这条路会绕过它的引用改写。 */
    const flat: Array<{ abs: string; rel: string; size: number }> = [];
    for (const src of sources) {
      const sAbs = resolve(src);
      if (!existsSync(sAbs)) {
        throw new ToolError(err(X.BAD_INPUT, src, { kind: "path", name: src }, `这个路径不在：${src}`));
      }
      if (isInside(proj.dir, sAbs)) {
        throw new ToolError(err(X.BAD_INPUT, src, { kind: "path", name: src },
          "这一份本来就在项目里", { fix: "项目内复制用 duplicate_draft（设计稿）或 move_file（别的）—— 它们会把引用一起改对。" }));
      }
      flat.push(...await flattenSource(sAbs));
    }
    if (!flat.length) {
      throw new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name: "sources" }, "一个文件都没有（空文件夹？）"));
    }
    if (flat.length > COPY_MAX_FILES) {
      throw new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name: "sources" },
        `一次最多复制 ${COPY_MAX_FILES} 个文件，这次是 ${flat.length} 个`,
        { fix: "分几次拖，或者用访达 / 资源管理器直接拷进去（那条路我们不插手）。" }));
    }
    const cap = (await getPluginLimits()).binaryReadMaxMB * 1048576;
    const tooBig = flat.filter((f) => f.size > cap);
    if (tooBig.length) {
      throw new ToolError(err(X.BAD_INPUT, tooBig[0]!.rel, { kind: "file", name: basename(tooBig[0]!.rel) },
        `有 ${tooBig.length} 份超过了 ${Math.round(cap / 1048576)} MB`,
        { fix: "复制要经过写入口（它会记一版快照），超限的用访达 / 资源管理器直接拷进去。上限在设置 › 插件沙箱里。" }));
    }

    /* 顶层那几项各自占一个不重名的落点；文件夹内部的相对结构原样跟过来。
       ⚠️ **先把名字全占好再开始写**：边算边写的话，两个顶层同名项会抢到同一个名字。 */
    const topMap = new Map<string, string>();
    for (const f of flat) {
      const top = f.rel.split("/")[0]!;
      if (!topMap.has(top)) topMap.set(top, freeName(destAbs, top));
    }

    const written: string[] = [];
    const failed: Array<{ path: string; why: string }> = [];
    for (const f of flat) {
      const segs = f.rel.split("/");
      segs[0] = topMap.get(segs[0]!)!;
      const relOut = (dest ? dest + "/" : "") + segs.join("/");
      try {
        /* ⚠️ **两条写入口各走各的，不许用 `copyFile` 抄过去** ——
           抄过去的 `.dc.html` 没有 `__resources`，断网就白屏（纪律①），
           而别的文件会少一版 v1 快照（于是「退回上一版」在它身上永远是空的）。 */
        if (relOut.endsWith(".dc.html")) {
          const src = await readFileP(f.abs, "utf8");
          /* ⚠️ `kind` **真解析一次再判**，不要写死 `"page"`：它今天只落在
             `stats.kind` 上，而「只是个读数」不是「可以随便写」——
             读数错了，下一个人按它判断就会错（`draft.ts` 那条注释的原话）。
             解析不出来（别人发来的稿本来就坏）就按 page，让写入口去报它自己那套诊断。 */
          let kind: "page" | "component" = "page";
          try { kind = draftKindOf(parseDraft(src, relOut)); } catch { /* 让写入口去报 */ }
          await writeDraft(proj, relOut, src, kind, "从外面复制进来", { origin: "人手改" });
        } else {
          await writeAnyFile(proj, relOut, await readFileP(f.abs));
        }
        written.push(relOut);
      } catch (e) {
        failed.push({ path: relOut, why: e instanceof Error ? e.message : String(e) });
      }
    }
    /* ⚠️ 回执要**分开说成了几份、败了几份**，不要只回一个 ok ——
       一个「成功」里藏着三份没复制进来，就是又一条假回执。 */
    return envelope({ written, failed, destDir: dest }, [], { copied: written.length, failed: failed.length });
  },
});

defineCap({
  name: "start_editing", title: "解锁这个目录（从只读预览变成可编辑）", scope: "project",
  summary: [
    "**只读预览**那道闸的出路（Q70 / M14-7）：从「右键 → 打开方式」随手打开一个目录时，我们默认不动它的文件。",
    "点一下这件，之后这个目录**永远**可编辑，不再提示。",
    "⚠️ 它**不复制也不移动任何文件** —— 落的只是我们自己目录里的一个标记。版本历史也记在我们这边，原文件夹不会多出任何文件。",
  ].join("\n"),
  input: {},
  http: { method: "POST" },
  run: async (_i, c) => {
    const proj = p(c);
    const already = isEditable(proj.dir);
    const flag = markEditable(proj.dir);
    /* ⚠️ 回执要分得清**「刚解锁」和「本来就是」** —— 前端那条横条要据此决定
       「换成那句保证」还是「压根不该出现过」。只回一个 ok 的话两种状态分不开。 */
    return envelope({ dir: proj.dir, editable: true, already }, [], { flag });
  },
});

defineCap({
  name: "move_file", title: "改名 / 移动一个文件（非设计稿）", scope: "project",
  summary: "改名或移动。引用它的稿会被一起改写 —— 所以不要用系统的文件管理器搬，那样引用会断。",
  input: { from: z.string(), to: z.string() },
  http: { route: "file_move", method: "POST" },
  run: async ({ from, to }, c) => envelope(await moveFile(p(c), from, to)),
});

defineCap({
  name: "trash_file", title: "把文件挪进回收站", scope: "project",
  summary: "不是真删 —— 挪进项目的回收站，可以恢复。",
  input: { path: z.string() },
  http: { route: "file_trash", method: "POST" },
  run: async ({ path }, c) => envelope(await trashFile(p(c), path)),
});

defineCap({
  name: "list_file_versions", title: "一个文件的历史版本", scope: "project",
  summary: "列这个文件存过的快照（版本号、时间、谁改的、备注）。",
  input: { path: z.string() },
  http: { route: "file_versions", method: "GET" },
  run: async ({ path }, c) => {
    const proj = p(c);
    /* `gitFallback` 一起给：版本历史那一面要在头上说一句「这个文件没有 git 兜底」，
       而那句话的依据只有后端知道（要问 `git check-ignore`）。 */
    const [snapshots, gitFallback] = await Promise.all([
      listSnapshotMeta(proj, path),
      gitFallbackOf(proj.dir, path),
    ]);
    return envelope({ path, snapshots, gitFallback });
  },
});

defineCap({
  name: "read_file_version", title: "读一个文件的某一个历史版本", scope: "project",
  summary: [
    "读某一版快照里存的**原文**，不动盘上那份。",
    "这是「**看**那一版」和「**比**那一版」的底座 —— 在它之前只能列出版本号、读不到内容，",
    "于是界面能显示「有 7 版」却打不开其中任何一版。",
    "`list_file_versions` 给的 `delta`（`+N −M`）**已经由后端算好**，不必为了算它来调这一件。",
  ].join("\n"),
  input: { path: z.string(), version: z.string().describe("快照号，`list_file_versions` 给的那个，形如 s3") },
  http: { route: "file_version", method: "GET" },
  run: async ({ path, version }, c) => {
    /* ⚠️ **二进制按字节回**（issue #133）：原来一律 utf8 往返 —— 图片读回乱码，`sha256` / `bytes` 也按那段乱码算，
       和 `list_file_versions` 的 `bytes` 对不上。现在和 `read_file` 对二进制一样不给正文（`content: null`），
       另给 `base64` 原样字节，`sha256` / `bytes` 按真实字节算。 */
    if (!isTextual(path)) {
      const buf = await readSnapshotBytes(p(c), path, version);
      /* 插件来源和 `read_file` 守同一条线（设置里的二进制读取上限）：原来这里没有上限，
         一份比上限还大的旧版本（外部改动的快照没有体积闸）会整份 base64 进沙箱。别的来源照旧（前端要看图）。 */
      if (c.via === "plugin") {
        const max = (await getPluginLimits()).binaryReadMaxMB * 1048576;
        if (buf.length > max) {
          return envelope({ path, version, content: null, sha256: sha256(buf), bytes: buf.length,
            why: `这一版 ${(buf.length / 1048576).toFixed(1)} MB，超过二进制读取上限 ${Math.round(max / 1048576)} MB` });
        }
      }
      return envelope({ path, version, content: null, why: "不是文本文件", encoding: "base64", base64: buf.toString("base64"),
        sha256: sha256(buf), bytes: buf.length });
    }
    const content = await readSnapshotContent(p(c), path, version);
    return envelope({ path, version, content, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8"),
      lines: content.split("\n").length });
  },
});

defineCap({
  name: "compare_file_versions", title: "两个版本之间增删了几行", scope: "project",
  summary: [
    "只回 `+N −M` 两个数，不回 diff 正文。",
    "`to` 不给就是**和盘上现在那份比** —— 「我在看 s5，它和当前差多少」问的就是这个。",
    "⚠️ 这和 `list_file_versions` 给的 `delta` **不是一回事**：那个是「每一版和它上一版」，",
    "这个是「任意两版之间」。**两者不能互相换算** —— 中间各版的 delta 累加会高估",
    "（一处改了又改回来，累加算两次改动，实际是零）。",
  ].join("\n"),
  input: {
    path: z.string(),
    from: z.string().describe("起点版本，形如 s3"),
    to: z.string().optional().describe("终点版本；不给就是盘上现在那份"),
  },
  http: { route: "file_compare", method: "GET" },
  run: async ({ path, from, to }, c) => {
    const proj = p(c);
    /* 二进制不按行比（#133）：那个数没有意义。先读一次 from 让版本号不对时照常报错 */
    if (!isTextual(path)) {
      await readSnapshotBytes(proj, path, from);
      if (to) await readSnapshotBytes(proj, path, to);
      return envelope({ path, from, to: to ?? null, delta: null, note: "不是文本文件，没法按行比" });
    }
    const a = await readSnapshotContent(proj, path, from);
    const b = to ? await readSnapshotContent(proj, path, to) : (await readAnyFile(proj, path)).content;
    if (b === null) {
      return envelope({ path, from, to: to ?? null, delta: null, note: "盘上那份读不出正文（二进制？），没法按行比" });
    }
    return envelope({ path, from, to: to ?? null, delta: lineDelta(a, b) });
  },
});

defineCap({
  name: "revert_file", title: "把文件回退到某一版", scope: "project",
  summary: "回退**也是一次写** —— 会先给当前内容存一版快照，所以回错了还能再回来。",
  input: { path: z.string(), version: z.string() },
  http: { route: "file_revert", method: "POST" },
  run: async ({ path, version }, c) => envelope(await revertFile(p(c), path, version)),
});

/* ════ 草稿暂存（M10-2c）════
   ⚠️ 这三件**不是**写入口的例外：它们写的是 `.umbrastudio/staged/` 下的工具状态，
   和 `snapshots/` 同类，不是用户的文件。草稿要变成用户文件里的内容时
   （「用草稿覆盖」）走的是 `write_file`，一样都不少。 */

defineCap({
  name: "stage_draft", title: "暂存一份没落盘的草稿", scope: "project",
  summary: [
    "把编辑器里还没落盘的内容存起来，**刷新 / 崩溃 / 关窗之后还找得回来**。",
    "⚠️ 插件自己存不了 —— 它在不透明源的 iframe 里，`localStorage` 访问会抛，所以这一层由宿主兜。",
    "**内容和盘上那份一样时不存，反而清掉已有的草稿** —— 「改了又改回来」不该留下一条",
    "点了恢复什么都不变的提示。",
    "每一份草稿都记着它是在哪一版上改的，所以下次打开答得出「还能不能直接恢复」。",
  ].join("\n"),
  input: { path: z.string(), content: z.string() },
  http: { route: "draft_stage", method: "POST" },
  run: async ({ path, content }, c) => envelope(await stageDraft(p(c), path, content)),
});

defineCap({
  name: "get_staged_draft", title: "这个文件有没有暂存的草稿", scope: "project",
  summary: [
    "回草稿内容、什么时候存的、相对盘上那份增删了几行，以及**还能不能直接恢复**。",
    "`stale: true` = 草稿的底稿和现在盘上那份不是同一个（别的编辑器改过、AI 改过、回退过）。",
    "**这时候不该直接恢复** —— 那会静默盖掉别人的改动。",
  ].join("\n"),
  input: { path: z.string() },
  http: { route: "draft_staged", method: "GET" },
  run: async ({ path }, c) => envelope(await getStagedDraft(p(c), path)),
});

defineCap({
  name: "clear_staged_draft", title: "丢掉暂存的草稿", scope: "project",
  summary: "落盘之后、或者用户点「丢掉」时调。本来就没有也算成功。",
  input: { path: z.string() },
  http: { route: "draft_clear", method: "POST" },
  run: async ({ path }, c) => envelope(await clearStagedDraft(p(c), path)),
});

defineCap({
  name: "list_staged_drafts", title: "这个项目里还挂着哪些草稿", scope: "project",
  summary: "「哪些文件我改了还没落盘」——**给 AI 和秘书用的**：它们看不见编辑器，只能问这一件。",
  input: {},
  http: { route: "drafts_staged", method: "GET" },
  run: async (_i, c) => {
    const rows = await listStagedDrafts(p(c));
    return envelope({ rows, count: rows.length, stale: rows.filter((r) => r.stale).length },
      [], { count: rows.length });
  },
});

defineCap({
  name: "list_file_refs", title: "谁引用了这个文件", scope: "project",
  summary: "找出哪些稿引用了它。删之前先看这个 —— 有人引用还删，那些稿会缺资源。",
  input: { path: z.string() },
  http: { route: "file_refs", method: "GET" },
  run: async ({ path }, c) => envelope({ path, referencedBy: await referencesOf(p(c), path) }),
});

defineCap({
  name: "count_file_types", title: "项目里各类型文件各有多少", scope: "project",
  summary: "按类型统计。目录视图的筛选条用它填数字。",
  input: {},
  http: { route: "file_types", method: "GET" },
  run: async (_i, c) => envelope({ types: await countTypes(p(c)) }),
});
