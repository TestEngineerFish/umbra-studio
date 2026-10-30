import { z } from "zod";
import { envelope, err, ToolError } from "../envelope.js";
import { X } from "../codes.js";
import { getPluginLimits } from "../plugin/limits.js";
import { countTypes, denyReason, freeName, WALK_MAX, fileSizeOf, isTextual, lineDelta, listFiles, listSnapshotMeta, moveFile, normalizeRel, readAnyFile, readFileRange, readSnapshotBytes, readSnapshotContent, referencesOf, revertFile, sha256, trashFile, writeAnyFile } from "../files.js";
import { writeDraft } from "../write.js";
import { draftKindOf, parseDraft } from "../draft.js";
import { isEditable, markEditable } from "../records.js";
/* ── M16-8 ③④ 搬来的那六件要这些（实现仍在 `refs.ts` / `project.ts`，这一次不碰）── */
import { createFolder, duplicateDraft } from "../project.js";
import { emptyTrash, listTrash, purgeTrash, restoreDraft } from "../refs.js";
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
  summary: [
    "列一个目录下的文件与子目录（含类型、大小、改动时间）。默认**只列一层** —— 要看深层就给 `recursive: true`，或者对子目录再调一次。",
    "`recursive: true` 递归列**整个项目的文件**（不含目录项），上限 5000 个；扫到上限就停并回 `truncated: true`。",
    "⚠️ 递归那条路**只给名字 / 路径 / 类型 / 大小 / 改动时间** —— 不读图片尺寸、不给首行摘要、不查快照，"
      + "那几样对五千项是几千次 syscall。要某一份的详细信息，对它所在的那一层再调一次（不给 `recursive`）。",
    "⚠️ 递归时 `total` 等于实际给出的条数（扫到上限就停，**算不出项目里一共有多少**）——"
      + "所以「还有多少没给」这句话说不了，只能说「只列了前 5000 个」。",
  ].join("\n"),
  input: {
    dir: z.string().optional().describe("相对项目根的子目录，不给就是项目根"),
    limit: z.number().optional(),
    recursive: z.boolean().optional().describe("递归列整个项目的文件（忽略 dir），上限 5000"),
  },
  http: { route: "files", method: "GET" },
  /* ⚠️ `limit` 原样传下去 —— **两条路默认值不同这件事住在 `listFiles` 里**，
     不在这个门面里（第一版写在这儿，于是直接调 `listFiles` 的人拿到 200 条，
     见那边的注释）。 */
  run: async ({ dir, limit, recursive }, c) =>
    envelope(await listFiles(p(c), dir ?? "", limit, { recursive })),
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
       有 `copy_file` 管那件（M16-8 ② 改名前叫 `duplicate_draft`），
       而走这条路会绕过它的重名顺延与快照。 */
    const flat: Array<{ abs: string; rel: string; size: number }> = [];
    for (const src of sources) {
      const sAbs = resolve(src);
      if (!existsSync(sAbs)) {
        throw new ToolError(err(X.BAD_INPUT, src, { kind: "path", name: src }, `这个路径不在：${src}`));
      }
      if (isInside(proj.dir, sAbs)) {
        throw new ToolError(err(X.BAD_INPUT, src, { kind: "path", name: src },
          "这一份本来就在项目里", { fix: "项目内复制一份用 copy_file；要挪位置或改名用 move_file（它会把引用一起改对）。" }));
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

/* ⚠️ **M16-8 ①（2026-10-24）：`rename_draft` / `move_draft` 并进来了。**
   标题里那句「非设计稿」因此去掉 —— `.dc.html` 也走这条路（C3 之后那道拒已恒假，
   而前端的改名 / 移动 / 拖拽本来就都在这条路上）。
   ⚠️ **两种引用都改**，而且回执**分两栏**（`rewrote` 按路径 · `dcImports` 按组件名）：
   M16-8 ⑤ 刚因为「两件都叫谁引用了它」栽过，合成一栏会让「改写 0 处」
   在另一种关系上有 4 处的情况下照样说出来。 */
defineCap({
  name: "move_file", title: "改名 / 移动一个文件", scope: "project",
  /* ⚠️ **第一句要把两种引用都说出来，而且要在前 160 个字之内**（geek-99 2026-10-24）：
     UmbraPC 的秘书把这段 `summary` 当技能描述，**只取前 160 个字**。
     原来第一句只说「引用它的文件一起改对」，而「`<dc-import>` 的名字也跟着改」
     要到第三行才出现 —— 那时已经靠近截断线，而带 markdown 反引号的字数算得比看着多。
     > **一段描述被下游截断时，「说全了」和「说在前面」是两回事** ——
     > 而决定模型会不会派这件技能的，是没被截掉的那一半。 */
  summary: [
    "改名或移动一个文件。引用它的路径（href / src / url()）和 <dc-import> 的组件名都会跟着改对，所以不要用系统的文件管理器搬 —— 那样引用会断。",
    "回执分两栏：`rewrote` 是按路径改的，`dcImports` 是 `.dc.html` 里按组件名改的（两种关系，不混算）。",
    "⚠️ 目标已存在就**拒**，不会替你顺延一个序号；`to` 要给完整的目标相对路径，不是目标目录。",
  ].join("\n"),
  input: { from: z.string(), to: z.string().describe("完整的目标相对路径，不是目标目录") },
  http: { route: "file_move", method: "POST" },
  run: async ({ from, to }, c) => envelope(await moveFile(p(c), from, to)),
});

/* ⚠️ **M16-8 ③（2026-10-24）：`delete_draft` 并进来了**（回收站布局本来就是同一套）。
   少了它回执里的 `impact` —— 「有几处 `<dc-import>` 会断」改成**删之前**单独问
   `get_delete_impact`，而那件事只在文件还在盘上时答得出来（删完再问它抛「找不到稿」）。
   > **把一个查询绑在破坏性动作的回执里，看着方便 ——
   > 而两者对「文件还在不在」的要求正好相反。** */
defineCap({
  name: "trash_file", title: "把文件挪进回收站", scope: "project",
  summary: [
    "不是真删 —— 挪进项目的回收站，可以恢复（`list_trash` / `restore_trashed`）。",
    "⚠️ 删之前想知道「有谁引用它、会不会断」，**先问** `get_delete_impact`（按组件名）",
    "和 `list_file_refs`（按路径）—— 这件的回执不带影响面。",
  ].join("\n"),
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
  /* ⚠️ `originOf(c.via)` 要传进去 —— 不传的话 AI / 插件回退的那一版都会记成「人手改」
     （那是 M11-7（四）漏掉的一处，M16-7b 补的）。 */
  run: async ({ path, version }, c) => envelope(await revertFile(p(c), path, version, originOf(c.via))),
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
  summary: [
    "找出哪些文件引用了它。删之前先看这个 —— 有人引用还删，那几处就断了。",
    "扫 **html / htm / css / svg / md / markdown** 六种：前五种认 `href` / `src` / `url()`，"
      + "md 另认 `![](…)` / `[](…)`（它内嵌的 `<img src>` 也认）。",
    "⚠️ **外链不算引用**：`http(s)://`、`data:`、`//…`、`#锚点`、根相对 `/x.png`，以及指到项目外的 `../`。",
    "⚠️ **最多扫 5000 个文件**；到上限会回 `truncated: true` —— 那时候「没人引用」这句话说不了，"
      + "回执里要照实说「只查了前 N 个」。",
    "⚠️ **不认 md 的引用式链接**（`[a][ref]` + 底部 `[ref]: path`）：那要两段关联，而认一半比不认更糟。",
  ].join("\n"),
  input: { path: z.string() },
  http: { route: "file_refs", method: "GET" },
  /* ⚠️ `truncated` 一路带到界面 —— **「只查了前 N 个文件」和「这个文件没人引用」
     在一个空列表上长得一模一样**，而前者是「我没查完」，后者是一个结论。 */
  run: async ({ path }, c) => {
    const r = await referencesOf(p(c), path);
    return envelope({ path, referencedBy: r.refs, truncated: r.truncated, scanLimit: WALK_MAX },
      [], { count: r.refs.length });
  },
});

defineCap({
  name: "count_file_types", title: "项目里各类型文件各有多少", scope: "project",
  summary: "按类型统计。目录视图的筛选条用它填数字。",
  input: {},
  http: { route: "file_types", method: "GET" },
  run: async (_i, c) => envelope({ types: await countTypes(p(c)) }),
});

/* ══════════════ 目录与回收站（M16-8 ③④ 从 `cap/drafts.ts` 搬来，2026-10-24）══════════════
   ⚠️ **纯搬家：对外名、路由名、入参、回执、实现一个字都没动。**
   搬的理由是它们**和设计稿一点关系都没有** —— 「回收站里有什么 / 怎么拿回来 / 怎么真删」
   和「建一个目录」对任何文件都成立，只是历史上住在 `drafts.ts` 里。
   ⚠️ 实现仍在 `refs.ts`（`listTrash` / `restoreDraft` / `purgeTrash` / `emptyTrash`）——
   **这一次不碰实现**：那一摊的函数名也还带着 `Draft`，而改它是另一笔改动。
   > **一次提交里只放一种改动** —— 搬家和改名混在一起，回归红的时候分不清是哪一种引起的。
   ⚠️ 回收站是**两条删除路径共用**的（`trashFile` 和 `refs.ts` 的 `deleteDraft`，
   布局都是 `<时间戳>/<原相对路径>`，issue #81 那一轮统一的），所以它跟着文件面走是对的。 */

defineCap({
  name: "create_folder", title: "新建目录", scope: "project",
  summary: "在项目里建一个目录。稿按目录分组，目录本身不是稿。",
  input: { path: z.string().describe("目录相对项目根的路径，如 Components 或 Pages/子目录") },
  /* HTTP 侧原来叫 `dir_create`（资源在前），前端在用，保留 */
  http: { route: "dir_create", method: "POST" },
  run: async ({ path }, c) => envelope(await createFolder(p(c), path)),
});

defineCap({
  name: "list_trash", title: "回收站里有什么", scope: "project",
  summary: "列回收站：原路径、删除时间、回收站路径。恢复要用它给的 trashPath。",
  input: {},
  http: { route: "trash", method: "GET" },
  run: async (_i, c) => {
    const items = await listTrash(p(c));
    return envelope({ items }, [], { count: items.length });
  },
});

/* ⚠️ **恢复有两件，不是重叠**（M11-7 第一批误判过，`00` §九十）：
   - `restore_trashed_by_name`（按**文件名**）：**只记得名字**的时候用 ——
     「把我刚删的 需求.md 恢复一下」，手上没有 trashPath。
   - `restore_trashed`（按 **trashPath**）：给**回收站列表**用 —— 那里每一项都带着自己的
     trashPath，按它恢复才不会在同名多次删除时选错。
   合成一条就得二选一，而两边都有真实用途。

   ⚠️⚠️ **改名的理由，以及顺手更正它原来的说明**（M16-8 ③，2026-10-24）。
   旧名 `restore_draft` 带着「稿」字，而它收的从来是**任何文件的文件名** ——
   `listTrash` 把两条删除路径的回收站读成同一套，所以它一直能恢复 `.md` 和图片。
   新名字和 `trash_file` / `restore_trashed` 对齐（`*_trashed*` 一族）。

   ⚠️ 它原来的 summary 写着「**行内撤销用它**」—— 那句话现在是假的，而且
   **它指的那个调用方已经不存在了**（`ui/S1-稿件索引.dc.html`，C3 删了）。
   实测现在的行内撤销**一次都不调恢复**：删除是**延后落实的**
   （`Workbench.tsx` 的 `commitTrash`，离开那一行时才真删），所以「撤销」
   只是把那一行从待删清单里拿掉 —— 文件压根没离开过磁盘。
   > **一条判据的文案里写着一个前提时，那个前提下线了，文案就开始骗人** ——
   > 而一件能力的 summary 也一样：它会让下一个人去维护一条没有人走的路。
   ⚠️ 而延后落实**不是可以顺手改掉的**：M16-8 ⑤ 那句「有 N 处引用它，会断」
   靠的正是「文件还在盘上」（删完再问 `delete_impact` 实测抛「找不到稿」）。 */
defineCap({
  name: "restore_trashed_by_name", title: "按文件名从回收站恢复", scope: "project",
  summary: "在回收站里按文件名找**最近删的那一份**恢复。只记得名字时用它。要精确恢复某一版（同名删过多次）请用 restore_trashed。",
  input: { file: z.string().describe("被删掉的那个文件的文件名") },
  http: { method: "POST" },
  run: async ({ file }, c) => {
    const proj = p(c);
    const base = file.split("/").pop() ?? file;
    /* listTrash 按时间倒序，`find` 拿到的就是**最近删的那一份** ——
       同名删过多次时这是唯一合理的语义（用户点的是「撤销刚才那一下」）。 */
    const hit = (await listTrash(proj)).find((t) => t.originalName === base);
    if (!hit) return envelope(null, [{ level: "error", code: "E_TRASH_NOT_FOUND",
      message: `回收站里没有 ${base}`, where: "(trash)", at: { kind: "key", name: base },
      fix: "用 list_trash 看回收站里现在有什么；同名删过多次时用它给的 trashPath 调 restore_trashed。" } as never]);
    const r = await restoreDraft(proj, hit.trashPath);
    return envelope(r, [], { restored: r.originalPath });
  },
});

defineCap({
  name: "restore_trashed", title: "从回收站恢复指定的那一份", scope: "project",
  summary: "按 list_trash 给的 trashPath 恢复。原位置已被占用时会换个名字，不会覆盖。",
  input: { trashPath: z.string().describe("回收站路径，list_trash 给的那个") },
  http: { route: "trash_restore", method: "POST" },
  run: async ({ trashPath }, c) => {
    const r = await restoreDraft(p(c), trashPath);
    return envelope(r, [], { restored: r.originalPath });
  },
});

defineCap({
  name: "purge_trash", title: "永久删掉回收站里的一项", scope: "project",
  summary: "**真删，退不回来**。删之前想清楚。",
  input: { trashPath: z.string() },
  http: { route: "trash_purge", method: "POST" },
  run: async ({ trashPath }, c) => envelope(await purgeTrash(p(c), trashPath)),
});

defineCap({
  name: "empty_trash", title: "清空回收站", scope: "project",
  summary: "**真删，全部退不回来**。",
  input: {},
  http: { route: "trash_empty", method: "POST" },
  run: async (_i, c) => envelope(await emptyTrash(p(c))),
});

/* ══════════════ 项目内复制一份（M16-8 ②，2026-10-24 从 `duplicate_draft` 改名搬来）══════════════ */
/* ⚠️⚠️ **改名的理由**：它 2026-10-24 通用化了（后缀跟着源走、二进制逐字节复制），
   而名字还写着 `draft` —— 一个只对一种扩展名成立的名字，挂在一件对任何文件成立的能力上。
   > **名字是契约的一部分。** 一件能力通用化之后名字不跟着改，模型会按名字判断该不该调它 ——
   而「它叫 `duplicate_draft`，我这是个 `.md`」是一个完全合理的推断，只不过是错的。
   ⚠️ 实测 `../UmbraPC` 整仓 `duplicate_draft` / `duplicateDraft` **零命中**，所以这次不用跨仓同步
   （geek-99 和我各核了一遍）。
   ⚠️ **实现的函数名没改**（`project.ts` 的 `duplicateDraft`）—— 和上一批同一条口径：
   > **一次提交里只放一种改动。** 改对外名是一件事，改内部函数名是另一件。
   ⚠️ **入参形状也没改**（`path` + `newName?`，而 `move_file` 是 `from` + `to`）——
   同上，而且 `newName` 的语义是「基名，后缀跟着源走」，换成 `to` 会悄悄改掉那个语义。
   ⚠️ **和 `copy_into_project` 分工**：那一件是「从项目**外面**复制进来」，
   这一件是「在项目**里面**复制一份」。两件的拒因互相指向对方。 */
defineCap({
  name: "copy_file", title: "在项目里复制一份", scope: "project",
  summary: [
    "在项目里复制一份。**后缀跟着源走**（`.md` 的副本还是 `.md`），二进制按字节复制。",
    "不给 `newName` 就是「<原名> 副本」；重名自动顺延序号，**永不覆盖**。",
    "⚠️ 从项目**外面**复制进来是另一件：`copy_into_project`。",
  ].join("\n"),
  input: { path: z.string(), newName: z.string().optional().describe("新的基名，不用带后缀（后缀跟着源走）") },
  http: { method: "POST" },
  run: async ({ path, newName }, c) => {
    const r = await duplicateDraft(p(c), path, newName ? { newName } : {});
    return envelope(r, [], { newPath: r.newPath });
  },
});
