/** **一个项目的「记录」住在哪** —— M14-4 B1（`doc/24` §八 / §19.2，决策 `doc/11` Q62 / Q72）。
 *
 *  ### 它要解决的那件事
 *  用户 2026-10-20 的原话：「无论临时打开文件还是导入文件夹，**都不该在用户那个目录里新增任何东西**；
 *  要新增的统一放我们自己的资源地址，每导入一条就在那儿建一个文件夹装这条记录除文件本身以外的一切。」
 *
 *  2026-10-21 sam 实测踩到了它的后果：用「新建项目」打开 `Geek/doc`，
 *  我们往他的文档目录写了 **23 个文件 · 约 780 KB**，还改了他的 `.gitignore`。
 *  A 段（`statedirs.ts`）已经把「旁数据在哪」收口成一处；**这一段把那一处翻过来**。
 *
 *  ### 键为什么是随机 ID，不是路径哈希（Q72，用户 2026-10-21 拍板）
 *  原方案是 `sha256(realpath(dir))` 前 16 位。那样**目录改个名，历史就断**——
 *  而改名是用户每天都在做的事。所以键换成**与路径无关的随机 ID**，
 *  路径只是这条记录的一个**属性**，可以变。
 *
 *  ⚠️ **存量迁移不做**（同一次拍板）：用户的原话是「现在都是测试的，完全可以重新设计，
 *  历史的不用考虑，丢掉都没事」。这砍掉的是 B1 里**唯一一段会动用户已有数据**的逻辑 ——
 *  也就是唯一一段「写错了会丢东西」的。
 *  ⚠️ **「不用考虑」不等于「去删」**：旧的 `<项目>/.umbrastudio/` 留在原地，**不迁也不删**
 *  （纪律⑥ —— 允许我们不管它，不是要我们删它）。
 *
 *  ### 三条查找规则，顺序就是分寸所在
 *  1. **路径对得上、指纹也对得上**（或者老条目没指纹）→ 就是它。
 *  2. **路径对得上、指纹不对** → 这个位置**换了一个目录**（M14-2 的 `replaced`）→
 *     **另起一条新记录，不继承**。
 *     ⚠️ 这正是 M14-2 当时**承诺了而做不到**的那一半：那时三处键都是纯路径，
 *     「不许静默继承」只能靠弹一句话提醒，拦不住实际的继承。现在键是 ID，才真的拦得住。
 *  3. **路径对不上，但有一条记录的旧路径已经不在了、而它的指纹正是现在这个目录** →
 *     **目录被改名或移动了**，把记录改绑到新路径（Q72 要的那一半）。
 *
 *  ⚠️ 第 3 条是**拿指纹认人**，而 M14-2 写过「不可靠的信号用来报警是安全的，用来认人才危险」。
 *  这里敢用，是因为两个前提同时成立：① 只在 `ino > 0`（量得到）时才比；
 *  ② 要求**旧路径已经不在**。两个不同目录要撞上，得 `ino` 被回收**且** `birthtimeMs`
 *  恰好一毫秒不差 —— 而真要撞上了，代价也只是「改名后的目录继承了一份快照历史」，
 *  不是数据被删。**代价不对称，所以这一档值得冒。**
 *
 *  ### 为什么是同步 API
 *  `assetDir()` 有 **20 多个调用点**，全是同步地拼一个路径。
 *  改成异步等于把这 20 多处连同它们的调用者一起染成 async ——
 *  **一次搬迁顺手做一次大改，是让搬迁出错的最可靠办法**。
 *  索引文件只有几 KB，`readFileSync` / `writeFileSync` 在这里的代价可以忽略。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { STATE_ROOT } from "./project.js";
import { UD_DIRNAME } from "./statedirs.js";
import { tmpNameFor } from "./tmpfiles.js";

/** 所有记录的根。`STATE_ROOT/.umbrastudio/records/` */
export const recordsRoot = (): string => join(STATE_ROOT, UD_DIRNAME, "records");
const indexFile = (): string => join(recordsRoot(), "index.json");

