import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lineDelta, listSnapshots, normalizeRel, readAnyFile, sha256 } from "./files.js";
import { pathKey } from "./history.js";
import type { Project } from "./project.js";

/** 草稿暂存（M10-2c，设计侧第十三轮定形制）。
 *
 *  ### 它解决的是什么
 *  用户在编辑器里改了几行没落盘，**刷新就没了，而且原来没有任何提示**。
 *  M10-2b 那一批加了 `beforeunload`，但那只是「拦住最坏的那一下」——
 *  **它看起来像已经处理了，而实际上一旦点了「离开」还是全丢。**
 *  「拦了一下」和「不会丢」之间的差距，用户是看不见的。
 *
 *  ### 为什么必须由宿主做
 *  **插件自己存不了。** 它在不透明源的 iframe 里，`localStorage` 访问会抛。
 *  所以这一层只能宿主兜 —— 插件把内容交过来，我们落到项目的 `.umbrastudio/staged/`。
 *
 *  ### ⚠️ 这**不是**纪律①「唯一写入口」的例外
 *  暂存写的是 `.umbrastudio/` 下的**工具状态**，和 `snapshots/` 同类，
 *  **不是用户的文件**。纪律①管的是「往用户文件里写东西」那条路
 *  （归一化 → `@ds` 展开 → `__resources` 注入 → 节点地址 → 快照 → changelog）。
 *  草稿一旦要变成用户文件里的内容（「用草稿覆盖」），**那一步走 `write_file`**，
 *  一样都不少。
 *
 *  ### 难的不是存，是回来那一下
 *  暂存的草稿和盘上的文件可能已经不是同一个底稿了（别的编辑器改过、AI 改过、回退过）。
 *  所以每一份草稿都记着**它是在哪一版上改的**（`baseSha` / `baseVersion`），
 *  打开时比一次：一样 = `fresh`（可以直接恢复），不一样 = `stale`（**不给直接恢复**）。
 *  设计侧这一条判得很准 —— 直接恢复会静默盖掉别人的改动。
 */
export interface StagedDraft {
  path: string;
  content: string;
  /** 存下这一份的时刻 */
  at: string;
  /** 存的时候**盘上那份**的 sha256。`"0"` = 当时盘上没有这个文件（新建中） */
  baseSha: string;
  /** 存的时候盘上那份的最新快照号，给「草稿是在 s6 上改的」那句话用 */
  baseVersion: string | null;
}

/** 暂存文件的落点。**和快照共用 `pathKey`** —— 它是「相对路径 → 状态目录名」
 *  的唯一一处定义（issue #47）。
 *  原来这里自己写了一份 `/` → `__`，而那个编码不可逆：
 *  `docs/x.md` 和 `docs__x.md` 落到同一个文件，于是两份文件的草稿互相覆盖。
 *  **两处各写一份，就是那条 bug 的来源。** */
function stagedPath(p: Project, rel: string): string {
  return join(p.dir, ".umbrastudio", "staged", `${pathKey(rel)}.json`);
}

/** 旧编码下的落点。**只用来读** —— 升级之后还能找回以前存的草稿。 */
function legacyStagedPath(p: Project, rel: string): string {
  return join(p.dir, ".umbrastudio", "staged", `${rel.replace(/[\\/]/g, "__")}.json`);
}

export interface StagedInfo {
  path: string;
  has: boolean;
  content?: string;
  at?: string;
  baseVersion?: string | null;
  /** 现在盘上那份的最新快照号 */
  currentVersion?: string | null;
  /** 草稿的底稿和现在盘上那份**不是同一个** —— 不给直接恢复 */
  stale?: boolean;
  /** 草稿相对**盘上那份**增删了几行，给横条上那个读数用 */
  delta?: { plus: number; minus: number } | null;
  note?: string;
}

/** 存一份草稿。
 *
 *  ⚠️ **内容和盘上一样时不存，反而把已有的清掉。**
 *  不这么做的话「改了又改回来」会留下一份草稿，
 *  用户下次打开看到「有一份没落盘的草稿」，点恢复**什么都不变** ——
 *  一条说了等于没说的提示，比不提示更糟（它会让人怀疑别的提示也是假的）。
 */
