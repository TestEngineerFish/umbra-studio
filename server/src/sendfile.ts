/** 把一个文件发出去 —— **三台静态服务共用这一份**（issue #96，2026-10-06）。
 *
 *  原来三处都是同一行：
 *  ```ts
 *  reply.writeHead(200, head);
 *  createReadStream(abs).pipe(reply);
 *  ```
 *  而 `existsSync` + `!statSync().isDirectory()` 只证明「路径在、不是目录」，
 *  **不证明「打得开」**。`createReadStream` 是**异步**打开文件的，打不开时在流上
 *  emit `'error'`；`.pipe()` **不会**把源流的 error 转给目标，也不会替它挂监听 ——
 *  没人监听的 `'error'` 按 EventEmitter 的规则直接 throw → `uncaughtException`
 *  → **整个进程退出**（全仓没有 `uncaughtException` 处理）。
 *
 *  盘上随手就有这种状态：没有读权限的文件（`chmod 000`、docker / sudo 产生的 root 属主文件）
 *  → `EACCES` · 符号链接指到一个 unix socket → `ENXIO` ·
 *  `existsSync` 和 `open` 之间文件被别的编辑器删掉 → `ENOENT`。
 *  而对体检那台：稿里只要有 `<img src="那个文件">`，**每一次 `render_check` 都会去请求它**。
 *
 *  ⚠️ **#43 / #85 加的 `try { … } catch` 兜不住这一种** ——
 *  它发生在回调返回之后的下一轮事件循环里，不在 try 的同步范围内。
 *  **「整体包一层」这个修法让这一类缺陷看起来已经被覆盖了**，这是它最坏的地方。
 *
 *  所以这里做三件事：
 *  ① 响应头挪到 `'open'` **之后** —— 失败时才回得出 404/403，而不是先给了 200；
 *  ② `'error'` 有人听；
 *  ③ 客户端中途断开时回收 fd（`reply` 的 `close`）。
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, normalize, resolve } from "node:path";
import { isInsideReal } from "./pathguard.js";

/** 这个路径能不能当文件发出去。**四个出口只认这一个判定**（issue #104，2026-10-06）。
 *
 *  ⚠️ #96 把 `!isDirectory()` 换成 `isFile()` 的时候**只换到两处** ——
 *  而同一个文件里还有两条路由没跟着换（`routeStatic` 末尾那条是「最常走的」，
 *  `/__preview/` 那条更重：它用的是 `readFileSync`，**直接卡死主线程**，
 *  而且那条路由**不要令牌**，只要那个 FIFO 叫 `x.html`）。
 *  **修复说明写的是「三处都换上」，而实现只有两处** —— 这就是「清单式修法」的代价。
 *
 *  为什么是 `isFile()` 而不是 `!isDirectory()`：FIFO / socket / 块设备都「不是目录」，
 *  而 `open` 一个 FIFO 会**一直阻塞**（不是报错）——
 *  异步那条每请求一次占掉一个 libuv 线程（默认 4 个），四次之后同进程所有 fs 都排不上队；
 *  同步那条一次就够。
 *
 *  ⚠️ **抽成函数就是为了不再有「第五处」** —— 加新出口时用它，不要再各写一份判定。 */
export function isServable(abs: string): boolean {
  try { return existsSync(abs) && statSync(abs).isFile(); }
  catch { return false; }   // 权限不够、路径坏了 —— 都算「发不出去」，不要抛
}

export function sendFile(reply: ServerResponse, abs: string, head: Record<string, string>): void {
  const s = createReadStream(abs);
  s.once("open", () => {
    reply.writeHead(200, head);
    s.pipe(reply);
  });
  s.once("error", (e) => {
    const code = (e as NodeJS.ErrnoException).code;
    if (!reply.headersSent) {
      reply.writeHead(code === "ENOENT" ? 404 : 403, { "content-type": "text/plain; charset=utf-8" });
      reply.end(code === "ENOENT" ? "404" : "403 这个文件打不开");
    } else {
      reply.destroy();
    }
  });
  /* ⚠️ 客户端断开时要主动 `destroy()` 流 —— 不然 fd 留着。
     预览里图片多、用户快速切稿时这种断开是常态。 */
  reply.once("close", () => s.destroy());
}