export interface RecordEntry {
  /** 随机 ID，**与路径无关**（Q72）。目录名就是它 */
  id: string;
  /** 这条记录现在指着哪个目录（`realpath`，拿不到就 `resolve`） */
  dir: string;
  /* 指纹（和 `workspace.ts` 同一套口径）。都可缺 —— 平台给不出 inode 时就缺 */
  dev?: number;
  ino?: number;
  birthtimeMs?: number;
  /** 建这条记录的时间 */
  at: string;
}

interface RecordIndex { records: RecordEntry[] }

/** 进程内缓存。**写也走这里**，所以缓存和盘上不会分叉。 */
let cache: RecordIndex | null = null;
/** 缓存是按哪个 `STATE_ROOT` 算的 —— 回归会在一个进程里换状态目录，不记就会读到上一个的 */
let cacheRoot: string | null = null;

function load(): RecordIndex {
  const root = recordsRoot();
  if (cache && cacheRoot === root) return cache;
  cacheRoot = root;
  try {
    const raw = JSON.parse(readFileSync(indexFile(), "utf8")) as RecordIndex;
    cache = Array.isArray(raw?.records) ? { records: raw.records.filter((r) => r && typeof r.id === "string" && typeof r.dir === "string") } : { records: [] };
  } catch {
    /* 没有 / 坏了都当空 —— 这是我们自己的索引，坏了重新长出来就行（读宽容） */
    cache = { records: [] };
  }
  return cache;
}

function save(ix: RecordIndex): void {
  mkdirSync(recordsRoot(), { recursive: true });
  /* 临时名走唯一出处（M14-9）。原来是写死的 `index.json.tmp`：**没有 pid 也没有随机串**，
     两个进程同时存记录时第二个的 rename 会报 ENOENT —— 而那正是 `normalize.ts`
     里注释了半屏的那个坑，这里又犯了一次。 */
  const tmp = tmpNameFor(indexFile());
  writeFileSync(tmp, JSON.stringify(ix, null, 2) + "\n", "utf8");
  renameSync(tmp, indexFile());
  cache = ix;
  cacheRoot = recordsRoot();
}

/** 量一次目录指纹。口径**和 `workspace.ts` 的 `fingerprintOf` 一模一样** ——
 *  ⚠️ 两处口径不一致的话，M14-2 说「换了一个目录」而这里照样复用旧记录，
 *  用户会收到一句警告**然后看到旧项目的历史**，比不警告更让人糊涂。 */
function fingerprintOf(dir: string): { dev: number; ino: number; birthtimeMs: number } | null {
  try {
    const st = statSync(resolve(dir));
    if (!st.isDirectory()) return null;
    if (!Number.isFinite(st.ino) || st.ino <= 0) return null;
    return { dev: st.dev, ino: st.ino, birthtimeMs: Math.round(st.birthtimeMs) };
  } catch { return null; }
}

/** 规范化一个目录路径。**能 `realpath` 就 `realpath`** ——
 *  macOS 上 `/var` 是链接，不解会让同一个目录产生两条记录（`verbtest` / `dropFallbackRepos` 都踩过）。 */
function canon(dir: string): string {
  try { return realpathSync(resolve(dir)); } catch { return resolve(dir); }
}

/** 指纹对得上吗。`null` = 其中一边量不到，当「不知道」—— **不知道不算不对**。 */
function fpSame(r: RecordEntry, now: ReturnType<typeof fingerprintOf>): boolean | null {
  if (!now || typeof r.ino !== "number") return null;
  if (r.ino !== now.ino) return false;
  if (typeof r.birthtimeMs === "number" && r.birthtimeMs !== now.birthtimeMs) return false;
  return true;
}

const newId = (): string => "r" + randomBytes(8).toString("hex");

