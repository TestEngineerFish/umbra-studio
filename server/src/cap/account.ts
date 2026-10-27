/** 账号那几件（Umbra 账号，云端身份；`account.ts`）。
 *
 *  **只对 HTTP 暴露**（`faces: ["http"]`，同 `design.ts` / `plugins.ts` 那两处先例）：登录状态是这台机器上
 *  用户自己的事，不该经 MCP 给外部模型客户端看；**令牌本身哪一面都不回**。
 *  全是 `scope: "global"`：设置页在首页（hub）也要能开，首页没有项目上下文。
 */
import { platformName } from "../shared/brand.js";
import { z } from "zod";
import { envelope } from "../envelope.js";
import { account, LoginFail } from "../account.js";
import { defineCap } from "./registry.js";

const err = (code: string, message: string) =>
  ({ level: "error", code, message, where: "(account)", at: { kind: "key", name: "account" } }) as never;

defineCap({
  name: "account", title: "账号状态", scope: "global",
  summary: `登没登 ${platformName}账号、是谁、服务端地址、有没有一场登录正在等浏览器。不回令牌。`,
  input: {},
  faces: ["http"],
  http: { route: "account", method: "GET" },
  run: async () => envelope(await account.status()),
});

defineCap({
  name: "account_check", title: "核一次账号还认不认", scope: "global",
  summary: `拿存着的令牌问 ${platformName}服务端我是谁；401 就用刷新令牌续一次，还不行就清掉本机的登录。`,
  input: {},
  faces: ["http"],
  http: { route: "account_check", method: "GET" },
  run: async () => envelope(await account.check()),
});

/* ⚠️ `account_login`（开浏览器那条）2026-10-27 随 OIDC 退场 —— 账号中心对接说明 §三 3 点名的一样。
   登录只剩 `account_login_password`（邮箱 + 密码），线上 10-19 起本来就只有这一条。 */

defineCap({
  name: "account_login_password", title: "用邮箱密码登录", scope: "global",
  summary: "服务端是 local 时（接了账号中心之后就是这一种）用邮箱 + 密码登录；密码只用这一次、不落盘，令牌不回。",
  input: {
    email: z.string().describe("邮箱"),
    password: z.string().describe("密码"),
    serverUrl: z.string().optional().describe(`这一次用哪台 ${platformName}服务端；不给用存着的`),
  },
  faces: ["http"],
  http: { route: "account_login_password", method: "POST" },
  run: async ({ email, password, serverUrl }) => {
    try {
      return envelope(await account.loginPassword(email, password, serverUrl));
    } catch (e) {
      // stats.fail / stats.wait：设置页按它画哪一档错误条（批次 270 §一）；message 是第一段的原话。
      const f = e instanceof LoginFail ? { fail: e.kind, wait: e.wait } : { fail: "other", wait: 0 };
      return envelope(await account.status(), [err("E_ACCOUNT_LOGIN", (e as Error).message)], f);
    }
  },
});

defineCap({
  name: "account_forgot", title: "忘了密码：发重置信", scope: "global",
  summary: `服务端是 local 时，请 ${platformName}服务端给这个邮箱发重置信（POST /auth/forgot）。不管邮箱有没有账号都回同一个结果。`,
  input: {
    email: z.string().describe("登录用的邮箱"),
    serverUrl: z.string().optional().describe(`这一次用哪台 ${platformName}服务端；不给用存着的`),
  },
  faces: ["http"],
  http: { route: "account_forgot", method: "POST" },
  run: async ({ email, serverUrl }) => {
    try {
      await account.forgotPassword(email, serverUrl);
      return envelope({ sent: true });
    } catch (e) {
      const f = e instanceof LoginFail ? { fail: e.kind, wait: 0 } : { fail: "other", wait: 0 };
      return envelope({ sent: false }, [err("E_ACCOUNT_FORGOT", (e as Error).message)], f);
    }
  },
});

