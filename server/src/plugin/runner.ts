/** 沙箱里跑的那一端（M11-4；Q48 起插件代码在 **QuickJS-WASM** 里跑）。
 *
 *  **这个文件跑在插件的进程里，和宿主不共享任何内存。**
 *  它做三件事：把插件加载进一个 QuickJS 上下文、把 `host` 递进去、把两边的消息转成 promise。
 *
 *  ⚠️ 这里**不做任何权限判断** —— 判断在宿主那边（`host.ts`）。
 *  在这里判等于让嫌疑人自己签字：这段代码和插件在同一个进程里。
 *
 *  ── 为什么要再套一层 VM（issue #94 / `doc/11` Q48，2026-10-06）──
 *
 *  原来插件是 `await import("file://<插件目录>/tools.mjs")` 进来的 ——
 *  **和这段代码在同一个 V8 里**。于是它手上有整个 Node：`require` / `process` /
 *  `fetch` / `Buffer` 一个不少。网络那一道靠 `net-block.cjs` 这个**同进程的桩**顶着，
 *  而那个文件的头注自己写着「这是防呆，不是安全边界」。
 *  `doc/20` §3.1 的结论是：**真边界只有进程隔离或不同的 VM**。
 *
 *  现在插件源码交给 QuickJS `evalCode`，只注入一个 `host` 对象。实测（spike，2026-10-06）
 *  插件那个世界里：
 *
 *  ```
 *  require: undefined · process: undefined · fetch: undefined
 *  Buffer: undefined · WebAssembly: undefined · globalThis 只有 1 个键
 *  ```
 *
 *  **网络不是「被拦住」，是「不存在」。** `--permission` 那一层继续留着当第二道墙。
 *
 *  ⚠️ **代价写明**（`doc/11` Q48 里也记了）：
 *  ① QuickJS 里**没有 WebAssembly** —— 想在 B 面用 sql.js / mediabunny 这类 wasm 库的
 *     插件跑不了，只能放 A 面（浏览器里）或由宿主提供能力；
 *  ② 解释执行，没有 JIT，纯计算比 V8 慢一个数量级 ——
 *     「改 markdown 结构」这类工具无所谓，「解析几十 MB 的 CSV」就明显。
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import {
  newQuickJSWASMModuleFromVariant, Scope,
  type QuickJSContext, type QuickJSHandle, type QuickJSRuntime,
} from "quickjs-emscripten-core";
/* ⚠️ 这个包是双格式（CJS + ESM），而 server 的 tsconfig **没开 `esModuleInterop`** ——
   默认导入拿到的是整个命名空间而不是 variant 本身（编译器当场就报了）。
   取 `.default`，并留一条兜底：哪天 tsconfig 开了 interop，`default` 就不在了，
   那时命名空间自己就是它。 */
import * as variantNs from "@jitl/quickjs-wasmfile-release-sync";
import type { QuickJSSyncVariant } from "@jitl/quickjs-ffi-types";
const RELEASE_SYNC = ((variantNs as unknown as { default?: QuickJSSyncVariant }).default ?? variantNs) as unknown as QuickJSSyncVariant;

const dir = process.env.UD_PLUGIN_DIR ?? "";
const entry = process.env.UD_PLUGIN_ENTRY ?? "";

/** 一次调用最多跑多久（毫秒）。到点由 `setInterruptHandler` 在**解释器里面**打断。
 *  ⚠️ 这和宿主那边的 15 秒 RPC 超时**不是一回事**：那一条只让调用方的 promise 落地，
 *  插件的死循环还在空转（原来就是这样）。这一条真把它停下来。 */
const DEADLINE_MS = 10_000;
/** 一个插件上下文最多占多少内存。超了 QuickJS 自己抛 `out of memory`。 */
const MEM_LIMIT = 128 * 1024 * 1024;

let seq = 0;
/** 还在等宿主回话的 `host.call`：id → 那个 QuickJS 侧的 deferred */
const pending = new Map<number, { resolve: (v: unknown) => void }>();
type CapMeta = { name: string; title: string; summary: string; input: Record<string, unknown> };
/** 插件声明的能力：名字 → { 元信息, 它那个 `run` 函数的句柄 } */
const caps = new Map<string, { meta: CapMeta; run: QuickJSHandle }>();

const send = (m: Record<string, unknown>) => process.send?.(m);

