/** 本机桥接：让声明过 `permissions.local` 的插件和本机开着的另一个程序通信。
 *
 *  完整契约在 `doc/S8-本机桥接宿主能力（SketchUp）-接口契约.md`（跨仓，插件侧与 Ruby 扩展照它写）。
 *  这里只写宿主这一半：握手文件核查 → 连接池 → 帧编解码 → 超时。
 *
 *  ## 三条决定了形状的原则
 *
 *  **① 插件永远拿不到端口和令牌。** 握手文件只有这个模块读；插件在调用里只说一个 `endpoint` 名字。
 *  > 令牌一旦进了插件的地址空间，「不打印、不落日志」就只是它的自觉。
 *
 *  **② 不给插件 session 句柄，只有一次次的调用。** 连接由这里持（懒连、闲置关）。
 *  B 面沙箱会被 `PluginSandbox.retire` 换池（改设置时）、会撞 `deadlineMs`、会崩；
 *  A 面 iframe 切页签就拆。
 *  > **插件手上的句柄会活得比它的持有者久。**
 *
 *  **③ 只连 `127.0.0.1`。** 地址写死在这里，清单里给 `host` / `port` 的插件**装不上**
 *  （schema 里那两个字段是 `false`，和 `exec` 同一个办法）。
 */
import { createConnection, type Socket } from "node:net";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { X } from "../codes.js";

/** 单帧上限。**另立一个数，不借 `binaryReadMax`** ——
 *  B 面拿到回包要整串 `JSON.parse`，而回包里一个非拉丁字符就让 QuickJS 按 UTF-16 存、
 *  内存翻倍（PLUGIN-SPEC §三 末尾那条）。**对端一帧就能把解释器打爆。** */
export const FRAME_MAX = 8 * 1024 * 1024;
/** 一次调用的默认超时与硬顶。B 面那一侧还有沙箱自己的 `deadlineMs` 管整次调用，两者各管一段。 */
export const CALL_DEFAULT_MS = 15_000;
export const CALL_MAX_MS = 30_000;
/** 闲置这么久就把连接关掉 —— 不长期占着到 SketchUp 的一条 socket。 */
const IDLE_MS = 60_000;

/** 七种拒的码。**正本在 `codes.ts` 的 `X`** —— 这里只是取个短名字用，
 *  不另写一份字面量（两份字面量迟早有一份漂掉，而漂掉的那一份不会报错）。 */
export const LOCAL_CODES = {
  NOT_DECLARED: X.LOCAL_NOT_DECLARED,
  NOT_GRANTED: X.LOCAL_NOT_GRANTED,
  NOT_PAIRED: X.LOCAL_NOT_PAIRED,
  TIMEOUT: X.LOCAL_TIMEOUT,
  DISCONNECTED: X.LOCAL_DISCONNECTED,
  FRAME_TOO_BIG: X.LOCAL_FRAME_TOO_BIG,
  REMOTE: X.LOCAL_REMOTE,
} as const;

/** 握手文件里该有的几样。⚠️ `token` **不出现在任何回给插件的东西里**。 */
export interface Handshake {
  app: string;
  version?: string;
  pid?: number;
  port: number;
  token: string;
  startedAt?: string;
}

/** 握手文件的目录。**中立位置，不是 Studio 的 STATE_ROOT**（geek-99 2026-10-30 定）。
 *
 *  理由两条：① Ruby 那边不用去推算 Studio 的 userData —— 那个路径和身份名 / `CFBundleName`
 *  绑着，而那个名字还会动（2026-10-24 刚因为它炸过：Electron 按 `CFBundleName` 拼 helper
 *  路径，改名之后每个包都起不来）；② 以后 PC 想连同一个 SketchUp，可以共用这一份。
 *
 *  ⚠️ 测试用 `UMBRA_LOCAL_DIR` 换掉 —— 判据不碰用户真实的那个目录。 */
export function localDir(): string {
  const over = process.env.UMBRA_LOCAL_DIR;
  if (over) return over;
  if (platform() === "win32") {
    const appdata = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appdata, "Umbra", "local");
  }
  return join(homedir(), "Library", "Application Support", "Umbra", "local");
}

