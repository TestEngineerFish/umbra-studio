/** 登录令牌过期自动刷新的回归（2026-10-17，用户报：商城点「免费安装」弹「登录已失效」，而界面显示已登录）。
 *
 *  根因：Casdoor 的访问令牌 7 天整点过期；只有 `check()` 会用刷新令牌换新的，
 *  取许可证 / 查会员 / 购买 / 服务端 AI（`bearer()`）都拿着过期令牌直接 401。界面的「已登录」只看本机有没有令牌。
 *  修法（`account.ts`）：用之前看 `exp`，快到期先刷新；回 401 再刷新重试一次；并发的刷新合并成一次；
 *  刷新令牌被 IdP 拒了才清登录，断网不清。
 *
 *  全程临时状态目录（`UMBRASTUDIO_STATE_DIR`，**要在 import 核心模块之前设**），网络全是注入的假服务端。
 *  跑：`npm --prefix server run tokentest` */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await mkdtemp(join(tmpdir(), "umbra-tokentest-"));
process.env.UMBRASTUDIO_STATE_DIR = STATE;

const { AccountService, tokenExpMs, TOKEN_RENEW_SKEW_MS } = await import("./account.js");
const { OidcLogin } = await import("./oidc.js");
const { getAccount, setAccount } = await import("./account.js");

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};

/** 造一枚 JWT 形状的令牌（只有 payload 有意义，签名随便）。 */
const jwt = (name: string, expSec: number) =>
  ["e30", Buffer.from(JSON.stringify({ sub: name, exp: expSec })).toString("base64url"), "sig"].join(".");
const nowSec = Math.floor(Date.now() / 1000);
const OLD = jwt("old", nowSec - 180);          // 已经过期 3 分钟（用户实际碰到的那一枚）
const SOON = jwt("soon", nowSec + 20);         // 20 秒后过期（在提前量之内）
const FRESH = jwt("fresh", nowSec + 7 * 86400);
const NEW = jwt("new", nowSec + 7 * 86400);
const BASE = "https://umbra.tokentest.invalid";
const CFG = { provider: "oidc", issuer: "https://auth.invalid", client_id: "c", authorization_endpoint: "https://auth.invalid/a", token_endpoint: "https://auth.invalid/t" };

/** 假服务端：认 `valid` 里的令牌；记下每次请求带的令牌。 */
function world(opts: { valid: string[]; refresh: "ok" | "reject" | "network"; configDown?: boolean }) {
  const seen: Array<{ path: string; token: string }> = [];
  let refreshes = 0;
  const oidc = new OidcLogin(async () => {
    refreshes++;
    await new Promise((r) => setTimeout(r, 30));
    if (opts.refresh === "network") throw new Error("fetch failed");
    if (opts.refresh === "reject") return { ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) };
    return { ok: true, status: 200, json: async () => ({ access_token: NEW, refresh_token: "RT2", expires_in: 604800 }) };
  });
  const fetchFn = async (url: string, init: { headers?: Record<string, string> }) => {
    const path = url.slice(BASE.length);
    const token = (init.headers?.Authorization ?? "").replace(/^Bearer /, "");
    seen.push({ path, token });
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (path === "/auth/config") { if (opts.configDown) throw new Error("fetch failed"); return json(200, CFG); }
    if (!opts.valid.includes(token)) return json(401, { detail: "unauthorized" });
    if (path === "/auth/me") return json(200, { user: { id: 1, name: "sam" } });
    if (path === "/membership") return json(200, { gift_plugins: ["com.umbra.pdf"], discount_pct: 100 });
    if (path === "/plugins/license") return json(200, {});      // 缺 payload：只为看「有没有拿新令牌去要」
    return json(404, {});
  };
  return { svc: new AccountService(oidc, fetchFn as never), seen, refreshes: () => refreshes };
}
const signIn = (token: string, refreshToken = "RT1") => setAccount({ serverUrl: BASE, accessToken: token, refreshToken, user: { id: 1, name: "sam" } as never, signedInAt: "2026-10-10T01:56:30Z" });

