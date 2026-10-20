/** 「还是那个文件夹吗」—— 打开记录的身份与指纹回归（M14-2，`doc/11` Q68、`doc/24` §十二）。
 *
 *  测的不是「记得住」，是**「不许静默继承」**：
 *  一个目录被删掉、又新建一个同名的，今天三处键都是纯路径 —— 新目录会**悄悄**继承
 *  旧的快照、评论、回收站。**冲突会报错，继承不会**，而用户看到的是别人的历史。
 *
 *  ⚠️ **状态目录是临时的**（`UMBRASTUDIO_STATE_DIR`）。「最近打开」是**用户的东西**
 *  （首页直接显示它），§166 那一轮实测过：回归往里塞了 18 条死记录，而**删临时目录删不掉它** ——
 *  列表记的是路径。所以这一套**一条都不往真列表里写**，而不是写完再清。
 *  环境变量要在 **import 任何核心模块之前**设：`STATE_ROOT` 在 `project.ts` 顶层算一次。
 *
 *  用法：npm --prefix server run identitytest
 */
import { mkdtemp, mkdir, rm, writeFile, readFile, rename } from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = await mkdtemp(join(tmpdir(), "umbra-identitytest-"));
process.env.UMBRASTUDIO_STATE_DIR = STATE;

const { touchProject, listRecentProjects, removeRecentProject, clearRecentProjects } = await import("./workspace.js");
const { STATE_ROOT, TOOL_ROOT } = await import("./project.js");

const WS = join(STATE_ROOT, ".umbrastudio", "workspace.json");
const BOX = await mkdtemp(join(tmpdir(), "umbra-identitybox-"));
let bad = 0, n = 0;
function ok(label: string, cond: boolean, extra?: unknown): void {
  n++; if (!cond) bad++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
}
const one = async (dir: string) => (await listRecentProjects(50)).recents.find((r) => r.dir === dir);

console.log(`\n打开记录的身份与指纹 · 状态目录 ${STATE}\n`);

/* ⚠️ 样本有效性第一条：**证明这一套真的没在碰真列表**。
   不验这一条的话，整套判据可能一路绿着、同时把用户的列表写脏了 ——
   而那正是 §166 那三处泄漏的长相（「清掉自己造的文件」和「清掉自己造的状态」是两件事）。 */
ok("（前提）状态目录是临时的 —— 这一套不碰用户真实的「最近打开」",
   STATE_ROOT.includes("umbra-identitytest-"), STATE_ROOT);

/* ── ① `exists` 判的是目录本身，不是 `project.json`（`doc/24` §8.5① 那条现成缺陷）── */
{
  const A = join(BOX, "随手打开的目录");
  await mkdir(A, { recursive: true });
  await touchProject(A, "随手打开的目录");
  const r = await one(A);
  ok("**没有 `project.json` 的目录也算「在」**（旧实现：永远显示「不存在」）",
     r?.exists === true, { exists: r?.exists, 有project_json: false });
  ok("指纹三项都记上了（dev / ino / birthtime）",
     typeof r?.dev === "number" && typeof r?.ino === "number" && typeof r?.birthtimeMs === "number",
     { dev: r?.dev, ino: r?.ino, birthtimeMs: r?.birthtimeMs });
  ok("第一次打开 → `same`（没有旧记录可继承）", r?.identity === "same", r?.identity);
  {
    const st = statSync(A);
    ok("**指纹是真去 stat 的，不是占位的 0**", r?.dev === st.dev && r?.ino === st.ino,
       { 记的: [r?.dev, r?.ino], 实际: [st.dev, st.ino] });
  }
  /* 再打开一次：次数加一、首见时间不动 */
  const first = r?.firstSeenAt;
  await new Promise((s) => setTimeout(s, 5));
  await touchProject(A, "随手打开的目录");
  const r2 = await one(A);
  ok("再打开一次 → 次数加一", r2?.openCount === 2, r2?.openCount);
  ok("**首见时间不动**（它是「这条记录活了多久」，不是「最后一次打开」）",
     r2?.firstSeenAt === first, { 现在: r2?.firstSeenAt, 当初: first });
}

