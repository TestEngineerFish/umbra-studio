import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { STATE_ROOT, TOOL_ROOT } from "../project.js";

/** 插件市场的目录（M11-6 接线；2026-10-11 改成问服务端）。
 *
 *  **三级来源，依次回落**（`pickCatalog`）：
 *  1. `server`  —— Umbra 服务端 `GET /plugins/catalog`（不要凭证，只含上架的；后台在那边管上下架）；
 *  2. `cache`   —— 上一次从服务端拿到的那份（`STATE_ROOT/plugins/catalog-cache.json`），离线时用；
 *  3. `bundled` —— 出厂清单 `TOOL_ROOT/plugins/catalog.json`，第一次装、从没联过网时的兜底。
 *  没配服务端地址（账号文件里 `serverUrl` 为空）就只有 3。
 *
 *  ⚠️ 这一层**不是权威**：一个插件「要什么权限」的权威出处是**包里的 manifest**，
 *  目录里那份只是给用户装之前看一眼的。两者不一致时以包里的为准 ——
 *  否则伪造目录就能让用户看到一份假的权限清单（`install.ts` 里记过同一条）。
 *  同理服务端回来的条目也先过 `validateCatalog`：id 空、formats 不是数组的条目直接丢掉，不让坏数据进市场。
 *
 *  网络只打一次就记住（`memo`）：`whoHandles` 是 ✎ 那颗钮每次都问的，不能每按一下等 3 秒。
 */
export interface CatalogEntry {
  id: string; name: string; author: string; version: string;
  /** 积分。0 = 免费；`builtin` 的不显示价格 */
  price: number;
  builtin?: boolean;
  brief: string;
  /** 它认领哪些扩展名 —— 市场按这个筛，也用来回答「有没有插件能编辑 .xyz」 */
  formats: string[];
  permissions: { files?: string[]; net?: string[] };
  size?: string;
  updated?: string;
  /** B 面：给大模型的能力。`sample` 用来算那道「读写账」 */
  tools?: Array<{
    name: string; id: string; desc: string;
    sample?: { task: string; without: "whole" | "none" | string; with: string };
  }>;
}

/** 目录从哪来（给前端提示用）。 */
export type CatalogSource = "server" | "cache" | "bundled";

export interface CatalogResult { entries: CatalogEntry[]; source: CatalogSource }

/** 扩展名 → 大类。**前端和这里各有一份是有意的**：
 *  前端那份用来筛选（纯展示），这一份用来回答「有没有插件能编辑它」（要和目录一致）。
 *  ⚠️ 不要把它塞进插件清单 —— 分类是市场的事，不是插件的事：
 *  同一个插件在不同市场里可以归不同的类。 */
export const KIND_OF_EXT: Record<string, string> = {
  ".md": "文本", ".markdown": "文本", ".txt": "文本", ".srt": "文本", ".json": "文本",
  ".csv": "表格", ".tsv": "表格", ".xlsx": "表格",
  ".mp4": "视频", ".mov": "视频", ".webm": "视频",
  ".html": "网页", ".htm": "网页",
};

/** 出厂清单（进仓库）。 */
export const BUNDLED_FILE = join(TOOL_ROOT, "plugins", "catalog.json");
/** 服务端那份的本地缓存（不进仓库，`.gitignore` 有它）。 */
export const CACHE_FILE = join(STATE_ROOT, "plugins", "catalog-cache.json");

/** 问服务端等多久。超过就当没联上，回落缓存 —— 市场页不能因为网络卡住。 */
export const FETCH_TIMEOUT_MS = 3000;
/** 拿到服务端那份之后多久内不再问（上下架不是分钟级的事）。 */
export const MEMO_OK_MS = 5 * 60 * 1000;
/** 没联上之后多久内不再试（别让每次 ✎ 都等 3 秒）。 */
export const MEMO_FAIL_MS = 30 * 1000;

/** 形状校验：`{plugins:[…]}`，每条 id 非空字符串、formats 是字符串数组；不合形的条目丢掉。
 *  整体不是这个形状（没有 `plugins` 数组）回 null —— 「回了但不是目录」和「回了空目录」要分开：前者回落，后者就是空市场。 */
export function validateCatalog(raw: unknown): CatalogEntry[] | null {
  const list = (raw as { plugins?: unknown } | null)?.plugins;
  if (!Array.isArray(list)) return null;
  const out: CatalogEntry[] = [];
  for (const e of list) {
    const c = e as Partial<CatalogEntry> | null;
    if (!c || typeof c !== "object") continue;
    if (typeof c.id !== "string" || !c.id.trim()) continue;
    if (!Array.isArray(c.formats) || !c.formats.every((f) => typeof f === "string")) continue;
    const id = c.id.trim();
    out.push({
      ...(c as CatalogEntry),
      id,
      name: typeof c.name === "string" && c.name.trim() ? c.name : id,
      author: typeof c.author === "string" ? c.author : "",
      version: typeof c.version === "string" ? c.version : "",
      price: typeof c.price === "number" && Number.isFinite(c.price) && c.price >= 0 ? c.price : 0,
      brief: typeof c.brief === "string" ? c.brief : "",
      permissions: c.permissions && typeof c.permissions === "object" ? c.permissions : {},
    });
  }
  return out;
}

