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
import type { ServerResponse } from "node:http";

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