/* ── ② 删掉再新建同名：**这是用户 2026-10-20 第三轮问的那一条** ── */
{
  const A = join(BOX, "桌面文件夹A");
  await mkdir(A, { recursive: true });
  await writeFile(join(A, "旧的.txt"), "这是第一个 A 的内容\n", "utf8");
  await touchProject(A, "桌面文件夹A");
  const before = await one(A);
  ok("（前提）第一个 A 记下来了", before?.identity === "same" && before?.openCount === 1);

  await rm(A, { recursive: true, force: true });
  ok("**目录被删掉 → `missing`**（标「已删除」，可清）",
     (await one(A))?.identity === "missing", (await one(A))?.identity);
  ok("而且 `exists` 为假", (await one(A))?.exists === false);

  /* 新建一个**同名**的 —— 路径一模一样 */
  await mkdir(A, { recursive: true });
  const nowFp = statSync(A);
  ok("（样本有效）新建的同名目录 inode 真的变了（APFS 实测会变；不变的话这条判据测不到东西）",
     nowFp.ino !== before?.ino, { 旧: before?.ino, 新: nowFp.ino });
  ok("**同一个路径、不同的目录 → `replaced`**（不是 `same`，也不是报错）",
     (await one(A))?.identity === "replaced", (await one(A))?.identity);

  /* 再打开它：不继承 */
  const t = await touchProject(A, "桌面文件夹A");
  ok("**打开时就回 `replaced`**（界面据此说一句，`open_project` 把它带回前端）",
     t.identity === "replaced", t.identity);
  const after = await one(A);
  ok("**不继承：次数归 1**（继承的话用户会看到「打开过 37 次」而他昨天才新建它）",
     after?.openCount === 1, after?.openCount);
  ok("首见时间也重新算（这是一条新记录了）",
     typeof after?.firstSeenAt === "number" && after.firstSeenAt > (before?.firstSeenAt ?? 0));
  ok("指纹换成新那个目录的", after?.ino === nowFp.ino, { 记的: after?.ino, 实际: nowFp.ino });
  ok("而这一次回 `same`（已经按新的记下来了，不该一直报警）",
     (await one(A))?.identity === "same", (await one(A))?.identity);
}

/* ── ③ 老条目：**绝不报警**，而且会被补上 ──
   ⚠️ 这一条是整套里最要紧的一条。用户机器上「最近打开」最多 20 条，**全是 2026-10-20 之前的**，
   一项指纹都没有。把「没指纹」当成「对不上」的话，他下次打开 Studio 会收到**二十次**
   「这个位置换了一个」—— 而我们其实什么都没查出来。 */
{
  const A = join(BOX, "老条目");
  await mkdir(A, { recursive: true });
  /* 手写一条 2026-10-20 之前那个形状的记录（没有 dev / ino / birthtimeMs / firstSeenAt） */
  await writeFile(WS, JSON.stringify({ recents: [
    { dir: A, name: "老条目", title: "老条目", lastOpened: new Date().toISOString(), openCount: 7 },
  ] }, null, 2), "utf8");
  const r = await one(A);
  ok("（样本有效）手写的那条真的一项指纹都没有",
     r !== undefined && r.ino === undefined && r.birthtimeMs === undefined);
  ok("**老条目回 `unknown`，不是 `replaced`**（否则每条老记录都要弹一次窗）",
     r?.identity === "unknown", r?.identity);
  ok("而它照样算「在」（目录好好地在那儿）", r?.exists === true);

  await touchProject(A, "老条目");
  const r2 = await one(A);
  ok("**打开一次就补上指纹**（不补的话这道闸对存量记录永远不起作用）",
     typeof r2?.ino === "number" && r2.ino === statSync(A).ino, r2?.ino);
  ok("补齐之后回 `same`", r2?.identity === "same", r2?.identity);
  ok("**次数照常加一，没被当成新记录**（`unknown` 不是 `replaced`）", r2?.openCount === 8, r2?.openCount);
  await clearRecentProjects();
}

/* ── ④ `dev` 只记不比：这是一个**有意的**决定，所以要钉住 ──
   `dev`（设备号）跨重启不保证稳定（Linux 上实测有变），而同名重建**不会**让它变。
   把它算进等号里 = 用户重启之后一堆本来就是它的记录被判 `replaced`（白问 + M14-4 之后不继承），
   **而一个真的替换它也抓不到**。一个既帮不上忙、又会误伤的信号。 */
{
  const A = join(BOX, "换了设备号");
  await mkdir(A, { recursive: true });
  const st = statSync(A);
  await writeFile(WS, JSON.stringify({ recents: [
    { dir: A, name: "x", title: "x", lastOpened: new Date().toISOString(), openCount: 1,
      dev: 999999999, ino: st.ino, birthtimeMs: Math.round(st.birthtimeMs), firstSeenAt: Date.now() },
  ] }, null, 2), "utf8");
  ok("**`dev` 对不上但 inode 对 → 还是 `same`**（跨重启不误伤）",
     (await one(A))?.identity === "same", (await one(A))?.identity);
  /* 反过来：inode 对不上就一定是 replaced，哪怕别的都对 */
  await writeFile(WS, JSON.stringify({ recents: [
    { dir: A, name: "x", title: "x", lastOpened: new Date().toISOString(), openCount: 1,
      dev: st.dev, ino: st.ino + 1, birthtimeMs: Math.round(st.birthtimeMs), firstSeenAt: Date.now() },
  ] }, null, 2), "utf8");
  ok("**inode 对不上 → `replaced`**（它是唯一进等号的那个）",
     (await one(A))?.identity === "replaced", (await one(A))?.identity);
  /* 创建时间对不上也算 —— Windows 的文件系统隧道会让同名新建继承旧创建时间，
     所以这一项是**补强**：隧道时 inode 来抓，inode 不可靠时这一项来抓。 */
  await writeFile(WS, JSON.stringify({ recents: [
    { dir: A, name: "x", title: "x", lastOpened: new Date().toISOString(), openCount: 1,
      dev: st.dev, ino: st.ino, birthtimeMs: 1, firstSeenAt: Date.now() },
  ] }, null, 2), "utf8");
  ok("创建时间对不上也算 `replaced`（两项互为补强）",
     (await one(A))?.identity === "replaced", (await one(A))?.identity);
  await clearRecentProjects();
}

