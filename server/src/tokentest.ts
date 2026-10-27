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
 *  ⚠️⚠️ **2026-10-27：OIDC 那半删了。** Casdoor 已下线（geek-99 在服务器上核过服务是
 *  inactive），按对接说明 §三 3 删掉 `oidc.ts` / `oidc_pkce.ts` / `renew()` /
 *  `loginStart()` / `tokenExpMs` 那一摊，而**这个文件的 ①–⑧ 和 ⑬ 随它一起走**
 *  （上一版这里就写着「那条路还在，判据就得在 …… 随 OIDC 代码一起删」）。
 *
 *  现在这个文件只测**线上真正走的那条**：邮箱 + 密码 + 不透明长串令牌，没有刷新令牌。
 *  - ⑨ 密码登录的分档（bad / locked / offline / other）
 *  - ⑩ **失效判准** —— 也就是「什么时候才允许清掉用户的登录」。
 *    ⚠️ 其中 ⓕ 是删 OIDC 当天新加的：**存量 `refreshToken` 不改变任何行为**。
 *    删除时有两道守卫把「有刷新令牌」当成「OIDC 那条路还在、会有人续期」的替身，
 *    两道都拆了，而那个字段还留在 `account.json` 里（对接说明 §四：存储格式不改）。
 *  - ⑪ 第二个失效信号（任意状态码带 `x-umbra-session: invalid`，含 200）
 *  - ⑫ 改密码 / 改显示名 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await mkdtemp(join(tmpdir(), "umbra-tokentest-"));
process.env.UMBRASTUDIO_STATE_DIR = STATE;

const { AccountService, LoginFail, isSessionInvalid, isSessionInvalidHeader } = await import("./account.js");
type LoginFail = InstanceType<typeof LoginFail>;
const { getAccount, setAccount } = await import("./account.js");

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};

const BASE = "https://umbra.tokentest.invalid";
/* ⚠️ 这里原来还有一整套 OIDC 的夹具（JWT 造枚器、四种过期档位、`world()` 那个带
   `OidcLogin` 的假 IdP），2026-10-27 随 ①–⑧ 一起删。 */
/* ⚠️ `signIn()` 那个 helper 也随 ①–⑧ 删了 —— 余下几节各自写自己的登录态
   （它们要的 `refreshToken` / `signedInAt` 各不相同，共用一个 helper 反而要加参数）。 */

console.log("登录令牌过期自动刷新");

/* ⚠️⚠️ **①–⑧ 和上面那两条纯函数判据，2026-10-27 随 OIDC 一起删**（这个文件头上
   2026-10-21 就写着「那条路还在，判据就得在 …… 随 OIDC 代码一起删」）。
   它们测的是：`tokenExpMs` 认 JWT 的 `exp` · 提前量 · 过期先刷新 · 并发只刷一次 ·
   401 刷新重试 · 刷新令牌被拒才清 · 断网不清 · 购买也走同一条。
   **这八条的共同前提是「有一张刷新令牌」**，而线上那张不透明令牌没有。
   > **一条判据的前提消失之后，它不会变红，它会变成一条永远绿的判据** ——
   > 而永远绿的判据会让人以为那条路还被守着。

   ⚠️ 删掉的条数要**从基线里减掉**，不然「有意删掉」和「静默跳过」在读数上分不开
   （`uitest` / `apitest` 那条口径）。这个文件没有下界闸，所以读数直接从 50 掉到下面那个数。 */

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
  const svc = new AccountService(fetchFn as never);
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
  const down = new AccountService((async () => { throw new Error("ECONNREFUSED"); }) as never);
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
    /* ⚠️ `refreshes` 这个计数器留着，而它现在**恒为 0** —— 它钉的是
       「这条路一次都不去刷新」，而 2026-10-27 之后连刷新的代码都没了。
       > **一个恒为 0 的计数器，在那条路刚被删掉的这一次是最该留着的** ——
       > 它是「真的没有人去刷新」的读数，不是一句推断。 */
    return { svc: new AccountService(fetchFn as never), refreshes: () => refreshes };
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

  /* ⓕ ⚠️⚠️ **存量 `refreshToken` 不改变任何行为**（2026-10-27 删 OIDC 时新加的那一条）。
     原来这里是「`tokenExpMs` 对不透明令牌回 null」，而那个函数随 OIDC 删了。
     换成一条**更要紧**的：删 OIDC 时有**两道守卫**把「有刷新令牌」当成
     「OIDC 那条路还在、会有人续期」的替身 ——
     `noteSessionInvalid()` 的 `if (a.refreshToken) return;` 与
     `check()` 的 `if (a.refreshToken || sessionInvalid)`。两道都删了，
     而**存量 `account.json` 里真的可能躺着一张 Casdoor 时代的刷新令牌**
     （对接说明 §四：存储格式不改，那个字段还在）。
     > **一个判准的前提被别处改掉了，而它自己不会报错** —— 这次「别处」就是同一个提交。
     ⚠️ 这一条问**行为**不问文本：带着一张旧刷新令牌，两种 401 的结果要和没有它时一样。
     不这么问的话，只能靠 grep 源码里有没有 `refreshToken`，而那种判据改个写法就瞎了。 */
  {
    const LEGACY = { serverUrl: BASE, accessToken: TOK, refreshToken: "RT-存量",
      user: { id: 1, name: "sam" } as never, signedInAt: "2026-10-21T00:00:00Z" };
    const plain = checkWorld(() => ({ status: 401 }));                 // 401，不带失效头
    await setAccount(LEGACY);
    await plain.svc.check();
    const a1 = await getAccount();
    ok(a1.accessToken === TOK && plain.refreshes() === 0,
       "**带着存量刷新令牌，普通 401 照旧不清登录**（删掉的那一支会让它「任何 401 都清」）",
       `令牌还在=${a1.accessToken === TOK} · 刷新次数=${plain.refreshes()}`);

    const dead = checkWorld(() => ({ status: 401, hdr: { "x-umbra-error": "session_invalid" } }));
    await setAccount(LEGACY);
    await dead.svc.check();
    const a2 = await getAccount();
    ok(a2.accessToken === "" && a2.refreshToken === "",
       "**而真失效时照旧清掉，连那张旧刷新令牌一起**（删掉的那道守卫会让它永远不被处置）",
       `accessToken=${JSON.stringify(a2.accessToken)} · refreshToken=${JSON.stringify(a2.refreshToken)}`);
  }
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
    /* ⚠️ `refreshes` 这个计数器留着，而它现在**恒为 0** —— 它钉的是
       「这条路一次都不去刷新」，而 2026-10-27 之后连刷新的代码都没了。
       > **一个恒为 0 的计数器，在那条路刚被删掉的这一次是最该留着的** ——
       > 它是「真的没有人去刷新」的读数，不是一句推断。 */
    return { svc: new AccountService(fetchFn as never), refreshes: () => refreshes };
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
    return { svc: new AccountService(fetchFn as never), sent };
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

/* ⚠️ ⑬（`renew()` 的两条竞态，issue #171 / #170）2026-10-27 随 OIDC 删 ——
   `renew()` 这个函数不存在了，而它测的两条竞态都发生在「刷新途中」。
   > **一条竞态判据的价值，等于那两件事还能不能同时发生。** */


await rm(STATE, { recursive: true, force: true });
console.log(`\n${fail ? "✗" : "✓"} 令牌刷新 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