/* ═══ 一台最小的本地静态服务（2026-10-23 从 `render.ts` 搬过来）═══
   ⚠️ 搬它的理由和 `browser.ts` 那段一样：`render.ts` 随 C3 删了，
   **而这一件和设计稿无关** —— `apitest` 用它起一台服务打畸形请求，
   钉的正是本文件头注那条（issue #96：`.pipe()` 上没人听 `'error'` → 整个进程退出）。
   > 判据要钉住的那条缺陷，和承载它的那个功能，可以不在同一个模块里。
   放这儿而不是另起一个文件：它和 `sendFile` 是同一件事的两半
   （一台静态服务 + 它怎么把文件发出去），而本文件的头注已经写着「三台静态服务共用」。 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ttf": "font/ttf", ".map": "application/json; charset=utf-8",
};

/** 起一台只读的本地静态服务。**导出主要是给回归用**（issue #85 要能起一台来打畸形请求）。 */
export function startStatic(rootDir: string): Promise<{ server: Server; port: number }> {
  return new Promise((res, rej) => {
    const server = createServer((req, reply) => {
      /* ⚠️ **整个回调包一层**（issue #85，2026-10-06）。和 #43 **同一族** ——
         #43 修的是 `serve.ts` 那一支（`routeStatic` 整体包了 try/catch，
         注释里写着「全仓没有 `uncaughtException` 处理」），
         **而 render.ts 自己这台静态服务没跟着修**。

         `decodeURIComponent` 遇到不成对的 `%`（`/a%zz.png`）抛 `URIError`，
         同步冒出 `createServer` 的回调 → uncaughtException → **整个进程退出**。
         而稿里出现 `<img src="a%zz.png">` 太容易了（手误 / 从别处粘的 URL /
         被提示注入的 AI 写进去），浏览器对不成对的 `%` **原样发出**。
         `render_check` 是每批收尾都要调的（纪律⑤），于是「体检一次，服务没了」。

         ⚠️ **一个专门用来检测崩溃的工具，自己会被一个畸形地址带走** ——
         和这个函数上面那段注释说的是同一件事（它自己会在卡死面前死锁）。 */
      try {
        let raw: string;
        try { raw = decodeURIComponent((req.url ?? "/").split("?")[0] as string); }
        catch { reply.writeHead(400, { "content-type": "text/plain; charset=utf-8" }); reply.end("400 地址里的 % 编码不合法"); return; }
        const abs = resolve(rootDir, "." + normalize(raw));
        /* `isInside` 而不是 `startsWith`（#19 那一族）—— 这里因为前面
           `normalize("/..")` 会钳到根，目前逃不出去，但**判定写法要统一**，
           免得下一个人把它当样板抄走。 */
        /* ⚠️ `isFile()` 而不是 `!isDirectory()`（issue #96）—— 见 `sendfile.ts` 的头注。 */
        if (!isInsideReal(rootDir, abs) || !existsSync(abs) || !statSync(abs).isFile()) {   // #140
          reply.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          reply.end("404");
          return;
        }
        /* ⚠️ 走共用的 `sendFile`（issue #96）—— 上面那层 `try` **兜不住读流的
           异步 `'error'`**，而「整体包一层」会让人以为已经兜住了。 */
        sendFile(reply, abs, {
          "content-type": MIME[extname(abs).toLowerCase()] ?? "application/octet-stream",
          "cache-control": "no-store",
        });
      } catch {
        if (!reply.headersSent) reply.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        reply.end("400");
      }
    });
    server.on("error", rej);
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      if (a && typeof a === "object") res({ server, port: a.port });
      else rej(new Error("静态服务起不来"));
    });
  });
}