defineCap({
  name: "account_password", title: "改密码", scope: "global",
  summary: `改 ${platformName}账号的密码（POST /auth/password）。改完其他设备全部下线、这一台保留；回执说下线了几台。两个密码都不落盘。`,
  input: {
    current: z.string().describe("当前密码"),
    password: z.string().describe("新密码"),
  },
  faces: ["http"],
  http: { route: "account_password", method: "POST" },
  run: async ({ current, password }) => {
    try {
      const { loggedOut } = await account.changePassword(current, password);
      return envelope({ changed: true, loggedOut });
    } catch (e) {
      /* `field` 要带出去：设置页把话画在那一格底下。
         ⚠️ 当前密码不对是 400 `invalid_field`，**不是登录失效** —— 这里一个字都不碰登录状态。 */
      const f = e instanceof LoginFail ? { fail: e.kind, wait: e.wait, field: e.field } : { fail: "other", wait: 0, field: "" };
      return envelope({ changed: false, loggedOut: 0 }, [err("E_ACCOUNT_PASSWORD", (e as Error).message)], f);
    }
  },
});

defineCap({
  name: "account_display_name", title: "改显示名", scope: "global",
  summary: `改 ${platformName}账号的显示名（PATCH /auth/me）。空串合法 —— 意思是不要显示名，界面退回显示邮箱。`,
  input: {
    displayName: z.string().describe("新的显示名；空串 = 不要显示名，界面退回显示邮箱"),
  },
  faces: ["http"],
  http: { route: "account_display_name", method: "POST" },
  run: async ({ displayName }) => {
    try {
      const user = await account.setDisplayName(displayName);
      return envelope({ saved: true, user });
    } catch (e) {
      const f = e instanceof LoginFail ? { fail: e.kind, wait: 0, field: e.field } : { fail: "other", wait: 0, field: "" };
      return envelope({ saved: false, user: null }, [err("E_ACCOUNT_DISPLAY_NAME", (e as Error).message)], f);
    }
  },
});

defineCap({
  name: "account_provider", title: "这台服务端怎么登录", scope: "global",
  summary: `问 ${platformName}服务端的 /auth/config：oidc（打开浏览器）还是 local（邮箱密码）。问不到回 unknown。`,
  input: {},
  faces: ["http"],
  http: { route: "account_provider", method: "GET" },
  run: async () => envelope({ provider: await account.probeProvider() }),
});

defineCap({
  name: "account_storage", title: "存储容量（只看）", scope: "global",
  summary: `这个账号在 ${platformName}服务端上存了多少、上限多少、到哪一档（草案 §十一）。Studio 不往服务端传东西，只给账号块画一行；清理与管理在 PC / iOS 的账号页。没登录 / 老服务端回 null。`,
  input: {},
  faces: ["http"],
  http: { route: "account_storage", method: "GET" },
  run: async () => envelope({ storage: await account.storage() }),
});

defineCap({
  name: "account_logout", title: "登出", scope: "global",
  summary: "告诉服务端吊销这一条会话并清掉本机的令牌；服务端叫不动也清本机。",
  input: {},
  faces: ["http"],
  http: { route: "account_logout", method: "POST" },
  run: async () => envelope(await account.logout()),
});

defineCap({
  name: "account_server_ai", title: `通道 A 切到 / 切回 ${platformName}服务端 AI`, scope: "global",
  summary: "开：通道 A 的端点与密钥换成「账号那一层连的服务端 + 登录令牌」，服务端按积分扣；关：回到自填端点。要先登录。",
  input: { on: z.boolean().describe("true 开、false 关") },
  faces: ["http"],
  http: { route: "account_server_ai", method: "POST" },
  run: async ({ on }) => {
    try {
      return envelope(await account.setServerAi(on));
    } catch (e) {
      return envelope(await account.status(), [err("E_ACCOUNT_LOGIN", (e as Error).message)]);
    }
  },
});

defineCap({
  name: "account_server", title: `换 ${platformName}服务端地址`, scope: "global",
  summary: `改账号那一层连哪台 ${platformName}服务端。换了地址等于登出：令牌是上一台的。`,
  input: { serverUrl: z.string().describe("http(s)://主机[:端口]，不带路径") },
  faces: ["http"],
  http: { route: "account_server", method: "POST" },
  run: async ({ serverUrl }) => {
    try {
      return envelope(await account.setServer(serverUrl));
    } catch (e) {
      return envelope(await account.status(), [err("E_BAD_INPUT", (e as Error).message)]);
    }
  },
});
