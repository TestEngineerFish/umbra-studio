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
import { inflateRawSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { crc32 } from "node:zlib";
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
/* ⚠️ 夹具里**要有一个几百 KB 的条目和一个空条目**（issue #45）。
   小而可压缩的内容掩盖了很多东西：多条目时的偏移累加、压缩后比原文还大的情况、
   `compSize === 0` 时本地头那几个字段。 */
const BIG = randomBytes(300 * 1024);
const entries = [
  { name: CN, data: Buffer.from(BODY, "utf8") },
  { name: "README-给设计侧.md", data: Buffer.from("# 说明\n", "utf8") },
  { name: "ui/plain.js", data: Buffer.from("console.log(1)", "utf8") },
  { name: "ui/大附件-随机.bin", data: BIG },
  { name: "ui/空文件.txt", data: Buffer.alloc(0) },
];
writeZip(zipPath, entries);
const want = new Map(entries.map((e) => [e.name, e.data]));

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
interface CdEntry { name: string; flag: number; crc: number; comp: number; raw: number; offset: number; method: number }
const cd: CdEntry[] = [];
/* ⚠️ **解析越界要报红，不能抛。**（2026-10-02 反向验证时撞到）
   把 `offset` 的累加改坏之后，EOCD 里的「中央目录起始位置」也跟着错，
   于是 `readUInt32LE` 读到文件外面 → `ERR_OUT_OF_RANGE` **把整个 ziptest 带走**，
   一条判据都没输出。崩掉虽然也让退出码非 0，但读数里看不出**是哪一条坏了** ——
   判据该报红，不该把别的判据一起带走（`apitest` 今天也撞到同一件事）。 */
for (let i = 0; i < count; i++) {
  if (p < 0 || p + 46 > buf.length) {
    ok(false, `第 ${i + 1} 条中央目录在文件范围内`, `偏移 ${p}，而包只有 ${buf.length} 字节 —— 中央目录的 offset 写坏了`);
    break;
  }
  ok(buf.readUInt32LE(p) === 0x02014b50, `第 ${i + 1} 条中央目录签名对`);
  const flag = buf.readUInt16LE(p + 8);
  if (!(flag & 0x0800)) allUtf8 = false;
  const nLen = buf.readUInt16LE(p + 28);
  const name = buf.subarray(p + 46, p + 46 + nLen).toString("utf8");
  names.push(name);
  cd.push({
    name, flag,
    method: buf.readUInt16LE(p + 10),
    crc: buf.readUInt32LE(p + 16),
    comp: buf.readUInt32LE(p + 20),
    raw: buf.readUInt32LE(p + 24),
    offset: buf.readUInt32LE(p + 42),
  });
  p += 46 + nLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
}

/* **这一条是全部的重点。** 不设这一位，同样的字节会被按本地编码解 ——
   而那正是 `S3-Φ»èµû¡Θ¥óµ¥┐.dc.html` 那堆东西的来源。 */
ok(allUtf8, "**每一条都设了 UTF-8 标志位（bit 11）**", `${count} 条`);
ok(names.includes(CN), "中文文件名原样读得回来", names.find((n) => n.includes("S3")) ?? "（没找到）");
/* 反面：**别只验中文**。ASCII 名也必须在，否则「只有中文的那条对」也能蒙混过去 */
ok(names.includes("ui/plain.js"), "ASCII 文件名也在（别只验中文那一条）");

/* ── 包到底解不解得开（issue #45）──
   ⚠️ 上面那几条读的全是**中央目录**里的元数据。而下面这些它们一条都测不到：
   内容、本地文件头、偏移对不对。deflate 数据坏了、CRC 算错了、
   大小字段写反了、`offset` 指错了位置 —— 这份回归**原来还是全绿**。

   这份回归的名字叫「发件包编码」，而它**不能说明「发件包能被解开」** ——
   和 CLAUDE.md §9 列的「判据在测别的东西也会绿」是同一类。

   所以这一节按**本地头**往返读一遍，不依赖任何外部工具
   （系统 `unzip` 不认 bit 11，拿它当仪器一个正确的包也会被报成乱码）。
   有些流式解压方**只读本地头**，所以本地头那一份也必须对。 */
console.log("\n包解不解得开（issue #45）");
{
  let allRoundTrip = true, allLocalHead = true, allCrc = true, checked = 0;
  const bad: string[] = [];
  for (const e of cd) {
    const lo = e.offset;
    if (buf.readUInt32LE(lo) !== 0x04034b50) { allLocalHead = false; bad.push(`${e.name}: 本地头签名不对`); continue; }
    const lFlag = buf.readUInt16LE(lo + 6);
    const lNLen = buf.readUInt16LE(lo + 26), lELen = buf.readUInt16LE(lo + 28);
    const lName = buf.subarray(lo + 30, lo + 30 + lNLen).toString("utf8");
    /* ⚠️ **本地头也要设 bit 11，而且文件名要和中央目录一致** ——
       `zipwrite` 在两处各写一次，只验中央目录的话漏设本地头那一份查不出来。 */
    if (!(lFlag & 0x0800)) { allLocalHead = false; bad.push(`${e.name}: 本地头没设 bit 11`); }
    if (lName !== e.name) { allLocalHead = false; bad.push(`${e.name}: 本地头的名字是 ${lName}`); }
    /* ⚠️ **本地头的 crc 和两个大小字段也要和中央目录一致。**
       （2026-10-02 反向验证抓到的漏法）
       我原来只从中央目录读 `comp` 去切数据片段 —— 于是把**本地头**那两个
       大小字段写反，判据**照样全绿**：切片用的是中央目录那份（没改）。
       而只读本地头的解压方会按反了的大小去切，拿到的是垃圾。
       `zipwrite` 在两处各写一遍，**两处都要验**。 */
    const lCrc = buf.readUInt32LE(lo + 14), lComp = buf.readUInt32LE(lo + 18), lRaw = buf.readUInt32LE(lo + 22);
    if (lCrc !== e.crc) { allLocalHead = false; bad.push(`${e.name}: 本地头 crc 和中央目录不一致`); }
    if (lComp !== e.comp) { allLocalHead = false; bad.push(`${e.name}: 本地头压缩后大小 ${lComp} ≠ 中央目录 ${e.comp}`); }
    if (lRaw !== e.raw) { allLocalHead = false; bad.push(`${e.name}: 本地头原始大小 ${lRaw} ≠ 中央目录 ${e.raw}`); }
    /* 顺便钉一条**和中央目录无关**的性质：压缩后的大小不能超过剩下的字节数。
       两个字段写反时（原始 > 压缩）这一条在压不动的那条数据上会抓到。 */
    const dataAt = lo + 30 + lNLen + lELen;
    const comp = buf.subarray(dataAt, dataAt + e.comp);
    let out: Buffer | null = null;
    try { out = e.method === 0 ? Buffer.from(comp) : Buffer.from(inflateRawSync(comp)); }
    catch (err) { allRoundTrip = false; bad.push(`${e.name}: 解不开（${String(err).slice(0, 40)}）`); continue; }
    const expect = want.get(e.name);
    if (!expect || !out.equals(expect)) { allRoundTrip = false; bad.push(`${e.name}: 内容不一致（解出 ${out.length} 字节，该是 ${expect?.length ?? "?"}）`); }
    /* CRC 是解压方唯一能自查的东西 —— 它对不上，严格的解压方会直接报错 */
    if ((crc32(out) >>> 0) !== e.crc) { allCrc = false; bad.push(`${e.name}: CRC 不对`); }
    checked++;
  }
  ok(checked === cd.length && allLocalHead,
     "**每一条的本地头都对**（签名 · bit 11 · 文件名和中央目录一致 —— 有的解压方只读本地头）",
     bad.filter((b) => /本地头/.test(b)).join(" | ") || `${checked}/${cd.length} 条`);
  ok(allRoundTrip,
     "**每一条的内容都逐字节解得回来**（含 300 KB 随机数据和一个空文件）",
     bad.filter((b) => /解不开|内容不一致/.test(b)).join(" | ") || `${checked} 条`);
  ok(allCrc, "**CRC 和实际内容对得上**（它对不上，严格的解压方会直接报错）",
     bad.filter((b) => /CRC/.test(b)).join(" | ") || `${checked} 条`);
  /* 压不动的数据（随机字节）要能原样取回 —— 这一条单独点出来，
     因为它是「压缩后比原文还大」那条分支，而小的可压缩夹具测不到。 */
  const bigE = cd.find((e) => e.name === "ui/大附件-随机.bin");
  ok(!!bigE && bigE.raw === BIG.length,
     "**压不动的 300 KB 随机数据，原始大小字段是对的**（小而可压缩的夹具测不到这一支）",
     bigE ? `raw ${bigE.raw} / comp ${bigE.comp}` : "（没找到那一条）");
  const emptyE = cd.find((e) => e.name === "ui/空文件.txt");
  ok(!!emptyE && emptyE.raw === 0, "空文件那一条也在，原始大小是 0",
     emptyE ? `raw ${emptyE.raw} / comp ${emptyE.comp} / crc ${emptyE.crc}` : "（没找到）");
}

rmSync(dir, { recursive: true, force: true });
console.log(fail === 0 ? `\n✓ 发件包编码 ${pass}/${pass + fail}\n` : `\n✗ 发件包编码 ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
