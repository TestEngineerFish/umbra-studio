/** 原子写留下的临时文件：**一个命名，一个判准**（M14-9，2026-10-22）。
 *
 *  ### 为什么单独一个文件
 *  四处原子写要用它（`normalize.writeAtomic` · `records.save` · `plugin/license` 两处），
 *  而 `records.ts` 也要用 —— 放在 `normalize.ts` 里就成环：
 *  `normalize → project → statedirs → records → normalize`。
 *  所以它和 `statedirs.ts`（A 段）一样是**叶子**：**只 import node 内置的东西**。
 *  > 唯一出处要想被所有人用上，它自己就不能依赖任何人。
 *
 *  ### 这个文件要解决的那件事
 *  原子写 = `writeFile(tmp)` → `rename(tmp, 正式名)`。它买到的是
 *  「要么旧的完整、要么新的完整」，**代价是进程在这两步之间被打断就留一个孤儿**。
 *  实测 `STATE_ROOT` 下躺着两个（`doc/24` §19.5）：
 *  `clock.json.287.tmp` 0 字节（`writeFile` 刚 open 就被打断）·
 *  `clock.json.37369.tmp` 54 字节且**内容完整合法**（写完了而 `rename` 没跑到）。
 *
 *  ⚠️⚠️ **「把 tmp 挪出用户目录」做不到，而我原来以为做得到。**
 *  `doc/24` §19.5 写着「B1 之后 `records/<key>/` 就是现成的去处」—— **那句是错的**：
 *  `rename` 要求源和目标**在同一个文件系统**，而用户的项目可能在外置盘或网络盘上，
 *  那时 `STATE_ROOT` 和项目必然不同卷。2026-10-22 挂一个 RAM 盘实测：
 *  `EXDEV: cross-device link not permitted`。
 *  > **tmp 必须和目标同目录，不是没做，是和原子性互斥。**
 *  所以「防」那一半只剩一个问法：**让孤儿一定会被清掉**。
 */
import { join } from "node:path";

/** 临时文件的后缀。**它同时是「这是我们的垃圾」的唯一判准** ——
 *  所以不许有第二种写法：清理那一头只认这一个。 */
const TMP_SUFFIX = ".umbrastudio.tmp";

/** 一个孤儿要「老」到多久才敢删。
 *
 *  `writeAtomic` 从建 tmp 到 rename 是毫秒级，所以 10 分钟之外的 tmp 一定是被打断的。
 *  ⚠️ **为什么要有这个岁数门槛**：同一台机器上可能有**另一个** Studio 进程
 *  （`npm run ui` 一个、壳一个、外部客户端起的 MCP 一个 —— `doc/00` §166 实测过 13 台同时在）
 *  正在写同一个目录。按 pid 判「那个进程还在不在」是不行的：**pid 会被复用**，
 *  而复用的后果是**删掉另一个进程正在写的 tmp**，那就把原子写变成了随机失败。
 *  > 岁数是看得见的事实，进程活没活是猜的。 */
const TMP_STALE_MS = 10 * 60 * 1000;

/** 这个文件名是不是我们原子写留下的临时文件。
 *  ⚠️ 判准**只看我们自己造的后缀**，不看 `.tmp` —— 用户目录里的 `.tmp` 可能是别人的东西。 */
export const isOurTmp = (name: string): boolean => name.endsWith(TMP_SUFFIX);

/** 给 `abs` 造一个独一无二的临时文件名。
 *  唯一性是必须的：同一份稿两次写入并发时（实测：属性面板失焦落盘 + 横条「落盘」钮同时触发），
 *  共用一个 tmp 会让第二次 rename 报 ENOENT。各写各的，rename 是原子的，后到的赢。 */
export const tmpNameFor = (abs: string): string =>
  `${abs}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${TMP_SUFFIX}`;

/** 已经扫过的目录（每个进程每个目录只扫一次 —— 见 `sweepTmpIn` 的理由）。 */
const sweptDirs = new Set<string>();

/** 扫一个目录，删掉**我们自己**留下的、已经过期的临时文件。回删掉几个。
 *
 *  ⚠️⚠️ **为什么清理装在「写」这一层**：孤儿只会出现在我们写过的目录里，
 *  而「我们写过哪些目录」只有这一层知道 —— 装在别处就得去猜（扫整个磁盘？
 *  扫项目树？那对一个几万文件的目录是一次全量 walk）。
 *  > **产生垃圾的那一层，就是知道该去哪里扫的那一层。**
 *
 *  ⚠️ 每个进程每个目录**只扫一次**：一次 readdir 比一次写便宜，但
 *  「每写一次就 readdir 一次」在连续落盘几十份稿时会变成几十次 readdir。
 *  上一轮留下的孤儿在**这一轮第一次写同一个目录**时就被清掉，这就够了。
 *  ⚠️ 扫不动不抛（权限、目录没了都可能）—— **清垃圾失败不该挡住落盘**。 */
export async function sweepTmpIn(dir: string, opts?: { force?: boolean }): Promise<number> {
  if (!opts?.force) {
    if (sweptDirs.has(dir)) return 0;
    sweptDirs.add(dir);
  }
  try {
    const { readdir, stat, rm } = await import("node:fs/promises");
    const names = (await readdir(dir)).filter(isOurTmp);
    if (!names.length) return 0;
    const cutoff = Date.now() - TMP_STALE_MS;
    let n = 0;
    for (const name of names) {
      const abs = join(dir, name);
      try {
        const st = await stat(abs);
        if (st.mtimeMs > cutoff) continue;      // 可能是另一个进程正在写的
        await rm(abs, { force: true });
        n++;
      } catch { /* 它自己消失了也算清掉了 */ }
    }
    return n;
  } catch { return 0; }
}

/** 一开始就不该走进去的目录名。
 *
 *  ⚠️ **`git` 要跳掉，不是为了省事**：`STATE_ROOT/.umbrastudio/git/` 下是兜底仓库，
 *  一台机器上实测攒到过 **595 个 / 94 MB**（M14-6 之前），而 git 自己的对象库
 *  是几千个目录。我们**从来不往那里 `writeAtomic`**，所以走进去纯是白走。
 *  > 递归扫描的成本在「走过多少目录」，而不在「删了多少文件」。 */
const SWEEP_SKIP: ReadonlySet<string> = new Set(["git", ".git", "node_modules"]);

/** 递归扫一棵树。两个用处：启动时扫我们自己的状态目录 · 用户点「清除缓存」时扫他的项目。
 *  ⚠️ **不在「打开项目」那条路上调它** —— 那是一次全量 walk，
 *  而孤儿只在我们写过的目录里，那几个目录由 `sweepTmpIn` 在写的时候顺手扫掉。 */
export async function sweepTmpUnder(root: string): Promise<{ removed: number; dirs: number }> {
  const out = { removed: 0, dirs: 0 };
  const { readdir } = await import("node:fs/promises");
  const walk = async (d: string): Promise<void> => {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    out.dirs++;
    out.removed += await sweepTmpIn(d, { force: true });
    for (const e of entries) if (e.isDirectory() && !SWEEP_SKIP.has(e.name)) await walk(join(d, e.name));
  };
  await walk(root);
  return out;
}

