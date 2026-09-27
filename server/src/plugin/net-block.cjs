/** 插件进程里的**网络封堵桩**（issue #24，2026-09-27）。
 *
 *  ⚠️ **为什么需要它：Node 的权限模型不拦网络。**
 *  `sandbox.ts` 原来的注释写着「（不给 --allow-net）不许联网」——
 *  那一行是错的。实测（node 24.11 与 Electron 44 自带的 24.21 都一样）：
 *
 *  ```
 *  node --permission --allow-fs-read=… nettest.cjs
 *  permission.has(net) = false           ← 只表示「不认识这个作用域」
 *  connect 结果: ECONNREFUSED            ← 连接真的发出去了
 *  ```
 *
 *  `ERR_ACCESS_DENIED` 才叫被拦住；`ECONNREFUSED` 是对方拒绝，说明包出去了。
 *  **「permission.has 返回 false」和「拦住了」是两件事** ——
 *  和 §100.2 那条「有签名 ≠ 签名验得过」同一族。
 *
 *  为什么这件事严重：插件能合法 `host.call("read_file")` 读到项目文件，
 *  然后自己 `fetch` 发到任何地址；而清单里写的 `net: []` 装的时候
 *  是摆给用户看的 —— 那句「不许联网」目前是假的。
 *  更糟的一环（实测确证）：本机任何进程不带令牌 `GET /__app/`
 *  就能从页面里捡到真令牌，拿着它调 `/__ud/*` 的全部能力，
 *  `host.ts` 的白名单被整体绕过。所以「能不能发出第一个包」是这条链的第一环。
 *
 *  ⚠️ **这是防呆，不是安全边界。** 桩和插件在同一个进程里，
 *  它够刁钻就能绕（`process.binding`、内部模块、原生插件）。真边界要么是
 *  权限模型真能拦网络，要么把插件挪到别的进程/容器里。
 *  **等到 `probe` 实测能量到 `ERR_ACCESS_DENIED` 那一天，再删掉这个文件。**
 *  在那之前别把注释写成「关住了」—— 我们已经因为一句这样的注释漏过一件。
 */
"use strict";

const deny = (what) => () => {
  const e = new Error(`插件不许联网（清单里 net: [] 就是这个意思）：${what}`);
  e.code = "ERR_ACCESS_DENIED";
  throw e;
};

/** 设成不可写不可配置。
 *  ⚠️ 不用 `Object.freeze(整个模块)` —— `http` 内部要拿 `net.Socket` 来用，
 *  整块冻上会让 Node 自己的代码在赋值时炸，症状是「插件一起就崩」，
 *  比漏一个 API 更难查。 */
const hard = (obj, key, value) => {
  try { Object.defineProperty(obj, key, { value, writable: false, configurable: false, enumerable: true }); }
  catch { try { obj[key] = value; } catch { /* 拦不住这一个，别把整个预加载带崩 */ } }
};

/* ── 传输层 ── */
const net = require("node:net");
hard(net, "connect", deny("net.connect"));
hard(net, "createConnection", deny("net.createConnection"));
hard(net.Socket.prototype, "connect", deny("net.Socket#connect"));

const tls = require("node:tls");
hard(tls, "connect", deny("tls.connect"));

const dgram = require("node:dgram");
hard(dgram, "createSocket", deny("dgram.createSocket"));

/* ── 应用层：http/https/http2 自己会走 net，但它们也可能被换实现，所以各拦一道 ── */
for (const [mod, name] of [[require("node:http"), "http"], [require("node:https"), "https"]]) {
  hard(mod, "request", deny(`${name}.request`));
  hard(mod, "get", deny(`${name}.get`));
}
hard(require("node:http2"), "connect", deny("http2.connect"));

/* ── 全局（undici / WHATWG 那一套）── */
for (const k of ["fetch", "WebSocket", "EventSource"]) {
  if (k in globalThis) hard(globalThis, k, deny(`globalThis.${k}`));
}

/* ── 监听也一起封 ──
   插件开一个本机端口等别人来连，同样是一条出口（而且更难看见）。 */
hard(net.Server.prototype, "listen", deny("net.Server#listen"));
