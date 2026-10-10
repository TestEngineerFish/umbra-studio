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
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { STATE_ROOT } from "./project.js";
import { writeAtomic } from "./normalize.js";
import { OidcFail, OidcLogin, type FetchLike, type OidcClientConfig, type OidcTokens } from "./oidc.js";

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
export function oidcConfigOf(d: AuthConfigDTO | null): OidcClientConfig | null {
  if (!d || d.provider !== "oidc" || !d.client_id || !d.authorization_endpoint || !d.token_endpoint || !d.issuer) return null;
  return { issuer: d.issuer, client_id: d.client_id, authorization_endpoint: d.authorization_endpoint,
    token_endpoint: d.token_endpoint, end_session_endpoint: d.end_session_endpoint, scope: d.scope };
}

export class AccountService {
  private lastError = "";
  private provider: AccountStatus["provider"] = "unknown";

  constructor(private oidc = new OidcLogin(), private fetchFn: FetchLike = (u, i) => fetch(u, i) as unknown as ReturnType<FetchLike>,
              private log: (line: string) => void = () => {}) {}

  async status(): Promise<AccountStatus> {
    const a = await getAccount();
    const { getAiConfig } = await import("./ai_config.js");
    const serverAi = !!(await getAiConfig()).channelA?.useAccount;
    return { serverUrl: a.serverUrl, signedIn: !!a.accessToken && !!a.user, user: a.user, signedInAt: a.signedInAt,
      pending: this.oidc.pending, lastError: this.lastError, provider: this.provider, serverAi };
  }

  /** 通道 A 切到 / 切回 Umbra 服务端 AI。开：`useAccount: true` 并把缺省通道设为 A（端点 / 密钥取配置那一刻现算，
   *  文件里不存令牌）；关：只把标记放下，原来自填的端点 / 密钥还在（没覆盖过）。 */
  async setServerAi(on: boolean): Promise<AccountStatus> {
    const { getAiConfig, mergeChannel, setAiConfig } = await import("./ai_config.js");
    const cur = await getAiConfig();
    if (on) {
      const st = await this.status();
      if (!st.signedIn) throw new Error("先登录 Umbra 账号，再开服务端 AI");
      const next = mergeChannel(cur, "a", { useAccount: true, model: cur.channelA?.model || "umbra" } as never);
      await setAiConfig({ ...next, defaultChannel: "a" });
    } else {
      await setAiConfig(mergeChannel(cur, "a", { useAccount: false } as never));
    }
    return this.status();
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
    if (!cfg) throw new Error("这台服务器还没开 OIDC 登录（/auth/config 说是 local）。要等服务端切到 Casdoor 之后才能从这里登录。");
    const { url, done } = await this.oidc.start(cfg);
    void done.then(
      async (t) => { await this.finish(base, cfg!, t); },
      (e) => {
        const reason = (e as OidcFail)?.reason || "network";
        if (reason !== "cancelled") this.lastError = reason === "timeout" ? "等了 5 分钟浏览器没回来，再按一次重新开始"
          : reason === "state" ? "回来的不是这一次登录的回调，已经丢掉；再按一次重新开始" : `IdP 没有通过：${(e as Error).message}`;
        this.log(`[account] 登录没完成：${reason}`);
      },
    );
    return { url };
  }

  /** 换到令牌之后：问服务端我是谁，成了就落盘。 */
  private async finish(serverUrl: string, _cfg: OidcClientConfig, t: OidcTokens): Promise<void> {
    try {
      const user = await this.me(serverUrl, t.accessToken);
      await setAccount({ serverUrl, accessToken: t.accessToken, refreshToken: t.refreshToken, user, signedInAt: new Date().toISOString() });
      this.lastError = "";
      this.log(`[account] 已登录：user ${user.id}`);
    } catch (e) {
      this.lastError = `换到了令牌，但服务端不认：${(e as Error).message}`;
      this.log(`[account] /auth/me 失败：${(e as Error).message}`);
    }
  }

  private async me(serverUrl: string, token: string): Promise<AccountUser> {
    const r = await this.fetchFn(`${serverUrl}/auth/me`, { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    if (r.status === 401) throw new Error("401");
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
      if (!renewed) {
        await setAccount({ accessToken: "", refreshToken: "", user: null, signedInAt: "" });
        this.lastError = "登录已经失效，重新登录一次";
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

  /** 给别的能力用：当前访问令牌（空 = 没登录）。**只在核心进程内用**，不回前端。 */
  async bearer(): Promise<string> {
    return (await getAccount()).accessToken;
  }
}

/** 核心进程里只有一个账号服务。 */
export const account = new AccountService(new OidcLogin(undefined, (l) => console.error(l)), undefined, (l) => console.error(l));
