/** 插件沙箱的限额（2026-10-19，用户定：放进设置，后期好调）。
 *
 *  原来写死在三处：`runner.ts` 的 `MEM_LIMIT = 128 MB` / `DEADLINE_MS = 10 s`、
 *  `sandbox.ts` 的 RPC 超时 15 s、`files.ts` 的 `BINARY_MAX = 100 MB`。
 *  插件因此只处理得了二三十 MB 的文件（base64 +33%，再进 QuickJS 又是一份）。
 *
 *  存于 `STATE_ROOT/.umbrastudio/plugin_limits.json`（同 `ai_config.json`：属于机器，不随项目走）。
 *  **每次现读**：文件很小，而「改了设置要生效」靠的就是下一次读到新值 ——
 *  缓存一份的话，还得再想「谁来让它失效」。
 *
 *  读和写的口径**故意不一样**：
 *  · 读：手改坏了的文件（越界、写成字符串）**夹到范围 / 回落默认**，不让插件因为一份坏配置全体起不来；
 *  · 写：越界直接拒（E_BAD_INPUT）—— 界面上填了 4096 却悄悄存成 2048，用户会以为自己存进去了。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { X } from "../codes.js";
import { err, ToolError } from "../envelope.js";
import { writeAtomic } from "../normalize.js";
import { STATE_ROOT } from "../project.js";

const LIMITS_FILE = join(STATE_ROOT, ".umbrastudio", "plugin_limits.json");

/** 存盘的形状（设置页改的就是这四项） */
export interface PluginLimits {
  /** 插件一个 QuickJS 上下文最多占多少内存（MB） */
  memoryMB: number;
  /** 插件一次调用最多跑多久（秒） */
  deadlineSec: number;
  /** `read_file` 给插件按字节读（整份 base64 / 一段字节范围）的上限（MB） */
  binaryReadMaxMB: number;
  /** `read_file` 给**插件**整份读文本的上限（MB）。2026-10-19 加：原来是写死的 `files.ts` `TEXT_MAX`（2 MB）。
   *  ⚠️ **只管插件来源**：模型 / MCP / HTTP / chat 读文本仍是那个 2 MB 常量 —— 把 60 MB 的日志塞进模型上下文不是「调大上限」能解决的事。 */
  textReadMaxMB: number;
}

/** 每项的合法范围与默认值。**整数**。界面上显示的范围也从这里拿，不另抄一份。 */
export const LIMIT_RANGES: Record<keyof PluginLimits, { min: number; max: number; def: number }> = {
  memoryMB: { min: 64, max: 2048, def: 512 },
  deadlineSec: { min: 5, max: 120, def: 30 },
  /* 默认值 = 原来的 `files.ts` `BINARY_MAX`（100 MB）。⚠️ **这里不能写 `BINARY_MAX / 1048576`**：
     `files.ts` 经 project → … → `sandbox.ts` 绕回本文件，模块顶层取它会撞上「初始化之前访问」
     （gaptest 当场栽过）。 */
  binaryReadMaxMB: { min: 10, max: 1024, def: 100 },
  /* 默认值 = `files.ts` 的 `TEXT_MAX`（2 MB）；同上，不能在顶层引它。上限 64 MB：
     文本整份要解码成字符串再经 RPC / postMessage 进插件，再大就该按 byteOffset / byteLength 分段读了。 */
  textReadMaxMB: { min: 1, max: 64, def: 2 },
};
const KEYS = Object.keys(LIMIT_RANGES) as Array<keyof PluginLimits>;

export const DEFAULT_LIMITS: PluginLimits = {
  memoryMB: LIMIT_RANGES.memoryMB.def,
  deadlineSec: LIMIT_RANGES.deadlineSec.def,
  binaryReadMaxMB: LIMIT_RANGES.binaryReadMaxMB.def,
  textReadMaxMB: LIMIT_RANGES.textReadMaxMB.def,
};

/** **插件看到的限额**：B 面在 `host.limits`、A 面在 `ctx` 消息的 `limits` 里拿到的就是这一份。
 *  单位换成字节 / 毫秒 —— 插件拿它直接和 `size`、`Date.now()` 比，不用自己乘。
 *  ⚠️ 字段名和 umbra-plugins 那边定死了，改要两边一起改。 */
