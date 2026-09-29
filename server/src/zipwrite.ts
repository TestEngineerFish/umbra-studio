/** 写一个 **UTF-8 文件名**的 zip（2026-09-29）。
 *
 *  **为什么要自己写**：`zip -qr` 把 UTF-8 字节原样写进去，**但不设 general purpose bit 11**
 *  （那一位就是「文件名是 UTF-8」的声明）。于是严格的解压方按 CP437 解，
 *  中文名全变成 `S3-è¯æé¢æ¿.dc.html` 这种 —— 实测 ClaudeDesign 那边
 *  连文件都打不开（它的工具直接报 `invalid path: disallowed characters`）。
 *
 *  试过两条更省的路，都不行：
 *  - `zip -UN=UTF8`：Info-ZIP 3.0 的开关，**Apple 改过的版本去掉了**（`short option 'N' not supported`）
 *  - `ditto -c -k`：macOS 原生，实测**同样不设**那一位
 *
 *  所以自己写。只用到 zip 最基本的部分（deflate + 中央目录），
 *  而这也和 M11-6 那条一致：**不指望目标机器上有什么工具**。
 */
import { deflateRawSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";

interface Entry { name: string; data: Buffer }

const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

/** DOS 时间戳。zip 的时间精度是 2 秒，而且**没有时区** —— 写本地时间即可。 */
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** ⚠️ **bit 11 就是这件事的全部**：它声明「文件名是 UTF-8」。
 *  不设它，同样的字节会被按本地编码解 —— 而这正是那些乱码的来源。 */
const FLAG_UTF8 = 0x0800;

export function writeZip(outPath: string, entries: Entry[], now = new Date()): void {
  const { time, date } = dosTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const comp = deflateRawSync(e.data);
    const crc = crc32(e.data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(FLAG_UTF8), u16(8),
      u16(time), u16(date), u32(crc), u32(comp.length), u32(e.data.length),
      u16(name.length), u16(0), name, comp,
    ]);
    locals.push(local);
    centrals.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(FLAG_UTF8), u16(8),
      u16(time), u16(date), u32(crc), u32(comp.length), u32(e.data.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(offset), u16(0),
  ]);
  writeFileSync(outPath, Buffer.concat([...locals, cd, eocd]));
}
