/** 「清除缓存」三档的回归（M14-3，`doc/24` §8.7）。
 *
 *  测的**不是「删得掉」，是「只删该删的」**：
 *  ① 清缓存那一档的全部价值在于**它碰不到算不出来的东西** —— 快照是过去的内容，
 *     删了没有任何办法算回来。一条判据报错只是红一下，这一档出错是**用户的历史没了**。
 *  ② / ③ 动的是「最近打开」和 STATE_ROOT 里的兜底仓库 —— 都是用户的东西。
 *
 *  ⚠️ **临时状态目录**（`UMBRASTUDIO_STATE_DIR`）：要在 import 任何核心模块之前设。
 *  一条都不往用户真实的「最近打开」和真实的兜底仓库目录里写。
 *
 *  用法：npm --prefix server run purgetest
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const STATE = await mkdtemp(join(tmpdir(), "umbra-purgetest-"));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_NO_GIT = "";          // 这一套要真建兜底仓库

const { clearProjectCache, clearStaleRecords, forgetProject, refuseIfDangerous, ASSET_ENTRIES } = await import("./purge.js");
const { touchProject, listRecentProjects, removeRecentProject } = await import("./workspace.js");
const { ensureRepo, gitDirOfProject, commitPaths } = await import("./gitkeep.js");
const { STATE_ROOT, TOOL_ROOT } = await import("./project.js");
const { assetDir, cacheDir, commentsFile, indexDataFile } = await import("./statedirs.js");
const { recordDirOf } = await import("./records.js");

const BOX = await mkdtemp(join(tmpdir(), "umbra-purgebox-"));
let bad = 0, n = 0;
function ok(label: string, cond: boolean, extra?: unknown): void {
  n++; if (!cond) bad++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
}

console.log(`\n清除缓存三档 · 状态目录 ${STATE}\n`);
ok("（前提）状态目录是临时的 —— 这一套不碰用户真实的列表与兜底仓库",
   STATE_ROOT.includes("umbra-purgetest-") && STATE_ROOT !== TOOL_ROOT, STATE_ROOT);

/** 造一个「什么都有」的项目：缓存四样 + 资产六样。
 *
 *  ⚠️ **落点全从 `statedirs` 取，一处都不写死**（M14-4 B1 / B2 把它们搬去了
 *  `STATE_ROOT/.umbrastudio/records/<ID>/`）。这一套测的是「清缓存删对了没有」，
 *  **不是「它们放在哪」** —— 写死路径的夹具会让十几条判据红在「文件本来就不在」上。 */
async function makeProject(name: string): Promise<string> {
  const dir = join(BOX, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "project.json"), JSON.stringify({ name }), "utf8");
  await mkdir(join(cacheDir(dir, "checks"), "一次体检"), { recursive: true });
  await writeFile(join(cacheDir(dir, "checks"), "一次体检", "report.json"), '{"ok":true}', "utf8");
  await mkdir(cacheDir(dir, "shots"), { recursive: true });
  await writeFile(join(cacheDir(dir, "shots"), "缩略图.png"), Buffer.alloc(2048), "utf8");
  await writeFile(indexDataFile(dir), JSON.stringify({ drafts: [] }), "utf8");
  await writeFile(join(dir, "index-data.js"), "window.__UD_INDEX = {};", "utf8");
  /* 资产六样 —— 下面每一样都有自己一条判据 */
  await mkdir(join(assetDir(dir, "snapshots"), "稿.dc.html"), { recursive: true });
  await writeFile(join(assetDir(dir, "snapshots"), "稿.dc.html", "s1.src.gz"), Buffer.alloc(99), "utf8");
  await mkdir(dirname(commentsFile(dir)), { recursive: true });
  await writeFile(commentsFile(dir), '{"稿.dc.html":[{"text":"这里改一下"}]}', "utf8");
  await mkdir(join(assetDir(dir, "trash"), "20261020"), { recursive: true });
  await writeFile(join(assetDir(dir, "trash"), "20261020", "删掉的.dc.html"), "<x-dc></x-dc>", "utf8");
  await mkdir(assetDir(dir, "templates"), { recursive: true });
  await writeFile(join(assetDir(dir, "templates"), "我的模板.dc.html"), "<x-dc></x-dc>", "utf8");
  await mkdir(assetDir(dir, "staged"), { recursive: true });
  await writeFile(join(assetDir(dir, "staged"), "草稿.json"), "{}", "utf8");
  await mkdir(assetDir(dir, "chats"), { recursive: true });
  await writeFile(join(assetDir(dir, "chats"), "chat-1.json"), '{"messages":[{"role":"user"}]}', "utf8");
  await writeFile(join(dir, "稿.dc.html"), "<x-dc></x-dc>", "utf8");
  return dir;
}

