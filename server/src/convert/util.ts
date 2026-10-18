// 来源：UmbraPC electron/core/shared/util.ts（which / childEnv / killTree）+ providers/coding.ts（enginePath）
// + runtime/macho.ts（isIntelOnly 及其三个纯函数）（2026-10-18 a72ac3a），改动：只摘转换引擎要的这几样、合成一份。
//
// ⚠️ 这一份**不是**逐字副本、不进 converttest 的同步比对：PC 那边这几样各在一个大文件里（util.ts 还有 run / 进程组那一整套），
// 整份搬过来是把用不到的东西也带进 Studio；只摘出来又没法逐字比。所以它只守「行为一样」：
// `which` 补扩展名、`enginePath` 补齐 GUI 应用缺的 PATH、`killTree` 整组带走、`isIntelOnly` 读头判架构。
// Studio 里原来没有这几样的等价物（2026-10-18 查过：全仓没有 which / PATH 补齐 / 读 Mach-O 头）。

import type { ChildProcess } from "node:child_process";
import { accessSync, closeSync, constants, openSync, readdirSync, readSync, realpathSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** 在 PATH 中查找可执行文件，返回绝对路径或 null（对齐 Python shutil.which）。 */
export function which(cmd: string, pathStr?: string): string | null {
  const dirs = (pathStr || process.env.PATH || "").split(path.delimiter);
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try {
        accessSync(full, constants.X_OK);
        return full;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

/** 打包后的 GUI 应用只有 /usr/bin:/bin:… —— ffmpeg / pandoc 常装在 homebrew / ~/.local 下。
 *  找工具要用这份补齐后的 PATH，否则「终端里跑得动、Studio 里说没装」。 */
export function enginePath(): string {
  const home = os.homedir();
  const extra = [
    "/opt/homebrew/bin", "/usr/local/bin",
    path.join(home, ".local/bin"), path.join(home, ".bun/bin"),
    path.join(home, ".npm-global/bin"), path.join(home, ".volta/bin"),
    "/usr/bin", "/bin", "/usr/sbin", "/sbin",
  ];
  try {
    const nvm = path.join(home, ".nvm/versions/node");
    for (const v of readdirSync(nvm)) extra.push(path.join(nvm, v, "bin"));
  } catch {
    /* 没装 nvm */
  }
  const cur = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return [...new Set([...cur, ...extra])].join(path.delimiter);
}

/** 子进程的环境：不给追加就原样继承（转换器目前都不追加）。 */
export function childEnv(opts: { env?: Record<string, string> }): NodeJS.ProcessEnv {
  if (!opts.env) return process.env;
  return { ...process.env, ...opts.env };
}

/** 杀掉整个进程组（soffice 会再起子进程，只杀直接子进程的话孙子会活下来）。 */
export function killTree(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  try {
    process.kill(-child.pid, "SIGKILL"); // 进程组
  } catch {
    try {
      child.kill("SIGKILL"); // 不是进程组 leader 就只能杀自己
    } catch {
      /* ignore */
    }
  }
}

/* ── 读可执行文件头判断它是哪种 CPU 的（PC runtime/macho.ts）──
   Apple 芯片上只有 Intel 版的 ffmpeg 不用：一调就弹 Rosetta / 「Intel 应用即将不受支持」的系统通知，
   而用户会以为是 Umbra 不兼容。 */

/** Mach-O 的 CPU 类型 → 名字（只认我们关心的几种，其余给 "other"）。 */
const CPU: Record<number, string> = { 0x01000007: "x86_64", 0x0100000c: "arm64", 7: "i386", 12: "arm" };

/** 从文件头字节读出它含哪些架构。不是 Mach-O（脚本、ELF、乱码）回 null。**纯函数**。 */
export function machoArchs(buf: Uint8Array): string[] | null {
  if (buf.length < 8) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const be = dv.getUint32(0, false);
  // 通用二进制（fat）：大端头，nfat 个条目，每条 20 字节（fat64 是 32 字节），cputype 在条目开头
  if (be === 0xcafebabe || be === 0xcafebabf) {
    const n = dv.getUint32(4, false);
    // 0xcafebabe 也是 Java class 文件的魔数：class 文件这里是版本号（>= 45），fat 头的条目数不会这么多
    if (n === 0 || n > 20) return null;
    const step = be === 0xcafebabf ? 32 : 20;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const at = 8 + i * step;
      if (at + 4 > buf.length) break;
      out.push(CPU[dv.getUint32(at, false)] ?? "other");
    }
    return out.length ? out : null;
  }
  // 单一架构：小端魔数 0xfeedfacf（64 位）/ 0xfeedface（32 位），cputype 紧跟其后
  const le = dv.getUint32(0, true);
  if (le === 0xfeedfacf || le === 0xfeedface) return [CPU[dv.getUint32(4, true)] ?? "other"];
  return null;
}

/** 在 `host` 架构的 Mac 上跑它要不要 Rosetta：本机 arm64、认得出架构、且一个 arm64 切片都没有。**纯函数**。 */
export function needsRosetta(archs: string[] | null, host: string): boolean {
  return host === "arm64" && !!archs && archs.length > 0 && !archs.includes("arm64");
}

/** 脚本首行 `#!` 指向的解释器（`#!/usr/bin/env python` 这种不追 —— env 会按 PATH 找，读头判不出）。**纯函数**。 */
export function shebangInterpreter(buf: Uint8Array): string | null {
  if (buf.length < 3 || buf[0] !== 0x23 || buf[1] !== 0x21) return null;
  const line = new TextDecoder().decode(buf.subarray(2, Math.min(buf.length, 512))).split("\n")[0]!.trim();
  const exe = line.split(/\s+/)[0] ?? "";
  if (!exe.startsWith("/") || /\/env$/.test(exe)) return null;
  return exe;
}

function head(file: string, n = 4096): Uint8Array | null {
  let fd = -1;
  try {
    fd = openSync(realpathSync(file), "r");
    const b = Buffer.alloc(n);
    const got = readSync(fd, b, 0, n, 0);
    return b.subarray(0, got);
  } catch { return null; } finally { if (fd >= 0) try { closeSync(fd); } catch { /* 关不上无所谓 */ } }
}

/** 这个文件（或它脚本首行指向的解释器，追一层）是不是**只有 Intel 版**、在本机要靠 Rosetta 跑。
 *  只在 macOS 判；读不到 / 认不出一律回 false（宁可照常跑，也不把能跑的东西拦掉）。 */
export function isIntelOnly(file: string, host: string = process.arch, platform: string = process.platform): boolean {
  if (platform !== "darwin" || host !== "arm64" || !file.startsWith("/")) return false;
  const b = head(file);
  if (!b) return false;
  const archs = machoArchs(b);
  if (archs) return needsRosetta(archs, host);
  const interp = shebangInterpreter(b);
  if (!interp) return false;
  const ib = head(interp);
  return !!ib && needsRosetta(machoArchs(ib), host);
}
