// 来源：UmbraPC electron/core/convert/engine.ts（2026-10-19 d0ebb1d），改动：相对 import 补 .js；perSource[0]、route.steps[i] 加非空断言（noUncheckedIndexedAccess）
// 格式转换引擎（doc/格式转换-方案调研-2026-10-18.md §四、§9.3）。
//
// 一次转换 = 判格式 → 规划路线 → 在任务自己的临时目录里一步步转 → 占好成品位置 → 挪过去 → 删临时目录。
// 三个入口（转换窗口、快捷入口「转换为…」、AI 技能 convert.convert_file）都走这一个类。
//
// 「能转成什么」要说清楚**不能**的原因（§9.3 第 4 条）：一个格式够不着，是因为某个工具没装（给安装命令），
// 还是根本没有路（不说原因只说转不了）。所以 targets() 先用能用的工具规划，再用全部工具规划一遍，
// 第二遍够得着而第一遍够不着的，就是「装上 X 就行」。

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { formatById, formatOfPath, type FormatCategory } from "./formats.js";
import { planRoute, reachable, type Route } from "./route.js";
import { releaseOutput, reserveOutput, settleOutput } from "./output.js";
import type { Converter, StepOptions, ToolStatus } from "./types.js";

export interface TargetInfo {
  to: string;
  label: string;
  available: boolean;
  /** 不可用时的原因（「没装 LibreOffice」）。 */
  reason?: string;
  /** 不可用时的一行安装命令。 */
  hint?: string;
  /** 可用但有损 / 有出入时的提醒（来自路线上各边的 note）。 */
  note?: string;
  /** 走哪几个工具（「系统 · textutil → Umbra 内置」）。 */
  via?: string;
}

export interface FileResult {
  source: string;
  state: "done" | "failed" | "skipped";
  output?: string;
  error?: string;
  note?: string;
  via?: string;
}

export interface ConvertRequest {
  files: string[];
  to: string;
  options?: StepOptions;
  /** 成品放哪；不给 = 各自源文件旁边。 */
  outDir?: string;
  signal?: AbortSignal;
  /** 整体进度：第几个文件、这个文件的进度（0–1 / null 不知道）。 */
  onProgress?: (p: { index: number; total: number; source: string; fraction: number | null }) => void;
}

/** 一次请求最多几个文件：一次拖进来几百个，排队慢慢转可以，但 AI 一句话就要转几百个，先拦住。 */
export const MAX_FILES = 200;

class Gate {
  private running = 0;
  private waiters: (() => void)[] = [];
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) await new Promise<void>((r) => this.waiters.push(r));
    this.running++;
    try { return await fn(); } finally {
      this.running--;
      this.waiters.shift()?.();
    }
  }
}

export class ConvertEngine {
  private gates = new Map<string, Gate>();

  /** `converters` 的顺序就是同代价时的优先级。 */
  constructor(private converters: readonly Converter[], private tmpRoot: string = os.tmpdir()) {}

  private gate(c: Converter): Gate {
    let g = this.gates.get(c.id);
    if (!g) this.gates.set(c.id, (g = new Gate(Math.max(1, c.maxParallel))));
    return g;
  }

  /** 各工具现在的状态（能力页 / 设置页「引擎」一栏也用）。 */
  async statuses(): Promise<{ converter: Converter; status: ToolStatus }[]> {
    return Promise.all(this.converters.map(async (c) => ({ converter: c, status: await c.status().catch((e): ToolStatus => ({ ok: false, reason: String(e) })) })));
  }

  private async split(): Promise<{ ready: Converter[]; missing: Map<Converter, ToolStatus> }> {
    const ready: Converter[] = [];
    const missing = new Map<Converter, ToolStatus>();
    for (const { converter, status } of await this.statuses()) {
      if (status.ok) ready.push(converter);
      else missing.set(converter, status);
    }
    return { ready, missing };
  }

  /** 这些文件能转成什么。多个文件时只列**每一个都能转**的目标（格式不同的一批文件也能一起转成 PDF）。 */
  async targets(files: string[]): Promise<{ from: string[]; targets: TargetInfo[]; unknown: string[] }> {
    const froms = new Set<string>();
    const unknown: string[] = [];
    for (const f of files) {
      const fmt = formatOfPath(f);
      if (fmt) froms.add(fmt.id);
      else unknown.push(f);
    }
    if (!froms.size) return { from: [], targets: [], unknown };
    const { ready, missing } = await this.split();
    const all = [...ready, ...missing.keys()];
    const perSource: Set<string>[] = [...froms].map((f) => new Set([...reachable(all, f)].filter((to) => sensible(f, to))));
    const candidates: string[] = [...perSource[0]!].filter((to: string) => perSource.every((s) => s.has(to)));
    const out: TargetInfo[] = [];
    for (const to of candidates) {
      const label = formatById(to)?.label ?? to;
      const routes = [...froms].map((f) => planRoute(ready, f, to));
      if (routes.every((r): r is Route => !!r)) {
        out.push({ to, label, available: true, ...describe(routes) });
        continue;
      }
      // 至少一个源格式走不通：看「装上什么就通」—— 用全部工具规划，路线上第一个没就绪的工具就是原因。
      const blocked = [...froms].map((f) => planRoute(all, f, to)).find((r) => r && r.steps.some((s) => missing.has(s.converter)));
      const st = blocked?.steps.map((s) => missing.get(s.converter)).find((x): x is Extract<ToolStatus, { ok: false }> => !!x && !x.ok);
      out.push({ to, label, available: false, reason: st?.reason ?? "这台电脑上转不了", hint: st?.hint });
    }
    out.sort((a, b) => Number(b.available) - Number(a.available) || order(a.to) - order(b.to));
    return { from: [...froms], targets: out, unknown };
  }