/* ── ① 清缓存：删四样，资产六样一个都不许动 ── */
{
  const dir = await makeProject("清缓存");
  /* ⚠️ **这一条是 B1 / B2 的验收**：资产和缓存都不许在用户的项目目录里了。
     放在清缓存之前，因为清完之后缓存本来就没了，那时再量就分不清
     「搬走了」和「刚被删了」。 */
  ok("**资产和缓存都不在用户的项目目录里了**（B1 / B2）",
     !existsSync(join(dir, ".umbrastudio")) && assetDir(dir, "snapshots").startsWith(STATE_ROOT) && cacheDir(dir, "shots").startsWith(STATE_ROOT),
     { 项目里有没有umbrastudio: existsSync(join(dir, ".umbrastudio")), 快照: assetDir(dir, "snapshots").slice(STATE_ROOT.length) });
  ok("**缓存和资产是兄弟目录，不是一层**（结构上清缓存就够不到资产）",
     dirname(cacheDir(dir, "shots")) !== dirname(assetDir(dir, "snapshots")), { cache: cacheDir(dir, "shots"), asset: assetDir(dir, "snapshots") });
  const r = await clearProjectCache(dir);

  ok("删掉的正是点名那四样（不多不少）",
     r.removed.slice().sort().join(" · ") === ["cache/checks", "cache/shots", "cache/index-data.json", "index-data.js"].sort().join(" · "),
     r.removed);
  ok("腾出的字节数是真算的（不是 0）", r.freedBytes > 2048, r.freedBytes);
  ok("体检报告没了", !existsSync(cacheDir(dir, "checks")));
  ok("缩略图没了", !existsSync(cacheDir(dir, "shots")));
  ok("索引数据没了", !existsSync(indexDataFile(dir)));
  ok("项目根那份 index-data.js 也没了", !existsSync(join(dir, "index-data.js")));

  /* ⚠️ **资产逐个验，不写「至少一条」** —— §145.4 那条「『至少一条』几乎总是假判据」。
     六样里漏删一样就是用户的一类历史没了，而「还剩五样」这种判据照样绿。 */
  ok("**快照还在**（它是过去的内容，删了算不回来）", existsSync(join(assetDir(dir, "snapshots"), "稿.dc.html", "s1.src.gz")));
  ok("**评论还在**", existsSync(commentsFile(dir)));
  ok("**回收站还在**", existsSync(join(assetDir(dir, "trash"), "20261020", "删掉的.dc.html")));
  ok("**模板还在**", existsSync(join(assetDir(dir, "templates"), "我的模板.dc.html")));
  ok("**没落盘的草稿还在**", existsSync(join(assetDir(dir, "staged"), "草稿.json")));
  ok("**会话历史还在**", existsSync(join(assetDir(dir, "chats"), "chat-1.json")));
  ok("稿本身当然还在", existsSync(join(dir, "稿.dc.html")));

  ok("**回执把「没动的那几样」列出来**（不说的话用户不知道他的历史还在不在）",
     ASSET_ENTRIES.every((a) => r.kept.includes(a)), r.kept);

  /* 再清一次：不该报错，也不该再删到东西 */
  const again = await clearProjectCache(dir);
  ok("再清一次不报错、`removed` 为空（幂等）", again.removed.length === 0 && again.freedBytes === 0, again);
}

/* ── 防呆：这道闸平时一条路都走不到，只有直接打它才量得到 ── */
{
  const ud = join(BOX, "防呆", ".umbrastudio");
  const throws = (f: () => void) => { try { f(); return false; } catch { return true; } };
  ok("**点名要删 `snapshots` 一律拒**（防以后有人往白名单里手抖加一项）",
     throws(() => refuseIfDangerous(join(ud, "snapshots"), [ud])));
  ok("`comments.json` 也拒", throws(() => refuseIfDangerous(join(ud, "comments.json"), [ud])));
  ok("**界外的路径一律拒**（哪怕名字无害）", throws(() => refuseIfDangerous("/etc/hosts", [ud])));
  ok("`..` 爬出去也拒", throws(() => refuseIfDangerous(join(ud, "..", "..", "别人的"), [ud])));
  ok("（对照）`checks` 是放行的 —— 否则上面四条可能只是因为它什么都拒",
     !throws(() => refuseIfDangerous(join(ud, "checks"), [ud])));
}