console.log("登录令牌过期自动刷新");

/* ── 纯函数 ── */
ok(tokenExpMs(FRESH) === (nowSec + 7 * 86400) * 1000 && tokenExpMs("not-a-jwt") === null && tokenExpMs("a.b.c") === null, "tokenExpMs：认 JWT 的 exp，不是 JWT 给 null");
ok(TOKEN_RENEW_SKEW_MS >= 30_000, "提前量至少 30 秒（请求在路上也要时间）", `${TOKEN_RENEW_SKEW_MS} ms`);

/* ① 用户碰到的那一幕：令牌已过期 → 取许可证不再说「登录已失效」，而是先刷新、拿新令牌去要 */
{
  await signIn(OLD);
  const w = world({ valid: [NEW], refresh: "ok" });
  const r = await w.svc.fetchLicense();
  ok(!/登录已失效/.test(r.why) && w.refreshes() === 1, "**令牌过期 3 分钟：取许可证先刷新，不报「登录已失效」**", r.why || "ok");
  ok(w.seen.filter((x) => x.path === "/plugins/license").every((x) => x.token === NEW), "取许可证带的是**新**令牌（过期那枚根本没发出去）");
  const a = await getAccount();
  ok(a.accessToken === NEW && a.refreshToken === "RT2", "新令牌和新的刷新令牌都落盘了");
}

/* ② 并发：市场一打开 perks 与 fetchLicense 同时发 —— 只刷新一次 */
{
  await signIn(OLD);
  const w = world({ valid: [NEW], refresh: "ok" });
  const [p, l] = await Promise.all([w.svc.perks(), w.svc.fetchLicense(), w.svc.perks()]);
  ok(w.refreshes() === 1, "**三个请求同时撞上过期：只刷新一次**（刷新令牌一次一换的 IdP 上，各刷各的会互相作废）", `刷新 ${w.refreshes()} 次`);
  ok(p.ok && p.gift.includes("com.umbra.pdf") && !/登录已失效/.test(l.why), "三个都成了");
}

/* ③ 快过期（20 秒后）也先刷新 */
{
  await signIn(SOON);
  const w = world({ valid: [SOON, NEW], refresh: "ok" });
  const t = await w.svc.bearer();
  ok(t === NEW && w.refreshes() === 1, "**还有 20 秒才过期：bearer() 也先换新的**（服务端 AI 用它，原来一过期 AI 请求全 401）");
}

/* ④ 令牌没过期、但服务端提前不认了（吊销 / 换了密钥）→ 401 → 刷新一次再试 */
{
  await signIn(FRESH);
  const w = world({ valid: [NEW], refresh: "ok" });
  const p = await w.svc.perks();
  const tries = w.seen.filter((x) => x.path === "/membership").map((x) => x.token === FRESH ? "旧" : x.token === NEW ? "新" : "?");
  ok(p.ok && tries.join(",") === "旧,新", "**没到期但回 401：刷新后重试一次**", tries.join(" → "));
}

/* ⑤ 刷新令牌也被拒了 → 这才是真的登录失效：清登录、照实说 */
{
  await signIn(OLD);
  const w = world({ valid: [NEW], refresh: "reject" });
  const r = await w.svc.fetchLicense();
  const st = await w.svc.status();
  ok(/登录已失效/.test(r.why), "刷新令牌被 IdP 拒了：取许可证说「登录已失效」（不是「没登录」—— 他明明登过）", r.why);
  ok(!st.signedIn && /失效/.test(st.lastError), "**界面这时如实显示「没登录」**（原来令牌死了还显示已登录）", `signedIn=${st.signedIn} · ${st.lastError}`);
}

/* ⑥ 断网：问不到服务端 → 不清登录（网好了还能刷） */
{
  await signIn(OLD);
  const w = world({ valid: [NEW], refresh: "ok", configDown: true });
  await w.svc.perks();
  ok((await getAccount()).accessToken === OLD && (await w.svc.status()).signedIn, "断网时刷新不了：**不清登录**");
  const w2 = world({ valid: [NEW], refresh: "network" });
  await w2.svc.perks();
  ok((await getAccount()).refreshToken === "RT1", "换令牌那一步网络失败：也不清登录");
}

