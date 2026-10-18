/** 账号那几件（Umbra 账号，云端身份；`account.ts`）。
 *
 *  **只对 HTTP 暴露**（`faces: ["http"]`，同 `design.ts` / `plugins.ts` 那两处先例）：登录状态是这台机器上
 *  用户自己的事，不该经 MCP 给外部模型客户端看；**令牌本身哪一面都不回**。
 *  全是 `scope: "global"`：设置页在首页（hub）也要能开，首页没有项目上下文。
 */
import { z } from "zod";
import { envelope } from "../envelope.js";
import { account } from "../account.js";
import { defineCap } from "./registry.js";

const err = (code: string, message: string) =>
  ({ level: "error", code, message, where: "(account)", at: { kind: "key", name: "account" } }) as never;

defineCap({
  name: "account", title: "账号状态", scope: "global",
  summary: "登没登 Umbra 账号、是谁、服务端地址、有没有一场登录正在等浏览器。不回令牌。",
  input: {},
  faces: ["http"],
  http: { route: "account", method: "GET" },
  run: async () => envelope(await account.status()),
});

defineCap({
  name: "account_check", title: "核一次账号还认不认", scope: "global",
  summary: "拿存着的令牌问 Umbra 服务端我是谁；401 就用刷新令牌续一次，还不行就清掉本机的登录。",
  input: {},
  faces: ["http"],
  http: { route: "account_check", method: "GET" },
  run: async () => envelope(await account.check()),
});

defineCap({
  name: "account_login", title: "开始登录（开浏览器）", scope: "global",
  summary: "问服务端怎么登录，是 OIDC 就起回环端口、回授权地址；前端拿地址开系统浏览器，然后轮询 account 看结果。",
  input: { serverUrl: z.string().optional().describe("这一次用哪台 Umbra 服务端；不给用存着的") },
  faces: ["http"],
  http: { route: "account_login", method: "POST" },
  run: async ({ serverUrl }) => {
    try {
      return envelope(await account.loginStart(serverUrl));
    } catch (e) {
      return envelope({ url: "" }, [err("E_ACCOUNT_LOGIN", (e as Error).message)]);
    }
  },
});

defineCap({
  name: "account_login_password", title: "用邮箱密码登录", scope: "global",
  summary: "服务端是 local 时（接了账号中心之后就是这一种）用邮箱 + 密码登录；密码只用这一次、不落盘，令牌不回。",
  input: {
    email: z.string().describe("邮箱"),
    password: z.string().describe("密码"),
    serverUrl: z.string().optional().describe("这一次用哪台 Umbra 服务端；不给用存着的"),
  },
  faces: ["http"],
  http: { route: "account_login_password", method: "POST" },
  run: async ({ email, password, serverUrl }) => {
    try {
      return envelope(await account.loginPassword(email, password, serverUrl));
    } catch (e) {
      return envelope(await account.status(), [err("E_ACCOUNT_LOGIN", (e as Error).message)]);
    }
  },
});

defineCap({
  name: "account_provider", title: "这台服务端怎么登录", scope: "global",
  summary: "问 Umbra 服务端的 /auth/config：oidc（打开浏览器）还是 local（邮箱密码）。问不到回 unknown。",
  input: {},
  faces: ["http"],
  http: { route: "account_provider", method: "GET" },
  run: async () => envelope({ provider: await account.probeProvider() }),
});

defineCap({
  name: "account_storage", title: "存储容量（只看）", scope: "global",
  summary: "这个账号在 Umbra 服务端上存了多少、上限多少、到哪一档（草案 §十一）。Studio 不往服务端传东西，只给账号块画一行；清理与管理在 PC / iOS 的账号页。没登录 / 老服务端回 null。",
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
  name: "account_server_ai", title: "通道 A 切到 / 切回 Umbra 服务端 AI", scope: "global",
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
  name: "account_server", title: "换 Umbra 服务端地址", scope: "global",
  summary: "改账号那一层连哪台 Umbra 服务端。换了地址等于登出：令牌是上一台的。",
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
