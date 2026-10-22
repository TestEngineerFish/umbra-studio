/** 前端 ⇄ 核心：只有 HTTP（/__ud/*）和 WS（/__ud/ws）两条路（doc/01 §4.9）。
 *  启动数据由核心在托管 /__app/ 时注进 window.__UD_APP（server/src/serve.ts）。 */
/** 托管本页的核心：属于某个项目（name/dir 有值）或是桌面壳的 hub（hub=true，只有全局路由） */
export interface Boot { url: string; token: string; name: string | null; title: string | null; dir: string | null; ws: string; front: "app" | "legacy"; hub?: boolean }
export interface ProjectHandle {
  url: string; token: string; ws: string; name: string; title: string; dir: string;
  /** 这个目录是**用户显式接管过的设计项目**吗（M14-4 B3）。
   *  `false` = 普通目录，我们一个字节都没往里写，`.dc.html` 的预览壳也不在。
   *  `undefined` = 这条路没报（老的调用点），**当「不知道」而不是当 false** ——
   *  当 false 会让所有现成项目都弹那条接管横条。 */
  designProject?: boolean;
  /** 这个目录解锁过编辑没有（M14-7 / Q70）。
   *  `false` = 只读预览：从「右键 → 打开方式」随手打开的目录，**两条写入口都会拒**。
   *  `undefined` = 这条路没报 —— 同上，当「不知道」而不是当 false，
   *  **当 false 会让所有现成项目都变成只读**，那比没有这道闸糟得多。 */
  editable?: boolean;
}
/** 一个项目在**这个窗口里**的全部东西（M15-1 S1，2026-10-22）。
 *
 *  ### 为什么把 `core` 和 `handle` 绑成一个对象
 *  现在这两个值是**独立的**：`core = useMemo(() => new Core(project.url, …), [project])`。
 *  单项目的时候它们不可能不一致 —— 因为**只有一个项目**。
 *  并存之后它们**可以不一致**，而那种不一致的症状是：
 *  > **改动落在另一个项目的文件上，而界面一句话都不说。**
 *  那正是 issue #20 那一条（`serveStart` 原来按项目名去重，命中之后原样返回
 *  **另一个项目**的服务：用户看到的、编辑的、让 AI 改的都是第一个项目的文件，
 *  而界面标题写的是第二个）。
 *
 *  绑成一个对象之后，「这个 `core` 是哪个项目的」和「这个 `handle` 是哪个项目的」
 *  **是同一个对象的两半** —— 拿错一半在类型上就拼不起来。
 *  **这是把一个会静默的 bug 变成编译错误。**
 *
 *  ⚠️ **S1 顺带把同一个项目的两个 `Core` 实例合成了一个**（`App.tsx` 和 `Workbench.tsx`
 *  原来各 `new` 一次）。**而这仍然是零行为变化**，理由要写下来：
 *  `Core` 只有三个 `readonly` 字符串 + 方法，**没有可变状态**；
 *  而 `events()` 是个**工厂** —— 每次调用开一条新的 WS，不复用。
 *  所以「两个实例合成一个」在外部不可观测：HTTP 请求照旧各自发，
 *  WS 连接数按 `events()` 的**调用次数**算，不按实例数算。
 *  > **判断「零变化」要看被合并的那个对象有没有状态，不是看测试绿不绿** ——
 *  > 要是 `Core` 持有连接或缓存，这一步就是一次真实的行为变化，
 *  > 而「全套回归不变」会变成一个**没测到那件事**的读数。
 *
 *  ### 为什么这件事必须先做
 *  `App.tsx` 现在挂着 `<Workbench key={project.dir} …>` —— **切项目时整个工作台重挂**。
 *  也就是说 `Workbench.tsx` 里那 **32 处 `project.dir`** 之所以今天不出错，
 *  **不是因为它们被小心写过**，是因为它们**每次只活在一个项目里**。
 *  > **「单项目」不是一个被写进代码里的假设，是一个被 `key=` 替我们维持住的不变量。**
 *  并存的全部意义是两个项目同时活着，所以那个 `key` 必须拿掉（S2）；
 *  而拿掉的那一刻那 32 处同时变成可疑点，**编译器一个都不会报**。
 *  所以 S1 先把那个不变量换成一个**编译器管得到的东西**，S2 才敢动 `key`。
 */
export interface ProjectEntry {
  /** 这个项目的身份与连接信息（`open_project` 的回执） */
  handle: ProjectHandle;
  /** 打它那台服务的客户端。**一个项目一个，窗口持有** —— 切项目不重建 */
  core: Core;
}

/** 信封里的一条诊断：`fix` 是给人看的改法，比 message 更可操作（doc/00 §二） */
export interface Err { code?: string; message: string; fix?: string; level?: string }
/** `stats`：能力自带的附加结果（如账号登录失败的分档 `{fail, wait}`） */
export interface Envelope<T = unknown> { ok: boolean; data?: T; errors?: Err[]; stats?: Record<string, unknown> }
export interface UdEvent { type: "hello" | "job" | "chat" | "write" | "fs" | "plugin"; projectDir: string | null; payload: unknown; at: string }

declare global { interface Window { __UD_APP?: Boot } }

export function boot(): Boot | null { return window.__UD_APP ?? null; }

export class Core {
  constructor(public readonly url: string, public readonly token: string, public readonly ws: string) {}
  static fromBoot(b: Boot): Core { return new Core(b.url, b.token, b.ws); }
  private u(route: string): string { return `${this.url.replace(/\/$/, "")}/__ud/${route}${route.includes("?") ? "&" : "?"}token=${encodeURIComponent(this.token)}`; }
  async get<T = unknown>(route: string): Promise<Envelope<T>> {
    const r = await fetch(this.u(route)); return r.json();
  }
  async post<T = unknown>(route: string, body: unknown): Promise<Envelope<T>> {
    const r = await fetch(this.u(route), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }); return r.json();
  }
  /** 事件流：断了 2s 后重连；返回停止函数 */
  events(onEvent: (e: UdEvent) => void, onState?: (s: "open" | "closed") => void): () => void {
    let ws: WebSocket | null = null; let stopped = false; let timer: number | null = null;
    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(`${this.ws}?token=${encodeURIComponent(this.token)}`);
      ws.onopen = () => onState?.("open");
      ws.onmessage = (m) => { try { onEvent(JSON.parse(String(m.data))); } catch { /* 坏行丢掉 */ } };
      ws.onclose = () => { onState?.("closed"); if (!stopped) timer = window.setTimeout(connect, 2000); };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); ws?.close(); };
  }
}
