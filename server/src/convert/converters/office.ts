// 来源：UmbraPC electron/core/convert/converters/office.ts（2026-10-21 876cb3a），改动：相对 import 补 .js；索引取值加非空断言（noUncheckedIndexedAccess）
// 格式转换：用户自己装的 LibreOffice / Pandoc（doc/格式转换-方案调研-2026-10-18.md §3.3）。
//
// LibreOffice：Office → PDF 的高保真路线（代价 8，比「textutil → html → 打印」那条 20 便宜，装了就优先它）。
//   - 配置目录（UserInstallation）固定一份、不用用户自己那份：用户开着 LibreOffice 时，共用配置会撞锁，
//     命令行那边静默退出、什么都不转。也正因为固定一份，同时只能跑一个（maxParallel 1）。
//   - 那份配置目录里写死一组加固项（#126，见 LO_HARDENING）：文档里链接的外部图片 / 子文档 / 外部数据一律不取、
//     OLE 和 DDE 不激活、宏不跑、加载后不重算（WEBSERVICE 之类的公式不会在转换时发请求）、不查更新。
//     每次转换前合并进 `user/registrymodifications.xcu`（LO 退出时会重写那份文件，别的项照留）。
//     sandbox-exec 已弃用，不靠它；也不碰用户自己那份 LibreOffice 配置。
//   - 它不让指定输出文件名，只给 `--outdir`，成品叫「源文件名.新扩展名」→ 转到一个专用子目录里再挪到 step.output。
// Pandoc：Markdown / HTML / Word / EPUB 之间的文字类互转。docx → md 时图片不导出（成品只许一个文件）。
//   - 一律 `--sandbox`（#126）：不然 md / html 里引用的图片 pandoc 会照读照嵌 —— 本地任意路径（`![](~/.ssh/…)`）、
//     `http(s)://` 也照发请求去取。AI / 手机发起的转换只对源文件过了 fsChecked 读闸，被引用的那些没过，
//     嵌进 docx 之后成品落回允许读的目录，等于绕过了读闸。10-21 用 pandoc 3.12.1 实测：不加时根外文件进了 word/media、
//     外链收到 GET；加了之后两样都没有，退出码仍是 0，图换成替代文字。
//     代价：md 旁边正常的本地图也不嵌了（sandbox 只许读命令行上给的输入文件）—— 边上的说明写「引用的图片不嵌入」。
//   - `--sandbox` 是 2.15 起才有的：更旧的 pandoc 不登记这几条边（status 回 ok:false，提示升级），不退回不加 sandbox 的跑法。

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { runProc, procError } from "../proc.js";
import { INSTALL_HINT, missingStatus, type ToolBox } from "../tools.js";
import type { Converter, Edge, ToolStatus } from "../types.js";

const IDLE = 5 * 60_000;

/** LibreOffice `--convert-to` 的写法：目标格式 → 「扩展名:过滤器名」。 */
const LO_FILTER: Record<string, string> = {
  pdf: "pdf",
  docx: "docx:MS Word 2007 XML",
  odt: "odt",
  xlsx: "xlsx:Calc MS Excel 2007 XML",
  ods: "ods",
  // 44 = 逗号、34 = 双引号、76 = UTF-8、1 = 从第一行起
  csv: "csv:Text - txt - csv (StarCalc):44,34,76,1",
  pptx: "pptx:Impress MS PowerPoint 2007 XML",
  odp: "odp",
};

/** 转换专用配置里写死的项：[配置路径, 项名, 类型, 值]。 */
export const LO_HARDENING: [string, string, "boolean" | "int", string][] = [
  // 不是「受信任位置」里的文档，链接出去的东西（链接图片、外部数据源等）一律不取。我们的配置里没有受信任位置。
  ["/org.openoffice.Office.Common/Security/Scripting", "BlockUntrustedRefererLinks", "boolean", "true"],
  // OLE 嵌入对象和 DDE 不激活。
  ["/org.openoffice.Office.Common/Security/Scripting", "DisableActiveContent", "boolean", "true"],
  ["/org.openoffice.Office.Common/Security/Scripting", "DisableMacrosExecution", "boolean", "true"],
  ["/org.openoffice.Office.Common/Security/Scripting", "MacroSecurityLevel", "int", "3"],
  // 加载时更新链接：Writer 0 = 从不；Calc 1 = 从不（两边的枚举顺序不一样）。
  ["/org.openoffice.Office.Writer/Content/Update", "Link", "int", "0"],
  ["/org.openoffice.Office.Calc/Content/Update", "Link", "int", "1"],
  // 加载后不重算：1 = 从不。
  ["/org.openoffice.Office.Calc/Formula/Load", "OOXMLRecalcMode", "int", "1"],
  ["/org.openoffice.Office.Calc/Formula/Load", "ODFRecalcMode", "int", "1"],
  ["/org.openoffice.Office.Update/Update", "Enabled", "boolean", "false"],
];

