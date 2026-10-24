/** 账号（Umbra 账号，云端身份）：登没登、是谁、令牌放哪。
 *
 *  **和本地 API 令牌（`api.ts` 的 `newToken`）是两层，绝不合并、绝不走 `/__app/` 注入**（CLAUDE.md §4 / Q42）：
 *  本地令牌是进程间凭据、离线也要有；这一把是云端身份，管市场 / 购买 / 许可证 —— 合并会把泄露后果
 *  从「文件」升级成「钱」。它只住在核心进程的 `STATE_ROOT/.umbrastudio/account.json`，前端经 `account` 那几件
 *  能力问**结果**（谁、登没登），**令牌本身不回给前端**、不进日志、不进 changelog（同 `ai_config.ts` 的纪律）。
 *
 *  登录走 Umbra 服务端说的方式（`GET /auth/config`）：`oidc` → 授权码 + PKCE（`oidc.ts`），拿到的访问令牌
 *  对 Umbra 服务端照旧放 `Authorization: Bearer`。`local`（老服务端 / 还没切）→ 这里不做邮箱密码登录，
 *  照实回「这台服务器还没开 OIDC 登录」。
 */

import { platformName } from "./shared/brand.js";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { STATE_ROOT } from "./project.js";
import { writeAtomic } from "./normalize.js";
import { OidcFail, OidcLogin, type FetchLike, type OidcClientConfig, type OidcTokens } from "./oidc.js";
import { licenseIsFor, licenseTextOf, discountPctOf } from "./plugin/acquire.js";
import { loadLicense, saveLicenseText, type Grant, type LicenseCheck } from "./plugin/license.js";

/** Umbra 服务端的缺省地址（与 UmbraPC `config.ts` 同一个缺省）。 */
export const DEFAULT_UMBRA_URL = "https://umbra.tingyusha.xyz";

const ACCOUNT_FILE = join(STATE_ROOT, ".umbrastudio", "account.json");

/** 服务端 `/auth/me` 回的用户（字段名照服务端，不改名）。 */
export interface AccountUser {
  id: number;
  email?: string;
  display_name?: string;
  name?: string;
  is_owner?: boolean;
}

/** 落盘的形状。令牌只在这里。 */
export interface AccountFile {
  serverUrl: string;
  accessToken: string;
  refreshToken: string;
  user: AccountUser | null;
  signedInAt: string;
}

const EMPTY: AccountFile = { serverUrl: DEFAULT_UMBRA_URL, accessToken: "", refreshToken: "", user: null, signedInAt: "" };

export async function getAccount(): Promise<AccountFile> {
  if (!existsSync(ACCOUNT_FILE)) return { ...EMPTY };
  try {
    const raw = JSON.parse(await readFile(ACCOUNT_FILE, "utf8")) as Partial<AccountFile>;
    return { ...EMPTY, ...raw, serverUrl: (raw.serverUrl || DEFAULT_UMBRA_URL).replace(/\/+$/, "") };
  } catch {
    return { ...EMPTY };
  }
}

export async function setAccount(patch: Partial<AccountFile>): Promise<AccountFile> {
  const next = { ...(await getAccount()), ...patch };
  await mkdir(join(STATE_ROOT, ".umbrastudio"), { recursive: true });
  await writeAtomic(ACCOUNT_FILE, JSON.stringify(next, null, 2) + "\n");
  return next;
}

/** 前端看到的状态。**没有令牌。** */
export interface AccountStatus {
  serverUrl: string;
  signedIn: boolean;
  user: AccountUser | null;
  signedInAt: string;
  /** 有一场登录正在等浏览器。 */
  pending: boolean;
  /** 最近一次登录 / 核对失败的原因（给人看的一句）；成功后清空。 */
  lastError: string;
  /** 服务端说它怎么登录（问到过才有）。 */
  provider: "oidc" | "local" | "unknown";
  /** 通道 A 是不是走 Umbra 服务端 AI（`ai_config.channelA.useAccount`）。 */
  serverAi: boolean;
}

interface AuthConfigDTO extends Partial<OidcClientConfig> { provider: string }

/** `/auth/config` 回的形状 → 能不能走 oidc。缺字段按 local，不猜。 */
/** `GET /membership` 回包 → 赠送插件 id 列表（纯判据）。只认字符串、去空、去重；不是数组就是 `[]`。 */
export function giftPluginIdsOf(body: unknown): string[] {
  const raw = (body as { gift_plugins?: unknown } | null)?.gift_plugins;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))];
}

/** 存储容量（Umbra 草案 §十一）：`GET /membership` 回包里的 `storage` → 账号块那一行要的几个数（纯判据）。
 *  Studio 自己不往服务端传任何东西，所以只**看**：用量、上限、百分比、档位；管理页在 PC / iOS 的账号页。
 *  缺、不是对象、数不是有限非负数 → null（老服务端没这一段，账号块不画这一行）。 */