/* ── ② 清掉已失效的记录 ── */
{
  const 活着 = await makeProject("还在的项目");
  const 死了一 = await makeProject("删掉的项目一");
  const 死了二 = await makeProject("删掉的项目二");
  for (const d of [活着, 死了一, 死了二]) await touchProject(d, d.split("/").pop() as string);

  /* 给两个死的各建一个兜底仓库并真提交一版 —— 不然「仓库被清掉了」测不到东西 */
  for (const d of [死了一, 死了二]) {
    await ensureRepo(d);
    await commitPaths(d, ["稿.dc.html"], "第一版");
  }
  const gd1 = gitDirOfProject(死了一), gd2 = gitDirOfProject(死了二), gdLive = gitDirOfProject(活着);
  await ensureRepo(活着);
  ok("（前提）三个兜底仓库都建起来了", existsSync(gd1) && existsSync(gd2) && existsSync(gdLive));
  ok("（前提）三条记录都在", (await listRecentProjects(50)).recents.length === 3);

  await rm(死了一, { recursive: true, force: true });
  await rm(死了二, { recursive: true, force: true });

  const r = await clearStaleRecords();
  ok("清掉的是那两条失效的", r.removed.length === 2 && r.removed.every((x) => /删掉的项目/.test(x.dir)), r.removed.map((x) => x.name));
  ok("腾出的字节数是真算的", r.freedBytes > 0, r.freedBytes);
  ok("**它们的兜底仓库也清掉了**（历史跟着走，不留 93 MB 那种孤儿）",
     !existsSync(gd1) && !existsSync(gd2));
  ok("**还活着那条一个字节都没动**", r.left === 1 && existsSync(gdLive));
  const left = (await listRecentProjects(50)).recents;
  ok("列表里只剩它，而且还是 `same`", left.length === 1 && left[0]?.identity === "same", left.map((x) => x.identity));
  ok("它的资产当然也还在", existsSync(join(assetDir(活着, "snapshots"), "稿.dc.html", "s1.src.gz")));
}

/* ── ③ 忘掉这一个：要确认，而且和「从列表去掉」分得清 ── */
{
  const dir = await makeProject("忘掉它");
  await touchProject(dir, "忘掉它");
  await ensureRepo(dir);
  await commitPaths(dir, ["稿.dc.html"], "第一版");
  const gd = gitDirOfProject(dir);
  const recDirBefore = dirname(assetDir(dir, "snapshots"));
  ok("（前提）记录和兜底仓库都在", existsSync(gd) && existsSync(recDirBefore) && !!(await listRecentProjects(50)).recents.find((r) => r.dir === dir), recDirBefore);

  /* **「从列表去掉」不许碰历史** —— 两件事分开，这一条钉住那个分界 */
  await removeRecentProject(dir);
  ok("**`remove_recent_project` 只是别在首页列它了 —— 兜底历史一个字节都不动**", existsSync(gd));
  await touchProject(dir, "忘掉它");   // 放回去，继续测 ③

  let 拒了 = "";
  try { await forgetProject(dir, false as unknown as boolean); }
  catch (e) { 拒了 = (e as { diagnostic?: { message?: string } }).diagnostic?.message ?? String(e); }
  ok("**不给 `confirm` 一律拒**（历史删了退不回来）", /退不回来|确认/.test(拒了), 拒了);
  ok("而且被拒的那一下**什么都没删**", existsSync(gd) && !!(await listRecentProjects(50)).recents.find((r) => r.dir === dir));

  const r = await forgetProject(dir, true);
  ok("确认之后：记录没了", !(await listRecentProjects(50)).recents.find((x) => x.dir === dir));
  ok("兜底历史也没了", !existsSync(gd));
  ok("腾出的字节数是真算的", r.freedBytes > 0, r.freedBytes);
  /* ⚠️ 这两条**随 M14-4 B1 翻了个面，而翻面本身就是验收**：
     B1 之前快照还在用户的项目目录里、这一件没有权力删它，所以回执必须
     照实说「那一份还在」（`stillOnDisk` 指着那个目录）。
     B1 之后**历史全在我们这边**，这一件才真的把它删干净 —— 于是
     `stillOnDisk` 应该是 `null`，而记录目录应该真的没了。
     ⚠️ `stillOnDisk` 这个字段**不删**：用户机器上 B1 之前写下的那一份还在原地
     （Q72 拍板不迁不删），对那些项目它仍然会指出来。 */
  ok("**回执不再说「项目目录里还有一份」**（B1 之后历史全在我们这边）", r.stillOnDisk === null, r.stillOnDisk);
  ok("**记录目录真的被删了 —— 「忘掉」现在是真的忘掉**", !existsSync(recDirBefore), recDirBefore);
  ok("（对照）那份稿本身还在，我们没碰用户的文件", existsSync(join(dir, "稿.dc.html")));
}