/** 这个项目目录的记录 ID。**没有就当场建一条**（只写索引，不建目录 —— 目录等第一次真写东西时才建）。 */
export function recordIdFor(projectDir: string): string {
  const dir = canon(projectDir);
  const ix = load();
  const now = fingerprintOf(dir);

  /* ① / ② 路径对得上 */
  const byPath = ix.records.find((r) => r.dir === dir);
  if (byPath) {
    const same = fpSame(byPath, now);
    if (same !== false) return byPath.id;                      // 对得上，或者量不到 → 就是它
    /* ② 这个位置换了一个目录 —— **不继承**。旧记录留着（它还是旧目录的历史），
       把它的 dir 清成空串表示「它指着的那个目录已经不是它了」 */
    byPath.dir = "";
    const fresh: RecordEntry = { id: newId(), dir, ...(now ?? {}), at: new Date().toISOString() };
    ix.records.push(fresh);
    save(ix);
    return fresh.id;
  }

  /* ③ 目录被改名 / 移动了：旧路径已经不在，而指纹正是现在这个目录 */
  if (now) {
    const moved = ix.records.find((r) => r.dir && r.dir !== dir && !existsSync(r.dir) && fpSame(r, now) === true);
    if (moved) { moved.dir = dir; save(ix); return moved.id; }
  }

  const fresh: RecordEntry = { id: newId(), dir, ...(now ?? {}), at: new Date().toISOString() };
  ix.records.push(fresh);
  save(ix);
  return fresh.id;
}

/** 这个项目的记录目录（绝对路径）。**不建目录** —— 建在真要写的那一刻（`mkdir recursive`）。 */
export const recordDirOf = (projectDir: string): string => join(recordsRoot(), recordIdFor(projectDir));

/** 只查不建：这个目录有记录吗。给「清理 / 导出」这类不该顺手建记录的地方用。 */
export function existingRecordIdFor(projectDir: string): string | null {
  const dir = canon(projectDir);
  return load().records.find((r) => r.dir === dir)?.id ?? null;
}

/** 全部记录（拷贝，外面改不动缓存）。 */
export const allRecords = (): RecordEntry[] => load().records.map((r) => ({ ...r }));

/** 把一条记录连同它的目录删掉（「忘掉这一个」走这里）。回 `true` = 真删了点什么。 */
export function dropRecord(id: string): boolean {
  const ix = load();
  const i = ix.records.findIndex((r) => r.id === id);
  const dir = join(recordsRoot(), id);
  let touched = false;
  if (existsSync(dir)) { rmrfSync(dir); touched = true; }
  if (i >= 0) { ix.records.splice(i, 1); save(ix); touched = true; }
  return touched;
}

/** 把一个现成的目录收编成某个项目的记录（导入备份走这里）。已有记录就**先删再换**。 */
export function adoptRecordDir(projectDir: string, from: string): string {
  const id = recordIdFor(projectDir);
  const dest = join(recordsRoot(), id);
  mkdirSync(recordsRoot(), { recursive: true });
  if (existsSync(dest)) rmrfSync(dest);
  renameSync(from, dest);
  return id;
}

const rmrfSync = (p: string): void => rmSync(p, { recursive: true, force: true });

/** 索引里没有、而盘上有的记录目录。**只可能是垃圾** ——
 *  索引是够到一条记录的唯一途径（`recordIdFor` 先写索引才建目录），
 *  索引里没有它就等于谁也打不开它，而它照样占着地方。
 *  ⚠️ **只报不删**，删的决定留给调用方 —— 这是「量到零 vs 仪器是零」那条纪律的用法：
 *  有一条判据专门盯这个数，它涨了说明某处写索引失败了，而那比「多占点地方」严重。 */
export function unindexedRecordDirs(): string[] {
  const root = recordsRoot();
  if (!existsSync(root)) return [];
  const known = new Set(load().records.map((r) => r.id));
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !known.has(e.name))
    .map((e) => e.name);
}

