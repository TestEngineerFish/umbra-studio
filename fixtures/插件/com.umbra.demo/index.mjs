/* 演示插件（M11-4 的验证件）。**插件里一个 import 都没有** —— 这是 Q37 定的契约形状：
   插件是独立更新的，和主程序必然版本错配，所以全部能力从 host 这一个带版本号的对象拿。

   它同时是**沙箱的攻击样本**：下面 probe 那件能力故意去做插件不该做的事，
   plugintest 拿它来验「关不关得住」。沙箱不被攻一次，等于没验。 */
/* ── issue #122 的样本（2026-10-06）──
   ① **入口之外的相对 import**：第一版算到了「进程 cwd」上，于是整个插件装不起来；
   ② **同名模块串号**：`./util.mjs` 和 `子目录/util.mjs` 在「规范化名没解析」时
      是同一个缓存键，后者拿到前者那份 —— 这一种是**静默算错**，比报错难查。
   ⚠️ 这两条**只有 B 面拆成多个文件时才会出现**，而唯一的内置 B 面插件
   （markdown）一个 import 都没有，所以回归原来测不到。 */
import { greet } from "./helper.mjs";
import { who as rootWho } from "./util.mjs";
import { sees } from "./子目录/a.mjs";

export default function register(host) {
  host.defineCap({
    name: "com.umbra.demo.rows",
    title: "数一数 CSV 有几行",
    summary: "读一个分隔符文本文件，返回行数和第一行的列名。用来验证插件能通过宿主读文件。",
    input: { path: "string" },
    async run({ path }) {
      const out = await host.call("read_file", { path });
      if (!out.ok) return { ok: false, why: out.errors?.[0]?.message ?? "读不到" };
      const lines = String(out.data.content ?? "").split("\n").filter((l) => l.trim());
      return { ok: true, rows: lines.length, header: (lines[0] ?? "").split(",") };
    },
  });

  /* issue #122：把上面三个 import 的结果报出来，判据读它 */
  host.defineCap({
    name: "com.umbra.demo.imports",
    title: "（测试用）多文件 import 的结果",
    summary: "报出入口之外的相对 import 和同名模块各自拿到了什么。给 plugintest 验 issue #122。",
    input: {},
    async run() { return { helper: greet(), root: rootWho, sub: sees }; },
  });

  /* ── 攻击样本：这几件插件都不该做成 ──
     ⚠️ **Q48 之后预期读数变了**（2026-10-06）：插件代码现在在 QuickJS-WASM 里跑，
     `require` / `process` / `fetch` / `Buffer` / `WebAssembly` **压根不存在**，
     不是「被拦住」。所以每一件都报三档之一：

       `不存在`     —— 那个名字在这个 VM 里没有（`fetch` / `process` 这一类）
       `没这个模块` —— `import` 被宿主的 loader 拒了（`node:fs` 这一类）
       `被拦 <码>`  —— 东西在，但调用被拒了（Q48 之前的最好情况）
       `成了`       —— **出事了**

     ⚠️ **四档不许合并**：合并了就分不出「这个 VM 里没有网络」和
     「网络在但这次连不上」—— 后者在 Q48 之前一直被当成前者。

     判据要认得出三档的差别（`plugintest`）。
     ⚠️ 这一条是 §101.8 那条教训的延续：当时我写的 `startsWith("被拦")` 是**假判据** ——
     `fetch failed` 也以「被拦」开头。所以这里**不把「失败」和「不存在」混成一句话**。 */
  host.defineCap({
    name: "com.umbra.demo.probe",
    title: "（测试用）试着越界",
    summary: "故意去做插件不该做的事，给 plugintest 验沙箱用。正常插件不会有这种能力。",
    input: {},
    async run() {
      const r = {};
      /** 一件一件试：抛 ReferenceError（那个名字不存在）就是最硬的那一档 */
      const probe = async (what, fn) => {
        try { await fn(); r[what] = "成了"; }
        catch (e) {
          const msg = String((e && (e.message || e.name)) || e);
          r[what] = /只能 import 自己目录|import 不到/.test(msg) ? "没这个模块"
            : /not defined|not a function|undefined/i.test(msg) ? "不存在"
            : (e && e.code) ? "被拦 " + e.code : "被拦 " + msg.slice(0, 40);
        }
      };
      /* ① 碰文件系统 —— 现在连 import 都出不去（loader 只认插件自己的目录） */
      await probe("readEtc", async () => { const fs = await import("node:fs"); fs.readFileSync("/etc/hosts"); });
      await probe("write", async () => { const fs = await import("node:fs"); fs.writeFileSync("/tmp/ud-pwned", "x"); });
      /* ② 起子进程（P1 的落点） */
      await probe("exec", async () => { const cp = await import("node:child_process"); cp.execSync("echo pwned"); });
      /* ③ 联网。⚠️ **判据是「不存在」或错误码，不是「连上没连上」** ——
         连一个关着的本机端口得到 `ECONNREFUSED` 也是「连不上」，#24 当初就是这样被漏过去的。 */
      await probe("net", async () => {
        const net = await import("node:net");
        await new Promise((res, rej) => {
          const s = net.connect(1, "127.0.0.1");
          s.on("error", rej); s.on("connect", () => { s.destroy(); res(); });
        });
      });
      await probe("fetch", async () => { await globalThis.fetch("http://127.0.0.1:1/"); });
      /* ④ 宿主的运行时本身在不在（Q48 的核心读数：**不是被拦，是不存在**） */
      r.hasRequire = typeof require;
      r.hasProcess = typeof process;
      r.hasBuffer = typeof Buffer;
      r.hasWasm = typeof WebAssembly;
      r.globalKeys = Object.keys(globalThis).length;
      /* ⑤ 调一件白名单外的宿主能力 —— 这一条**不受 VM 影响**，还是宿主在核 */
      const out = await host.call("write_draft", { path: "x.dc.html", content: "<x-dc></x-dc>" });
      r.offWhitelist = out.ok ? "**调到了**" : "被拦 " + (out.errors?.[0]?.message ?? "").slice(0, 26);
      return r;
    },
  });

  /* ⚠️ **死循环**（Q48 的新判据面）：Q48 之前宿主那条 15 秒 RPC 超时只让调用方的
     promise 落地，**插件的死循环还在空转**（进程占着一个核直到被 kill）。
     QuickJS 的 `setInterruptHandler` 能在解释器**里面**把它打断，
     所以这件能力该在 10 秒内抛，而且**沙箱还活着**（下一次调用照常能用）。 */
  /* ⚠️ **把死循环挂在 `host.call` 的回调里**（issue #123，2026-10-06）。
     和上面那件 `spin` 的区别是全部：`spin` 同步跑在 `run` 里，
     而这一件**先返回**、把活挂在 `.then()` 上 —— 于是死循环发生在
     「宿主回话之后的 `executePendingJobs()`」里。
     第一版的期限只在 `invoke` 窗口里有值，那一刻已经归零 → **打不断**。
     判据：调它之后再调对照组 `rows`，要在 11 秒内回来。 */
  host.defineCap({
    name: "com.umbra.demo.spinLater",
    title: "（测试用）把死循环挂在回调里",
    summary: "先返回，再在 host.call 的回调里死循环。给 plugintest 验「这一种也打得断吗」。",
    input: {},
    async run() {
      host.call("read_file", { path: "表.udemo" }).then(function () { for (;;) { /* 就是要一直转 */ } });
      return "已经返回了（死循环在回调里）";
    },
  });

  host.defineCap({
    name: "com.umbra.demo.spin",
    title: "（测试用）死循环",
    summary: "一个永不结束的循环，给 plugintest 验「真的打得断吗」。正常插件不会有这种能力。",
    input: {},
    async run() { for (;;) { /* 就是要一直转 */ } },
  });
}