export interface PluginLimitsView {
  memoryBytes: number;
  deadlineMs: number;
  binaryReadMax: number;
  /** 插件整份读文本的上限（字节）= 设置里的 `textReadMaxMB`。2026-10-19 前是写死的 `TEXT_MAX`（2 MB） */
  textReadMax: number;
  /** 这个宿主认不认 `read_file({ byteOffset, byteLength })`。老宿主没有这个字段 */
  rangeRead: true;
}

/** 读的口径：数字就夹到范围（小数四舍五入），别的回落默认 */
function clampOne(k: keyof PluginLimits, v: unknown): number {
  const r = LIMIT_RANGES[k];
  if (typeof v !== "number" || !Number.isFinite(v)) return r.def;
  return Math.min(r.max, Math.max(r.min, Math.round(v)));
}

export function clampLimits(raw: unknown): PluginLimits {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    memoryMB: clampOne("memoryMB", o.memoryMB),
    deadlineSec: clampOne("deadlineSec", o.deadlineSec),
    binaryReadMaxMB: clampOne("binaryReadMaxMB", o.binaryReadMaxMB),
    textReadMaxMB: clampOne("textReadMaxMB", o.textReadMaxMB),
  };
}

/** 现读。没文件 / 坏 JSON → 默认值 */
export async function getPluginLimits(): Promise<PluginLimits> {
  try { return clampLimits(JSON.parse(await readFile(LIMITS_FILE, "utf8"))); }
  catch { return { ...DEFAULT_LIMITS }; }
}

export function limitsView(l: PluginLimits): PluginLimitsView {
  return {
    memoryBytes: l.memoryMB * 1048576,
    deadlineMs: l.deadlineSec * 1000,
    binaryReadMax: l.binaryReadMaxMB * 1048576,
    textReadMax: l.textReadMaxMB * 1048576,
    rangeRead: true,
  };
}

export async function getPluginLimitsView(): Promise<PluginLimitsView> {
  return limitsView(await getPluginLimits());
}

const bad = (name: string, message: string, fix?: string) =>
  new ToolError(err(X.BAD_INPUT, "(input)", { kind: "key", name }, message, fix ? { fix } : undefined));

/** 改其中几项，别的原样保留；原子写。**写完把在跑的插件沙箱都停掉** —— 限额是沙箱起来那一刻定的
 *  （内存上限进 QuickJS 运行时、期限进 runner），不停的话新值要等到下次重启 Studio 才生效。
 *  停掉的沙箱在下一次调用时按新限额重开（`sandbox.ts` 的 `invoke`）。
 *
 *  ⚠️ 门面不跑 zod（`api.ts`），所以校验在这里手写：只认这四个键、整数、在范围里，别的一律拒。 */
export async function setPluginLimits(patch: unknown): Promise<PluginLimits> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw bad("(body)", "要给一个对象，例如 { memoryMB: 512 }");
  const p = patch as Record<string, unknown>;
  for (const k of Object.keys(p)) {
    if (!(KEYS as string[]).includes(k)) throw bad(k, `不认识的限额项：${k}`, `能改的是：${KEYS.join(" / ")}`);
  }
  const cur = await getPluginLimits();
  const next: PluginLimits = { ...cur };
  for (const k of KEYS) {
    if (p[k] === undefined) continue;
    const v = p[k];
    const r = LIMIT_RANGES[k];
    if (typeof v !== "number" || !Number.isInteger(v)) throw bad(k, `${k} 要是整数，收到的是 ${JSON.stringify(v)}`, `范围 ${r.min}–${r.max}`);
    if (v < r.min || v > r.max) throw bad(k, `${k} = ${v} 超出范围 ${r.min}–${r.max}`, `默认 ${r.def}`);
    next[k] = v;
  }
  await writeAtomic(LIMITS_FILE, JSON.stringify(next, null, 2) + "\n");
  /* 动态 import：`verbs.ts` → `sandbox.ts` → 本文件，静态引回去就绕成环 */
  const { restartVerbSandboxes } = await import("./verbs.js");
  restartVerbSandboxes();
  return next;
}
