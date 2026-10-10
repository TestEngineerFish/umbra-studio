/** OIDC 授权码 + PKCE 的那一趟（核心进程这一半）：起本机回环端口收回调 → 换令牌；以及用刷新令牌续期。
 *
 *  和 UmbraPC `core/auth/oidc.ts` 同形，差一处：**这里不开浏览器**。核心是个 Node 进程，壳模式下开浏览器的是
 *  壳（`host.openExternal`），浏览器模式下是前端 `window.open` —— 所以 `start()` 把授权地址**交给调用方**去开，
 *  自己只等回调。前端拿到地址 → `host.openExternal(url)` → 轮询 `account` 看登没登上。
 *
 *  安全边界：`state` 不对的回调不认（防 CSRF）；只监听 `127.0.0.1`、随机端口、收到一次就关；
 *  同一时刻只一场（再开一场作废上一场）；5 分钟没回来就失败，端口不会一直开着。
 *  出网用 Node 全局 `fetch`（与 `provider.ts` 一致），令牌**不进任何日志**。
 */
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import {
  authorizeUrl, loopbackRedirectUri, parseCallback, parseTokenResponse, pkcePair, randomState,
  refreshRequestBody, tokenRequestBody, type OidcClientConfig, type OidcTokens,
} from "./oidc_pkce.js";

export type { OidcClientConfig, OidcTokens } from "./oidc_pkce.js";

/** 浏览器那边最多等多久（毫秒）。 */
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const PAGE_OK = "<!doctype html><meta charset=utf-8><title>Umbra Studio</title>"
  + "<body style='font:15px system-ui;padding:48px;color:#333'>登录成功，可以回到 Umbra Studio 了。这个页面可以关掉。</body>";
const PAGE_BAD = "<!doctype html><meta charset=utf-8><title>Umbra Studio</title>"
  + "<body style='font:15px system-ui;padding:48px;color:#333'>这次登录没有完成，请回到 Umbra Studio 重试。</body>";

export type OidcFailReason = "cancelled" | "timeout" | "state" | "idp" | "network";

export class OidcFail extends Error {
  constructor(readonly reason: OidcFailReason, detail = "") {
    super(detail || reason);
    this.name = "OidcFail";
  }
}