/** 清掉那些**指着的目录已经不在**的记录（「清除已失效的记录」那一档会调）。
 *  ⚠️ `dir` 为空串的那些是 ②「位置被换掉」留下的旧记录 —— 它们也算失效。
 *  ⚠️ 顺带把**索引里没有的目录**也收掉：它们谁也打不开，留着只是占地方。
 *  这一步**只放在这一件里**（用户明确点的「清除已失效的记录」），
 *  不放进回归收尾 —— 收尾那条路要尽量只碰自己造的东西。 */
export function dropOrphanRecords(): { ids: string[]; unindexed: string[] } {
  const ix = load();
  const dead = ix.records.filter((r) => !r.dir || !existsSync(r.dir));
  for (const r of dead) {
    const dir = join(recordsRoot(), r.id);
    if (existsSync(dir)) rmrfSync(dir);
  }
  if (dead.length) { ix.records = ix.records.filter((r) => !dead.includes(r)); save(ix); }
  const unindexed = unindexedRecordDirs();
  for (const name of unindexed) rmrfSync(join(recordsRoot(), name));
  return { ids: dead.map((r) => r.id), unindexed };
}

/* ══════════ M14-7：这个目录「准不准改」（Q70，用户 2026-10-21 拍板）══════════ */

/** 解锁标记：解锁过的目录在它自己的记录目录下有这一个文件。 */
const editableFlag = (projectDir: string): string => join(recordDirOf(projectDir), "editable");

/** 这个目录现在准不准我们动它的文件。
 *
 *  ### 为什么要有这道闸（Q70，`doc/24` §二十一）
 *  从「右键 → 打开方式」进来的那条路上，用户的意图**通常只是看一眼**，
 *  而我们这个窗口里坐着一个能调 `write_file` 的模型 ——
 *  一句「帮我把这段改通顺」就落盘了。
 *  > 这道闸的理由**不是「我们改不了」**（Notion 是那样，我们不是），
 *  > 是「**在我们还不确定你想不想让我们改的时候，先别改**」。
 *
 *  ### 判准为什么不是「`records/<key>/` 在不在」
 *  Q70 当初定的是那个，而 2026-10-22 落地时量了一次 —— **它有一个洞**：
 *  `stage_draft`（在编辑框里打字、还没落盘的暂存）会写进 `records/<id>/staged/`，
 *  而那一下就把记录目录建出来了 → **用户在只读状态下打几个字就把自己解锁了**。
 *  「暂存」恰恰是「还没落盘」，拿它当「可以落盘」的证据是反的。
 *  > **一个「存在性」判准，会被任何顺手建出那个东西的代码路径悄悄满足。**
 *  所以换成一个**只有显式解锁才会写**的标记文件。
 *
 *  ### 存量怎么办（不迁移，一次性认）
 *  两种目录直接**当成已解锁并补上标记**：
 *  · 有 `project.json` —— 用户显式接管过（`create_project` / `adopt_project` 都写它）；
 *  · 有 `snapshots/` —— 我们已经改过它的文件，历史就在那儿。
 *  ⚠️ **`staged` / `chats` / `cache` 不算**：前者是「还没落盘」，后两者不代表「动过文件」。
 *  这是一次性的认，认完就落标记，不会每次都算。 */
export function isEditable(projectDir: string): boolean {
  const dir = resolve(projectDir);
  const id = existingRecordIdFor(dir);
  if (id && existsSync(join(recordsRoot(), id, "editable"))) return true;
  /* 存量：显式接管过，或者我们已经存过它的快照 */
  const grandfathered = existsSync(join(dir, "project.json"))
    || (!!id && existsSync(join(recordsRoot(), id, "snapshots")));
  if (grandfathered) { markEditable(dir); return true; }
  return false;
}