let rt: QuickJSRuntime;
let ctx: QuickJSContext;
/** VM 里的 `JSON.parse` / `JSON.stringify`，建一次留着 —— 过值全靠它们。
 *  ⚠️ **只过 JSON 能表示的东西**是有意的：函数、Proxy、原型链都过不去，
 *  两边的对象图不会连在一起（同 VM 隔离被反复逃逸就是因为这个）。 */
let jsonParse: QuickJSHandle;
let jsonStringify: QuickJSHandle;
/** 把 VM 里抛出来的东西变成一句话。
 *  ⚠️ **不能用 `JSON.stringify`** —— `Error` 的 `name`/`message`/`stack` 都是
 *  不可枚举属性，`JSON.stringify(new Error("x"))` 是 `"{}"`。
 *  第一版就这么写的，症状是所有插件错误都报成「插件抛了」，**原因一个字都没有**。 */
let errToText: QuickJSHandle;
/** 本次调用的截止时刻；0 = 不限（加载插件那一下用） */
let deadline = 0;

/** Node 的值 → VM 里的值 */
function toVm(v: unknown): QuickJSHandle {
  return Scope.withScope((s) => {
    const str = s.manage(ctx.newString(JSON.stringify(v ?? null)));
    return ctx.unwrapResult(ctx.callFunction(jsonParse, ctx.undefined, str));
  });
}

/** VM 里的值 → Node 的值 */
function fromVm(h: QuickJSHandle): unknown {
  return Scope.withScope((s) => {
    const str = s.manage(ctx.unwrapResult(ctx.callFunction(jsonStringify, ctx.undefined, h)));
    const text = ctx.getString(str);
    return text === undefined ? undefined : JSON.parse(text);
  });
}

/** VM 里抛出来的那个东西 → 一句话。**句柄由调用方释放。** */
function vmErrorText(h: QuickJSHandle): string {
  try {
    return Scope.withScope((sc) => {
      const t = sc.manage(ctx.unwrapResult(ctx.callFunction(errToText, ctx.undefined, h)));
      return ctx.getString(t) || "插件抛了";
    });
  } catch { return "插件抛了"; }
}

/** 插件能 `import` 到什么 —— **宿主的显式选择**。
 *  原来插件在 Node 里跑，`import` 得到任何它读得到的东西；
 *  现在只有它自己目录下的文件，而且**文件内容由我们读出来递进去**，
 *  VM 里没有 fs。 */
function loadModule(name: string, fromFile: string): string {
  const base = fromFile && fromFile !== "__boot__" ? dirname(fromFile) : dir;
  const abs = isAbsolute(name) ? resolve(name) : resolve(base, name);
  /* ⚠️ 必须在插件目录里 —— `resolve` 会折叠 `..`（#57 / #63 / #69 那一族）。
     判定和那几条用同一个形状：解出来之后比，不比输入的字符串。 */
  const root = resolve(dir);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`插件只能 import 自己目录下的文件：${name}`);
  }
  try { return readFileSync(abs, "utf8"); }
  catch { throw new Error(`import 不到 ${name}`); }
}

function buildVm(): void {
  rt.setMemoryLimit(MEM_LIMIT);
  /* 到点就打断。⚠️ 返回 `true` 才是「中断」—— 写反的话插件一死循环整个进程就没了 */
  rt.setInterruptHandler(() => deadline > 0 && Date.now() > deadline);
  rt.setModuleLoader((name, modCtx) => {
    void modCtx;
    return loadModule(name, currentImporter);
  }, (base, name) => {
    /* 规范化：我们自己记住「谁在 import」，名字原样传给 loader */
    currentImporter = base;
    return name;
  });

  jsonParse = ctx.unwrapResult(ctx.evalCode("JSON.parse", "__json__"));
  jsonStringify = ctx.unwrapResult(ctx.evalCode("JSON.stringify", "__json__"));
  errToText = ctx.unwrapResult(ctx.evalCode(
    `(e) => { try { return e && e.message ? String(e.message) : String(e); } catch { return "（插件抛了一个说不出话的东西）"; } }`,
    "__err__"));

  /* ── 注入 `host` ──
     **插件里一个 `import` 都不写，全部能力从这一个对象拿**（`doc/11` Q37）——
     插件是独立更新的，和主程序必然版本错配，边界越窄，跨版本要守住的越少。 */
  Scope.withScope((s) => {
    const host = s.manage(ctx.newObject());
    ctx.setProp(host, "version", s.manage(ctx.newNumber(1)));

    const fnCall = s.manage(ctx.newFunction("call", (capH, inputH) => {
      const cap = ctx.getString(capH);
      const input = inputH === undefined ? {} : fromVm(inputH);
      const id = ++seq;
      const d = ctx.newPromise();
      pending.set(id, {
        resolve: (out) => {
          const h = toVm(out);
          d.resolve(h);
          h.dispose();
          d.dispose();
          /* ⚠️ **必须自己驱动任务队列**：QuickJS 不像 Node 有事件循环，
             promise 的后续（插件 `await` 之后那几行）要我们推一把才会跑。
             不推的话症状是「插件的 run 永远不返回」—— 和 #97 一模一样的长相。 */
          rt.executePendingJobs();
        },
      });
      send({ type: "host", id, cap, input });
      return d.handle;
    }));
    ctx.setProp(host, "call", fnCall);

    const fnDefine = s.manage(ctx.newFunction("defineCap", (cH) => {
      const meta = fromVm(cH) as CapMeta & { run?: unknown };
      delete meta.run;                            // JSON 过不去函数，这里只是把键也去掉
      /* `run` 的句柄要**留着**（别进 scope）—— 后面 invoke 还要调它 */
      const run = ctx.getProp(cH, "run");
      if (!meta?.name) { run.dispose(); throw new Error("defineCap 要给 name"); }
      caps.set(meta.name, { meta, run });
    }));
    ctx.setProp(host, "defineCap", fnDefine);
    ctx.setProp(ctx.global, "__host", host);
  });
}