  /** 转一批文件。逐个文件独立成败：一个失败不影响其他的。 */
  async convert(req: ConvertRequest): Promise<FileResult[]> {
    const files = req.files.slice(0, MAX_FILES);
    const { ready } = await this.split();
    const results: FileResult[] = [];
    let index = 0;
    // 文件之间并行由各转换器的闸门限流；这里按顺序发起，结果按原顺序回。
    await Promise.all(files.map((source) => {
      const i = index++;
      return this.one(source, req, ready, (fraction) => req.onProgress?.({ index: i, total: files.length, source, fraction }))
        .then((r) => { results[i] = r; });
    }));
    return results;
  }

  private async one(source: string, req: ConvertRequest, ready: Converter[], progress: (f: number | null) => void): Promise<FileResult> {
    const fmt = formatOfPath(source);
    if (!fmt) return { source, state: "skipped", error: "不认识这个文件的格式" };
    if (fmt.id === req.to) return { source, state: "skipped", error: "已经是这个格式了" };
    const route = planRoute(ready, fmt.id, req.to);
    if (!route) return { source, state: "failed", error: `这台电脑上没法把 ${fmt.label} 转成 ${formatById(req.to)?.label ?? req.to}` };
    const st = await fs.stat(source).catch(() => null);
    if (!st || !st.isFile()) return { source, state: "failed", error: "文件不存在" };
    const { note, via } = describe([route]);

    const work = await fs.mkdtemp(path.join(this.tmpRoot, "umbra-convert-"));
    let reserved = "";
    try {
      let input = source;
      for (let i = 0; i < route.steps.length; i++) {
        if (req.signal?.aborted) throw new Error("已取消");
        const s = route.steps[i]!;
        const output = path.join(work, `step${i + 1}.${formatById(s.to)?.exts[0] ?? s.to}`);
        const n = route.steps.length;
        await this.gate(s.converter).run(() => s.converter.convert({
          input, from: s.from, to: s.to, output, workDir: work,
          options: req.options ?? {},
          signal: req.signal ?? new AbortController().signal,
          progress: (f) => progress(f === null ? null : (i + f) / n),
        }));
        // 有的工具失败了退出码还是 0（afconvert 写 mp3）：成品不在或是空的，就当失败。
        const made = await fs.stat(output).catch(() => null);
        if (!made || !made.isFile() || made.size === 0) throw new Error(`${s.converter.name} 没有转出内容`);
        input = output;
      }
      reserved = await reserveOutput(source, req.to, req.outDir);
      await settleOutput(input, reserved);
      progress(1);
      const out = reserved;
      reserved = "";
      return { source, state: "done", output: out, note, via };
    } catch (e) {
      return { source, state: "failed", error: e instanceof Error ? e.message : String(e), via };
    } finally {
      if (reserved) await releaseOutput(reserved);
      await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/** 文字类的源。 */
const TEXTY: ReadonlySet<FormatCategory> = new Set(["document", "sheet", "slides", "text", "ebook", "pdf"]);
/** 音视频。 */
const MEDIA: ReadonlySet<FormatCategory> = new Set(["video", "audio"]);

/** 列「能转成什么」时去掉没意义的组合：文字类的东西转成音视频。
 *  增强转换包的格式图很宽，多步一拼就会出「docx → gif → mp4」这种技术上通、没人要的路（10-18 实测撞到）。
 *  只管**列不列**，不拦明确的请求（AI / 工作流写明了要 mp4，照转）。 */
export function sensible(from: string, to: string): boolean {
  const a = formatById(from)?.category;
  const b = formatById(to)?.category;
  return !(a && b && TEXTY.has(a) && MEDIA.has(b));
}

/** 常用的排前面。 */
const ORDER = ["pdf", "jpg", "png", "docx", "mp4", "mp3", "m4a", "xlsx", "pptx", "md", "html", "txt", "heic", "webp", "gif"];
function order(id: string): number {
  const i = ORDER.indexOf(id);
  return i < 0 ? ORDER.length : i;
}

function describe(routes: Route[]): { note?: string; via?: string } {
  const notes = [...new Set(routes.flatMap((r) => r.steps.map((s) => s.note).filter((x): x is string => !!x)))];
  const via = [...new Set(routes.map((r) => r.steps.map((s) => s.converter.name).join(" → ")))].join("；");
  return { note: notes.length ? notes.join("；") : undefined, via: via || undefined };
}