/** 出网。缺省 Node 全局 fetch；回归里换成假的。 */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class OidcLogin {
  private current: { server: http.Server; cancel: (why: OidcFailReason) => void } | null = null;

  constructor(private fetchFn: FetchLike = (u, i) => fetch(u, i) as unknown as ReturnType<FetchLike>,
              private log: (line: string) => void = () => {}) {}

  /** 开一场：起回环端口、算 PKCE，回**授权地址**（调用方去开浏览器）和「等到令牌」的 Promise。
   *  上一场还开着就先作废它（它的 `done` 以 cancelled 失败）。 */
  async start(cfg: OidcClientConfig, timeoutMs = LOGIN_TIMEOUT_MS): Promise<{ url: string; done: Promise<OidcTokens> }> {
    this.cancel("cancelled");
    const { verifier, challenge } = pkcePair();
    const state = randomState();
    const { url, code } = await this.listen(cfg, { state, challenge }, timeoutMs);
    const done = code.then(async (c) => {
      const resp = await this.post(cfg.token_endpoint, tokenRequestBody(cfg, { code: c.code, redirectUri: c.redirectUri, verifier }));
      const tokens = this.parse(resp);
      this.log("[oidc] 换令牌成功");
      return tokens;
    });
    // 没人接这个 Promise 的拒绝时（比如壳关了）不要变成 unhandledRejection；真正的接法在 account.ts。
    done.catch(() => {});
    return { url, done };
  }

  /** 用刷新令牌换一枚新的访问令牌。IdP 拒了（过期 / 吊销）抛 `OidcFail("idp")`。 */
  async refresh(cfg: OidcClientConfig, refreshToken: string): Promise<OidcTokens> {
    if (!refreshToken) throw new OidcFail("idp", "没有刷新令牌");
    const resp = await this.post(cfg.token_endpoint, refreshRequestBody(cfg, refreshToken));
    const tokens = this.parse(resp);
    this.log("[oidc] 刷新令牌成功");
    return tokens;
  }

  /** 作废正在进行的那一场。没有就什么都不做。 */
  cancel(why: OidcFailReason = "cancelled"): void {
    const c = this.current;
    this.current = null;
    if (c) c.cancel(why);
  }

  /** 有没有一场正在等浏览器。 */
  get pending(): boolean { return this.current !== null; }

  private parse(resp: unknown): OidcTokens {
    try {
      return parseTokenResponse(resp);
    } catch (e) {
      throw new OidcFail("idp", String((e as Error)?.message || e));
    }
  }

  private async post(url: string, body: string): Promise<unknown> {
    let r: Awaited<ReturnType<FetchLike>>;
    try {
      r = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
      });
    } catch (e) {
      throw new OidcFail("network", String((e as Error)?.message || e));
    }
    let data: unknown = null;
    try {
      data = await r.json();
    } catch {
      throw new OidcFail("idp", `IdP 回了 ${r.status}，不是 JSON`);
    }
    if (!r.ok && !(data && typeof data === "object" && "error" in data)) throw new OidcFail("idp", `IdP 回了 ${r.status}`);
    return data;
  }

  /** 起回环端口、拼授权地址；回地址与「等到 code」的 Promise。 */
  private listen(cfg: OidcClientConfig, p: { state: string; challenge: string }, timeoutMs: number):
    Promise<{ url: string; code: Promise<{ code: string; redirectUri: string }> }> {
    return new Promise((resolveStart, rejectStart) => {
      let done = false;
      let timer: NodeJS.Timeout | null = null;
      let redirectUri = "";
      let settleCode: { resolve: (v: { code: string; redirectUri: string }) => void; reject: (e: Error) => void } | null = null;
      const code = new Promise<{ code: string; redirectUri: string }>((resolve, reject) => { settleCode = { resolve, reject }; });
      code.catch(() => {});
      const server = http.createServer((req, res) => {
        const cb = parseCallback(req.url || "/");
        if (!cb) { res.statusCode = 404; res.end(); return; }
        if (done) { res.statusCode = 410; res.end(PAGE_BAD); return; }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        if (cb.state !== p.state || !cb.code) {
          res.statusCode = 400; res.end(PAGE_BAD);
          finish(() => settleCode!.reject(new OidcFail(cb.error ? "idp" : "state", cb.error || "state 对不上")));
          return;
        }
        res.end(PAGE_OK);
        finish(() => settleCode!.resolve({ code: cb.code, redirectUri }));
      });
      const finish = (settle: () => void) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (this.current?.server === server) this.current = null;
        settle();
        server.close();
      };
      // 同步登记成「正在进行的那一场」，不等 listen 回调：紧接着再开一场时要作废的是它（PC 那边实测踩过）。
      this.current = { server, cancel: (why) => finish(() => settleCode!.reject(new OidcFail(why))) };
      server.on("error", (e) => {
        finish(() => settleCode!.reject(new OidcFail("network", `回环端口起不来：${(e as Error).message}`)));
        rejectStart(new OidcFail("network", `回环端口起不来：${(e as Error).message}`));
      });
      server.listen(0, "127.0.0.1", () => {
        if (done) { rejectStart(new OidcFail("cancelled")); return; }
        const port = (server.address() as AddressInfo).port;
        redirectUri = loopbackRedirectUri(port);
        timer = setTimeout(() => finish(() => settleCode!.reject(new OidcFail("timeout"))), timeoutMs);
        const url = authorizeUrl(cfg, { redirectUri, state: p.state, challenge: p.challenge });
        this.log(`[oidc] 等浏览器登录，回调端口 ${port}`);
        resolveStart({ url, code });
      });
    });
  }
}