export interface StorageBrief { used: number; limit: number; pct: number; warn: "ok" | "warn" | "critical" | "full"; tier: string | null }
export function storageOf(body: unknown): StorageBrief | null {
  const s = (body as { storage?: unknown } | null)?.storage as Record<string, unknown> | null | undefined;
  if (!s || typeof s !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const used = n(s.used), limit = n(s.limit), pct = n(s.pct);
  if (used === null || limit === null || pct === null) return null;
  const warn = s.warn === "warn" || s.warn === "critical" || s.warn === "full" ? s.warn : "ok";
  /* ⚠️ 档位取回包**顶层的 `member.tier`**（issue #149）。服务端 `/membership` 顺带的 `storage` 子对象
     只有 used / limit / pct / warn 四个键（`tier` 只在完整的 `GET /storage` 里有），
     原来只看 `storage.tier` → 永远 null → 付费会员也显示「免费档」。
     `member` 没会员时是 null；`storage.tier` 留作兜底（将来服务端补上这个键也照样认）。 */
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const member = (body as { member?: unknown } | null)?.member as { tier?: unknown } | null | undefined;
  const tier = (member && typeof member === "object" ? str(member.tier) : null) ?? str(s.tier);
  return { used, limit, pct: Math.min(100, Math.round(pct)), warn, tier };
}

/** 字节 → 给人看：<1 MB 写 KB，≥1 GB 写 GB（两位小数去尾零），<100 MB 留一位小数。与 PC / iOS 同一条规矩（设计侧 234 §四）。
 *  ⚠️ **为判据开的接缝** —— 生产侧零调用，只有回归在用（2026-10-24 量过）。
 */
export function fmtBytes(b: number): string {
  if (!(b > 0)) return "0";
  const mb = b / 1048576;
  if (mb < 1) return `${Math.round(b / 1024)} KB`;
  if (mb >= 1024) return `${String(Math.round(mb / 1024 * 100) / 100)} GB`;
  return `${mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

export function oidcConfigOf(d: AuthConfigDTO | null): OidcClientConfig | null {
  if (!d || d.provider !== "oidc" || !d.client_id || !d.authorization_endpoint || !d.token_endpoint || !d.issuer) return null;
  return { issuer: d.issuer, client_id: d.client_id, authorization_endpoint: d.authorization_endpoint,
    token_endpoint: d.token_endpoint, end_session_endpoint: d.end_session_endpoint, scope: d.scope };
}

/** 访问令牌（Casdoor 签的 JWT）的过期时刻，毫秒；不是 JWT / 没有 `exp` → null（那就不预判，只靠 401 兜底）。**纯函数**。 */
export function tokenExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: unknown };
    return typeof p.exp === "number" && Number.isFinite(p.exp) ? p.exp * 1000 : null;
  } catch { return null; }
}

/** 提前多久就当它快过期、先刷新（毫秒）。请求在路上也要时间，卡着点用会在服务端那头刚好过期。 */
export const TOKEN_RENEW_SKEW_MS = 60_000;

/** Umbra 服务端的**通用错误码头**。
 *
 *  ⚠️ **它不只用于会话失效** —— 2026-10-21 从实现侧确认：当前密码填错时回的是
 *  `400` + `X-Umbra-Error: invalid_field`。所以**光看这个头有没有值是不够的**，
 *  必须连状态码和具体的值一起判（见 `isSessionInvalid`）。
 *  已知的值：`session_invalid` · `invalid_field` · `bad_credentials` · `too_many_attempts`。 */
export const UMBRA_ERROR_HEADER = "x-umbra-error";

/** 会话失效**专用**的那个头（三端契约 `contract-session-revoked`，2026-09-28 定）。
 *  和上面那个不同：它只有一种含义，所以**可以跟着任何状态码走，包括 200**。 */
export const SESSION_HEADER = "x-umbra-session";

/** `x-umbra-session` 的值是不是 `invalid`。**大小写与空白宽容** —— 反代可能会动它（PC `server.ts` 同一句）。 */
export function isSessionInvalidHeader(v: string | null | undefined): boolean {
  return String(v || "").trim().toLowerCase() === "invalid";
}

/** 这个 401 是不是「会话真的失效了」。**纯函数**，判据直接钉它。
 *
 *  ⚠️ **默认方向是「不是」** —— 读不到那个头（老服务端、网关挡在前面、代理自己回的 401）
 *  一律**不算**失效。两个方向的代价不对称：
 *  - 读不到就清 → 一个网关的 401 把用户的登录清掉，而他什么都没做错；
 *  - 读不到就不清 → 真失效时界面会多说一会儿「已登录」。
 *
 *  账号中心承诺「失效时**任何接口都回 401 并带这个头**」，所以第二种的窗口是服务端兜住的；
 *  而第一种没有任何东西兜。**选了不清，就必须把「为什么没清」写进 `lastError`** ——
 *  不然这个选择会变成一个查不出来的沉默（`CLAUDE.md` 纪律③ 同族）。 */
export function isSessionInvalid(r: { status: number; headers?: { get(name: string): string | null } }): boolean {
  /* ② **任意状态码**（包括 200）带 `x-umbra-session: invalid`。
     ⚠️ 2026-10-21 从 Umbra 主会话问到的，我原来漏了这一个：Bearer 已经作废、
     而别的凭据放行时，服务端回的是 **200** 并带这个头 —— 只看 401 的话**永远不知道会话已经没了**。 */
  if (isSessionInvalidHeader(r.headers?.get(SESSION_HEADER))) return true;
  /* ① 401 + `x-umbra-error: session_invalid`（跟着 401 走的那条）。 */
  return r.status === 401 && (r.headers?.get(UMBRA_ERROR_HEADER) ?? "").trim() === "session_invalid";
}

/** 服务端回的那句**给人看的话**。⚠️ **只认字符串**。
 *
 *  FastAPI 在请求体不合法时回 **422**，而它的 `detail` 是一个**数组**
 *  （`[{loc, msg, type}]`）—— `String()` 它会得到 **`"[object Object]"`**，
 *  然后原样画到界面上。2026-10-21 实现侧说「422 落到 other 那一档就行」时才想到去查，
 *  当时**四处都这么写着**（登录 / 忘了密码 / 改密码 / 改显示名），前两处今天就够得到。
 *  不是字符串就回空串，让调用方用自己那句兜底文案。 */
function detailOf(d: unknown): string {
  const v = (d as { detail?: unknown } | null | undefined)?.detail;
  return typeof v === "string" ? v : "";
}

/** `/auth/me` 失败。`message === "401"` 这个约定别处在用，所以标记另挂一个字段。 */
class MeFail extends Error {
  constructor(message: string, readonly sessionInvalid = false) { super(message); }
}

/** 密码登录 / 找回失败的分档（设置页按 kind 画错误条）。
 *  kind：bad 邮箱或密码不对 · locked 试太多（`wait` 秒后再试，0 = 服务端没说）· offline 连不上 · other 其余（message 用服务端原话）。
 *  `cause` 是给日志看的底层原因，不上界面。 */
export class LoginFail extends Error {
  constructor(readonly kind: "bad" | "locked" | "offline" | "other", message: string, readonly wait = 0, readonly cause_ = "",
              /** 哪一格不对（服务端 400 `invalid_field` 带的 `field`，例如 `"current"`）。空串 = 不是某一格的事。
               *  界面把话画在那一格底下 —— 画在表单顶上的话，用户得自己猜是哪一栏（PC `auth.ts` 的 `AuthFail.field` 同位）。 */
              readonly field = "") {
    super(message);
  }
}

export class AccountService {
  private lastError = "";
  /** 正在进行的那一次刷新（合并并发）：市场一打开 `perks` 和 `fetchLicense` 是同时发的，
   *  各刷各的话，刷新令牌一次一换的 IdP 会让后到的那一次拿着已作废的刷新令牌失败、把登录清掉。 */
  private renewing: Promise<boolean> | null = null;
  private provider: AccountStatus["provider"] = "unknown";
  /** 正在进行的那一场登录的代号（0 = 没有）。⚠️ 「这场登录做完没」是这里自己的状态，不借 `oidc.pending`（issue #137）：
   *  回调一到 `oidc.pending` 就是 false，而换令牌、核 `/auth/me`、落盘还没做 —— 前端轮询落在这段窗口里
   *  会看到 `pending:false, signedIn:false, lastError:""`，当成「没登上」停下来，之后写的失败原因也被吞。
   *  用代号不用布尔：再开一场会作废上一场，上一场的收尾不该把新一场的标记放下。 */
  private inFlight = 0;
  private loginGen = 0;

  /** 打 Umbra 的那个 fetch，**已经包过一层「回来先报一次信」**（见构造函数）。 */
  private fetchFn: FetchLike;

  constructor(private oidc = new OidcLogin(), rawFetch: FetchLike = (u, i) => fetch(u, i) as unknown as ReturnType<FetchLike>,
              private log: (line: string) => void = () => {}) {
    /* ⚠️ **把报信装在 fetch 本身上，不是在六个调用点各加一行。**
       `this.fetchFn(` 现在有六处（`/auth/config` · `/auth/login` · `/auth/forgot` ·
       `/auth/me` · `/auth/logout` · `authedFetch` 那个 `go`），而 `perks` /
       `fetchLicense` / `buyPlugin` 都走 `authedFetch`。
       逐个加的话**漏一个就静默复发，而症状和没修一模一样** ——
       `00` §162（issue #117/#118 的 `setSessionId` 六个调用点）记的就是这一条。
       包在这里，以后新加的出口也自动覆盖。 */
    this.fetchFn = async (u, i) => {
      const r = await rawFetch(u, i);
      if (isSessionInvalid(r)) await this.noteSessionInvalid(u);
      return r;
    };
  }

  /** 会话失效的**唯一处置点**（PC `auth.ts` 的 `sessionRevoked` 同位）。
   *
   *  这一层只做一件事：清本机登录、写 `lastError`、记一行日志。
   *  **去重靠状态本身而不是一个布尔标志** —— 本机已经没有令牌了就什么都不做。
   *  （标志会和真实状态分叉：令牌换了而标志没重置，下一次真失效就被它吃掉。）
   *
   *  ⚠️ **有刷新令牌时不在这里清**：那是 OIDC 回退路，它有自己的「先用刷新令牌续一次、
   *  换不到才清」（`renew()`）。在这里抢着清会把那条路的静默续期废掉。
   *  这个分支随 OIDC 在 Casdoor 下线后一起删。 */
  private async noteSessionInvalid(where: string): Promise<void> {
    const a = await getAccount();
    if (!a.accessToken) return;                     // 已经清过了 —— 天然去重
    if (a.refreshToken) return;                     // OIDC 回退路：交给 renew()
    await setAccount({ accessToken: "", refreshToken: "", user: null, signedInAt: "" });
    this.lastError = "登录已经失效（服务端说这条会话不作数了），重新登录一次";
    this.log(`[account] 会话失效 → 已清本机登录（信号来自 ${where.replace(/\?.*$/, "")}）`);
  }

  async status(): Promise<AccountStatus> {
    const a = await getAccount();
    const { getAiConfig } = await import("./ai_config.js");
    const serverAi = !!(await getAiConfig()).channelA?.useAccount;
    return { serverUrl: a.serverUrl, signedIn: !!a.accessToken && !!a.user, user: a.user, signedInAt: a.signedInAt,
      pending: this.oidc.pending || this.inFlight !== 0, lastError: this.lastError, provider: this.provider, serverAi };
  }

  /** 通道 A 切到 / 切回 Umbra 服务端 AI。开：`useAccount: true`（端点 / 密钥取配置那一刻现算，文件里不存令牌）；
   *  关：只把标记放下，原来自填的端点 / 密钥还在（没覆盖过）。
   *  ⚠️ **不碰 `defaultChannel`**（issue #141）：原来开的时候顺手把缺省通道设成 A、关掉也不还原 ——
   *  缺省走通道 B（本机 CLI 订阅）/ C 的人点一下，没手动选过通道的对话和 MCP 调用就悄悄改走扣积分，
   *  和界面那句「本地 CLI（通道 B）不受影响」正好相反；关掉后缺省通道还可能指向一条空端点。
   *  要用服务端 AI，在引擎选择器里选通道 A。 */
  async setServerAi(on: boolean): Promise<AccountStatus> {
    const { getAiConfig, mergeChannel, setAiConfig } = await import("./ai_config.js");
    const cur = await getAiConfig();
    if (on) {
      const st = await this.status();
      if (!st.signedIn) throw new Error(`先登录${platformName}账号，再开服务端 AI`);
      const next = mergeChannel(cur, "a", { useAccount: true, model: cur.channelA?.model || "umbra" } as never);
      await setAiConfig(next);
    } else {
      await setAiConfig(mergeChannel(cur, "a", { useAccount: false } as never));
    }
    return this.status();
  }

  /** 用刷新令牌换一枚新的访问令牌（2026-10-17：令牌 7 天整点过期，原来只有 `check()` 会刷新，
   *  取许可证 / 查会员 / 购买 / 服务端 AI 都拿着过期令牌直接 401，界面却还显示「已登录」）。
   *  - 并发合并成一次（`renewing`）；
   *  - 服务端 `/auth/config` 都问不到（断网）→ 回 false，**不清登录**（网好了还能刷）；
   *  - IdP 拒了刷新令牌（过期 / 吊销）或新令牌服务端不认 → 清掉本机登录、写 `lastError`，回 false —— 界面这时才如实显示「没登录」。 */
  async renew(): Promise<boolean> {
    if (this.renewing) return this.renewing;
    this.renewing = (async () => {
      const a = await getAccount();
      if (!a.refreshToken) return false;
      let cfg: OidcClientConfig | null;
      try { cfg = oidcConfigOf(await this.authConfig(a.serverUrl)); } catch { return false; }
      if (!cfg) return false;
      try {
        const t = await this.oidc.refresh(cfg, a.refreshToken);
        const user = await this.me(a.serverUrl, t.accessToken);
        /* ⚠️⚠️ **写回之前核一次「世界还是不是我出发时那个世界」**（issue #171）。
           这中间有**三次网络往返**（`/auth/config` → IdP token → `/auth/me`），
           而 `setAccount` 是 `{...当前文件, ...patch}` 合并 —— patch 里带着
           `accessToken` 和 `user`，于是：
           · 用户在刷新途中点「退出登录」→ 界面先显示未登录，**一两秒后又变回已登录**
             （而 `signedInAt` 是空的，且 `logout` 吊销的是**旧**那枚令牌，
             新换的那枚和新刷新令牌**没被吊销**）；
           · 刷新途中完成了一场**新登录** → 旧的刷新结果把新令牌盖掉。
           > **一个跨了三次 await 的写回，必须问一句「我读到的那一版还在吗」** ——
           > 这和写文件的 sha256 写前校验是同一件事，只是这里的「文件」是登录状态。 */
        const now = await getAccount();
        if (now.accessToken !== a.accessToken) {
          this.log("[account] 刷新完成时登录状态已经变了（退出登录 / 新登录），这次不写回");
          return !!now.accessToken && !!now.user;
        }
        await setAccount({ accessToken: t.accessToken, refreshToken: t.refreshToken || a.refreshToken, user });
        this.lastError = "";
        this.log("[account] 访问令牌已刷新");
        return true;
      } catch (e) {
        const f = e as OidcFail & { status?: number };
        if (f?.reason === "network" || /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test((e as Error).message)) return false;
        /* ⚠️⚠️ **对面「此刻不舒服」不等于「这个令牌废了」**（issue #170）。
           原来除了 network 一律清登录，于是服务端或 IdP 短暂 **5xx**、
           或者刷新超时，**本机登录就被清掉了** —— 而用户什么都没做错，
           手上那枚刷新令牌也还好着。
           > 两个方向的代价不对称：**误清 = 用户被踢出去重新登录**（没有东西兜）；
           > **误留 = 界面多说一会儿「已登录」，下一次请求照样会发现失效**
           > （那一头有 `x-umbra-session` 兜着，Q69/§162 装的那层报信）。
           > **所以只在 IdP 明确拒了这枚令牌时才清。** */
        const transient = f?.reason === "timeout"
          || (typeof f?.status === "number" && f.status >= 500)
          || (typeof f?.status === "number" && f.status === 429);
        if (transient) {
          this.lastError = `暂时刷新不了（${f.status ?? f.reason}），稍后再试`;
          this.log(`[account] 刷新失败但不清登录：${f.status ?? f.reason}`);
          return false;
        }
        /* 清之前也要核一次 —— 刷新途中完成的新登录不该被这一条清掉（#171 的另一半） */
        const now2 = await getAccount();
        if (now2.accessToken !== a.accessToken) {
          this.log("[account] 刷新失败，但登录状态已经换了一版，不动它");
          return !!now2.accessToken && !!now2.user;
        }
        await setAccount({ accessToken: "", refreshToken: "", user: null, signedInAt: "" });
        this.lastError = "登录已经失效，重新登录一次";
        return false;
      }
    })();
    try { return await this.renewing; } finally { this.renewing = null; }
  }

  /** 一枚现在能用的访问令牌：快过期（`exp` 前 `TOKEN_RENEW_SKEW_MS`）就先刷新。没登录回 null。
   *  刷新失败但旧令牌还没真过期 → 照用旧的（让服务端说了算）。 */
  async usableToken(now = Date.now()): Promise<{ serverUrl: string; token: string } | null> {
    let a = await getAccount();
    if (!a.accessToken) return null;
    const exp = tokenExpMs(a.accessToken);
    if (exp !== null && exp - now < TOKEN_RENEW_SKEW_MS && a.refreshToken) {
      if (await this.renew()) a = await getAccount();
      else if (exp <= now) { a = await getAccount(); if (!a.accessToken) return null; }
    }
    return { serverUrl: a.serverUrl, token: a.accessToken };
  }

  /** 带登录令牌请求服务端：先拿可用令牌，**回 401 就刷新一次再试**（令牌在路上过期 / 服务端提前吊销）。
   *  没登录回 null（调用方按「没登录」说）。 */
  private async authedFetch(path: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<Awaited<ReturnType<FetchLike>> | null> {
    const tk = await this.usableToken();
    if (!tk) return null;
    const go = (token: string) => this.fetchFn(`${tk.serverUrl}${path}`, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` } } as never);
    const r = await go(tk.token);
    if (r.status !== 401) return r;
    if (!(await this.renew())) return r;
    const again = await getAccount();
    return again.accessToken ? go(again.accessToken) : r;
  }

  /** 当前会员带来的两样（服务端 `GET /membership`，一次请求）：随会员赠送的插件 id（后台「赠送插件」页配的）
   *  与买积分计价东西的折扣百分比（`discount_pct`，100 = 不打折）。
   *  没登录 / 没会员 / 连不上 / 老服务端一律回「没有赠送、不打折」—— 市场页标不标，不该让市场打不开。
   *  ⚠️ 但 `ok` 要分清「问到了、确实没送」和「这次没问到」（issue #145）：`acquire_plugin` 原来把后者
   *  当成「不是赠送」去按价买，会员的积分会被误扣。市场页只看 gift，照旧。 */
  async perks(): Promise<{ ok: boolean; gift: string[]; discountPct: number }> {
    const none = { ok: false, gift: [], discountPct: 100 };
    try {
      const r = await this.authedFetch("/membership", { method: "GET" });
      if (!r || !r.ok) return none;
      const body = await r.json();
      return { ok: true, gift: giftPluginIdsOf(body), discountPct: discountPctOf(body) };
    } catch { return none; }
  }

  /** 账号块那一行「存储」：没登录 / 连不上 / 老服务端 → null，那一行就不画。 */
  async storage(): Promise<StorageBrief | null> {
    try {
      const r = await this.authedFetch("/membership", { method: "GET" });
      if (!r || !r.ok) return null;
      return storageOf(await r.json());
    } catch { return null; }
  }

  /** 只要赠送清单的调用方用这个。 */
  async giftPlugins(): Promise<string[]> {
    return (await this.perks()).gift;
  }

  /** 问 Umbra 服务端怎么登录。连不上 / 老服务端（404）抛，由调用方翻成人话。 */
  async authConfig(serverUrl: string): Promise<AuthConfigDTO> {
    const r = await this.fetchFn(`${serverUrl}/auth/config`, { method: "GET", headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`这台服务器没有 /auth/config（${r.status}），多半是老版本`);
    const d = (await r.json()) as AuthConfigDTO;
    this.provider = d.provider === "oidc" ? "oidc" : "local";
    return d;
  }

  /** 开一场登录：回授权地址，调用方去开浏览器；换到令牌后自己核 `/auth/me` 并落盘。
   *  `serverUrl` 给了就用它（并在登录成功后记住），没给用存着的。 */
  async loginStart(serverUrl?: string): Promise<{ url: string }> {
    const base = (serverUrl || (await getAccount()).serverUrl).replace(/\/+$/, "");
    this.lastError = "";
    let cfg: OidcClientConfig | null;
    try {
      cfg = oidcConfigOf(await this.authConfig(base));
    } catch (e) {
      throw new Error(`连不上 ${base}：${(e as Error).message}`);
    }
    /* ⚠️ 2026-10-21 改掉了这句的后半 —— 原文写「要等服务端切到 Casdoor 之后」，
       而那个未来**不会来了**：账号中心对接说明定了 Casdoor 不用，线上 10-19 起
       `/auth/config` 永远回 `local`。这条路留着只是为了 10-26 前的回退开关。 */
    if (!cfg) throw new Error("这台服务器用的是邮箱 + 密码登录（/auth/config 说是 local）—— 用上面那个表单登，不走浏览器这条路。");
    const { url, done } = await this.oidc.start(cfg);
    const gen = ++this.loginGen;
    this.inFlight = gen;
    void done.then(
      async (t) => { await this.finish(base, cfg!, t); },
      (e) => {
        const reason = (e as OidcFail)?.reason || "network";
        if (reason !== "cancelled") this.lastError = reason === "timeout" ? "等了 5 分钟浏览器没回来，再按一次重新开始"
          : reason === "state" ? "回来的不是这一次登录的回调，已经丢掉；再按一次重新开始" : `IdP 没有通过：${(e as Error).message}`;
        this.log(`[account] 登录没完成：${reason}`);
      },
    ).finally(() => { if (this.inFlight === gen) this.inFlight = 0; });   // 落盘 / 写完 lastError 之后才放下
    return { url };
  }

  /** 服务端是 local（2026-10-19 起 Umbra 接账号中心后就是这一种，对端上仍叫 local）：邮箱 + 密码登录。
   *  `POST /auth/login` 回一张长效不透明令牌（没有刷新令牌；`tokenExpMs` 认不出 exp → 不会去刷新，失效时服务端 401、界面照实显示没登录）。
   *  失败抛 `LoginFail`，按服务端的分档带上 kind：bad（密码不对）/ locked（试太多，带 wait 秒）/ offline（连不上）/ other。
   *  设置页按 kind 画三段式错误条（Claude Design 批次 270 §一）。密码只在这一次请求里用，不落盘。 */
  async loginPassword(email: string, password: string, serverUrl?: string): Promise<AccountStatus> {
    const base = (serverUrl || (await getAccount()).serverUrl).replace(/\/+$/, "");
    this.lastError = "";
    let r: Awaited<ReturnType<FetchLike>>;
    try {
      r = await this.fetchFn(`${base}/auth/login`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, device: "umbra-studio" }) } as never);
    } catch (e) {
      throw new LoginFail("offline", `连不上 ${base}`, 0, (e as Error).message);
    }
    if (!r.ok) {
      const code = r.headers?.get?.("x-umbra-error") || "";
      let detail = "";
      try { detail = detailOf(await r.json()); } catch { /* 不是 JSON */ }
      if (code === "too_many_attempts") {
        const wait = Number(r.headers?.get?.("retry-after") || 0);
        throw new LoginFail("locked", wait > 0 ? `试得太多了，${wait} 秒后再试` : "试得太多了，过一会儿再试", wait > 0 ? wait : 0);
      }
      if (r.status === 401) throw new LoginFail("bad", detail || "邮箱或密码不对");
      if (r.status >= 500) throw new LoginFail("offline", `连不上 ${base}`, 0, `服务端回 ${r.status}`);
      throw new LoginFail("other", detail || `登录没成（${r.status}）`);
    }
    const d = (await r.json()) as { token?: string };
    if (!d.token) throw new LoginFail("other", "服务端没回令牌");
    const user = await this.me(base, d.token);
    await setAccount({ serverUrl: base, accessToken: d.token, refreshToken: "", user, signedInAt: new Date().toISOString() });
    this.provider = "local";
    this.log(`[account] 已用密码登录：user ${user.id}`);
    void this.syncLicense();
    return this.status();
  }

  /** 忘了密码（批次 270 §一：Studio 自己做）：`POST /auth/forgot`。服务端不管这个邮箱有没有账号都回同一句，
   *  这里也不分辨——成功只说明「请求送到了」。连不上抛 `LoginFail("offline")`，别的失败抛 other。 */
  async forgotPassword(email: string, serverUrl?: string): Promise<void> {
    const base = (serverUrl || (await getAccount()).serverUrl).replace(/\/+$/, "");
    let r: Awaited<ReturnType<FetchLike>>;
    try {
      r = await this.fetchFn(`${base}/auth/forgot`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }) } as never);
    } catch (e) {
      throw new LoginFail("offline", `连不上 ${base}`, 0, (e as Error).message);
    }
    if (r.status >= 500) throw new LoginFail("offline", `连不上 ${base}`, 0, `服务端回 ${r.status}`);
    if (!r.ok) {
      let detail = "";
      try { detail = detailOf(await r.json()); } catch { /* 不是 JSON */ }
      throw new LoginFail("other", detail || `没发出去（${r.status}）`);
    }
  }

  /** 改密码（账号中心对接说明 2026-10-21 要点 5，字面参照 PC 账号页批次 053 §二）：
   *  `POST /auth/password` `{current, password}` → `{ ok: true, logged_out: <整数> }`。
   *
   *  `logged_out` 是**这一次让其他设备下线了几台，不含这一台** —— 这一台的令牌保留
   *  （Umbra 主会话 2026-10-21 确认）。所以改完**不要**清本机登录。
   *
   *  ⚠️ 当前密码不对是 **400 `invalid_field` + `field: "current"`，不是 401** ——
   *  **它不是会话失效，一个字都不许碰登录状态**。这条写在这里是因为「改密码失败」和
   *  「登录失效」在界面上长得很像（都是「你的身份有问题」），而下一步完全不同：
   *  一个是「这一格重填」，一个是「整个重登」。 */
  async changePassword(current: string, password: string): Promise<{ loggedOut: number }> {
    let r: Awaited<ReturnType<FetchLike>> | null;
    try {
      r = await this.authedFetch("/auth/password", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, password }) });
    } catch (e) {
      throw new LoginFail("offline", "连不上服务器", 0, (e as Error).message);
    }
    if (!r) throw new LoginFail("other", "还没登录");
    if (r.status >= 500) throw new LoginFail("offline", "服务器这会儿不舒服，过一会儿再试", 0, `服务端回 ${r.status}`);
    if (!r.ok) {
      let detail = "", field = "", code = "";
      try {
        const d = (await r.json()) as { detail?: unknown; field?: unknown; code?: unknown };
        detail = detailOf(d); field = String(d.field ?? ""); code = String(d.code ?? "");
      } catch { /* 不是 JSON */ }
      if (r.status === 400 && (code === "invalid_field" || field)) {
        throw new LoginFail("bad", detail || (field === "current" ? "当前密码不对" : "这一项填得不对"), 0, code, field || "current");
      }
      if (r.status === 401) throw new LoginFail("other", "登录已经失效，重新登录一次再改");
      throw new LoginFail("other", detail || `没改成（${r.status}）`);
    }
    const d = (await r.json()) as { logged_out?: unknown };
    const loggedOut = typeof d.logged_out === "number" && Number.isFinite(d.logged_out) ? d.logged_out : 0;
    this.log(`[account] 密码已改，另有 ${loggedOut} 台被下线`);
    return { loggedOut };
  }

  /** 改显示名：`PATCH /auth/me` `{display_name}` → `{user}`。
   *  ⚠️ **空串合法** —— 意思是「不要显示名」，界面退回显示邮箱（Umbra 主会话 2026-10-21 确认）。
   *  所以这里**不许**把空串当成「没填，拒了」。 */
  async setDisplayName(name: string): Promise<AccountUser> {
    let r: Awaited<ReturnType<FetchLike>> | null;
    try {
      r = await this.authedFetch("/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name }) });
    } catch (e) {
      throw new LoginFail("offline", "连不上服务器", 0, (e as Error).message);
    }
    if (!r) throw new LoginFail("other", "还没登录");
    if (r.status >= 500) throw new LoginFail("offline", "服务器这会儿不舒服，过一会儿再试", 0, `服务端回 ${r.status}`);
    if (!r.ok) {
      let detail = "", field = "";
      try { const d = (await r.json()) as { detail?: unknown; field?: unknown }; detail = detailOf(d); field = String(d.field ?? ""); } catch { /* 不是 JSON */ }
      if (r.status === 401) throw new LoginFail("other", "登录已经失效，重新登录一次再改");
      throw new LoginFail(r.status === 400 ? "bad" : "other", detail || `没改成（${r.status}）`, 0, "", field);
    }
    const d = (await r.json()) as { user?: AccountUser };
    if (!d.user || typeof d.user.id !== "number") throw new LoginFail("other", "服务端没回 user");
    await setAccount({ user: d.user });
    return d.user;
  }

  /** 问服务端怎么登录并记下（设置页据此画「密码表单」还是「打开浏览器」）。问不到回 unknown，不抛。 */
  async probeProvider(): Promise<AccountStatus["provider"]> {
    try { await this.authConfig((await getAccount()).serverUrl); } catch { /* 断网：保持原样 */ }
    return this.provider;
  }

  /** 换到令牌之后：问服务端我是谁，成了就落盘。 */
  private async finish(serverUrl: string, _cfg: OidcClientConfig, t: OidcTokens): Promise<void> {
    try {
      const user = await this.me(serverUrl, t.accessToken);
      await setAccount({ serverUrl, accessToken: t.accessToken, refreshToken: t.refreshToken, user, signedInAt: new Date().toISOString() });
      this.lastError = "";
      this.log(`[account] 已登录：user ${user.id}`);
      /* 登上就把许可证取回来（失败不报错：市场打开时还会再试一次） */
      void this.syncLicense();
    } catch (e) {
      this.lastError = `换到了令牌，但服务端不认：${(e as Error).message}`;
      this.log(`[account] /auth/me 失败：${(e as Error).message}`);
    }
  }

  private async me(serverUrl: string, token: string): Promise<AccountUser> {
    const r = await this.fetchFn(`${serverUrl}/auth/me`, { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    if (r.status === 401) throw new MeFail("401", isSessionInvalid(r));
    if (!r.ok) throw new Error(`/auth/me 回了 ${r.status}`);
    const d = (await r.json()) as { user?: AccountUser };
    if (!d.user || typeof d.user.id !== "number") throw new Error("/auth/me 没有 user");
    return d.user;
  }

  /** 活着核一次：令牌还认不认。401 → 用刷新令牌换一枚再核；还不行 → 清掉本机的登录（服务端已经不认了）。 */
  async check(): Promise<AccountStatus> {
    const a = await getAccount();
    if (!a.accessToken) return this.status();
    try {
      const user = await this.me(a.serverUrl, a.accessToken);
      await setAccount({ user });
      this.lastError = "";
    } catch (e) {
      if ((e as Error).message !== "401") { this.lastError = `核对失败：${(e as Error).message}`; return this.status(); }
      let renewed = false;
      try {
        const cfg = oidcConfigOf(await this.authConfig(a.serverUrl));
        if (cfg && a.refreshToken) {
          const t = await this.oidc.refresh(cfg, a.refreshToken);
          const user = await this.me(a.serverUrl, t.accessToken);
          await setAccount({ accessToken: t.accessToken, refreshToken: t.refreshToken || a.refreshToken, user });
          renewed = true;
          this.lastError = "";
        }
      } catch { /* 下面按失效处理 */ }
      /* 清不清登录，两条路的**证据**不一样（账号中心对接说明 2026-10-21 §二）：
         - 有刷新令牌（OIDC 回退路）：「IdP 拒了这张刷新令牌」本身就是证据 —— 照旧清；
         - 没有刷新令牌（不透明令牌，线上 10-19 起走这条）：唯一的证据是服务端那个头。
         ⚠️ **原来这里对后者是「任何 401 都清」** —— `a.refreshToken` 是空串，
         上面那个 `if` 进不去，`renewed` 永远 false，于是一个网关的 401
         就能把用户的登录清掉，而他什么都没做错。 */
      if (!renewed) {
        if (a.refreshToken || (e as MeFail).sessionInvalid === true) {
          await setAccount({ accessToken: "", refreshToken: "", user: null, signedInAt: "" });
          this.lastError = "登录已经失效，重新登录一次";
        } else {
          this.lastError = `服务端回了 401，但没说是会话失效（没有 ${UMBRA_ERROR_HEADER}: session_invalid）—— 本机的登录没有清掉`;
        }
      }
    }
    return this.status();
  }

  /** 登出：先告诉服务端（它吊销这一条），**服务端失败也要清本机**。 */
  async logout(): Promise<AccountStatus> {
    this.oidc.cancel("cancelled");
    const a = await getAccount();
    if (a.accessToken) {
      try {
        await this.fetchFn(`${a.serverUrl}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${a.accessToken}`, Accept: "application/json" } });
      } catch { /* 叫不动服务端不改变本机事实 */ }
    }
    await setAccount({ accessToken: "", refreshToken: "", user: null, signedInAt: "" });
    this.lastError = "";
    return this.status();
  }

  /** 换 Umbra 服务端地址（换了就等于登出：令牌是上一台的）。 */
  async setServer(serverUrl: string): Promise<AccountStatus> {
    const base = serverUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^/\s]+$/.test(base)) throw new Error("地址要是 http(s)://主机[:端口]，不带路径");
    const a = await getAccount();
    if (a.serverUrl !== base) await this.logout();
    await setAccount({ serverUrl: base });
    this.provider = "unknown";
    return this.status();
  }

  /** 向服务端要这个账号的许可证（`GET /plugins/license`），验签过了就落盘（`saveLicenseText`，与 `set_license` 同一条）。
   *  回 `{ok, why, grants}`：`why` 是给人看的一句。没登录 / 服务端没配私钥（503）/ 验不过都在 `why` 里说清。 */
  async fetchLicense(): Promise<{ ok: boolean; why: string; grants: Grant[] }> {
    let body: unknown;
    try {
      const r = await this.authedFetch("/plugins/license", { method: "GET" });
      /* 刚因为令牌失效被清掉的，要说「失效」而不是「没登录」—— 他明明登过 */
      if (!r) return { ok: false, why: this.lastError ? "登录已失效，重新登录一次再取许可证" : `没登录${platformName}账号，取不了许可证`, grants: [] };
      if (r.status === 503) return { ok: false, why: "服务端还没配许可证签名密钥，暂时发不了许可证", grants: [] };
      /* 走到这里 = 刷新过还是 401（或刷新令牌也过期了）：才真是「登录失效」 */
      if (r.status === 401) return { ok: false, why: "登录已失效，重新登录一次再取许可证", grants: [] };
      if (!r.ok) return { ok: false, why: `取许可证失败：HTTP ${r.status}`, grants: [] };
      body = await r.json();
    } catch (e) {
      return { ok: false, why: `连不上服务端：${(e as Error).message}`, grants: [] };
    }
    const text = licenseTextOf(body);
    if (!text) return { ok: false, why: "服务端回的许可证缺 payload 或 signature", grants: [] };
    const r = await saveLicenseText(text);
    if (!r.ok) return { ok: false, why: r.why ?? "许可证验不过", grants: [] };
    this.log(`[account] 许可证已更新：${r.license!.grants.length} 条授权`);
    return { ok: true, why: "", grants: r.license!.grants };
  }

  /** 本机没有许可证、或许可证不是当前账号的 → 静默取一次。**失败不抛**（市场打不打得开不该取决于它）。
   *  回 `true` = 这次取过了。 */
  async syncLicense(): Promise<boolean> {
    const a = await getAccount();
    if (!a.accessToken || !a.user) return false;
    let lic: LicenseCheck | null = null;
    try { lic = await loadLicense(); } catch { lic = null; }
    if (licenseIsFor(lic, a.user.id)) return false;
    try { await this.fetchLicense(); } catch { /* 静默 */ }
    return true;
  }

  /** 用积分买一个插件（`POST /plugins/{id}/buy`）。回 `already: true` = 早就买过；`price / discount / charged`
   *  是服务端记的「原价 · 折扣 · 实扣」（草案 §3.3，折扣落在扣积分那一刻；老服务端没有就是 0）。失败抛 Error（message 是服务端的人话）。 */
  async buyPlugin(id: string): Promise<{ ok: boolean; already: boolean; price: number; discount: number; charged: number }> {
    const r = await this.authedFetch(`/plugins/${encodeURIComponent(id)}/buy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!r) throw new Error(this.lastError ? "登录已失效，重新登录一次" : `登录${platformName}账号后才能购买`);
    let body: Record<string, unknown> = {};
    try { body = (await r.json()) as Record<string, unknown>; } catch { body = {}; }
    if (r.ok) {
      const n = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : 0);
      return { ok: true, already: body.already === true, price: n("price"), discount: n("discount"), charged: n("charged") };
    }
    const detail = body.detail as Record<string, unknown> | string | undefined;
    const msg = typeof detail === "string" ? detail
      : typeof detail?.message === "string" ? detail.message
      : typeof body.message === "string" ? body.message : "";
    if (r.status === 401) throw new Error("登录已失效，重新登录一次");
    throw new Error(msg || `购买失败：HTTP ${r.status}`);
  }

  /** 给别的能力用：当前访问令牌（空 = 没登录）。**只在核心进程内用**，不回前端。 */
  async bearer(): Promise<string> {
    /* 快过期就先刷新（通道 A 走服务端 AI 用它：原来令牌一过期，AI 请求全是 401） */
    return (await this.usableToken())?.token ?? "";
  }
}

/** 核心进程里只有一个账号服务。 */
export const account = new AccountService(new OidcLogin(undefined, (l) => console.error(l)), undefined, (l) => console.error(l));