/* ── ④ 失效的记录要在首页**列出来**，不是静默消失 ──
   ⚠️ 用户 2026-10-20 的原话：「如果配置中指定的文件或者文件夹不存在了，
   也是在点击历史记录时提示」—— 而 `describe` 的 `catch` 让它压根不出现，
   于是连「点」的机会都没有。这一条走真 HTTP，因为那个合并只在 http 面发生。 */
{
  const 活着 = await makeProject("首页还在的");
  const 没了 = await makeProject("首页没了的");
  await touchProject(活着, "首页还在的");
  await touchProject(没了, "首页没了的");
  await rm(没了, { recursive: true, force: true });

  const { serveStart } = await import("./serve.js");
  const { buildProject } = await import("./project.js");
  const s = await serveStart(await buildProject(活着));
  const r = await fetch(`${s.url}__ud/projects?token=${encodeURIComponent(s.token)}`).then((x) => x.json()) as
    { ok: boolean; data: { projects: Array<{ dir: string; missing?: boolean; name: string }> } };
  const row = r.data.projects.find((x) => x.dir === 没了);
  ok("**失效那条在首页列表里有一行**（原来：`catch` 掉 → 压根不出现）", !!row, row?.name);
  ok("而且标着 `missing`（界面据此灰掉、给「忘掉它」）", row?.missing === true, row?.missing);
  const live = r.data.projects.find((x) => x.dir === 活着);
  ok("（对照）活着那条照常列出来、没有 `missing`", !!live && live.missing === undefined);
}

/* ── ⑤ 原子写留下的 `.tmp` 孤儿有人清了（M14-9，2026-10-22）──
   成因不是逻辑缺陷，是原子写的必然代价：`writeFile(tmp)` → `rename()` 之间
   进程结束，tmp 就留下了。实测 `STATE_ROOT` 下躺着两个（`doc/24` §19.5），
   而**没有任何人会清它们** —— `purge` 的白名单不含 `*.tmp`，而白名单本身是对的。

   ⚠️⚠️ **原来写在 `doc/24` 的修法是错的**：那里写「B1 之后 `records/<key>/`
   就是现成的去处」，而 `rename` 要求源和目标**在同一个文件系统** ——
   用户的项目可能在外置盘 / 网络盘上，那时 `STATE_ROOT` 和项目必然不同卷。
   挂一个 RAM 盘实测：`EXDEV: cross-device link not permitted`。
   > **tmp 必须和目标同目录，不是没做，是和原子性互斥。**
   所以这一节测的全是「清」：三条路（写的时候顺手扫 · 清缓存时递归扫 · 启动时扫状态目录）。

   ⚠️ **判准只认我们自己造的后缀 `.umbrastudio.tmp`**，不认 `.tmp` ——
   这是在**用户的项目目录**里删文件，而他目录里的 `.tmp` 可能是别人的东西。
   每一条「该删的删了」后面都配一条「不该删的没删」。 */