/** 三级回落：服务端 > 缓存 > 出厂。`null` = 这一级没有（拿不到 / 文件不在 / 不合形）。 */
export function pickCatalog(server: CatalogEntry[] | null, cache: CatalogEntry[] | null, bundled: CatalogEntry[] | null): CatalogResult {
  if (server) return { entries: server, source: "server" };
  if (cache) return { entries: cache, source: "cache" };
  return { entries: bundled ?? [], source: "bundled" };
}

/** 服务端目录的地址。`serverUrl` 空 = 没配服务端。 */
export function catalogUrl(serverUrl: string): string {
  const base = (serverUrl || "").trim().replace(/\/+$/, "");
  return base ? `${base}/plugins/catalog` : "";
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** 从服务端拿一份。任何失败（连不上、超时、非 2xx、不合形）都回 null，不抛 —— 失败就回落，不是错误。 */
export async function fetchServerCatalog(serverUrl: string, fetchFn: FetchLike, timeoutMs = FETCH_TIMEOUT_MS): Promise<CatalogEntry[] | null> {
  const url = catalogUrl(serverUrl);
  if (!url) return null;
  try {
    const r = await fetchFn(url, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return validateCatalog(await r.json());
  } catch { return null; }
}

async function readJsonFile(file: string): Promise<CatalogEntry[] | null> {
  if (!existsSync(file)) return null;
  try { return validateCatalog(JSON.parse(await readFile(file, "utf8"))); } catch { return null; }
}

export interface ReadCatalogOptions {
  /** 注入网络（测试用）。缺省 `globalThis.fetch`。 */
  fetchFn?: FetchLike;
  /** 服务端地址；`undefined` = 读账号文件里的；空串 = 不问服务端。 */
  serverUrl?: string;
  cacheFile?: string;
  bundledFile?: string;
  /** 跳过 memo（测试用）。 */
  noMemo?: boolean;
}

let memo: { at: number; ok: boolean; result: CatalogResult } | null = null;

/** 测试 / 登录切换后清掉记忆。 */
export function resetCatalogMemo(): void { memo = null; }

/** 读目录（带来源）。没有任何一级就是空市场 —— **空市场不是错误**，第一期很可能就只有内置的那一个。 */
export async function readCatalogDetailed(opts: ReadCatalogOptions = {}): Promise<CatalogResult> {
  const now = Date.now();
  if (!opts.noMemo && memo && now - memo.at < (memo.ok ? MEMO_OK_MS : MEMO_FAIL_MS)) return memo.result;
  const cacheFile = opts.cacheFile ?? CACHE_FILE;
  const bundledFile = opts.bundledFile ?? BUNDLED_FILE;
  let serverUrl = opts.serverUrl;
  if (serverUrl === undefined) {
    if (process.env.UMBRASTUDIO_OFFLINE_CATALOG === "1") serverUrl = "";
    else {
      try { serverUrl = (await (await import("../account.js")).getAccount()).serverUrl; } catch { serverUrl = ""; }
    }
  }
  const fetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i) as unknown as ReturnType<FetchLike>);
  const server = serverUrl ? await fetchServerCatalog(serverUrl, fetchFn) : null;
  if (server) {
    try { await mkdir(dirname(cacheFile), { recursive: true }); await writeFile(cacheFile, JSON.stringify({ plugins: server, fetchedAt: new Date().toISOString() }, null, 2)); }
    catch { /* 写不了缓存不影响这次的结果 */ }
  }
  const result = pickCatalog(server, server ? null : await readJsonFile(cacheFile), await readJsonFile(bundledFile));
  if (!opts.noMemo) memo = { at: now, ok: !!server || !serverUrl, result };
  return result;
}

/** 读目录（老签名，只要条目）。 */
export async function readCatalog(): Promise<CatalogEntry[]> {
  return (await readCatalogDetailed()).entries;
}

/** 有没有插件能编辑这个扩展名。**✎ 那颗钮要问它**（用户 2026-09-26 定的模型）。 */
export async function whoHandles(ext: string): Promise<CatalogEntry[]> {
  const e = ext.toLowerCase();
  return (await readCatalog()).filter((c) => c.formats.some((f) => f.toLowerCase() === e));
}
