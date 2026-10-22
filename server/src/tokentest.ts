/** 登录令牌过期自动刷新的回归（2026-10-17，用户报：商城点「免费安装」弹「登录已失效」，而界面显示已登录）。
 *
 *  根因：Casdoor 的访问令牌 7 天整点过期；只有 `check()` 会用刷新令牌换新的，
 *  取许可证 / 查会员 / 购买 / 服务端 AI（`bearer()`）都拿着过期令牌直接 401。界面的「已登录」只看本机有没有令牌。
 *  修法（`account.ts`）：用之前看 `exp`，快到期先刷新；回 401 再刷新重试一次；并发的刷新合并成一次；
 *  刷新令牌被 IdP 拒了才清登录，断网不清。
 *
 *  全程临时状态目录（`UMBRASTUDIO_STATE_DIR`，**要在 import 核心模块之前设**），网络全是注入的假服务端。
 *  跑：`npm --prefix server run tokentest`
 *
 *  ⚠️ **2026-10-21 身份层换对端了**（`doc/11` Q69，账号中心对接说明
 *  `Geek/doc/账号中心-对接说明-UmbraStudio-2026-10-21.md`）：**Casdoor 不用了**，
 *  线上 10-19 起 `/auth/config` 回 `{"provider":"local","managed_by":"center"}`，
 *  走的是邮箱 + 密码 + **不透明长串令牌，没有刷新令牌**。
 *
 *  于是这个文件分成两半，**两半都要留着**：
 *  - ①–⑧ 测 **OIDC 那条路**（刷新令牌、7 天整点过期）。线上已经不走它，但 Casdoor
 *    10-26 才下线、服务端还留着回退开关 `switch.sh oidc` —— **那条路还在，判据就得在**。
 *    随 OIDC 代码一起删（对接说明 §三.3）。
 *  - ⑨⑩ 测**线上现在真正走的那条**：不透明令牌。⑩ 是失效判准，
 *    也就是「什么时候才允许清掉用户的登录」。 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await mkdtemp(join(tmpdir(), "umbra-tokentest-"));
process.env.UMBRASTUDIO_STATE_DIR = STATE;

const { AccountService, LoginFail, tokenExpMs, TOKEN_RENEW_SKEW_MS, isSessionInvalid, isSessionInvalidHeader } = await import("./account.js");
type LoginFail = InstanceType<typeof LoginFail>;
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
    if (path === "/auth/forgot") return JSON.parse(init.body || "{}").email ? json(200, { ok: true }) : json(400, { detail: "缺邮箱" });
    if (path === "/auth/me") return init.headers?.Authorization === `Bearer ${LOCAL}` ? json(200, { user: { id: 1, name: "sam" } }) : json(401, {});
    if (path === "/membership") return init.headers?.Authorization === `Bearer ${LOCAL}` ? json(200, { gift_plugins: [], discount_pct: 100 }) : json(401, {});
    return json(404, {});
  };
  const svc = new AccountService(new OidcLogin(async () => { throw new Error("不该刷新"); }), fetchFn as never);
  ok(await svc.probeProvider() === "local", "probeProvider 认出 local");
  let msg = "";
  let kind = "", wait = -1;
  const grab = (e: unknown) => { msg = (e as Error).message; kind = (e as LoginFail).kind; wait = (e as LoginFail).wait; };
  try { await svc.loginPassword("sam@example.com", "wrong one!!"); } catch (e) { grab(e); }
  ok(msg === "邮箱或密码不对" && kind === "bad", "密码不对：照服务端那句说、kind=bad", msg);
  try { await svc.loginPassword("sam@example.com", "slow"); } catch (e) { grab(e); }
  ok(/42 秒/.test(msg) && kind === "locked" && wait === 42, "试太多：带上等多少秒、kind=locked", msg);
  await svc.forgotPassword("sam@example.com");
  ok(calls.includes("/auth/forgot"), "忘了密码：发到 /auth/forgot");
  const down = new AccountService(new OidcLogin(), (async () => { throw new Error("ECONNREFUSED"); }) as never);
  try { await down.loginPassword("sam@example.com", "x", BASE); } catch (e) { grab(e); }
  ok(kind === "offline" && msg === `连不上 ${BASE}`, "连不上：kind=offline，第一段写地址", msg);
  const st = await svc.loginPassword("sam@example.com", "right password");
  const a = await getAccount();
  ok(st.signedIn && a.accessToken === LOCAL && a.refreshToken === "", "登上：存下不透明令牌，没有刷新令牌");
  ok(!JSON.stringify(a).includes("right password"), "密码不落盘");
  const p = await svc.perks();
  ok(p.ok, "不透明令牌（没有 exp）照用、不去刷新");
}


/* ⑩ 不透明令牌的失效判准（账号中心对接说明 2026-10-21 §二）：
      **只有 401 带 `x-umbra-error: session_invalid` 才清登录**，断网 / 5xx / 不带那个头的 401 都不清。

   ⚠️ 这一节之前**一条判据都没有**，而产品代码当时是「任何 401 都清」——
      `a.refreshToken` 是空串，`check()` 里那个 `if (cfg && a.refreshToken)` 进不去，
      `renewed` 永远 false，于是**一个网关的 401 就能把用户的登录清掉**。
      ①–⑧ 全绿也看不见它：它们每一条都有刷新令牌。 */
{
  const TOK = "opaque-check-token";
  /** 只管 `/auth/me` 的世界：`me()` 说它回什么（`status: 0` = 断网）。
   *  ⚠️ 刷新函数一律先计数再抛 —— 「永不刷新」这条要测的是**它没被调**，
   *  而不是「调了没出事」（调了没出事在没有刷新令牌的世界里看起来一模一样）。 */
  const checkWorld = (me: () => { status: number; hdr?: Record<string, string> }) => {
    let refreshes = 0;
    const fetchFn = async (url: string) => {
      const path = url.slice(BASE.length);
      const json = (status: number, body: unknown, hdr: Record<string, string> = {}) =>
        ({ ok: status < 300, status, json: async () => body, headers: { get: (n: string) => hdr[n.toLowerCase()] ?? null } });
      if (path === "/auth/config") return json(200, { provider: "local", managed_by: "center" });
      if (path === "/auth/me") {
        const r = me();
        if (r.status === 0) throw new Error("fetch failed");
        if (r.status === 200) return json(200, { user: { id: 1, name: "sam" } });
        return json(r.status, { detail: "x" }, r.hdr ?? {});
      }
      return json(404, {});
    };
    const oidc = new OidcLogin(async () => { refreshes++; throw new Error("不该刷新"); });
    return { svc: new AccountService(oidc, fetchFn as never), refreshes: () => refreshes };
  };
  const signInOpaque = () => setAccount({ serverUrl: BASE, accessToken: TOK, refreshToken: "", user: { id: 1, name: "sam" } as never, signedInAt: "2026-10-21T00:00:00Z" });

  /* ⓐ 该清的时候清 */
  await signInOpaque();
  let w = checkWorld(() => ({ status: 401, hdr: { "x-umbra-error": "session_invalid" } }));
  let st = await w.svc.check();
  ok(!st.signedIn && !(await getAccount()).accessToken && w.refreshes() === 0,
     "401 带 session_invalid：**清登录**，而且一次刷新都没发（不透明令牌没有刷新令牌）", st.lastError);

  /* ⓑ 不该清的时候不清 —— 这两条是这一节的理由 */
  await signInOpaque();
  w = checkWorld(() => ({ status: 401 }));
  st = await w.svc.check();
  ok(st.signedIn && (await getAccount()).accessToken === TOK,
     "**401 不带那个头：不清登录**（网关 / 代理自己回的 401 不是会话失效）");
  ok(/没说是会话失效/.test(st.lastError),
     "而且要说出「为什么没清」—— 选了不清就必须留线索，不然它是个查不出来的沉默", st.lastError);

  /* ⓒ 5xx */
  await signInOpaque();
  w = checkWorld(() => ({ status: 503 }));
  st = await w.svc.check();
  ok(st.signedIn && (await getAccount()).accessToken === TOK, "5xx：不清登录", st.lastError);

  /* ⓓ 断网（原来那条纪律照旧） */
  await signInOpaque();
  w = checkWorld(() => ({ status: 0 }));
  st = await w.svc.check();
  ok(st.signedIn && (await getAccount()).accessToken === TOK, "断网：不清登录", st.lastError);

  /* ⓔ 判准本身是纯函数，直接钉它 —— 上面四条测的是「用对了」，这条测的是「它自己对」 */
  const res = (status: number, h: Record<string, string> | null) =>
    h === null ? { status } : { status, headers: { get: (n: string) => h[n.toLowerCase()] ?? null } };
  ok(isSessionInvalid(res(401, { "x-umbra-error": "session_invalid" })) === true
     && isSessionInvalid(res(401, { "x-umbra-error": "bad_credentials" })) === false
     && isSessionInvalid(res(401, {})) === false
     && isSessionInvalid(res(401, null)) === false
     && isSessionInvalid(res(200, { "x-umbra-error": "session_invalid" })) === false,
     "判准纯函数：状态码和头都要对，**读不到头一律不算失效**");

  /* ⓕ 令牌是不透明长串：认不出 exp，所以永远不会去「预判过期」 */
  ok(tokenExpMs(TOK) === null && tokenExpMs("opaque.two.parts.only") === null,
     "不透明令牌：`tokenExpMs` 回 null —— 不预判过期，只靠服务端那个头");
}


