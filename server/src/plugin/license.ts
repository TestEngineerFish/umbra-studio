import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createPublicKey, verify as edVerify } from "node:crypto";
import { join } from "node:path";
import { STATE_ROOT, TOOL_ROOT } from "../project.js";

/** 授权：**装了 ≠ 能用**（M11-12 · 需求 `doc/20` §四）。
 *
 *  M11-6 的验签管的是「**装的时候**这个包是不是我们签的」；
 *  这一层管的是「**用的时候**这个插件还有效吗」。⚠️ 这两件事以前只有前一半 ——
 *  而「过期」是个会真实出现的态：**限时免费到期那天，所有试用用户同时看到它**。
 *
 *  ### 为什么是本地验签而不是问服务器
 *  用户明确要求**离线可用**。所以服务端用 Ed25519 私钥签一份许可证，
 *  主程序内置公钥、本地验，全程不联网。
 *
 *  ### 「买断」和「限时」是同一个机制的两种取值
 *  `until: null` = 永久（买断，含后续所有版本 —— `doc/20` §4.3 用户已定，
 *  所以许可证里**不留 `majorVersion` 槽位**，留着会让人以为将来要收版本费）；
 *  `until: <日期>` = 限时免费 / 赠送时长。**不需要两套机制。**
 *
 *  ### 这道防线的上限，写在这里免得下一个人误解
 *  **离线授权一定可破解** —— 这是「离线可用」这个需求自带的代价，不是实现没做好。
 *  单调高水位挡的是「顺手把系统时间调回去」，挡不住会改文件的人。
 *  真正的防线是三条：① 正版够便宜够方便 ② 更新要联网 ③ 账号绑定（共享许可证 = 共享账号）。
 */

/** 一条授权。`until` 为 `null` = 永久。 */
export interface Grant {
  plugin: string;
  from: string;
  until: string | null;
  src?: "purchase" | "promo" | "gift" | string;
}
export interface License {
  sub: string;
  grants: Grant[];
  device?: string;
  iat?: string;
}

/** 许可证放在**可写**的 `STATE_ROOT`（它随账号变），公钥放在**只读**的 `TOOL_ROOT`（它随程序发）。
 *  ⚠️ 两个 root 混了在开发模式下测不出来（`00` §63.1 栽过）。 */
const LICENSE_FILE = join(STATE_ROOT, ".umbrastudio", "license.json");
const WATERMARK_FILE = join(STATE_ROOT, ".umbrastudio", "clock.json");
const PUBKEY = join(TOOL_ROOT, "keys", "publisher.pub");

/** 许可证的验签结果。`license` 只在 `ok` 时有值 —— **验不过的许可证一个字都不要用**。 */
export interface LicenseCheck { ok: boolean; why?: string; license?: License }

/** 验一份许可证文本（`{ payload, signature }`，payload 是 JSON 字符串）。
 *
 *  ⚠️ **签的是 payload 那个字符串本身，不是它解析出来的对象** ——
 *  对象重新序列化出来的字节和原文未必一样（键序、空格、数字格式），
 *  那样签名永远验不过，而症状是「明明是我们签的却说验不过」。 */
export function verifyLicenseText(raw: string): LicenseCheck {
  if (!existsSync(PUBKEY)) return { ok: false, why: "本机没有发布方公钥，验不了许可证" };
  let wrap: { payload?: unknown; signature?: unknown };
  try { wrap = JSON.parse(raw) as typeof wrap; }
  catch { return { ok: false, why: "许可证不是合法 JSON" }; }
  if (typeof wrap.payload !== "string" || typeof wrap.signature !== "string") {
    return { ok: false, why: "许可证缺 payload 或 signature" };
  }
  try {
    const key = createPublicKey(readFileSync(PUBKEY));
    /* Ed25519 用 `verify(null, …)` —— 不走摘要那一套，传 "sha256" 会直接抛（同 pack.ts） */
    const ok = edVerify(null, Buffer.from(wrap.payload, "utf8"), key, Buffer.from(wrap.signature, "base64"));
    if (!ok) return { ok: false, why: "许可证签名验不过 —— 被改过，或者不是我们签的" };
  } catch (e) { return { ok: false, why: `验许可证出错：${(e as Error).message}` }; }
  try {
    const lic = JSON.parse(wrap.payload) as License;
    if (!Array.isArray(lic.grants)) return { ok: false, why: "许可证里没有 grants" };
    return { ok: true, license: lic };
  } catch { return { ok: false, why: "许可证的 payload 不是合法 JSON" }; }
}

/** 读本机的许可证。没有就是 `null`（**没有许可证不是错误** —— 只装内置插件的用户就没有）。 */
export async function loadLicense(): Promise<LicenseCheck | null> {
  if (!existsSync(LICENSE_FILE)) return null;
  try { return verifyLicenseText(await readFile(LICENSE_FILE, "utf8")); }
  catch (e) { return { ok: false, why: `读不了许可证：${(e as Error).message}` }; }
}

/* ══════════ 单调高水位：挡时钟回拨（`doc/20` §4.2）══════════ */

