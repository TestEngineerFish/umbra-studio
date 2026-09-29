#!/usr/bin/env node
/** 发件包的编码回归（2026-09-29 新建）。
 *
 *  **为什么要有它**：`zip -qr` 打出来的包，中文文件名在**严格的解压方**那边全是乱码
 *  （它不设 general purpose bit 11）。而我们这边用 `ditto` 或 Finder 解都是好的
 *  —— macOS 会猜编码 —— **所以这个缺陷藏了很多轮没人发现**，
 *  直到 ClaudeDesign 说「README 的文件名乱码了，我打不开」。
 *
 *  这份钉的就是那一位。跑：npm --prefix server run ziptest
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeZip } from "./zipwrite.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`); }
};

const dir = mkdtempSync(join(tmpdir(), "us-zip-"));
const zipPath = join(dir, "t.zip");
const CN = "ui/S3-诊断面板.dc.html";
const BODY = "<html>诊断面板的内容 · 带中文</html>";
writeZip(zipPath, [
  { name: CN, data: Buffer.from(BODY, "utf8") },
  { name: "README-给设计侧.md", data: Buffer.from("# 说明\n", "utf8") },
  { name: "ui/plain.js", data: Buffer.from("console.log(1)", "utf8") },
]);

console.log("\n发件包的文件名编码（`00` §一二〇）");

/* ⚠️ 判据**自己解析 zip**，不调 `unzip` —— 系统那个 UnZip 6.00 **不认 bit 11**，
   拿它当仪器的话，一个正确的包也会被报成乱码（实测过）。
   而严格的解压方（python zipfile、以及 ClaudeDesign 用的那种）认。 */
const buf = readFileSync(zipPath);

/* 中央目录里逐条读 flag 与文件名。EOCD 在文件末尾，先找它。 */
let eocd = -1;
for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
ok(eocd >= 0, "zip 结构完整（找得到 EOCD）");
const count = buf.readUInt16LE(eocd + 10);
let p = buf.readUInt32LE(eocd + 16);
const names: string[] = [];
let allUtf8 = true;
for (let i = 0; i < count; i++) {
  ok(buf.readUInt32LE(p) === 0x02014b50, `第 ${i + 1} 条中央目录签名对`);
  const flag = buf.readUInt16LE(p + 8);
  if (!(flag & 0x0800)) allUtf8 = false;
  const nLen = buf.readUInt16LE(p + 28);
  names.push(buf.subarray(p + 46, p + 46 + nLen).toString("utf8"));
  p += 46 + nLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
}

/* **这一条是全部的重点。** 不设这一位，同样的字节会被按本地编码解 ——
   而那正是 `S3-Φ»èµû¡Θ¥óµ¥┐.dc.html` 那堆东西的来源。 */
ok(allUtf8, "**每一条都设了 UTF-8 标志位（bit 11）**", `${count} 条`);
ok(names.includes(CN), "中文文件名原样读得回来", names.find((n) => n.includes("S3")) ?? "（没找到）");
/* 反面：**别只验中文**。ASCII 名也必须在，否则「只有中文的那条对」也能蒙混过去 */
ok(names.includes("ui/plain.js"), "ASCII 文件名也在（别只验中文那一条）");

rmSync(dir, { recursive: true, force: true });
console.log(fail === 0 ? `\n✓ 发件包编码 ${pass}/${pass + fail}\n` : `\n✗ 发件包编码 ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