console.log("\n⑤ 原子写的 .tmp 孤儿");
{
  const { sweepTmpIn, sweepTmpUnder, isOurTmp, tmpNameFor } = await import("./tmpfiles.js");
  const { writeAtomic } = await import("./normalize.js");
  const { utimes } = await import("node:fs/promises");

  const dir = await makeProject("tmp孤儿");
  const old = new Date(Date.now() - 60 * 60 * 1000);          // 一小时前
  /** 造一个「上一轮留下的」孤儿：名字走真命名 + 把 mtime 推old */
  const makeOrphan = async (at: string, body = "半截内容") => {
    const q = tmpNameFor(at);
    await writeFile(q, body, "utf8");
    await utimes(q, old, old);
    return q;
  };

  ok("（前提）判准认得我们自己的后缀，也认得「这不是我们的」",
     isOurTmp("稿.dc.html.123.abc.umbrastudio.tmp") && !isOurTmp("用户自己的.tmp") && !isOurTmp("稿.dc.html"));

  /* ── ⓐ 写的时候顺手扫同目录 ── */
  {
    const orphan = await makeOrphan(join(dir, "稿.dc.html"));
    const 别人的 = join(dir, "用户自己的东西.tmp");
    await writeFile(别人的, "这是用户的，不许动", "utf8");
    await utimes(别人的, old, old);
    ok("（样本自己先成立）孤儿和用户那份 .tmp 都真的在盘上", existsSync(orphan) && existsSync(别人的));
    /* 往同一个目录写一次 —— `writeAtomic` 第一次写这个目录时会顺手扫 */
    await writeAtomic(join(dir, "新写的.txt"), "x");
    /* ⚠️ **要等一会儿再数**：那一扫是 `void` 出去的（清垃圾不该让保存等着）。
       不等的话这条判据测的是「它还没跑完」，而那和「它没装」长得一样 ——
       昨天 B3 那条判据就是这么假绿的。 */
    await new Promise((r) => setTimeout(r, 300));
    ok("**写一次就把同目录里上一轮的孤儿清掉了**（产生垃圾的那一层知道该去哪扫）", !existsSync(orphan));
    ok("**而用户自己的 `.tmp` 一个字节都没动**（判准只认我们造的后缀）", existsSync(别人的));
  }

  /* ── ⓑ 太新的不碰：那可能是另一个进程正在写的 ── */
  {
    const fresh = tmpNameFor(join(dir, "另一个进程正在写.dc.html"));
    await writeFile(fresh, "正在写", "utf8");
    const removed = await sweepTmpIn(dir, { force: true });
    ok("**刚建出来的 tmp 不碰**（同机器上可能有另一个 Studio 进程正在写它）",
       existsSync(fresh), { 这一轮清掉: removed });
    /* ⚠️ 这一条是上一条的**反面对照**：把它推老，同一个扫描就该删它 ——
       没有它的话「不碰」可能只是因为扫描整个不工作。
       ⚠️ **先把它重新写一遍再推老** —— 不然上一条红的时候（闸被拆了，它已经被删了）
       这里 `utimes` 当场 ENOENT 抛出去，**整套测试在第 6 条上崩掉，后面 7 条一条都不报**。
       反向验证的时候实测到的：读数变成一个 node 堆栈，而不是「哪几条红了」。
       > **产品坏了的时候，判据要照样把话说完。** */
    await writeFile(fresh, "正在写", "utf8");
    await utimes(fresh, old, old);
    await sweepTmpIn(dir, { force: true });
    ok("**对照组**：同一个 tmp 推老之后，同一次扫描就删它了（「不碰」不是因为扫描不工作）", !existsSync(fresh));
  }

  /* ── ⓒ 清缓存那一档连孤儿一起清，而且**不混进 `removed` 那一列** ── */
  {
    const dir2 = await makeProject("tmp随清缓存");
    await mkdir(join(dir2, "子目录"), { recursive: true });
    const a = await makeOrphan(join(dir2, "根上的.dc.html"));
    const b = await makeOrphan(join(dir2, "子目录", "深一层的.dc.html"));
    const c = await makeOrphan(join(assetDir(dir2, "snapshots"), "记录目录里的.json"));
    const 别人的 = join(dir2, "子目录", "别人的.tmp");
    await writeFile(别人的, "用户的", "utf8");
    await utimes(别人的, old, old);
    const r = await clearProjectCache(dir2);
    ok("**清缓存把三个孤儿都清了**（项目根 · 子目录 · 记录目录里）",
       r.tmpOrphans === 3 && !existsSync(a) && !existsSync(b) && !existsSync(c), { 清掉: r.tmpOrphans });
    ok("用户自己的 `.tmp` 照旧不动", existsSync(别人的));
    ok("**孤儿不混进「删掉了哪几样」那一列**（那一列是「你点名要清的缓存」）",
       !r.removed.some((x) => x.includes(".tmp")), { removed: r.removed });
    /* ⚠️ **去盘上看，不看回执**：`r.kept` 是产品自己算出来的那一列，
       拿它当判据等于「问它自己有没有删错」—— 而那正好是出错时它会答错的那个问题。
       上一条孤儿的判据也是 `existsSync`，口径要一致。 */
    const 还在的 = ASSET_ENTRIES.filter((x) => existsSync(join(recordDirOf(dir2), x)));
    ok("资产那六样照旧一个都没动（去盘上数的，不是读它的回执）",
       还在的.length === ASSET_ENTRIES.length, { 盘上还在: 还在的.length, 应该: ASSET_ENTRIES.length });
  }

  /* ── ⓓ 启动时扫状态目录：跳过 git/（递归扫描的成本在走过多少目录）── */
  {
    const st = join(STATE_ROOT, ".umbrastudio");
    await mkdir(st, { recursive: true });
    const clock = await makeOrphan(join(st, "clock.json"), "{\"seen\":1}");   // 实测那两个孤儿就长这样
    const gitDir = join(st, "git", "假仓库");
    await mkdir(gitDir, { recursive: true });
    const inGit = await makeOrphan(join(gitDir, "git 自己的东西"));
    const r = await sweepTmpUnder(STATE_ROOT);
    ok("**启动时那一扫清掉了状态目录里的孤儿**（`doc/24` §19.5 量到的就是这一种）",
       !existsSync(clock), { 清掉: r.removed, 走过目录: r.dirs });
    ok("**`git/` 下面整个跳过**（我们从不往那里原子写，而那下面是几千个目录）", existsSync(inGit));
    await rm(inGit, { force: true });
  }
}