/* ── ⑤ 改名 / 移动：身份**能**跟着走（Q68 说的「仅 mac 做得到」那一半的依据）── */
{
  const A = join(BOX, "改名前"), B = join(BOX, "改名后");
  await mkdir(A, { recursive: true });
  await touchProject(A, "改名前");
  const before = await one(A);
  await rename(A, B);
  ok("改名之后旧路径那条回 `missing`", (await one(A))?.identity === "missing");
  ok("**而新路径的 inode 和它一模一样** —— 所以「要把记录指过去吗」这句话有依据",
     statSync(B).ino === before?.ino, { 旧记录: before?.ino, 新路径: statSync(B).ino });
  await clearRecentProjects();
}

/* ── ⑥ 路径归一：带尾斜杠不该变成第二条记录 ── */
{
  const A = join(BOX, "尾斜杠");
  await mkdir(A, { recursive: true });
  await touchProject(A, "尾斜杠");
  await touchProject(A + "/", "尾斜杠");
  const all = (await listRecentProjects(50)).recents.filter((r) => r.dir.includes("尾斜杠"));
  ok("**`/x` 和 `/x/` 是同一条记录**（原来按字符串相等 → 两条）", all.length === 1, all.length);
  ok("而且次数加到了 2", all[0]?.openCount === 2, all[0]?.openCount);
  ok("`remove_recent_project` 也认归一后的路径（带尾斜杠也删得掉）",
     (await removeRecentProject(A + "/")).removed === true);
  ok("删完真的没了", (await one(A)) === undefined);
}

/* ── ⑦ 指向一个**文件**而不是目录 → `unknown`（不是 `same`）── */
{
  const F = join(BOX, "其实是文件.txt");
  await writeFile(F, "x", "utf8");
  await writeFile(WS, JSON.stringify({ recents: [
    { dir: F, name: "f", title: "f", lastOpened: new Date().toISOString(), openCount: 1,
      dev: 1, ino: 2, birthtimeMs: 3, firstSeenAt: 4 },
  ] }, null, 2), "utf8");
  ok("**路径指着一个文件 → `unknown`**（量不到目录指纹，宁可说不知道）",
     (await one(F))?.identity === "unknown", (await one(F))?.identity);
}

/* ── 收尾：删临时目录 + 自检 ──
   ⚠️ §166 那条：**删掉自己造的文件 ≠ 删掉自己造的状态**。这里两样都验一次。 */
await rm(BOX, { recursive: true, force: true });
await rm(STATE, { recursive: true, force: true });
{
  const { existsSync } = await import("node:fs");
  ok("（收尾）临时状态目录删掉了", !existsSync(STATE));
  ok("（收尾）临时样本目录删掉了", !existsSync(BOX));
  /* 真·最后一条：**用户真实的 workspace.json 一个字节都没动** ——
     临时状态目录删掉了也要验这一条，因为「我以为我在临时目录里」正是 §166 那类事故的起点。
     ⚠️ **这里原来写的是 `process.cwd()`，那是一条不可能变红的判据**：
     `npm --prefix server run identitytest` 的 cwd 是 `server/`，而真 STATE_ROOT
     在**仓库根**（`STATE_ROOT` 没设环境变量时回落到 `TOOL_ROOT`）——
     于是它去查一个压根不存在的文件、`catch` 住、报「没有我造的」。
     **一条永远绿的收尾自检，比没有收尾自检更坏**：它会让人以为验过了。
     用 `TOOL_ROOT`：它不受 `UMBRASTUDIO_STATE_DIR` 影响，指的正是「我不该碰的那一份」。 */
  const real = join(TOOL_ROOT, ".umbrastudio", "workspace.json");
  let 真列表里有没有我的 = false, 读到 = "没有这个文件";
  try {
    const txt = await readFile(real, "utf8");
    读到 = `${txt.length} 字节 · ${(JSON.parse(txt).recents ?? []).length} 条`;
    真列表里有没有我的 = /umbra-identitybox-|umbra-identitytest-/.test(txt);
  } catch { /* 没这个文件也行（打包环境 / 全新机器） */ }
  /* ⚠️ **把读到了什么打出来**（纪律④）：这条判据有两种「通过」——
     「真的没有我造的」和「**我压根没读到任何东西**」。读数里出现条数，
     才分得清是世界是零还是仪器是零。 */
  ok("**（收尾）用户真实的「最近打开」里没有我造的任何一条**", !真列表里有没有我的, { 查的: real, 读到 });
}

console.log(`\n${bad ? "✗" : "✓"} 打开记录的身份与指纹 ${n - bad}/${n}\n`);
process.exit(bad ? 1 : 0);