/* ⑦ 没有刷新令牌：过期就是过期，照实说，不发无谓的刷新 */
{
  await signIn(OLD, "");
  const w = world({ valid: [NEW], refresh: "ok" });
  const r = await w.svc.fetchLicense();
  ok(w.refreshes() === 0 && /登录已失效/.test(r.why), "没有刷新令牌：不尝试刷新，报「登录已失效」");
}

/* ⑧ 购买也走同一条 */
{
  await signIn(OLD);
  const w = world({ valid: [NEW], refresh: "ok" });
  let msg = "";
  try { await w.svc.buyPlugin("com.umbra.pdf"); } catch (e) { msg = (e as Error).message; }
  ok(!/登录已失效/.test(msg) && w.seen.some((x) => x.path.endsWith("/buy") && x.token === NEW), "购买：先刷新再用新令牌买", msg || "ok");
}

/* ⑨ 服务端是 local（2026-10-19 接账号中心之后）：邮箱密码登录。不透明令牌没有 exp —— 不刷新、照用；失败按分档说 */
{
  await setAccount({ serverUrl: BASE, accessToken: "", refreshToken: "", user: null, signedInAt: "" });
  const LOCAL = "opaque-local-token";
  const calls: string[] = [];
  const fetchFn = async (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => {
    const path = url.slice(BASE.length);
    calls.push(path);
    const json = (status: number, body: unknown, hdr: Record<string, string> = {}) =>
      ({ ok: status < 300, status, json: async () => body, headers: { get: (n: string) => hdr[n.toLowerCase()] ?? null } });
    if (path === "/auth/config") return json(200, { provider: "local", managed_by: "center" });
    if (path === "/auth/login") {
      const b = JSON.parse(init.body || "{}") as { email: string; password: string; device: string };
      if (b.password === "slow") return json(401, { detail: "试得太频繁了" }, { "x-umbra-error": "too_many_attempts", "retry-after": "42" });
      return b.password === "right password" && b.device === "umbra-studio" ? json(200, { token: LOCAL, user: { id: 1 } }) : json(401, { detail: "邮箱或密码不对" }, { "x-umbra-error": "bad_credentials" });
    }
    if (path === "/auth/me") return init.headers?.Authorization === `Bearer ${LOCAL}` ? json(200, { user: { id: 1, name: "sam" } }) : json(401, {});
    if (path === "/membership") return init.headers?.Authorization === `Bearer ${LOCAL}` ? json(200, { gift_plugins: [], discount_pct: 100 }) : json(401, {});
    return json(404, {});
  };
  const svc = new AccountService(new OidcLogin(async () => { throw new Error("不该刷新"); }), fetchFn as never);
  ok(await svc.probeProvider() === "local", "probeProvider 认出 local");
  let msg = "";
  try { await svc.loginPassword("sam@example.com", "wrong one!!"); } catch (e) { msg = (e as Error).message; }
  ok(msg === "邮箱或密码不对", "密码不对：照服务端那句说", msg);
  try { await svc.loginPassword("sam@example.com", "slow"); } catch (e) { msg = (e as Error).message; }
  ok(/42 秒/.test(msg), "试太多：带上等多少秒", msg);
  const st = await svc.loginPassword("sam@example.com", "right password");
  const a = await getAccount();
  ok(st.signedIn && a.accessToken === LOCAL && a.refreshToken === "", "登上：存下不透明令牌，没有刷新令牌");
  ok(!JSON.stringify(a).includes("right password"), "密码不落盘");
  const p = await svc.perks();
  ok(p.ok, "不透明令牌（没有 exp）照用、不去刷新");
}

await rm(STATE, { recursive: true, force: true });
console.log(`\n${fail ? "✗" : "✓"} 令牌刷新 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
