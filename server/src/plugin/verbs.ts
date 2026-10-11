/** 插件 B 面动词的挂出与收回（`doc/22` §3.3，M13-1 / M13-2）。
 *
 *  插件在 `tools.mjs` 里 `host.defineCap({...})` 声明的每一件能力，这里叫一个**动词**。
 *  动词从三处进模型的视野：应用内会话的工具表（`chat_run.ts`）、对外 MCP（`index.ts`）、
 *  HTTP 的 `plugin_verbs`（给界面与回归看）。**三处都从这一份表拿**，不各自再扫一遍插件。
 *
 *  判据（`doc/22` §〇）：
 *  · **列出来的就能用，用不了的不列**：授权态 builtin / active → 全部动词挂出；
 *    expired / not-yet / unlicensed / bad-license → 只挂插件自己标了 `free: true` 的（Q56 拍板：不列、不标灰）。
 *  · **列表是快照，调用再验一次**：`invokeVerb` 进门先重算授权 —— 许可证可能在列出之后过期。
 *  · 沙箱不变：动词在 QuickJS 里跑（`sandbox.ts`），宿主能力照旧走白名单；这里**不给插件任何新权限**。
 *
 *  对外名字（Q54 拍板前缀制）：`<插件短名>__<动词>`，如 `markdown__replace_section`。
 *  用两个下划线不用点：OpenAI 函数名和 MCP 工具名都只认 `[A-Za-z0-9_-]`。
 *  短名 = 插件 id 最后一段；两个插件短名撞了，撞的那几个退回整个 id（点换下划线）—— 不让后装的那个静默消失。
 *
 *  沙箱按插件各起一个、起了就留着（第一次列动词时起，装 / 卸 / 切版本时按目录重开）。
 *  插件的 `caps` 只有起过沙箱才知道，所以「列动词」这件事本身会起进程 —— 开销在第一次，之后走缓存。
 */
import { z } from "zod";
import { subscribe } from "../events.js";
import type { Project } from "../project.js";
import { entitlementOf, type EntitlementState } from "./license.js";
import type { PluginManifest } from "./manifest.js";
import { PluginSandbox } from "./sandbox.js";
import { listInstalled } from "./store.js";

/** 一件动词在表里的样子。`exposed` = 此刻该不该出现在模型的工具表里。 */
export interface Verb {
  /** 对外工具名（`<短名>__<动词>`） */
  tool: string;
  plugin: string;
  pluginName: string;
  /** 插件自己声明的能力名（沙箱里 `invoke` 用它） */
  cap: string;
  title: string;
  summary: string;
  /** 插件声明的入参：`{ path: "string", from: "number" }` 这种「名 → 类型名」表；类型名尾巴带 `?` = 可选 */
  input: Record<string, unknown>;
  free: boolean;
  state: EntitlementState;
  exposed: boolean;
}

/** 调动词的结果。`ok: false` 时 `code` 是三种之一：没这件 / 没授权 / 插件自己抛了。 */
export type VerbResult =
  | { ok: true; data: unknown }
  | { ok: false; code: "E_VERB_UNKNOWN" | "E_PLUGIN_UNLICENSED" | "E_VERB_FAILED"; message: string;
      plugin?: string; state?: EntitlementState; note?: string; market_url?: string };

const USABLE = new Set<EntitlementState>(["builtin", "active"]);

interface Slot { dir: string; sandbox: PluginSandbox; error: string }
const pool = new Map<string, Slot>();
let cache: Verb[] | null = null;
let listing: Promise<Verb[]> | null = null;
const listeners = new Set<() => void>();

/** 订阅「动词表可能变了」（装 / 卸 / 切版本 / 许可证变了）。回调不带内容 —— 自己再 `listVerbs()` 一次。 */
export function onVerbsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function invalidate(): void {
  cache = null;
  for (const cb of listeners) { try { cb(); } catch { /* 一个订阅者坏了不影响别人 */ } }
}

/* 装 / 卸 / 切版本 / 许可证变动都从 `cap/plugins.ts` 发 `plugin` 事件 —— 这里订阅它，不另开一条通知路。 */
subscribe((e) => { if (e.type === "plugin") invalidate(); });

const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, "_");

/** 对外工具名。`shortTaken` 是「短名被几个插件用」的计数表，撞了的退回整个 id。 */
export function toolNameOf(pluginId: string, capName: string, shortTaken?: Map<string, number>): string {
  const short = pluginId.split(".").pop() || pluginId;
  const head = (shortTaken?.get(short) ?? 1) > 1 ? pluginId : short;
  const verb = capName.startsWith(pluginId + ".") ? capName.slice(pluginId.length + 1) : capName;
  return `${sanitize(head)}__${sanitize(verb)}`;
}

/** 插件的「名 → 类型名」入参表 → JSON Schema（给 OpenAI 函数调用）。认 string / number / boolean / object / array，别的当 string；尾巴 `?` = 可选。 */
export function jsonSchemaOf(input: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(input ?? {})) {
    const raw = typeof v === "string" ? v : "string";
    const optional = raw.endsWith("?");
    const t = raw.replace(/\?$/, "");
    properties[k] = { type: ["string", "number", "boolean", "object", "array"].includes(t) ? t : "string" };
    if (!optional) required.push(k);
  }
  return { type: "object", properties, required };
}