/* ⑪ **第二个信号**：`x-umbra-session: invalid` 跟着**任何状态码**走，包括 **200**
      （三端契约 `contract-session-revoked`，2026-09-28 定；2026-10-21 从 Umbra 主会话问到 ——
      **我原来漏了这一个**）。

   为什么它必须存在：Bearer 已经作废、而别的凭据放行时，服务端回的是 **200** 并带这个头。
   **只看 401 的话永远不知道会话已经没了** —— 而「不知道」的表现就是界面一直显示「已登录」。

   这一节还顺带钉住一件实现选择：报信是**包在 `fetchFn` 本身上**的，不是在六个调用点各加一行。
   所以下面故意从 **`/membership`**（走 `authedFetch` 那条路）发信号 ——
   它和 `/auth/me` 不是同一个调用点，**认到了才说明那层包装真的覆盖了别的出口**。 */
{
  const TOK = "opaque-signal-token";
  const signInOpaque = () => setAccount({ serverUrl: BASE, accessToken: TOK, refreshToken: "", user: { id: 1, name: "sam" } as never, signedInAt: "2026-10-21T00:00:00Z" });
  /** `/membership` 回什么由 `reply` 说。刷新函数一律先计数再抛。 */
  const sigWorld = (reply: { status: number; hdr?: Record<string, string> }) => {
    let refreshes = 0;
    const fetchFn = async (url: string) => {
      const path = url.slice(BASE.length);
      const json = (status: number, body: unknown, hdr: Record<string, string> = {}) =>
        ({ ok: status < 300, status, json: async () => body, headers: { get: (n: string) => hdr[n.toLowerCase()] ?? null } });
      if (path === "/auth/config") return json(200, { provider: "local", managed_by: "center" });
      if (path === "/membership") return json(reply.status, { gift_plugins: [], discount_pct: 100 }, reply.hdr ?? {});
      return json(404, {});
    };
    const oidc = new OidcLogin(async () => { refreshes++; throw new Error("不该刷新"); });
    return { svc: new AccountService(oidc, fetchFn as never), refreshes: () => refreshes };
  };

  /* ⓐ 最要紧的一条：**一个 200 响应把我们登出** */
  await signInOpaque();
  let w = sigWorld({ status: 200, hdr: { "x-umbra-session": "invalid" } });
  await w.svc.perks();
  let st = await w.svc.status();
  ok(!st.signedIn && !(await getAccount()).accessToken,
     "**200 带 x-umbra-session: invalid → 清登录**（Bearer 作废而别的凭据放行时，服务端回的就是 200）", st.lastError);
  ok(w.refreshes() === 0, "而且一次刷新都没发");

  /* ⓑ 反代可能会动这个头的大小写和空白 */
  await signInOpaque();
  w = sigWorld({ status: 401, hdr: { "x-umbra-session": "  INVALID  " } });
  await w.svc.perks();
  ok(!(await getAccount()).accessToken, "头的值大小写 / 前后空白都宽容（反代会动它）");

  /* ⓒ 阿里云备案拦截：403 + `Server: Beaver`，**不带那两个头** → 更不该清
        （Umbra 主会话 2026-10-21 点名的线上真实情况） */
  await signInOpaque();
  w = sigWorld({ status: 403, hdr: { server: "Beaver" } });
  await w.svc.perks();
  ok((await getAccount()).accessToken === TOK, "**403 备案拦截：不清登录**（它说的不是会话的事）");

  /* ⓓ 正常的 200 当然不清 —— 这条是「判准没有宽到把好响应也算失效」 */
  await signInOpaque();
  w = sigWorld({ status: 200 });
  const p = await w.svc.perks();
  ok(p.ok && (await getAccount()).accessToken === TOK, "干净的 200：照常用，不清登录");

  /* ⓔ 去重：信号来两次，第二次什么都不做（**去重靠状态本身，不是布尔标志**）*/
  await signInOpaque();
  w = sigWorld({ status: 200, hdr: { "x-umbra-session": "invalid" } });
  await w.svc.perks();
  const after1 = await getAccount();
  await w.svc.perks();
  const after2 = await getAccount();
  ok(!after1.accessToken && !after2.accessToken && after1.signedInAt === after2.signedInAt,
     "连续两次信号：只清一次，第二次不再动盘上那份");

  /* ⓕ 两个纯函数 */
  ok(isSessionInvalidHeader("invalid") && isSessionInvalidHeader(" INVALID ")
     && !isSessionInvalidHeader("valid") && !isSessionInvalidHeader("") && !isSessionInvalidHeader(null),
     "`isSessionInvalidHeader`：认 invalid，大小写空白宽容，别的一律不算");
  const res = (status: number, h: Record<string, string>) => ({ status, headers: { get: (n: string) => h[n.toLowerCase()] ?? null } });
  ok(isSessionInvalid(res(200, { "x-umbra-session": "invalid" })) === true
     && isSessionInvalid(res(403, { server: "Beaver" })) === false
     && isSessionInvalid(res(401, { "x-umbra-error": "too_many_attempts" })) === false,
     "`isSessionInvalid`：200 带会话头算、403 备案拦截不算、401 带别的码不算");
}