/** 模块加载时「谁在 import」—— `setModuleLoader` 的 normalizer 先跑，把它记下来 */
let currentImporter = "__boot__";

/** 把插件装进来：bootstrap 一个模块，把它的 default 导出当 `register(host)` 调掉。
 *  ⚠️ 用 bootstrap 而不是「把源码包进一个函数」—— 插件写的是标准 ESM
 *  （`export default`），包进函数是语法错误；而**什么能 import 由 loader 说了算**，
 *  这正好是我们要的那道闸。 */
function loadPlugin(): void {
  if (!entry) return;
  const res = ctx.evalCode(
    `import register from ${JSON.stringify("./" + entry)};\n`
    + `if (typeof register !== "function") throw new Error("插件的入口要 export default 一个 register(host) 函数");\n`
    + `register(__host);\n`,
    "__boot__",
    { type: "module" });
  if (res.error) {
    const why = vmErrorText(res.error);
    res.error.dispose();
    throw new Error(why);
  }
  res.value.dispose();
  rt.executePendingJobs();
}

process.on("message", async (raw: unknown) => {
  const msg = raw as Record<string, unknown>;
  if (msg.type === "host:done") {
    const p = pending.get(Number(msg.id));
    if (!p) return;
    pending.delete(Number(msg.id));
    p.resolve(msg.result);
    return;
  }
  const id = Number(msg.id);
  try {
    if (msg.type === "init") {
      const mod = await newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
      rt = mod.newRuntime();
      ctx = rt.newContext();
      buildVm();
      deadline = Date.now() + DEADLINE_MS;      // 装插件这一下也给上限（顶层死循环）
      loadPlugin();
      deadline = 0;
      send({ type: "caps", caps: [...caps.values()].map((c) => c.meta) });
      send({ id, result: { ok: true, caps: caps.size } });
      return;
    }
    if (msg.type === "invoke") {
      const c = caps.get(String(msg.cap));
      if (!c) throw new Error(`插件没有声明能力 ${String(msg.cap)}`);
      deadline = Date.now() + DEADLINE_MS;
      let out: unknown;
      try {
        out = await Scope.withScopeAsync(async (s) => {
          const input = s.manage(toVm(msg.input));
          const called = ctx.callFunction(c.run, ctx.undefined, input);
          if (called.error) {
            const why = vmErrorText(called.error);
            called.error.dispose();
            throw new Error(why);
          }
          const retH = s.manage(called.value);
          /* 返回的可能是 promise（`async run`），也可能是普通值 —— 两种都要接住。 */
          if (ctx.typeof(retH) === "object") {
            const nat = ctx.resolvePromise(retH);
            rt.executePendingJobs();
            const settled = await nat;
            rt.executePendingJobs();
            if (settled.error) {
              const why = vmErrorText(settled.error);
              settled.error.dispose();
              throw new Error(why);
            }
            const v = s.manage(settled.value);
            return fromVm(v);
          }
          return fromVm(retH);
        });
      } finally { deadline = 0; }
      send({ id, result: out });
      return;
    }
    throw new Error(`不认识的消息：${String(msg.type)}`);
  } catch (e) {
    send({ id, error: (e as Error).message });
  }
});