/* ── 收尾 ── */
await rm(BOX, { recursive: true, force: true });
await rm(STATE, { recursive: true, force: true });
ok("（收尾）临时状态目录删掉了", !existsSync(STATE));
ok("（收尾）临时样本目录删掉了", !existsSync(BOX));
{
  const { readFile } = await import("node:fs/promises");
  const real = join(TOOL_ROOT, ".umbrastudio", "workspace.json");
  let 脏了 = false, 读到 = "没有这个文件";
  try {
    const txt = await readFile(real, "utf8");
    读到 = `${txt.length} 字节 · ${(JSON.parse(txt).recents ?? []).length} 条`;
    脏了 = /umbra-purgebox-|umbra-purgetest-/.test(txt);
  } catch { /* 没有也行 */ }
  ok("**（收尾）用户真实的「最近打开」里没有我造的任何一条**", !脏了, { 查的: real, 读到 });
  const realGit = join(TOOL_ROOT, ".umbrastudio", "git");
  const { readdir } = await import("node:fs/promises");
  let 真仓库里有我的 = 0;
  try { 真仓库里有我的 = (await readdir(realGit)).filter((d) => /清缓存|还在的项目|删掉的项目|忘掉它|首页/.test(d)).length; } catch { /* 没有也行 */ }
  ok("**（收尾）用户真实的兜底仓库目录里没有我造的任何一个**", 真仓库里有我的 === 0, { 查的: realGit, 找到: 真仓库里有我的 });
}

/* ── ⑦ 盘没挂上 ≠ 目录没了（issue #183）──
   ⚠️ 原来 `missing` 的判据只有「`existsSync` 为假」，而那**分不开两件事**。
   于是一键「清掉已失效的记录」会把**外接盘 / NAS 没挂上**的项目的
   git 兜底历史（外部改动的唯一记录）一起删掉，而回执说的是「那些目录本来就没了」。
   ⚠️ 这一节的样本**不需要真的外接盘**：判准问的是「从这个路径往上，第一个
   还存在的祖先是谁」—— `/Volumes/<一个不存在的盘名>/某项目` 的上级不在、
   而 `/Volumes` 在，这就是「中间整段没挂上」的形状。 */
console.log("\n⑦ 盘没挂上 ≠ 目录没了（issue #183）");
{
  const { readFile: rdf2, writeFile: wrf2 } = await import("node:fs/promises");
  const WS = join(STATE_ROOT, ".umbrastudio", "workspace.json");
  const 没了 = await makeProject("盘测试-真删掉");
  await touchProject(没了, "盘测试-真删掉");
  await ensureRepo(没了);
  await commitPaths(没了, ["稿.dc.html"], "第一版");
  const gdGone = gitDirOfProject(没了);

  /* 够不着那条：直接写进 workspace.json（那个路径造不出来，也不该造） */
  const 盘上 = process.platform === "win32"
    ? "Q:\\umbra-unreachable-test\\某项目"
    : join("/Volumes", "umbra-盘没接上-" + Math.random().toString(36).slice(2, 8), "某项目");
  await ensureRepo(盘上);                       // 兜底仓库住在 STATE_ROOT，和那块盘无关
  const gdAway = gitDirOfProject(盘上);
  const ws = JSON.parse(await rdf2(WS, "utf8")) as { recents: Array<Record<string, unknown>> };
  ws.recents.unshift({ dir: 盘上, name: "某项目", title: "某项目", lastOpened: new Date().toISOString(), dev: 1, ino: 12345, birthtimeMs: 1 });
  await wrf2(WS, JSON.stringify(ws, null, 2) + "\n", "utf8");

  await rm(没了, { recursive: true, force: true });
  const rec = (await listRecentProjects(50)).recents;
  const idOf = (d: string) => rec.find((r) => r.dir === d)?.identity;
  ok("**上级还在、自己不在 → `missing`**（真被删了 / 移走了）", idOf(没了) === "missing", idOf(没了));
  ok("**中间整段都不在 → `unreachable`**（那一块没挂上）", idOf(盘上) === "unreachable", idOf(盘上));
  ok("（前提）两个兜底仓库都建起来了", existsSync(gdGone) && existsSync(gdAway));

  const r = await clearStaleRecords();
  ok("**只清了真没了那条**", r.removed.length === 1 && r.removed[0]?.dir === 没了, r.removed.map((x) => x.dir));
  ok("**盘没接上那条的兜底历史一个字节都没动**", existsSync(gdAway), gdAway);
  ok("真没了那条的兜底仓库清掉了（这一档的本职没丢）", !existsSync(gdGone));
  ok("**回执里把跳过的那条说出来了**（不说的话用户会以为清理没生效而反复点）",
     r.skippedUnreachable.length === 1 && r.skippedUnreachable[0]?.dir === 盘上, r.skippedUnreachable);
  const left = (await listRecentProjects(50)).recents;
  ok("它还在列表里，而且还是 `unreachable`",
     left.find((x) => x.dir === 盘上)?.identity === "unreachable",
     left.map((x) => `${x.name}:${x.identity}`));
  /* 收尾：把我塞进列表的那条撤掉 */
  await removeRecentProject(盘上);
}