/** 读握手文件并核四条。回 `{ hs }` 或 `{ why }` —— **`why` 是一句给人看的话**，
 *  因为它会一路走到插件、再被插件转述给用户。
 *
 *  ⚠️⚠️ **后两条（属主、权限位）只在 POSIX 上核。** Node 在 Windows 上 `uid` 报 0、
 *  `mode` 报 `0666` —— 照 POSIX 那样核的话 **Windows 上永远配不上对**，
 *  而这台开发机是 mac，**这个缺陷在这里恰好不出现**。
 *  > `doc/00` §119 那一族（硬编码 `"/"` 的三处「在 mac 上恰好正确」）。
 *  > **一条只在另一个平台上才错的判准，要在写它的那一刻就标出来。** */
export function readHandshake(endpoint: string): { hs: Handshake } | { why: string } {
  const f = join(localDir(), `${endpoint}.json`);
  let st;
  try { st = lstatSync(f); } catch { return { why: `${endpoint} 没在跑（找不到握手文件 ${f}）` }; }
  /* ① 不是符号链接。先 `lstat` 再 `stat`：顺序反了就看不到链接本身 */
  if (st.isSymbolicLink()) return { why: `握手文件是一条符号链接，不认（${f}）` };
  if (!st.isFile()) return { why: `握手文件不是一个普通文件（${f}）` };
  if (platform() !== "win32") {
    /* ② 属于当前用户 */
    const me = typeof process.getuid === "function" ? process.getuid() : -1;
    if (me >= 0 && st.uid !== me) return { why: `握手文件不属于当前用户（${f}）` };
    /* ③ 不是 group / other 可读 */
    if ((st.mode & 0o077) !== 0) return { why: `握手文件的权限太松（要 0600，现在是 ${(st.mode & 0o777).toString(8)}）` };
  }
  /* ④ 形状对 */
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(f, "utf8")); } catch (e) { return { why: `握手文件不是合法 JSON：${(e as Error).message}` }; }
  const d = raw as Partial<Handshake>;
  if (typeof d?.app !== "string" || !d.app) return { why: "握手文件里没有 app" };
  if (typeof d.token !== "string" || !d.token) return { why: "握手文件里没有 token" };
  if (!Number.isInteger(d.port) || (d.port as number) < 1 || (d.port as number) > 65535) {
    return { why: `握手文件里的 port 不合法（${String(d.port)}）` };
  }
  void statSync;   // 留着：以后要跟符号链接核真实属主时用这一条
  return { hs: d as Handshake };
}

/** 版本的主版本号。认不出回 `null`（那就不拿它当身份的一部分）。 */
export function majorOf(version: string | undefined): string | null {
  const m = /^(\d+)/.exec(String(version ?? "").trim());
  return m ? m[1]! : null;
}

/* ──────────────────────── 帧编解码 ──────────────────────── */

