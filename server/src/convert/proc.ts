// 来源：UmbraPC electron/core/convert/proc.ts（2026-10-18 a72ac3a），改动：childEnv / killTree 改从副本自带的 ./util.js 取（PC 是 ../shared/util）
// 格式转换：起外部程序（sips / ffmpeg / soffice …）。
//
// 和 `shared/util.ts` 的 `run` 分开写，是因为转换要的三样它没有：
//   1. **能取消**（AbortSignal）—— 用户点了取消、或者 AI 那边任务被撤了；
//   2. **按「多久没动静」判卡死**，而不是固定总时长 —— 一部两小时的电影转码本来就要跑很久，
//      给死总时长要么误杀长视频、要么等一个早已卡死的进程等到天荒地老（照 Filee：10 分钟没输出才停）；
//   3. **只留输出的尾巴** —— ffmpeg 一小时能吐出几十 MB 进度行，全攒在内存里没有意义，报错只要最后几行。
// 不经 shell：参数是数组，文件名里的空格、引号、`$` 都原样传给程序。

import { spawn } from "node:child_process";
import { childEnv, killTree } from "./util.js";

export interface ProcOpts {
  signal?: AbortSignal;
  /** 这么久没有任何输出就当卡死（毫秒）；0 = 不判。 */
  idleMs?: number;
  /** 总时长上限（毫秒）；0 = 不限。 */
  totalMs?: number;
  env?: Record<string, string>;
  cwd?: string;
  /** 每一行输出（stdout + stderr，含 `\r` 分隔的进度行）。 */
  onLine?: (line: string) => void;
}

export interface ProcResult {
  code: number | null;
  /** 输出的最后一段（约 4 KB）。 */
  tail: string;
  /** 为什么被停下：没被停是 null。 */
  stopped: null | "aborted" | "idle" | "total";
}

const TAIL_MAX = 4096;

export function runProc(cmd: string, args: string[], opts: ProcOpts = {}): Promise<ProcResult> {
  return new Promise((resolve) => {
    if (opts.signal?.aborted) {
      resolve({ code: null, tail: "", stopped: "aborted" });
      return;
    }
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: childEnv({ env: opts.env }),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32", // 独立进程组：soffice 会再起子进程，要整组带走
    });
    let tail = "";
    let partial = "";
    let stopped: ProcResult["stopped"] = null;
    let done = false;
    let idleTimer: NodeJS.Timeout | undefined;
    let totalTimer: NodeJS.Timeout | undefined;

    const stop = (why: NonNullable<ProcResult["stopped"]>) => {
      if (stopped || done) return;
      stopped = why;
      killTree(child);
    };
    const armIdle = () => {
      if (!opts.idleMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => stop("idle"), opts.idleMs);
    };
    const onAbort = () => stop("aborted");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    if (opts.totalMs) totalTimer = setTimeout(() => stop("total"), opts.totalMs);
    armIdle();

    const onData = (chunk: Buffer) => {
      armIdle();
      const text = chunk.toString("utf-8");
      tail = (tail + text).slice(-TAIL_MAX);
      if (!opts.onLine) return;
      partial += text;
      const parts = partial.split(/\r\n|\r|\n/);
      partial = parts.pop() ?? "";
      if (partial.length > TAIL_MAX) partial = partial.slice(-TAIL_MAX);
      for (const l of parts) if (l.trim()) opts.onLine(l.trim());
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (totalTimer) clearTimeout(totalTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (partial.trim() && opts.onLine) opts.onLine(partial.trim());
      resolve({ code, tail, stopped });
    };
    child.on("error", (err) => {
      tail = (tail + `\n[启动失败] ${String(err)}`).slice(-TAIL_MAX);
      finish(-1);
    });
    // 退出后最多再等 1.5 s 把管道里剩下的冲出来（孙子进程可能还占着管道，见 util.run 的同一条）。
    child.on("exit", (code) => { setTimeout(() => finish(code), 1500); });
    child.on("close", (code) => finish(code));
  });
}

/** 把一次失败的运行说成一句人话（给结果卡 / AI 看）。 */
export function procError(name: string, r: ProcResult, idleMs?: number): Error {
  if (r.stopped === "aborted") return new Error("已取消");
  if (r.stopped === "idle") return new Error(`${name} 超过 ${Math.round((idleMs ?? 0) / 60000)} 分钟没有进展，已停止`);
  if (r.stopped === "total") return new Error(`${name} 运行太久，已停止`);
  const last = r.tail.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" / ");
  return new Error(`${name} 失败（退出码 ${r.code}）${last ? `：${last.slice(-300)}` : ""}`);
}
