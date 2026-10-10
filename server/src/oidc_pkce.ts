/** OIDC 授权码 + PKCE 的**纯函数**部分：verifier / challenge / state、授权地址、回调解析、请求体、响应解析。
 *
 *  与 UmbraPC `electron/core/auth/oidc-pkce.ts`、UmbraiOS `OidcRules.swift` 是同一份判据，三端同进同退。
 *  **不碰网络、不碰磁盘**，`apitest` 里直接测；起回环端口、发请求在 `oidc.ts`。
 *
 *  IdP 是 Casdoor（v4.18.0 核过）：带 `code_verifier` 时换令牌与刷新都不要 client_secret（公开客户端）；
 *  回环回调地址不比端口（`isSameLoopbackHost`），所以应用里登记 `http://127.0.0.1/callback`，这里随机端口照样过。
 */
import { createHash, randomBytes } from "node:crypto";

/** Umbra 服务端 `GET /auth/config` 回的那份（`provider === "oidc"` 时才有后面几项）。 */
export interface OidcClientConfig {
  issuer: string;
  client_id: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  scope?: string;
}

/** 换令牌拿到的东西。`refreshToken` 可能为空（IdP 没发）。`expiresIn` 秒。 */
export interface OidcTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** base64url（RFC 7636 §4.1：verifier 用这个字母表，不带 `=`）。 */
export function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 一对 PKCE：verifier 43 字符（32 字节随机），challenge = base64url(sha256(verifier))，方法 S256。 */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

/** 防 CSRF 的 state：16 字节随机，回调里必须原样带回。 */
export function randomState(): string {
  return b64url(randomBytes(16));
}

/** 回环回调地址。主机名用 `127.0.0.1` 不用 `localhost`（RFC 8252 §7.3：localhost 可能被 hosts 文件改到别处）。 */
export function loopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}/callback`;
}

/** 拼授权地址（`response_type=code` + S256）。 */
export function authorizeUrl(cfg: OidcClientConfig, p: { redirectUri: string; state: string; challenge: string }): string {
  const u = new URL(cfg.authorization_endpoint);
  u.searchParams.set("client_id", cfg.client_id);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", cfg.scope || "openid profile email");
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/** 回调请求行（`/callback?code=…&state=…`）→ 三个字段。只认 `/callback` 这条路径，别的回 null。 */
export function parseCallback(requestUrl: string): { code: string; state: string; error: string } | null {
  const u = new URL(requestUrl, "http://127.0.0.1");
  if (u.pathname !== "/callback") return null;
  return {
    code: u.searchParams.get("code") || "",
    state: u.searchParams.get("state") || "",
    error: u.searchParams.get("error") || "",
  };
}

/** 换令牌的请求体（`application/x-www-form-urlencoded`）。**不带 client_secret**：公开客户端靠 verifier。 */
export function tokenRequestBody(cfg: OidcClientConfig, p: { code: string; redirectUri: string; verifier: string }): string {
  return new URLSearchParams({
    grant_type: "authorization_code", client_id: cfg.client_id, code: p.code,
    redirect_uri: p.redirectUri, code_verifier: p.verifier,
  }).toString();
}

/** 刷新令牌的请求体。 */
export function refreshRequestBody(cfg: OidcClientConfig, refreshToken: string): string {
  return new URLSearchParams({
    grant_type: "refresh_token", client_id: cfg.client_id, refresh_token: refreshToken,
    scope: cfg.scope || "openid profile email",
  }).toString();
}

/** 令牌响应 → `OidcTokens`。IdP 回 `{error, error_description}` 或没有 `access_token` 时抛 Error（message 是 IdP 原话）。 */
export function parseTokenResponse(body: unknown): OidcTokens {
  const d = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof d.error === "string" && d.error) throw new Error(String(d.error_description || d.error));
  const accessToken = typeof d.access_token === "string" ? d.access_token : "";
  if (!accessToken) throw new Error("令牌响应里没有 access_token");
  return {
    accessToken,
    refreshToken: typeof d.refresh_token === "string" ? d.refresh_token : "",
    expiresIn: Number(d.expires_in) || 0,
  };
}