/** 一帧 = 4 字节**大端**长度前缀 + UTF-8 的 JSON 体（照 zinin/sketchup-mcp2，MIT；PC §1.1 核过协议）。 */
export function encodeFrame(obj: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  if (body.length > FRAME_MAX) throw new FrameTooBig(`要发的这一帧 ${body.length} 字节，超过上限 ${FRAME_MAX}`);
  const head = Buffer.allocUnsafe(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

export class FrameTooBig extends Error {}

/** 攒字节、切出完整帧。**一帧跨两个 TCP 包、两帧挤在一个包里**都要对 ——
 *  TCP 是字节流，没有「一次 `data` 就是一帧」这回事。 */
export class FrameReader {
  private buf: Buffer = Buffer.alloc(0);
  /** 回这一次攒出来的完整帧（可能 0 个，也可能好几个）。超限抛 `FrameTooBig`。 */
  push(chunk: Buffer): unknown[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out: unknown[] = [];
    for (;;) {
      if (this.buf.length < 4) return out;
      const len = this.buf.readUInt32BE(0);
      /* ⚠️ **长度先判上限再等字节** —— 不然对端报一个 4 GB 的长度，我们会一直攒到内存炸 */
      if (len > FRAME_MAX) throw new FrameTooBig(`对端报的帧长 ${len} 字节，超过上限 ${FRAME_MAX}`);
      if (this.buf.length < 4 + len) return out;
      const body = this.buf.subarray(4, 4 + len);
      this.buf = this.buf.subarray(4 + len);
      try { out.push(JSON.parse(body.toString("utf8"))); }
      catch (e) { throw new Error(`对端发来的不是合法 JSON：${(e as Error).message}`); }
    }
  }
}

/* ──────────────────────── 连接池 ──────────────────────── */

interface Conn {
  sock: Socket;
  reader: FrameReader;
  /** id → 等这一帧的人 */
  waiting: Map<number, { ok: (v: unknown) => void; bad: (e: Error) => void }>;
  nextId: number;
  idle: NodeJS.Timeout | null;
  /** 握手文件的身份（`app` + 主版本）—— 换了就不复用这条连接 */
  ident: string;
}

export class LocalError extends Error {
  constructor(readonly code: string, message: string, readonly fix?: string) { super(message); }
}

/** 一个端点一条连接。键是 `endpoint`（不含插件 id）——
 *  ⚠️ **授权是按 `(plugin, endpoint)` 核的，而连接按 `endpoint` 共用**：
 *  两个都授权过的插件连的是同一个 SketchUp，没有理由开两条 socket。
 *  核授权在 `host.ts` 那一层（进这里之前），所以共用连接不等于共享授权。 */
const pool = new Map<string, Conn>();

function identOf(hs: Handshake): string { return `${hs.app}@${majorOf(hs.version) ?? "?"}`; }

function drop(endpoint: string, why: Error): void {
  const c = pool.get(endpoint);
  if (!c) return;
  pool.delete(endpoint);
  if (c.idle) clearTimeout(c.idle);
  for (const w of c.waiting.values()) w.bad(why);
  c.waiting.clear();
  c.sock.destroy();
}

function touch(endpoint: string, c: Conn): void {
  if (c.idle) clearTimeout(c.idle);
  c.idle = setTimeout(() => drop(endpoint, new LocalError(LOCAL_CODES.DISCONNECTED, "闲置太久，已经断开")), IDLE_MS);
  c.idle.unref?.();
}

/** 连上并握手。**`hello` 这一帧带令牌，之后每帧都不带。**
 *
 *  ⚠️ 这是对 PC §1.2「每个请求都要带令牌」的一处**收紧而不是放松**：
 *  > **一个秘密出现的次数越多，它被记下来的机会就越多。**
 *  一条 socket 是一次 accept 的单一流，认一次等价；而每帧都带，令牌就会出现在
 *  对端每一条调试日志、每一次崩溃转储里。
 *  ⚠️ **扩展侧的契约**：`hello` 这一帧不许进日志（写在 S8 §六）。 */
async function connect(endpoint: string, hs: Handshake): Promise<Conn> {
  const sock = await new Promise<Socket>((res, rej) => {
    /* ⚠️ **地址写死 `127.0.0.1`** —— 不从握手文件读，不从清单读。
       握手文件是对端自己写的，让它决定连哪里等于把这道闸交给对端。 */
    const s = createConnection({ host: "127.0.0.1", port: hs.port });
    const onErr = (e: Error) => { s.destroy(); rej(new LocalError(LOCAL_CODES.NOT_PAIRED, `连不上 127.0.0.1:${hs.port}：${e.message}`)); };
    s.once("error", onErr);
    s.once("connect", () => { s.off("error", onErr); res(s); });
  });
  const c: Conn = { sock, reader: new FrameReader(), waiting: new Map(), nextId: 1, idle: null, ident: identOf(hs) };
  sock.on("data", (chunk: Buffer) => {
    let frames: unknown[];
    try { frames = c.reader.push(chunk); }
    catch (e) {
      /* 帧超限 / 不是 JSON：**流已经不知道走到哪了，关掉** */
      drop(endpoint, e instanceof FrameTooBig
        ? new LocalError(LOCAL_CODES.FRAME_TOO_BIG, e.message)
        : new LocalError(LOCAL_CODES.DISCONNECTED, (e as Error).message));
      return;
    }
    for (const f of frames) {
      const r = f as { id?: unknown; result?: unknown; error?: { code?: unknown; message?: unknown } };
      const w = typeof r.id === "number" ? c.waiting.get(r.id) : undefined;
      if (!w) continue;          // 迟到的响应：等它的人早走了，丢掉
      c.waiting.delete(r.id as number);
      if (r.error) {
        w.bad(new LocalError(LOCAL_CODES.REMOTE,
          `对端回了错误（${String(r.error.code ?? "?")}）：${String(r.error.message ?? "")}`));
      } else w.ok(r.result);
    }
  });
  sock.on("close", () => drop(endpoint, new LocalError(LOCAL_CODES.DISCONNECTED, "连接断了")));
  sock.on("error", (e) => drop(endpoint, new LocalError(LOCAL_CODES.DISCONNECTED, `连接出错：${e.message}`)));
  pool.set(endpoint, c);
  touch(endpoint, c);
  /* 握手：令牌不对对端会回 error 并断开 */
  try {
    await send(endpoint, c, "hello", { token: hs.token }, 5_000);
  } catch (e) {
    drop(endpoint, e as Error);
    /* ⚠️ **拒因不带令牌，也不带对端那句原话里可能夹的令牌** —— 只说「口令不对」 */
    throw new LocalError(LOCAL_CODES.NOT_PAIRED, `${endpoint} 不认这个口令（握手被拒）`,
      "多半是 SketchUp 重启过而握手文件没更新 —— 把它关掉重开一次");
  }
  return c;
}

/** 发一帧、等它的响应。超时就**把连接关掉** ——
 *  > 超时意味着**我们不知道流走到哪了**，下一帧可能是上一次那半截。 */
function send(endpoint: string, c: Conn, method: string, params: unknown, ms: number): Promise<unknown> {
  const id = c.nextId++;
  const frame = encodeFrame({ jsonrpc: "2.0", id, method, params: params ?? {} });
  return new Promise<unknown>((res, rej) => {
    const timer = setTimeout(() => {
      c.waiting.delete(id);
      drop(endpoint, new LocalError(LOCAL_CODES.TIMEOUT, `等了 ${ms} ms 没回来`));
      rej(new LocalError(LOCAL_CODES.TIMEOUT, `${method} 等了 ${ms} ms 没回来`, "把 SketchUp 切到前台看看它是不是卡着"));
    }, ms);
    timer.unref?.();
    c.waiting.set(id, {
      ok: (v) => { clearTimeout(timer); touch(endpoint, c); res(v); },
      bad: (e) => { clearTimeout(timer); rej(e); },
    });
    c.sock.write(frame, (e) => { if (e) { clearTimeout(timer); c.waiting.delete(id); rej(new LocalError(LOCAL_CODES.DISCONNECTED, `发不出去：${e.message}`)); } });
  });
}

/** 这个端点现在什么状况。**不会去连** —— 只读握手文件。 */
export function localStatus(endpoint: string): { paired: boolean; connected: boolean; app?: string; version?: string; why?: string } {
  const r = readHandshake(endpoint);
  if ("why" in r) return { paired: false, connected: false, why: r.why };
  return { paired: true, connected: pool.has(endpoint), app: r.hs.app, version: r.hs.version };
}

/** 往端点发一次 JSON-RPC。抛 `LocalError`（`host.ts` 翻成信封）。 */
export async function localCall(endpoint: string, method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
  const r = readHandshake(endpoint);
  if ("why" in r) throw new LocalError(LOCAL_CODES.NOT_PAIRED, r.why, "把那个程序打开，它会自己写好握手文件");
  const ms = Math.min(Math.max(1, timeoutMs ?? CALL_DEFAULT_MS), CALL_MAX_MS);
  let c = pool.get(endpoint);
  /* ⚠️ **身份变了就换连接**：SketchUp 重启之后端口和令牌都是新的，
     而池子里那条还连着已经不在的端口。按 `app@主版本` 比，不按端口比 ——
     端口每次都变，拿它当身份只会每次都重连。 */
  if (c && c.ident !== identOf(r.hs)) { drop(endpoint, new LocalError(LOCAL_CODES.DISCONNECTED, "对端换了版本")); c = undefined; }
  if (!c) c = await connect(endpoint, r.hs);
  return await send(endpoint, c, method, params, ms);
}

/** 把所有连接关掉。**给回归收尾用** —— 不关的话判据跑完留着连接，进程不退。 */
export function closeAllLocal(): void {
  for (const k of [...pool.keys()]) drop(k, new LocalError(LOCAL_CODES.DISCONNECTED, "收尾关闭"));
}