/** 「现在」是几点。**取系统时间和见过的最晚时间里更晚的那个。**
 *
 *  有时效就有这个问题：用户把系统时间调回去，过期的又能用了。
 *  所以本地记下「见过的最晚时间」，只许前进不许后退。
 *
 *  ⚠️ 落盘用**先写临时文件再改名**的原子写。直接写的话断电 / 被杀会留下半个文件，
 *  而半个文件解析出来是「时间零」—— **这道检查就静悄悄失效了**，
 *  而且失效的方向正好是放行（`Math.max(now, 0) === now`）。
 *  「坏掉的安全检查看起来和通过一模一样」这条在 §100.2 记过，这里是同一族。
 */
export async function nowMonotonic(): Promise<{ now: Date; rolledBack: boolean }> {
  const sys = Date.now();
  let seen = 0;
  try {
    const j = JSON.parse(await readFile(WATERMARK_FILE, "utf8")) as { seen?: unknown };
    if (typeof j.seen === "number" && Number.isFinite(j.seen) && j.seen > 0) seen = j.seen;
  } catch { /* 没有、或坏了 —— 当成没见过（下面会写一份新的） */ }
  const rolledBack = seen > sys;
  const now = Math.max(sys, seen);
  if (now > seen) await writeWatermark(now);
  return { now: new Date(now), rolledBack };
}

async function writeWatermark(ms: number): Promise<void> {
  try {
    await mkdir(join(STATE_ROOT, ".umbrastudio"), { recursive: true });
    const tmp = `${WATERMARK_FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ seen: ms, at: new Date(ms).toISOString() }), "utf8");
    await rename(tmp, WATERMARK_FILE);          // 原子替换：要么旧的完整，要么新的完整
  } catch { /* 写不下也不该挡住用户用插件 —— 下一次再试 */ }
}

/* ══════════ 对外那一件事：这个插件现在能不能用 ══════════ */

/** 一个插件当前的授权状态。
 *
 *  `builtin` 和 `unlicensed` 的区别要说清：前者是**免费且卸不掉**的内置插件（永远能用），
 *  后者是「装着但从来没有过授权」—— 界面上给的出路不一样。 */
export type EntitlementState = "builtin" | "active" | "expired" | "not-yet" | "unlicensed" | "bad-license";
export interface Entitlement {
  plugin: string;
  state: EntitlementState;
  /** 到期日（`active` 且有时效时才有）。`null` = 永久 */
  until: string | null;
  /** 给界面直接用的一句话 —— **每一种态都要有出路**，不能只说「不可用」 */
  note: string;
  /** 系统时间被调回去过 */
  rolledBack?: boolean;
}

export async function entitlementOf(plugin: string, opts?: { bundled?: boolean }): Promise<Entitlement> {
  if (opts?.bundled) {
    return { plugin, state: "builtin", until: null, note: "内置插件，免费且一直可用" };
  }
  const { now, rolledBack } = await nowMonotonic();
  const lic = await loadLicense();
  if (!lic) return { plugin, state: "unlicensed", until: null, note: "这个插件还没有授权 —— 在插件市场里购买后即可使用", rolledBack };
  if (!lic.ok) return { plugin, state: "bad-license", until: null, note: `许可证有问题：${lic.why ?? "验不过"} —— 重新登录账号可以取回授权`, rolledBack };

  /* 同一个插件可能有好几条 grant（先领了限时免费、后来又买断）。
     **取最宽松的那一条** —— 买断的 `until: null` 应该盖过已经过期的试用。
     反过来写（取第一条 / 取最早的）会让「买过的人因为试用过期而用不了」，那是最糟的一种错。 */
  const mine = lic.license!.grants.filter((g) => g.plugin === plugin);
  if (!mine.length) return { plugin, state: "unlicensed", until: null, note: "这个插件还没有授权 —— 在插件市场里购买后即可使用", rolledBack };

  const notYet = mine.filter((g) => g.from && new Date(g.from).getTime() > now.getTime());
  const usable = mine.filter((g) => {
    if (g.from && new Date(g.from).getTime() > now.getTime()) return false;
    return g.until === null || new Date(g.until).getTime() >= now.getTime();
  });
  if (usable.length) {
    const forever = usable.find((g) => g.until === null);
    const latest = forever ?? usable.slice().sort((a, b) => new Date(b.until!).getTime() - new Date(a.until!).getTime())[0]!;
    return {
      plugin, state: "active", until: latest.until,
      note: latest.until === null ? "已购买，永久可用（含后续所有版本更新）" : `可用至 ${latest.until.slice(0, 10)}`,
      rolledBack,
    };
  }
  if (notYet.length === mine.length) {
    return { plugin, state: "not-yet", until: null, note: `这份授权从 ${notYet[0]!.from.slice(0, 10)} 起生效`, rolledBack };
  }
  /* 全都过期了。`until` 报最晚的那一条，界面上「到期于 X」比「已过期」有用。 */
  const last = mine.filter((g) => g.until).sort((a, b) => new Date(b.until!).getTime() - new Date(a.until!).getTime())[0]!;
  return {
    plugin, state: "expired", until: last.until,
    note: `试用已于 ${last.until!.slice(0, 10)} 结束 —— 在插件市场里购买可继续使用`,
    rolledBack,
  };
}