/* ⑫ 改密码 / 改显示名（Q74 ①②，契约由 Umbra 主会话 2026-10-21 给：
      `POST /auth/password` `{current,password}` → `{ok:true, logged_out:<整数>}`，当前密码不对是
      **400 `invalid_field` + `field:"current"`**；`PATCH /auth/me` `{display_name}` → `{user}`，空串合法）。

   ⚠️ 这一节最要紧的一条是**反面的**：改密码失败**不许碰登录状态**。
      「当前密码填错了」和「这条会话失效了」在界面上长得很像（都是「你的身份有问题」），
      而下一步完全不同 —— 一个是「这一格重填」，一个是「整个重登」。
      把前者当后者的话，用户一打错密码就被踢出登录。 */
{
  const TOK = "opaque-op-token";
  const signInOpaque = () => setAccount({ serverUrl: BASE, accessToken: TOK, refreshToken: "", user: { id: 1, name: "sam", display_name: "老样子" } as never, signedInAt: "2026-10-21T00:00:00Z" });
  const opWorld = (reply: (path: string, body: Record<string, unknown>) => { status: number; body?: unknown; hdr?: Record<string, string> }) => {
    const sent: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
    const fetchFn = async (url: string, init: { method: string; body?: string }) => {
      const path = url.slice(BASE.length);
      const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      sent.push({ path, method: init.method, body });
      const json = (status: number, b: unknown, hdr: Record<string, string> = {}) =>
        ({ ok: status < 300, status, json: async () => b, headers: { get: (n: string) => hdr[n.toLowerCase()] ?? null } });
      if (path === "/auth/config") return json(200, { provider: "local", managed_by: "center" });
      const r = reply(path, body);
      return json(r.status, r.body ?? {}, r.hdr ?? {});
    };
    return { svc: new AccountService(new OidcLogin(async () => { throw new Error("不该刷新"); }), fetchFn as never), sent };
  };

  /* ⓐ 改密码成功：回「下线了几台」，而且**这一台的登录一个字没动** */
  await signInOpaque();
  let w = opWorld(() => ({ status: 200, body: { ok: true, logged_out: 3 } }));
  const okRes = await w.svc.changePassword("old pw", "new pw");
  ok(okRes.loggedOut === 3, "改密码成功：回执带「另外下线了几台」", `logged_out=${okRes.loggedOut}`);
  ok((await getAccount()).accessToken === TOK, "**改完这一台的令牌保留**（服务端只下别的设备）");
  ok(w.sent.some((x) => x.path === "/auth/password" && x.method === "POST" && x.body.current === "old pw" && x.body.password === "new pw"),
     "字段名照服务端：`{current, password}` 发到 POST /auth/password");
  ok(!JSON.stringify(await getAccount()).includes("new pw"), "两个密码都不落盘");

  /* ⓑ 当前密码不对 → 400 invalid_field + field=current：分档 bad、带 field、**不清登录** */
  await signInOpaque();
  w = opWorld(() => ({ status: 400, body: { code: "invalid_field", field: "current", detail: "当前密码不对" } }));
  let kind = "", field = "", msg = "";
  try { await w.svc.changePassword("wrong", "new pw"); } catch (e) { kind = (e as LoginFail).kind; field = (e as LoginFail).field; msg = (e as Error).message; }
  ok(kind === "bad" && field === "current" && msg === "当前密码不对", "当前密码不对：kind=bad、field=current、照服务端那句说", `${kind}/${field}/${msg}`);
  ok((await getAccount()).accessToken === TOK, "**而且一个字都不碰登录状态**（400 不是会话失效）");

  /* ⓑ' 实现侧 2026-10-21 给的**真实响应原文**（Umbra `app.py` 的 `render_problem`）：
        400 · 头 `X-Umbra-Error: invalid_field` · 体 `{detail, status, code, field}`。
     ⚠️ 这一条真正钉的是**另一件事**：`x-umbra-error` 是**通用错误码头，不只用于会话失效** ——
        它带着 `invalid_field` 回来时，`isSessionInvalid` 必须说「不是失效」。
        把这个头当成「有值就是会话没了」的话，**用户一打错密码就被踢出登录**。 */
  await signInOpaque();
  w = opWorld(() => ({ status: 400, hdr: { "x-umbra-error": "invalid_field" },
    body: { detail: "当前密码不对", status: 400, code: "invalid_field", field: "current" } }));
  try { await w.svc.changePassword("wrong", "new pw"); } catch (e) { kind = (e as LoginFail).kind; field = (e as LoginFail).field; msg = (e as Error).message; }
  ok(kind === "bad" && field === "current" && msg === "当前密码不对" && (await getAccount()).accessToken === TOK,
     "**带 `X-Umbra-Error: invalid_field` 头的 400：仍然是「这一格重填」，不是「会话失效」**", `${kind}/${field}/${msg}`);

  /* ⓑ'' FastAPI 的 422（请求体缺字段 / 类型不对）：`detail` 是个**数组** ——
        `String()` 它会得到 `"[object Object]"` 并原样画到界面上。
     ⚠️ 这一条是 2026-10-21 实现侧说「422 落到 other 那一档就行」时顺手查出来的，
        而当时**四处都这么写着**（登录 / 忘了密码 / 改密码 / 改显示名），**前两处今天就够得到**。 */
  await signInOpaque();
  w = opWorld(() => ({ status: 422, body: { detail: [{ loc: ["body", "current"], msg: "field required", type: "value_error.missing" }] } }));
  try { await w.svc.changePassword("", "new pw"); } catch (e) { kind = (e as LoginFail).kind; msg = (e as Error).message; }
  ok(kind === "other" && !/\[object Object\]/.test(msg) && msg.length > 0,
     "422（FastAPI 校验格式）：落 other 档，而且**不会把 `[object Object]` 画给用户**", `${kind} / ${msg}`);

  /* ⓒ 改密码时服务端 5xx → offline 档，也不清登录 */
  await signInOpaque();
  w = opWorld(() => ({ status: 503, body: {} }));
  try { await w.svc.changePassword("a", "b"); } catch (e) { kind = (e as LoginFail).kind; }
  ok(kind === "offline" && (await getAccount()).accessToken === TOK, "5xx：kind=offline，不清登录");

  /* ⓓ 改显示名：落盘新 user */
  await signInOpaque();
  w = opWorld((_p, b) => ({ status: 200, body: { user: { id: 1, name: "sam", display_name: b.display_name } } }));
  const u = await w.svc.setDisplayName("山姆");
  ok(u.display_name === "山姆" && (await getAccount()).user?.display_name === "山姆", "改显示名：服务端回的 user 落盘");
  ok(w.sent.some((x) => x.path === "/auth/me" && x.method === "PATCH" && x.body.display_name === "山姆"), "发的是 PATCH /auth/me `{display_name}`");

  /* ⓔ 空串是合法的值，不是「没填」 */
  const u2 = await w.svc.setDisplayName("");
  ok(u2.display_name === "" && w.sent.filter((x) => x.path === "/auth/me").length === 2,
     "**空串照样发出去**（服务端的意思是「不要显示名」，界面退回显示邮箱）—— 不当成「没填」拦掉");
}

