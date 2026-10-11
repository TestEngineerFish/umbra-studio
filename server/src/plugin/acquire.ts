/** 从市场「拿到」一个插件（2026-10-11）：买 → 取许可证 → 从 URL 装包。这里是**纯判据 + 下载**；
 *  调服务端（买、取许可证）在 `account.ts`，能力的编排在 `cap/plugins.ts acquire_plugin`。
 *
 *  ⚠️ 下载只认 https、有上限、有超时，**任何一步失败不落一个字节**：临时文件在 `finally` 里删，
 *  真正落盘的是 `installFromFile`（它自己也是「验不过就全撤」）。
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFromFile, type InstallResult } from "./install.js";
import type { License, LicenseCheck } from "./license.js";

/** 安装包上限 50 MB —— 插件是编辑器，不是游戏；超过多半是地址指错了。 */
export const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
/** 下载超时 30 秒。 */
export const DOWNLOAD_TIMEOUT_MS = 30_000;

/** 会员折扣的百分比（服务端 `GET /membership` 的 `discount_pct`，100 = 不打折）。
 *  只认 1..100 的整数；缺、不是数、越界一律回 100 —— **拿不到折扣就是不打折**，不能把价格算成 0。 */
export function discountPctOf(body: unknown): number {
  const raw = (body as { discount_pct?: unknown } | null)?.discount_pct;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 100) return 100;
  return raw;
}

/** 会员实扣：`(price * pct + 50) // 100`，price > 0 时至少 1。**与服务端 `plugin_licenses.buy()` 同一算法** ——
 *  目录接口不认人，所以端上只能自己算给用户看；真扣多少以服务端回包的 `charged` 为准。 */
export function memberPrice(price: number, pct: number): number {
  if (!(price > 0)) return 0;
  if (pct >= 100) return price;
  return Math.max(1, Math.floor((price * pct + 50) / 100));
}

/** 安装包地址合不合规：只认 `https://主机/路径`。http 不认（包会被中间人换掉；验签挡得住内容、挡不住拒绝服务）。 */
export function isHttpsUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && !!u.hostname && u.pathname.length > 1;
  } catch { return false; }
}

/** 本机这份许可证是不是**当前账号**的：`sub` 要等于账号 id（服务端签的是 `str(user_id)`）。
 *  `null` = 本机没有许可证。验不过的那份也算「不是」—— 要重新取。 */
export function licenseIsFor(lic: LicenseCheck | null, userId: number | string | null | undefined): boolean {
  if (!lic || !lic.ok || !lic.license) return false;
  if (userId === null || userId === undefined || userId === "") return false;
  return String(lic.license.sub) === String(userId);
}

/** 服务端 `GET /plugins/license` 的回包 → 可以直接写盘的许可证文本。
 *  ⚠️ **不重新序列化 payload**：签的是那个字符串本身，重排键序就验不过了（`license.ts` 文件头）。 */
export function licenseTextOf(body: unknown): string | null {
  const d = body as { payload?: unknown; signature?: unknown } | null;
  if (!d || typeof d !== "object") return null;
  if (typeof d.payload !== "string" || !d.payload || typeof d.signature !== "string" || !d.signature) return null;
  return JSON.stringify({ payload: d.payload, signature: d.signature });
}

/** 一场「拿到插件」要走哪几步（纯判据，能力按它编排）。 */
export interface AcquirePlan {
  /** 要不要先买：没授权、不是赠送、不是内置才买 */
  buy: boolean;
  /** 要不要（重新）取许可证：只要还没有有效授权就取 —— 买完要取，赠送的也要取 */
  license: boolean;
  /** 取完要不要装：有安装包地址才装 */
  install: boolean;
  /** 直接拒绝的原因（空串 = 可以进行） */
  refuse: string;
}

export function planAcquire(p: { signedIn: boolean; builtin: boolean; installed: boolean; entitled: boolean; gift: boolean; price: number; packageUrl?: string }): AcquirePlan {
  const none: AcquirePlan = { buy: false, license: false, install: false, refuse: "" };
  if (p.builtin) return { ...none, refuse: "内置插件随 Umbra 一起，不用买也不用装" };
  if (p.installed && p.entitled) return { ...none, refuse: "已经装好并且有授权了" };
  if (!p.signedIn) return { ...none, refuse: "登录 Umbra 账号后才能购买 / 领取插件" };
  const install = isHttpsUrl(p.packageUrl) && !p.installed;
  if (p.entitled) return { buy: false, license: false, install, refuse: "" };
  return { buy: !p.gift && p.price > 0, license: true, install, refuse: "" };
}

/** 许可证里有没有这个插件**现在有效**的授权（给 acquire 取完许可证后当场核；完整的六态在 `entitlementOf`）。 */
export function licenseGrants(lic: License | null | undefined, plugin: string, now: Date = new Date()): boolean {
  if (!lic) return false;
  return lic.grants.some((g) => g.plugin === plugin
    && (!g.from || new Date(g.from).getTime() <= now.getTime())
    && (g.until === null || g.until === undefined || new Date(g.until).getTime() >= now.getTime()));
}

/** 注入的 fetch 形状（同 `catalog.ts`）：只要 ok / status / arrayBuffer / headers。 */
export type PackageFetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  ok: boolean; status: number; headers?: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** 下载到临时文件。失败抛 Error（人话）；成功回临时文件路径，**调用方负责删**。 */
export async function downloadPackage(url: string, fetchFn: PackageFetch, opts: { maxBytes?: number; timeoutMs?: number } = {}): Promise<string> {
  if (!isHttpsUrl(url)) throw new Error("安装包地址不是 https，不下载");
  const max = opts.maxBytes ?? MAX_PACKAGE_BYTES;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  let buf: Buffer;
  try {
    const r = await fetchFn(url.trim(), { signal: ctl.signal, headers: { Accept: "application/octet-stream" } });
    if (!r.ok) throw new Error(`下载安装包失败：HTTP ${r.status}`);
    const declared = Number(r.headers?.get("content-length") ?? 0);
    if (declared > max) throw new Error(`安装包太大（${(declared / 1048576).toFixed(1)} MB，上限 ${max / 1048576} MB）`);
    buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) throw new Error(`安装包太大（${(buf.length / 1048576).toFixed(1)} MB，上限 ${max / 1048576} MB）`);
    if (!buf.length) throw new Error("下载到的安装包是空的");
  } catch (e) {
    if ((e as Error).name === "AbortError" || /abort/i.test((e as Error).message)) throw new Error("下载安装包超时");
    throw e;
  } finally { clearTimeout(timer); }
  const dir = await mkdtemp(join(tmpdir(), "umbrastudio-pkg-"));
  const file = join(dir, "package.umbraplugin");
  await writeFile(file, buf);
  return file;
}

/** 从 URL 装：下载 → `installFromFile` → 删临时文件（**不管成败都删**）。 */
export async function installFromUrl(url: string, fetchFn: PackageFetch, opts: { maxBytes?: number; timeoutMs?: number } = {}): Promise<InstallResult> {
  const file = await downloadPackage(url, fetchFn, opts);
  try {
    return await installFromFile(file);
  } finally {
    await rm(join(file, ".."), { recursive: true, force: true });
  }
}
