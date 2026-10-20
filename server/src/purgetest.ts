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
import { join } from "node:path";

const STATE = await mkdtemp(join(tmpdir(), "umbra-purgetest-"));
process.env.UMBRASTUDIO_STATE_DIR = STATE;
process.env.UMBRASTUDIO_NO_GIT = "";          // 这一套要真建兜底仓库

const { clearProjectCache, clearStaleRecords, forgetProject, refuseIfDangerous, ASSET_ENTRIES } = await import("./purge.js");
const { touchProject, listRecentProjects, removeRecentProject } = await import("./workspace.js");
const { ensureRepo, gitDirOfProject, commitPaths } = await import("./gitkeep.js");
const { STATE_ROOT, TOOL_ROOT } = await import("./project.js");

const BOX = await mkdtemp(join(tmpdir(), "umbra-purgebox-"));
let bad = 0, n = 0;
function ok(label: string, cond: boolean, extra?: unknown): void {
  n++; if (!cond) bad++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
}

console.log(`\n清除缓存三档 · 状态目录 ${STATE}\n`);
ok("（前提）状态目录是临时的 —— 这一套不碰用户真实的列表与兜底仓库",
   STATE_ROOT.includes("umbra-purgetest-") && STATE_ROOT !== TOOL_ROOT, STATE_ROOT);

/** 造一个「什么都有」的项目：缓存四样 + 资产六样 */
async function makeProject(name: string): Promise<string> {
  const dir = join(BOX, name);
  const ud = join(dir, ".umbrastudio");
  await mkdir(join(ud, "checks", "一次体检"), { recursive: true });
  await writeFile(join(ud, "checks", "一次体检", "report.json"), '{"ok":true}', "utf8");
  await mkdir(join(ud, "shots"), { recursive: true });
  await writeFile(join(ud, "shots", "缩略图.png"), Buffer.alloc(2048), "utf8");
  await writeFile(join(ud, "index-data.json"), JSON.stringify({ drafts: [] }), "utf8");
  await writeFile(join(dir, "index-data.js"), "window.__UD_INDEX = {};", "utf8");
  /* 资产六样 —— 下面每一样都有自己一条判据 */
  await mkdir(join(ud, "snapshots", "稿.dc.html"), { recursive: true });
  await writeFile(join(ud, "snapshots", "稿.dc.html", "s1.src.gz"), Buffer.alloc(99), "utf8");
  await writeFile(join(ud, "comments.json"), '{"稿.dc.html":[{"text":"这里改一下"}]}', "utf8");
  await mkdir(join(ud, "trash", "20261020"), { recursive: true });
  await writeFile(join(ud, "trash", "20261020", "删掉的.dc.html"), "<x-dc></x-dc>", "utf8");
  await mkdir(join(ud, "templates"), { recursive: true });
  await writeFile(join(ud, "templates", "我的模板.dc.html"), "<x-dc></x-dc>", "utf8");
  await mkdir(join(ud, "staged"), { recursive: true });
  await writeFile(join(ud, "staged", "草稿.json"), "{}", "utf8");
  await mkdir(join(ud, "chats"), { recursive: true });
  await writeFile(join(ud, "chats", "chat-1.json"), '{"messages":[{"role":"user"}]}', "utf8");
  await writeFile(join(dir, "稿.dc.html"), "<x-dc></x-dc>", "utf8");
  return dir;
}

/* ── ① 清缓存：删四样，资产六样一个都不许动 ── */
{
  const dir = await makeProject("清缓存");
  const ud = join(dir, ".umbrastudio");
  const r = await clearProjectCache(dir);

  ok("删掉的正是点名那四样（不多不少）",
     r.removed.slice().sort().join(" · ") === [".umbrastudio/checks", ".umbrastudio/shots", ".umbrastudio/index-data.json", "index-data.js"].sort().join(" · "),
     r.removed);
  ok("腾出的字节数是真算的（不是 0）", r.freedBytes > 2048, r.freedBytes);
  ok("体检报告没了", !existsSync(join(ud, "checks")));
  ok("缩略图没了", !existsSync(join(ud, "shots")));
  ok("索引数据没了", !existsSync(join(ud, "index-data.json")));
  ok("项目根那份 index-data.js 也没了", !existsSync(join(dir, "index-data.js")));

  /* ⚠️ **资产逐个验，不写「至少一条」** —— §145.4 那条「『至少一条』几乎总是假判据」。
     六样里漏删一样就是用户的一类历史没了，而「还剩五样」这种判据照样绿。 */
  ok("**快照还在**（它是过去的内容，删了算不回来）", existsSync(join(ud, "snapshots", "稿.dc.html", "s1.src.gz")));
  ok("**评论还在**", existsSync(join(ud, "comments.json")));
  ok("**回收站还在**", existsSync(join(ud, "trash", "20261020", "删掉的.dc.html")));
  ok("**模板还在**", existsSync(join(ud, "templates", "我的模板.dc.html")));
  ok("**没落盘的草稿还在**", existsSync(join(ud, "staged", "草稿.json")));
  ok("**会话历史还在**", existsSync(join(ud, "chats", "chat-1.json")));
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
  ok("它的资产当然也还在", existsSync(join(活着, ".umbrastudio", "snapshots", "稿.dc.html", "s1.src.gz")));
}

/* ── ③ 忘掉这一个：要确认，而且和「从列表去掉」分得清 ── */
{
  const dir = await makeProject("忘掉它");
  await touchProject(dir, "忘掉它");
  await ensureRepo(dir);
  await commitPaths(dir, ["稿.dc.html"], "第一版");
  const gd = gitDirOfProject(dir);
  ok("（前提）记录和兜底仓库都在", existsSync(gd) && !!(await listRecentProjects(50)).recents.find((r) => r.dir === dir));

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
  /* ⚠️ 这一条是**诚实度判据**：今天快照还在用户的项目目录里，而这一件没有权力删它 ——
     回执必须说出来，否则用户以为「忘掉」= 全删干净了。 */
  ok("**回执照实说项目目录里那一份还在**（M14-4 之后历史才全在我们这边）",
     r.stillOnDisk === join(dir, ".umbrastudio"), r.stillOnDisk);
  ok("而那一份确实还在（所以上一条不是空话）", existsSync(join(dir, ".umbrastudio", "snapshots", "稿.dc.html", "s1.src.gz")));
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

console.log(`\n${bad ? "✗" : "✓"} 清除缓存三档 ${n - bad}/${n}\n`);
process.exit(bad ? 1 : 0);