/** 同一张表 → zod 形状（给 MCP SDK 的 `inputSchema`）。 */
export function zodShapeOf(input: Record<string, unknown>): z.ZodRawShape {
  const shape: z.ZodRawShape = {};
  for (const [k, v] of Object.entries(input ?? {})) {
    const raw = typeof v === "string" ? v : "string";
    const optional = raw.endsWith("?");
    const t = raw.replace(/\?$/, "");
    const base = t === "number" ? z.number() : t === "boolean" ? z.boolean()
      : t === "object" ? z.record(z.unknown()) : t === "array" ? z.array(z.unknown()) : z.string();
    shape[k] = optional ? base.optional() : base;
  }
  return shape;
}

/** 给会话工具表用的一条 `ToolDef`（形状同 `provider.ts`，这里不 import 它免得插件层反依赖会话层）。 */
export function verbToolDef(v: Verb): { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } } {
  return { type: "function", function: { name: v.tool, description: `${v.title}。${v.summary}`, parameters: jsonSchemaOf(v.input) } };
}

/** 保证这个插件的沙箱起着、目录对得上。起不来回 `null` 并把原因记在槽位上（`plugin_verbs` 会把它列出来）。 */
async function slotOf(id: string, dir: string, manifest: PluginManifest): Promise<Slot | null> {
  const have = pool.get(id);
  if (have && have.dir === dir && !have.error) return have;
  if (have) have.sandbox.stop();
  const slot: Slot = { dir, sandbox: new PluginSandbox(manifest, dir), error: "" };
  try { await slot.sandbox.start(); }
  catch (e) { slot.error = (e as Error).message; slot.sandbox.stop(); }
  pool.set(id, slot);
  return slot.error ? null : slot;
}

/** 起不来的插件：id → 原因。给 `plugin_verbs` 列出来 —— 静静没有的话，用户只会看到「我装的插件的能力不见了」。 */
export function sandboxFailures(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, s] of pool) if (s.error) out[id] = s.error;
  return out;
}

/** 全表（含没挂出的）。`exposed` 字段说此刻该不该给模型看。并发调用共用同一次扫描。 */
export async function allVerbs(): Promise<Verb[]> {
  if (cache) return cache;
  if (listing) return listing;
  listing = (async () => {
    const installed = (await listInstalled()).filter((p) =>
      p.problems.length === 0 && p.manifest.surfaces?.includes("tools") && typeof p.manifest.tools === "string");
    const shortTaken = new Map<string, number>();
    for (const p of installed) {
      const short = p.manifest.id.split(".").pop() || p.manifest.id;
      shortTaken.set(short, (shortTaken.get(short) ?? 0) + 1);
    }
    /* 装着但这次没扫到的（卸了 / 清单坏了）：沙箱停掉，别留孤儿进程 */
    for (const [id, s] of pool) if (!installed.some((p) => p.manifest.id === id)) { s.sandbox.stop(); pool.delete(id); }
    const out: Verb[] = [];
    for (const p of installed) {
      const slot = await slotOf(p.manifest.id, p.dir, p.manifest);
      if (!slot) continue;
      const ent = await entitlementOf(p.manifest.id, { bundled: p.bundled });
      const usable = USABLE.has(ent.state);
      for (const c of slot.sandbox.caps) {
        const free = c.free === true;
        out.push({
          tool: toolNameOf(p.manifest.id, c.name, shortTaken), plugin: p.manifest.id, pluginName: p.manifest.name,
          cap: c.name, title: c.title, summary: c.summary, input: c.input ?? {}, free, state: ent.state,
          exposed: usable || free,
        });
      }
    }
    cache = out;
    return out;
  })();
  try { return await listing; } finally { listing = null; }
}

/** 此刻该挂出去的动词（模型工具表用这个）。 */
export async function listVerbs(): Promise<Verb[]> {
  return (await allVerbs()).filter((v) => v.exposed);
}

/** 一个名字是不是动词（会话分发时先问它，再落到「未实现的工具」）。 */
export async function isVerb(tool: string): Promise<boolean> {
  return (await allVerbs()).some((v) => v.tool === tool);
}

/** 调一件动词。**进门重算授权**：列表是快照，许可证可能刚过期；过不了回 `E_PLUGIN_UNLICENSED` + 去市场的地址。 */
export async function invokeVerb(tool: string, input: unknown, project: Project): Promise<VerbResult> {
  const v = (await allVerbs()).find((x) => x.tool === tool);
  if (!v) return { ok: false, code: "E_VERB_UNKNOWN", message: `没有叫 ${tool} 的动词（插件没装、或清单有毛病）` };
  const slot = pool.get(v.plugin);
  const ent = await entitlementOf(v.plugin, { bundled: (await listInstalled()).find((p) => p.manifest.id === v.plugin)?.bundled });
  if (!USABLE.has(ent.state) && !v.free) {
    return { ok: false, code: "E_PLUGIN_UNLICENSED", message: `${v.pluginName} 的「${v.title}」要授权：${ent.note}`,
      plugin: v.plugin, state: ent.state, note: ent.note, market_url: `umbrastudio://market/${v.plugin}` };
  }
  if (!slot || slot.error) return { ok: false, code: "E_VERB_FAILED", message: `插件 ${v.plugin} 的沙箱起不来：${slot?.error ?? "没起过"}` };
  try {
    return { ok: true, data: await slot.sandbox.invoke(v.cap, input ?? {}, project) };
  } catch (e) {
    return { ok: false, code: "E_VERB_FAILED", message: (e as Error).message };
  }
}

/** 停掉全部沙箱并清表（回归收尾、进程退出用）。 */
export function stopAllVerbSandboxes(): void {
  for (const [, s] of pool) s.sandbox.stop();
  pool.clear();
  cache = null;
}