const xcuItem = ([p, n, , v]: (typeof LO_HARDENING)[number]) =>
  `<item oor:path="${p}"><prop oor:name="${n}" oor:op="fuse"><value>${v}</value></prop></item>`;

/** 把加固项合并进已有的 registrymodifications.xcu（没有就新建）：同名项先删掉再写，别的项照留。**纯函数。** */
export function hardenXcu(existing: string | null): string {
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n';
  let body = existing && existing.includes("</oor:items>") ? existing : `${head}</oor:items>\n`;
  for (const [p, n] of LO_HARDENING) {
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    body = body.replace(new RegExp(`<item oor:path="${esc(p)}"><prop oor:name="${esc(n)}"[\\s\\S]*?</item>\\n?`, "g"), "");
  }
  return body.replace("</oor:items>", `${LO_HARDENING.map(xcuItem).join("\n")}\n</oor:items>`);
}

async function hardenProfile(profileDir: string): Promise<void> {
  const file = path.join(profileDir, "user", "registrymodifications.xcu");
  await fs.mkdir(path.dirname(file), { recursive: true });
  const old = await fs.readFile(file, "utf8").catch(() => null);
  const next = hardenXcu(old);
  if (next !== old) await fs.writeFile(file, next, "utf8");
}

function loEdges(): Edge[] {
  const out: Edge[] = [];
  const add = (fs_: string[], ts: string[], cost = 10, note?: string) => {
    for (const f of fs_) for (const t of ts) if (f !== t) out.push({ from: f, to: t, cost, note });
  };
  add(["docx", "doc", "odt", "rtf"], ["pdf"], 8);
  add(["doc", "odt", "rtf"], ["docx"]);
  add(["docx", "doc", "rtf"], ["odt"]);
  add(["xlsx", "xls", "ods", "csv"], ["pdf"], 8);
  add(["xls", "ods", "csv"], ["xlsx"]);
  add(["xlsx", "xls", "csv"], ["ods"]);
  add(["xlsx", "xls", "ods"], ["csv"], 10, "只转第一个工作表");
  add(["pptx", "ppt", "odp"], ["pdf"], 8);
  add(["ppt", "odp"], ["pptx"]);
  add(["pptx", "ppt"], ["odp"]);
  return out;
}

export function libreOfficeConverter(tools: ToolBox, profileDir: string): Converter {
  return {
    id: "libreoffice",
    name: "LibreOffice",
    maxParallel: 1,
    edges: loEdges(),
    async status(): Promise<ToolStatus> {
      const hit = tools.get("soffice");
      return hit.path ? { ok: true } : missingStatus("soffice", hit);
    },
    async convert(step) {
      const bin = tools.get("soffice").path;
      if (!bin) throw new Error("没装 LibreOffice");
      const outDir = path.join(step.workDir, `lo-${step.to}-${Date.now()}`);
      await fs.mkdir(outDir, { recursive: true });
      await hardenProfile(profileDir);
      step.progress(null);
      const r = await runProc(bin, [
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        "--headless", "--norestore", "--nolockcheck", "--nodefault",
        "--convert-to", LO_FILTER[step.to]!, "--outdir", outDir, step.input,
      ], { signal: step.signal, idleMs: IDLE, totalMs: 30 * 60_000 });
      if (r.code !== 0 || r.stopped) throw procError("LibreOffice", r, IDLE);
      const made = (await fs.readdir(outDir)).find((n) => n.toLowerCase().endsWith(`.${step.to}`));
      if (!made) throw new Error(`LibreOffice 没有转出文件${r.tail.trim() ? `：${r.tail.trim().slice(-200)}` : ""}`);
      await fs.rename(path.join(outDir, made), step.output);
    },
  };
}

const PANDOC_FROM: Record<string, string> = { md: "markdown", html: "html", docx: "docx", odt: "odt", epub: "epub" };
const PANDOC_TO: Record<string, string> = { md: "gfm", html: "html", docx: "docx", odt: "odt", epub: "epub" };

/** `--sandbox` 起始的版本。 */
export const PANDOC_MIN_VERSION: readonly [number, number] = [2, 15];