export async function stageDraft(p: Project, relRaw: string, content: string): Promise<{ path: string; staged: boolean; why?: string }> {
  const rel = normalizeRel(p, relRaw);
  const cur = await readAnyFile(p, rel).catch(() => null);
  const onDisk = cur?.content ?? null;
  if (onDisk !== null && onDisk === content) {
    await clearStagedDraft(p, rel);
    return { path: rel, staged: false, why: "和盘上那份一样，没什么可暂存的（已清掉旧草稿）" };
  }
  const snaps = await listSnapshots(p, rel);
  const d: StagedDraft = {
    path: rel,
    content,
    at: new Date().toISOString(),
    baseSha: onDisk === null ? "0" : sha256(onDisk),
    baseVersion: snaps.length ? snaps[snaps.length - 1]! : null,
  };
  const f = stagedPath(p, rel);
  await mkdir(join(p.dir, ".umbrastudio", "staged"), { recursive: true });
  await writeFile(f, JSON.stringify(d), "utf8");
  return { path: rel, staged: true };
}

/** 有没有草稿、它还能不能直接恢复。 */
export async function getStagedDraft(p: Project, relRaw: string): Promise<StagedInfo> {
  const rel = normalizeRel(p, relRaw);
  /* 新名字没有而旧名字有时读旧的（迁移期兼容，只读不写） */
  let f = stagedPath(p, rel);
  if (!existsSync(f) && existsSync(legacyStagedPath(p, rel))) f = legacyStagedPath(p, rel);
  if (!existsSync(f)) return { path: rel, has: false };
  let d: StagedDraft;
  try { d = JSON.parse(await readFile(f, "utf8")) as StagedDraft; }
  catch {
    /* ⚠️ 坏掉的草稿**直接清掉并说一句**，不要留着。
       留着的话每次打开都弹一条恢复不了的提示，而用户没有任何办法让它消失。 */
    await rm(f, { force: true });
    return { path: rel, has: false, note: "有一份草稿但读不出来，已清掉" };
  }
  /* ⚠️ **核对草稿里记的路径**（issue #47 的第 3 步）。
     不管编码怎么改，这一道都该在 —— 它是**和编码无关的那一层保险**：
     撞号时这里会把「另一个文件的草稿」挡掉，而不是让界面说
     「有一份没落盘的草稿」然后把别的文件内容覆盖进来。
     旧编码存的草稿走到这里也会被挡（它记的 `path` 是另一份），这是对的。 */
  if (d.path && d.path !== rel) {
    return { path: rel, has: false, note: `这里有一份草稿但它记的是 ${d.path}，不是这个文件 —— 没拿给你（旧版本的路径编码会撞号，issue #47）` };
  }
  const cur = await readAnyFile(p, rel).catch(() => null);
  const onDisk = cur?.content ?? null;
  const curSha = onDisk === null ? "0" : sha256(onDisk);
  const snaps = await listSnapshots(p, rel);
  return {
    path: rel,
    has: true,
    content: d.content,
    at: d.at,
    baseVersion: d.baseVersion ?? null,
    currentVersion: snaps.length ? snaps[snaps.length - 1]! : null,
    stale: curSha !== d.baseSha,
    delta: onDisk === null ? null : lineDelta(onDisk, d.content),
  };
}

/** 丢掉草稿。已经没有也算成功 —— 调用方不该为「本来就没有」写一条分支。 */
export async function clearStagedDraft(p: Project, relRaw: string): Promise<{ path: string; cleared: boolean }> {
  const rel = normalizeRel(p, relRaw);
  /* **两个名字都清** —— 只清新的话，旧编码存的那一份会一直被 `getStagedDraft`
     读到（然后被上面那道核对挡掉），用户点「丢掉」之后它还在盘上。 */
  const f = stagedPath(p, rel), old = legacyStagedPath(p, rel);
  const had = existsSync(f) || existsSync(old);
  await rm(f, { force: true });
  if (old !== f) await rm(old, { force: true });
  return { path: rel, cleared: had };
}

/** 这个项目里还挂着哪些草稿。给「哪些文件我改了没落盘」那类问题用（MCP 面上有用）。 */
export async function listStagedDrafts(p: Project): Promise<Array<{ path: string; at: string; stale: boolean }>> {
  const dir = join(p.dir, ".umbrastudio", "staged");
  if (!existsSync(dir)) return [];
  const out: Array<{ path: string; at: string; stale: boolean }> = [];
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const d = JSON.parse(await readFile(join(dir, name), "utf8")) as StagedDraft;
      /* ⚠️ 用草稿里记的 `path` 而不是把文件名反解码 —— `/` → `__` 那一步**不可逆**
         （`a/b.ts` 和 `a__b.ts` 会编成同一个名字）。反解码出来的路径可能压根不存在。 */
      const info = await getStagedDraft(p, d.path);
      if (info.has) out.push({ path: d.path, at: d.at, stale: !!info.stale });
    } catch { /* 坏的跳过 —— 一份坏数据不该让整个列表空掉（§九十二） */ }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}