/* ══════════════════════════════════════════════════════════════════════
   ⑬ `renew()` 的两条竞态（issue #171 / #170）

   `renew()` 中间有**三次网络往返**（`/auth/config` → IdP token → `/auth/me`），
   而 `setAccount` 是 `{...当前文件, ...patch}` 合并。于是：
   · **#171** 刷新途中点「退出登录」→ 界面先显示未登录，**一两秒后又变回已登录**
     （而 `logout` 吊销的是**旧**那枚令牌，新换的那枚和新刷新令牌没被吊销）；
   · **#170** 服务端或 IdP 短暂 **5xx** → 除 network 之外一律清登录 →
     **本机登录被清掉**，而用户什么都没做错、手上那枚刷新令牌也还好着。
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑬ renew() 的两条竞态（issue #171 / #170）");
{
  /* ── #171 ⓐ 刷新途中退出登录：刷新结果**不许复活它** ── */
  {
    let kick: (() => void) | null = null;
    const gate = new Promise<void>((r) => { kick = r; });
    const oidc = new OidcLogin(async () => {
      await gate;                                   // 停在这里，等判据把 logout 做完
      return { ok: true, status: 200, json: async () => ({ access_token: "复活的令牌", refresh_token: "RT9", expires_in: 604800 }) };
    });
    const svc = new AccountService(oidc, (async (url: string, init: { headers?: Record<string, string> }) => {
      const path = url.slice(BASE.length);
      const json = (st: number, b: unknown) => ({ ok: st < 300, status: st, json: async () => b });
      if (path === "/auth/config") return json(200, CFG);
      if (path === "/auth/me") return json(200, { user: { id: 1, name: "sam" } });
      return json(200, {});
    }) as never);
    await signIn("T1");
    const p1 = svc.renew();                          // 开始刷新，卡在 gate 上
    await new Promise((r) => setTimeout(r, 20));
    await svc.logout();                              // 用户点「退出登录」
    const afterLogout = (await svc.status()).signedIn;
    kick!();                                          // 刷新这才回来
    const renewed = await p1;
    const st = await svc.status();
    ok(afterLogout === false, "（前提）logout 当场就把登录清了", String(afterLogout));
    ok(st.signedIn === false,
       "**刷新途中退出登录，刷新结果不许把它复活**（原来一两秒后又变回已登录）",
       `signedIn=${st.signedIn} · renew 回 ${renewed}`);
    const a = await getAccount();
    ok(a.accessToken === "" && a.refreshToken === "",
       "**新换到的那枚令牌也没落盘**（不然它没被吊销、却躺在文件里）",
       JSON.stringify({ at: a.accessToken, rt: a.refreshToken }));
  }

  /* ── #171 ⓑ 刷新途中完成一场新登录：旧结果不许盖掉它 ── */
  {
    let kick: (() => void) | null = null;
    const gate = new Promise<void>((r) => { kick = r; });
    const oidc = new OidcLogin(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => ({ access_token: "旧刷新换到的", refresh_token: "RT-old", expires_in: 604800 }) };
    });
    const svc = new AccountService(oidc, (async (url: string) => {
      const path = url.slice(BASE.length);
      const json = (st: number, b: unknown) => ({ ok: st < 300, status: st, json: async () => b });
      if (path === "/auth/config") return json(200, CFG);
      if (path === "/auth/me") return json(200, { user: { id: 1, name: "sam" } });
      return json(200, {});
    }) as never);
    await signIn("T1");
    const p2 = svc.renew();
    await new Promise((r) => setTimeout(r, 20));
    await signIn("新登录的令牌", "RT-new");          // 另一场登录落盘了
    kick!();
    await p2;
    const a = await getAccount();
    ok(a.accessToken === "新登录的令牌" && a.refreshToken === "RT-new",
       "**刷新途中的新登录不被旧刷新结果盖掉**", JSON.stringify({ at: a.accessToken, rt: a.refreshToken }));
  }

  /* ── #170 对面 5xx / 429 / 超时：**不清登录** ──
     ⚠️ 两个方向的代价不对称：误清 = 用户被踢出去重新登录（**没有东西兜**）；
     误留 = 界面多说一会儿「已登录」，而下一次请求照样会发现失效
     （`x-umbra-session` 那层报信兜着）。 */
  for (const [label, mk] of [
    ["503", () => ({ ok: false, status: 503, json: async () => ({}) })],
    ["500", () => ({ ok: false, status: 500, json: async () => ({}) })],
    ["429", () => ({ ok: false, status: 429, json: async () => ({}) })],
  ] as const) {
    await signIn("T1");
    const svc = new AccountService(new OidcLogin(async () => mk() as never), (async (url: string) => {
      const path = url.slice(BASE.length);
      const json = (st: number, b: unknown) => ({ ok: st < 300, status: st, json: async () => b });
      if (path === "/auth/config") return json(200, CFG);
      return json(200, {});
    }) as never);
    const r = await svc.renew();
    const a = await getAccount();
    ok(r === false && a.refreshToken === "RT1" && a.accessToken === "T1",
       `**IdP 回 ${label} 时不清登录**（对面「此刻不舒服」≠「这枚令牌废了」）`,
       JSON.stringify({ renew: r, at: a.accessToken, rt: a.refreshToken }));
    const le = (await svc.status()).lastError ?? "";
    ok(/暂时刷新不了/.test(le),
       `${label}：而且说得出「暂时刷新不了」而不是「登录失效」`,
       le);
  }

  /* ── 反方向：IdP **明确拒了这枚令牌**（400 invalid_grant）→ 该清就清 ──
     ⚠️ 没有这一条的话，上面那几条可以用「renew 什么都不做」糊过去。 */
  {
    await signIn("T1");
    const svc = new AccountService(new OidcLogin(async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) } as never)), (async (url: string) => {
      const path = url.slice(BASE.length);
      const json = (st: number, b: unknown) => ({ ok: st < 300, status: st, json: async () => b });
      if (path === "/auth/config") return json(200, CFG);
      return json(200, {});
    }) as never);
    const r = await svc.renew();
    const a = await getAccount();
    ok(r === false && a.accessToken === "" && a.refreshToken === "",
       "**IdP 明确拒了这枚刷新令牌（400 invalid_grant）→ 照旧清登录**（不然上面几条可以靠「什么都不做」糊过去）",
       JSON.stringify({ at: a.accessToken, rt: a.refreshToken }));
  }
}

await rm(STATE, { recursive: true, force: true });
console.log(`\n${fail ? "✗" : "✓"} 令牌刷新 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