/** `pandoc --version` 第一行（`pandoc 3.12.1` / Windows 上 `pandoc.exe 3.1.9`）→ [主, 次, 修订]；认不出回 null。**纯函数。** */
export function parsePandocVersion(out: string): [number, number, number] | null {
  const m = /^pandoc(?:\.exe)?\s+(\d+)\.(\d+)(?:\.(\d+))?/im.exec(String(out || ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

/** 这个版本有没有 `--sandbox`。 */
export function pandocHasSandbox(v: readonly number[]): boolean {
  const [a, b] = PANDOC_MIN_VERSION;
  return v[0]! > a || (v[0]! === a && v[1]! >= b);
}

/** pandoc 的参数（**纯函数**，测试钉着 `--sandbox` 在里面）。 */
export function pandocArgs(from: string, to: string, input: string, output: string): string[] {
  return ["--sandbox", "-f", PANDOC_FROM[from]!, "-t", PANDOC_TO[to]!, "-s", "-o", output, input];
}

/** md / html → docx / odt / epub 的格子说明（悬停那句见 copy.ts `NOTE_TIP`）。 */
export const PANDOC_LINKED_NOTE = "引用的图片不嵌入";

/** 这条边的说明：md / html 里引用的图（sandbox 下不读）、docx 等转 md（只许一个文件）。 */
function pandocNote(from: string, to: string): string | undefined {
  if (to === "md" && from !== "html") return "图片不导出";
  if ((from === "md" || from === "html") && to !== "md" && to !== "html") return PANDOC_LINKED_NOTE;
  return undefined;
}

export function pandocConverter(tools: ToolBox, readVersion: (bin: string) => Promise<string> = pandocVersionOut, now: () => number = Date.now): Converter {
  const edges: Edge[] = [];
  for (const f of Object.keys(PANDOC_FROM)) {
    for (const t of Object.keys(PANDOC_TO)) {
      if (f === t) continue;
      edges.push({ from: f, to: t, note: pandocNote(f, t) });
    }
  }
  // 版本按路径记一份、60 秒有效（同 ToolBox）：brew upgrade 不换路径，过期了才读得到新版本。
  let known: { bin: string; at: number; v: [number, number, number] | null } | null = null;
  const version = async (bin: string) => {
    if (known?.bin !== bin || now() - known.at >= 60_000) {
      known = { bin, at: now(), v: parsePandocVersion(await readVersion(bin).catch(() => "")) };
    }
    return known.v;
  };
  return {
    id: "pandoc",
    name: "Pandoc",
    maxParallel: 2,
    edges,
    async status(): Promise<ToolStatus> {
      const hit = tools.get("pandoc");
      if (!hit.path) return missingStatus("pandoc", hit);
      const v = await version(hit.path);
      if (!v) return { ok: false, reason: "读不出 Pandoc 的版本", hint: upgradeHint() };
      if (!pandocHasSandbox(v)) return { ok: false, reason: pandocTooOld(v.join(".")), hint: upgradeHint() };
      return { ok: true, version: v.join(".") };
    },
    async convert(step) {
      const bin = tools.get("pandoc").path;
      if (!bin) throw new Error("没装 Pandoc");
      // 引擎只在 status ok 时才走这几条边；这里再核一次，防着两次之间换了一份旧的。
      const v = await version(bin);
      if (!v || !pandocHasSandbox(v)) throw new Error(`Pandoc 太旧，要 ${PANDOC_MIN_VERSION.join(".")} 以上`);
      step.progress(null);
      const r = await runProc(bin, pandocArgs(step.from, step.to, step.input, step.output),
        { signal: step.signal, idleMs: IDLE, cwd: step.workDir });
      if (r.code !== 0 || r.stopped) throw procError("Pandoc", r, IDLE);
    },
  };
}

/** 版本太旧那句（批次 282：照「这台电脑上转不了」那一族写）。设置页那行用 i18n `settings.cvPandocOld`，同句。 */
export function pandocTooOld(ver: string): string {
  return `Pandoc 版本太旧（要 ${PANDOC_MIN_VERSION.join(".")} 以上，现在是 ${ver}）`;
}

/** 升级命令（设置页那行和转不了的行都配它 +［复制］）。 */
export function upgradeHint(platform: string = process.platform): string {
  return platform === "darwin" ? "brew upgrade pandoc" : platform === "win32" ? "winget upgrade JohnMacFarlane.Pandoc" : (INSTALL_HINT.pandoc ?? "");
}

async function pandocVersionOut(bin: string): Promise<string> {
  const r = await runProc(bin, ["--version"], { idleMs: 10_000, totalMs: 10_000 });
  return r.tail;
}