/* ══════════════════════════════════════════════════════════════════════
   ⑥ 两个核心进程交替写索引（issue #189）

   ⚠️⚠️ **issue 里建议的模拟方式（`__resetRecordCache()` 当作「切到第二个进程」）
   在旧代码下也会通过** —— reset 清掉缓存之后，旧的 `load()` 同样会重读盘。
   那条判据测的是「今天恰好没事」。

   真正要造的状态是：**缓存里有旧数据，而盘上已经被别人改过**。
   所以这里**不 reset**，直接往盘上的 `index.json` 写一份「另一个进程写的」内容，
   再让本进程继续建记录 —— 旧代码会拿缓存覆盖掉对方那条，新代码会先发现
   `mtime + size` 变了、重读、再合并。
   > **模拟并发不是「清掉状态」，是「让两份状态不一致」。**
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑥ 两个核心进程交替写 records/index.json（issue #189）");
{
  const { recordIdFor, allRecords, unindexedRecordDirs, dropOrphanRecords, dropRecord, recordsRoot } =
    await import("./records.js");
  const { readFile: rdf, writeFile: wrf, mkdir: mkd, readdir: rdd } = await import("node:fs/promises");
  const IX = join(recordsRoot(), "index.json");

  /* ── ⓐ A 建一条，然后「另一个进程」写盘，A 再建一条 ── */
  const dirA = join(BOX, "并发-甲"); await mkd(dirA, { recursive: true });
  const idA = recordIdFor(dirA);                       // A：缓存与盘都有 idA
  ok("（前提）甲这条真写进索引了", allRecords().some((r) => r.id === idA), idA);

  /* 另一个进程：读盘、加自己那条、写回。**本进程的缓存不动** —— 这是关键 */
  const onDisk = JSON.parse(await rdf(IX, "utf8")) as { records: { id: string; dir: string; at: string }[] };
  const idB = "r" + "b".repeat(16);
  /* ⚠️ 乙指向的**项目目录也得真建出来** —— 不然它会被既有的、而且正确的那条
     「指着的目录已经不在 = 失效」给清掉，于是判据红在一个和 #189 无关的理由上。
     第一版就漏了这个，读数是「乙的快照文件 ENOENT」，看着像产品删了它。
     > **夹具不全和产品有缺陷，报出来的样子一样。** */
  const dirB = join(BOX, "并发-乙"); await mkd(dirB, { recursive: true });
  onDisk.records.push({ id: idB, dir: dirB, at: new Date().toISOString() });
  await wrf(IX, JSON.stringify(onDisk, null, 2) + "\n", "utf8");
  await mkd(join(recordsRoot(), idB), { recursive: true });
  await wrf(join(recordsRoot(), idB, "snapshots.txt"), "乙进程写的快照", "utf8");

  /* A 继续干活：再建一条 */
  const dirC = join(BOX, "并发-丙"); await mkd(dirC, { recursive: true });
  const idC = recordIdFor(dirC);

  const after = JSON.parse(await rdf(IX, "utf8")) as { records: { id: string }[] };
  const ids = new Set(after.records.map((r) => r.id));
  ok("**三条记录都在索引里 —— 后写的没有抹掉另一个进程刚写的那条**",
     ids.has(idA) && ids.has(idB) && ids.has(idC),
     { 甲: ids.has(idA), 乙: ids.has(idB), 丙: ids.has(idC), 共: after.records.length });

  /* ── ⓐ′ **读**那一半：别的进程刚写的那条，本进程要认得出来 ──
     ⚠️ 这一条是补上来的。ⓐ 全绿而**撤掉 `load()` 的盘上核对它照样绿** ——
     因为 `writeIndex()` 自己会重读盘，**写**那条路被合并逻辑单独救下了。
     守在 `load()` 上的是**读**：缓存里没有对方刚写的那条，
     `recordIdFor(那个目录)` 就会以为它不存在而**新建第二条指向同一个目录** ——
     于是同一个项目有两份历史，而界面只看得到新那份。
     > **一个修法有两条生效路径时，只拆一条判据不会红**（`doc/24` §24.5 同族，第 2 次）。 */
  /* ⚠️ **路径要 `realpath` 过**：产品内部用 `canon()`，而 macOS 的 `/var` 是链接
     （`BOX` 就在 `/var/folders` 下）。不解析的话这条判据会红在「路径对不上」
     而不是红在 #189 上 —— **一条红的判据，理由也可能是错的**（同一个坑第 4 次）。 */
  const { realpathSync: rps } = await import("node:fs");
  const dirE0 = join(BOX, "并发-戊"); await mkd(dirE0, { recursive: true });
  const dirE = rps(dirE0);
  const ix2 = JSON.parse(await rdf(IX, "utf8")) as { records: { id: string; dir: string; at: string }[] };
  const idE = "r" + "e".repeat(16);
  ix2.records.push({ id: idE, dir: dirE, at: new Date().toISOString() });
  await wrf(IX, JSON.stringify(ix2, null, 2) + "\n", "utf8");
  const seenE = recordIdFor(dirE);
  ok("**认得出另一个进程刚为这个目录写的那条记录**（不新建第二条 → 历史不分叉）",
     seenE === idE, { 期望: idE, 实得: seenE });
  ok("索引里这个目录只有一条记录",
     allRecords().filter((r) => r.dir === dirE).length === 1,
     allRecords().filter((r) => r.dir === dirE).map((r) => r.id));

  /* ── ⓑ 于是也就没有「孤儿」可清 ── */
  ok("**没有「索引里没有而盘上有」的目录**（乙那条已经在索引里，不会被当垃圾）",
     unindexedRecordDirs().length === 0, unindexedRecordDirs());
  const r1 = dropOrphanRecords();
  ok("**「清除已失效的记录」一个字节都没动乙的快照**",
     (await rdf(join(recordsRoot(), idB, "snapshots.txt"), "utf8")) === "乙进程写的快照",
     r1);

  /* ── ⓒ 合并写不能把删除弄坏（我改 `save` 时最容易破的那一条）── */
  const dirD = join(BOX, "并发-丁"); await mkd(dirD, { recursive: true });
  const idD = recordIdFor(dirD);
  dropRecord(idD);
  ok("**删一条仍然真的删掉了**（合并写最容易把删除变成「加回来」）",
     !allRecords().some((r) => r.id === idD), idD);

  /* ── ⓓ 真·来源不明的目录：收编，不删 ──
     ⚠️ 这一条造的是**索引里压根没有**的目录（即已经被抹掉之后的样子）。
     原来的代码会 `rm -rf` 它。 */
  const lost = "r" + "c".repeat(16);
  await mkd(join(recordsRoot(), lost, "snapshots"), { recursive: true });
  await wrf(join(recordsRoot(), lost, "snapshots", "v1.html"), "<p>用户的历史</p>", "utf8");
  ok("（前提）它确实在索引外", unindexedRecordDirs().includes(lost), unindexedRecordDirs());
  const r2 = dropOrphanRecords();
  ok("**来源不明的记录目录被收编而不是删掉**", r2.adopted.includes(lost), r2);
  ok("**里面用户的历史一个字节没变**",
     (await rdf(join(recordsRoot(), lost, "snapshots", "v1.html"), "utf8")) === "<p>用户的历史</p>");
  ok("收编之后它在索引里，并且标着 `orphan`",
     allRecords().some((r) => r.id === lost && (r as { orphan?: boolean }).orphan === true));
  /* 再点一次 —— 收编回来的 `dir` 是空串，而「`dir` 为空 = 失效」会把它删掉 */
  const r3 = dropOrphanRecords();
  ok("**再点一次「清除已失效的记录」它还在**（`dir` 为空不等于失效）",
     (await rdd(recordsRoot())).includes(lost), r3);

  /* ── ⓔ 空壳照旧清掉 —— 不然这件事就从「别乱删」变成「什么都不删」 ── */
  const shell = "r" + "d".repeat(16);
  await mkd(join(recordsRoot(), shell), { recursive: true });
  const r4 = dropOrphanRecords();
  ok("**完全空的记录目录照旧清掉**（那确实只是垃圾）",
     r4.unindexed.includes(shell) && !(await rdd(recordsRoot())).includes(shell), r4);
}

console.log(`\n${bad ? "✗" : "✓"} 清除缓存三档 ${n - bad}/${n}\n`);
process.exit(bad ? 1 : 0);
