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
  name: "account_logout", title: "登出", scope: "global",
  summary: "告诉服务端吊销这一条会话并清掉本机的令牌；服务端叫不动也清本机。",
  input: {},
  faces: ["http"],
  http: { route: "account_logout", method: "POST" },
  run: async () => envelope(await account.logout()),
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