/** 解锁：用户点了「开始编辑」。
 *  ⚠️ 幂等 —— 点两次、或者存量那条路和用户同时触发，都只是同一个文件。 */
export function markEditable(projectDir: string): string {
  const f = editableFlag(projectDir);
  mkdirSync(dirname(f), { recursive: true });
  if (!existsSync(f)) writeFileSync(f, new Date().toISOString() + "\n", "utf8");
  return f;
}

/** 清掉**指向某个目录树下**的记录（给回归收尾用，和 `dropFallbackReposUnder` 配对）。
 *
 *  ⚠️ **这件事 B1 一做完就必须有**：十几套回归跑在**真 `STATE_ROOT`** 上
 *  （`captest` / `filetest` / `lifecycletest` / `apitest` / `plugintest` / `difftest` …），
 *  而它们的样本项目在系统临时目录下、每轮都是新路径 —— 不清的话
 *  **每轮都在开发机的状态目录里多攒一条记录和一个目录**，
 *  正是 M14-6 那条「回归自己攒兜底仓库」（595 个 / 94 MB）的重演。
 *
 *  判准和 M14-6 一样只有一条、**不枚举名字**：指向这个目录树下 + （`onlyDead` 时）目标已经不在。
 *  ⚠️ `root` 要两种写法都比（macOS 上 `/var` 是链接 —— 同一个坑的第四次）。
 *
 *  ⚠️⚠️ **`onlyDead` 不传时的默认是「只删已经不在的」，和这个名字的字面读法相反。**
 *  一个叫 `onlyDead` 的可选布尔，自然读法是「不传 = false = 全删」——
 *  而这里的条件是 `opts?.onlyDead === false || !existsSync(dir)`，
 *  所以**不传等于 `true`**。要连「目标还在」的一起删，必须显式写 `{ onlyDead: false }`。
 *  2026-10-22 给 `shelltest` 加收尾时当场踩到：读数是「旁数据记录 **本来就没有**」，
 *  而索引里那一条明明在 —— **一句「本来就没有」把「我没删到」说成了「没有要删的」**。
 *  默认值**刻意不改**：这是一个删东西的函数，把默认从「保守」翻成「全删」，
 *  受影响的是所有不传 opts 的调用方，而他们原来依赖的正是那份保守。
 *  > **安全的默认值配一个会被读反的名字，代价是每个新调用方都要踩一次。**
 *  > 改不了默认值，就把这段话写在它正上方。 */
export function dropRecordsUnder(root: string, opts?: { onlyDead?: boolean }): { removed: string[] } {
  const roots = new Set([resolve(root), canon(root)]);
  const under = (dir: string) => [...roots].some((r) => dir === r || dir.startsWith(r + "/"));
  const ix = load();
  const hit = ix.records.filter((r) => r.dir && under(r.dir) && (opts?.onlyDead === false || !existsSync(r.dir)));
  for (const r of hit) {
    const d = join(recordsRoot(), r.id);
    if (existsSync(d)) rmrfSync(d);
  }
  if (hit.length) { ix.records = ix.records.filter((r) => !hit.includes(r)); save(ix); }
  return { removed: hit.map((r) => r.id) };
}

/** 只查不删：指向这个目录树下、而目标已经不在的记录还有几条。**给收尾自检用** ——
 *  「我删掉了 0 个」和「现在一个都不剩」是两句不同的话（`purge.ts` §223 同一条）。 */
export function deadRecordsUnder(root: string): string[] {
  const roots = new Set([resolve(root), canon(root)]);
  return load().records.filter((r) => r.dir && [...roots].some((x) => r.dir === x || r.dir.startsWith(x + "/")) && !existsSync(r.dir)).map((r) => r.id);
}

/** 只给回归用：忘掉进程内缓存（回归会在一个进程里换 `STATE_ROOT`）。 */
export function __resetRecordCache(): void { cache = null; cacheRoot = null; }
