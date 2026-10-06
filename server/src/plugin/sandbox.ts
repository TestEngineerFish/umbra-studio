import { fork, type ChildProcess } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "../project.js";
import { hostCall, type HostCtx } from "./host.js";
import type { PluginManifest } from "./manifest.js";

/** 工具面（B 面）的沙箱（M11-4，形状见 `doc/20` §三）。
 *
 *  **为什么是独立进程而不是 `vm` 模块。** Figma 踩过这个坑：他们最初用 Realms shim
 *  在同一个 JS VM 里造隔离，被反复逃逸 —— 沙箱内外用同一个引擎，
 *  攻击者只要让它把外面的对象和里面的对象搞混。
 *  **同 VM 隔离不是安全边界，只是防呆。** 真边界只有两种：进程隔离或不同的 VM。
 *
 *  我们用进程隔离 + **Node 24 的权限模型**（Electron 44 内置 Node 24.21，实测可用）：
 *
 *  ```
 *  --permission                 打开权限模型
 *  --allow-fs-read=<插件目录>    只读得到它自己的代码
 *  （不给 --allow-fs-write）     一个字节都写不了盘
 *  （不给 --allow-child-process）P1：不许起子进程
 *  --require net-block.cjs      不许联网 ← **不是权限模型给的**
 *  ```
 *
 *  ⚠️ **`--allow-net` 那一行原来是错的**（issue #24）：Node 24.x 的权限模型
 *  **不拦网络**，不给 `--allow-net` 毫无作用。实测 node 24.11 和 Electron 自带的
 *  24.21 都是 `ECONNREFUSED`（包发出去了），不是 `ERR_ACCESS_DENIED`。
 *  `process.permission.has("net") === false` 只说明「不认识这个作用域」。
 *  现在靠 `net-block.cjs` 这个同进程的桩顶着 —— 那是**防呆，不是边界**，
 *  理由和删除条件都写在那个文件里。
 *
 *  要读写项目文件就回调 `hostCall`，权限在**我们这边**核。
 */

/** ⚠️ macOS 上 `/tmp` 是指向 `/private/tmp` 的符号链接 ——
 *  `--allow-fs-read=/tmp/` 放行不了 `/private/tmp/` 下的东西，**连脚本自己都读不了**。
 *  放行路径一律 `realpath` 解过再给（实测踩过，`doc/20` §3.3）。 */
const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };

const RUNNER = join(fileURLToPath(new URL(".", import.meta.url)), "runner.js");
/** `server/` 根 —— `runner.js` 在 `<这里>/dist/plugin/` 下。
 *  打包后是 `…/Resources/core/server/`（`extraResources` 把 `node_modules` 原样拷进去）。 */
const SERVER_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
/** 网络封堵桩（issue #24）。**是 `.cjs`** —— `--require` 要 CJS，
 *  而这个包是 ESM。构建时由 `build` 脚本拷进 `dist/`（`tsc` 不搬非 TS 文件）。 */
const NET_BLOCK = join(fileURLToPath(new URL(".", import.meta.url)), "net-block.cjs");

interface Pending { resolve: (v: unknown) => void; reject: (e: Error) => void }

export class PluginSandbox {
  private child: ChildProcess | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  /** 插件声明的能力（`name` → summary/input）。沙箱起来后由它报上来 */
  caps: Array<{ name: string; title: string; summary: string; input: Record<string, unknown> }> = [];

  constructor(private manifest: PluginManifest, private dir: string) {}

  async start(): Promise<void> {
    if (this.child) return;
    const execArgv = [
      "--permission",
      `--allow-fs-read=${real(this.dir)}/`,
      /* 还要读得到 runner 自己和 node 内置模块的落盘位置 */
      `--allow-fs-read=${real(RUNNER)}`,
      /* 网络封堵桩：**必须能读到它自己**，否则权限模型会在预加载时就拒掉它 */
      `--allow-fs-read=${real(NET_BLOCK)}`,
      /* ⚠️ **runner 现在有 npm 依赖了**（Q48：QuickJS-WASM）——
         原来它只 import Node 内置模块，所以从没撞上这一条。
         实测不给的话子进程**起不来**，报的是
         `Error: Access to this API has been restricted`（栈在 `package_json_reader`）
         —— 权限模型连「解析 `quickjs-emscripten-core` 时读它的 package.json」都拦。

         这里放开的是**我们自己的只读代码**，而这件事的代价和 Q48 之前**不一样**：
         权限模型原来的职责是**圈住插件代码**，而现在插件代码
         **根本不在 Node 里跑**（它在 QuickJS 里，连 `require` 都没有）。
         这一层现在守的是「我们自己的 runner 别乱来」，不是「插件别乱来」。
         所以放开 `node_modules` 的**读**权限，拦插件那件事一点没松。
         ⚠️ 写权限照旧**一个字节都不给**。 */
      `--allow-fs-read=${real(join(SERVER_ROOT, "node_modules"))}/`,
      `--allow-fs-read=${real(join(SERVER_ROOT, "package.json"))}`,
      "--require", NET_BLOCK,
    ];
    /* ⚠️ 用 `process.execPath` —— 打包后它是 Electron，`ELECTRON_RUN_AS_NODE` 让它当 node 跑。
       写死 "node" 的话打包版机器上可能根本没有 node（用户不是开发者）。 */
    this.child = fork(RUNNER, [], {
      execPath: process.execPath,
      execArgv,
      /* ⚠️ **白名单，不是 `...process.env`**（issue #24）：原来把宿主的全部环境变量
         （实测 93 个）交给插件进程，和 `host.ts` 头注释「插件没有任何环境权限」正相反。
         用户在 shell 里设过的模型 key 之类会一并可见。
         `NODE_OPTIONS` 尤其不能透传 —— 那等于让环境替插件追加启动参数。 */
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        UD_PLUGIN_DIR: this.dir,
        UD_PLUGIN_ENTRY: this.manifest.tools ?? "",
        /* PATH 留着：Node 自己启动时会查它，去掉在个别平台上会出怪事。
           插件起不了子进程，拿到 PATH 也用不上。 */
        PATH: process.env.PATH ?? "",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    this.child.on("message", (msg) => void this.onMessage(msg as Record<string, unknown>));
    this.child.on("exit", (code) => {
      this.child = null;
      /* 进程没了，所有在飞的调用都要落地 —— 不落地的话调用方永远挂着 */
      for (const [, p] of this.pending) p.reject(new Error(`插件 ${this.manifest.id} 的沙箱退出了（code ${code}）`));
      this.pending.clear();
    });
    await this.rpc("init", {});
  }

  stop(): void { this.child?.kill(); this.child = null; }

  /** 调插件声明的一件能力 */
  async invoke(capName: string, input: unknown, project: Project): Promise<unknown> {
    this.ctx = { manifest: this.manifest, project };
    return this.rpc("invoke", { cap: capName, input });
  }

  private ctx: HostCtx | null = null;

  private rpc(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      if (!this.child) { reject(new Error("沙箱没起来")); return; }
      this.pending.set(id, { resolve, reject });
      this.child.send({ id, type, ...payload });
      /* 超时必须有：插件里一个死循环会让整个会话卡住，而症状是「AI 不动了」 */
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`插件 ${this.manifest.id} 的 ${type} 超时（15s）`));
      }, 15_000);
    });
  }

  private async onMessage(msg: Record<string, unknown>): Promise<void> {
    /* 沙箱回调宿主：这是插件唯一能碰到外界的路 */
    if (msg.type === "host") {
      const out = this.ctx
        ? await hostCall(this.ctx, String(msg.cap), msg.input)
        : { ok: false, data: null, errors: [{ code: "E_NO_CTX", message: "这次调用没有项目上下文" }], warnings: [], stats: {} };
      this.child?.send({ id: msg.id, type: "host:done", result: out });
      return;
    }
    if (msg.type === "caps") { this.caps = (msg.caps as typeof this.caps) ?? []; return; }
    const p = this.pending.get(Number(msg.id));
    if (!p) return;
    this.pending.delete(Number(msg.id));
    if (msg.error) p.reject(new Error(String(msg.error)));
    else p.resolve(msg.result);
  }
}
