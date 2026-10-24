/** 能力注册表的回归（M11-1，Q36）。
 *
 *  **这份测的不是功能，是「散不散」。** 用户的原话是「加新东西要改的地方太散」，
 *  所以判据钉的全是**结构性质**：声明了就两面都有、名字不打架、入参没写重。
 *  功能本身有 `filetest` 管。
 */
import { stripComments } from "./shared/stripcomments.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { allCaps, capsFor, httpRoutes } from "./cap/index.js";
import { TOOL_ROOT } from "./project.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};

/* ⚠️ **开头先数一次兜底仓库。**（2026-10-21）
   收尾那条「清掉 N 个」**认不出来的既不删也不报** —— 于是「清掉 0 个」
   有两种可能：本来就没有，或者我们压根没认出来（纪律④）。
   拿「跑之前有哪些」当基线，收尾比一次**完全不依赖任何匹配逻辑**：
   多出来一个就是我们自己留下的，不管它为什么没被清掉。 */
const REPO_ROOT_FOR_CHECK = await (async () => {
  const { STATE_ROOT: SR } = await import("./project.js");
  const { UD_DIRNAME: UD } = await import("./statedirs.js");
  return join(SR, UD, "git");
})();
const reposBefore: Set<string> = await (async () => {
  const { readdir: rd } = await import("node:fs/promises");
  try { return new Set(await rd(REPO_ROOT_FOR_CHECK)); } catch { return new Set<string>(); }
})();

console.log("能力注册表（M11-1）");
const caps = allCaps();
ok(caps.length > 0, "能力模块真的被 import 到了", `${caps.length} 件`);
/* ⚠️ `defineCap` 是 import 时的副作用 —— `cap/index.ts` 漏了一行 import，
   那一组能力就**静悄悄地整组消失**，两个门面都不会报错。这一条就是防它的。 */

for (const c of caps) {
  ok(!!c.title && !!c.summary, `${c.name}：有 title 和 summary`);
  /* MCP 面拿 summary 当 description。只复述名字的说明等于没有 —— 
     调用方是模型，它靠这句话决定什么时候用这件工具。 */
  ok(c.summary.length >= 12, `${c.name}：summary 不是复述名字`, `${c.summary.length} 字`);
  /* `scope: "project"` 的能力**不能自己声明 project** —— MCP 面会注入一个，
     写重了 MCP 侧会出现两个 project，而 TypeScript 不会管。 */
  if (c.scope === "project") ok(!("project" in c.input), `${c.name}：没有自己声明 project（MCP 面会注入）`);
}

/* 两面一致：这是整件事的目的。声明了 http 就该有路由，声明了 mcp 就该有工具名。 */
const routes = httpRoutes();
ok(routes.size === capsFor("http").length, "每件对 http 暴露的能力都有唯一路由",
  `${routes.size} 条 / ${capsFor("http").length} 件`);
const names = new Set(caps.map((c) => c.name));
ok(names.size === caps.length, "能力名不重复");

/* 这一批搬过来的九件，原来有四件**只在 HTTP 侧有** ——
   现在它们自动出现在 MCP 面上，这正是「两个门面手写」要修的那个病。 */
const wasHttpOnly = ["trash_file", "revert_file", "list_file_refs", "count_file_types"];
for (const n of wasHttpOnly) {
  const c = caps.find((x) => x.name === n);
  ok(!!c && (c.faces ?? ["mcp", "http"]).includes("mcp"), `${n}：原来只有 HTTP 侧有，现在 MCP 面也有了`);
}

/* ⚠️⚠️ **原来这里有一节钉「`create_draft` 认得 template 这一档」（M11-7 搬迁时修的真缺陷）**，
   2026-10-24 整节删了：**`create_draft` 和模板那一摊同一批退场**（M16-8 ⑥）。
   它当年钉的是「HTTP 侧不认 `source: "template"`，于是选了模板建出来是空白稿，
   而界面只说『已新建』」—— 那个缺陷的**两个当事人都不在了**。
   > **一条判据钉的那件坏事和它的修法一起退场时，判据跟着走** ——
   > 留着它会红在「找不到这件能力」上，而那句读数说不出「它是被有意删掉的」。
   而它教的那件事（**两个门面各写一遍就是分叉的来源**）仍然成立，
   并且今天由更上游的东西保证：能力一处声明、两面各自遍历生成（本文件开头那几节钉着）。 */

/* ══════════ 搬迁不能丢件（M11-7 第五批差点栽）══════════
   搬能力的动作是「在 `cap/` 里写一份 → 删掉两侧手写的」。
   中间漏写一件的话：**编译过、回归全绿**，因为 MCP 工具是给外部客户端用的，
   我们自己的测试一个都不会调。`get_index_data` 就这么差点没了。

   这条闸拿 **git 里上一版的工具清单**当基准 —— 基准独立于「现在有什么」，
   所以不会像 §九十一 那条一样变成循环。
   ⚠️ 有意去掉一件工具时，把它加进 `RETIRED` 并写清为什么。 */
{
  const { execFileSync } = await import("node:child_process");
  /** 有意去掉的，写清为什么 —— 不写的话下一个人只会看到判据红了却不知道是不是该红 */
  const RETIRED: Record<string, string> = {
    diff_drafts: "并进 list_changes（它的 from/to 是超集）",
    get_changes_since: "并进 list_changes（单份稿）与 list_project_changes（整个项目）",
    /* ── M16-8 ① / ③（2026-10-24）：生命周期那四件并进文件面 ── */
    rename_draft: "M16-8 ①：并进 move_file。并的理由是量出来的 —— 前端的改名 / 移动 / 拖拽走的全是 file_move，这件的调用方是零；而它真正做的那件事（改写 <dc-import name> 的引用）move_file 原来不做，现在住在 refs.ts 的 dcImportsFollow 里，由 moveFile 调。落盘也从 writeAtomic 改走第二条写入口（原来没有快照、没有并发闸）",
    move_draft: "M16-8 ①：同上，并进 move_file。它收「目标目录」而 move_file 收「完整目标路径」—— 重名顺延序号那一档因此没了，口径统一成「目标已存在就拒」（显式胜过聪明）",
    delete_draft: "M16-8 ③：并进 trash_file（回收站布局本来就是同一套 <时间戳>/<原相对路径>）。唯一的调用方是 ui/S1-稿件索引.dc.html，而那份稿 C3 已经删了。⚠️ 它回执里的 impact 没了 —— 那件事改成单独问 delete_impact（M16-8 ⑤），而且必须这样：delete_impact 要在文件还在盘上的时候问",
    duplicate_draft: "M16-8 ②：改名 copy_file 并搬进 cap/files.ts。它 2026-10-24 通用化了（后缀跟着源走、二进制逐字节复制），而名字还写着 draft —— 一个只对一种扩展名成立的名字挂在一件对任何文件成立的能力上。> 名字是契约的一部分：模型会按名字判断该不该调它，而「它叫 duplicate_draft，我这是个 .md」是一个完全合理的推断，只不过是错的。实测 ../UmbraPC 整仓零命中，不用跨仓同步",
    restore_draft: "M16-8 ③：改名 restore_trashed_by_name（和 trash_file / restore_trashed 一族对齐）。旧名带着「稿」字，而它收的从来是任何文件的文件名",
    /* MCP 侧原来**同时有** chat_list 和 list_chats、chat_get 和（没有）——
       前者是 HTTP 路由名混进了工具名。统一成动作在前的 list_chats / get_chat */
    chat_list: "和 list_chats 重复，统一成 list_chats（HTTP 路由仍叫 chat_list）",
    chat_get: "改名 get_chat（MCP 习惯动作在前；HTTP 路由仍叫 chat_get）",
    /* ── C3（M16-7，2026-10-23）：设计稿那一整套 ── */
    render_check: "C3：真实渲染体检，验收对象是 .dc.html 设计稿（render.ts 整个删了）",
    check_browser: "C3：它只回答「render_check 会用哪个浏览器」，随 render_check 走。⚠️ findBrowser 这个函数没删，搬去了 browser.ts —— app/actxtest 还要它",
    check_runtime: "C3：报告「哪个放稿的目录缺 support.js 与两个 React UMD」，而那三个文件连往哪拷都没有了（ensureRuntimeBeside 一起删）",
    /* ── M16-8 ⑥（2026-10-24）：`create_draft` 与模板那一摊 ── */
    create_draft: "M16-8 ⑥：四档来源里三档在造设计稿（<x-dc> 骨架 · <dc-import> 包装 · .dc.html 模板），C3 定的是设计稿那一整套删掉；第四档「复制现有稿」交给 duplicate_draft（同日 ② 改名 copy_file）。界面入口改成「新建文件…」走 write_file —— 删之前量过：那是界面上唯一能新建文件的入口",
    list_templates: "M16-8 ⑥：模板是 .dc.html 模板，唯一消费者是 create_draft 的 template 档，随它退场。⚠️ 用户项目里已存在的 .umbrastudio/templates/ 文件不动、不迁移",
    save_as_template: "M16-8 ⑥：同上（模板那一摊整体退场）",
    delete_template: "M16-8 ⑥：同上（模板那一摊整体退场）",
  };
  let base = "";
  try {
    base = execFileSync("git", ["show", "HEAD:server/src/index.ts"], { cwd: join(process.cwd(), ".."), encoding: "utf8" });
  } catch { /* 不在 git 仓库里就跳过这一节 */ }
  if (base) {
    const before = [...base.matchAll(/registerTool\("([a-z_]+)"/g)].map((m) => m[1]!);
    const now = new Set(allCaps().map((c) => c.name));
    const src = await readFile(join(process.cwd(), "src", "index.ts"), "utf8");
    for (const m of src.matchAll(/registerTool\("([a-z_]+)"/g)) now.add(m[1]!);
    const lost = before.filter((t) => !now.has(t) && !(t in RETIRED));
    ok(lost.length === 0, "**这一轮没有把 MCP 工具搬丢**（拿 git 上一版当基准）", lost.join(" · "));
    ok(before.length > 0, "读得到上一版的工具清单", `上一版 ${before.length} 件`);
  }
}

/* ── 按门面分的默认值（M11-7 第二批）──
   `list_icons` 的 `withPath` 默认值跟着 `via` 走：界面**必须**有 path 才画得出图标，
   MCP 那边 60 个 path 是白占上下文。
   以前这个差别藏在 HTTP 那一行多传的 `true` 里，**MCP 侧完全不知道有这回事** ——
   合成一份之后它变成了一个写出来的决定。 */
{
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildProject } = await import("./project.js");
  const cap = allCaps().find((c) => c.name === "list_icons")!;
  ok(!!cap, "list_icons 搬进 cap/ 了");
  const dir = await mkdtemp(join(tmpdir(), "umbrastudio-icons-"));
  await writeFile(join(dir, "project.json"), JSON.stringify({ name: "icontest", title: "图标回归" }));
  const proj = await buildProject(dir);
  const got: Record<string, unknown> = {};
  for (const via of ["http", "mcp"] as const) {
    const out = await cap.run({} as never, { project: proj, via });
    got[via] = (out.stats as { withPath?: boolean }).withPath;
  }
  ok(got.http === true && got.mcp === false,
    "**同一份声明，两个门面拿到不同的默认值**（界面带 path，模型不带）", `http=${got.http} mcp=${got.mcp}`);
  await rm(dir, { recursive: true, force: true });
}

/* ⚠️⚠️ **「界面稿也是调用方」这一整节 2026-10-23（M16-7c-2b / C3）删了，
   连同它的 `KNOWN_GONE` 名单。**

   它存在的理由（M11-7 第一批栽的那次）值得整段留着：
   本项目的设计稿是**可运行**的 —— `ui/*.dc.html` 自己会 `fetch` 本地 API，
   所以「这条路由没人调」不能只看 `app/src`。当时判定 8 条路由「前端零调用」、
   顺手合并了 `restore_draft`、改了 `delete_draft` 的入参，**当场把 S1 弄坏了**，
   而全套回归照样全绿 —— 因为没有任何判据覆盖「稿调 API」这条路。

   `ui/` 随设计侧协议一起删了，这一节没有调用方可查。
   ⚠️ **而它的接班人已经在了**：7c-1 新增的「前端（`app/src`）也是调用方」那一节
   （66 个调用点对账），它在 7c-2a 当天就抓到 `adopt_project（Sheets.tsx）`。
   > **一节判据删掉之前，先确认它防的那类事还有没有东西在防。**
   这一次有（而且形状一样：从**调用写法**抽候选，不拿现存路由表去搜）。

   ⚠️ `KNOWN_GONE` 当时写明「7c 删完 `ui/` 之后这个名单里的每一条都会变成
   『稿里压根没有这个调用』，到那时这个名单要删掉 —— **它为空还留着，就是下一个人的困惑**」。
   照办了。 */


/* ══════════ **前端（`app/src`）也是调用方，而它原来一条判据都没有** ══════════
   上面那一节钉的是 `ui/` 的设计稿，2026-10-23（M16-7b）证明了那还不够：
   删掉 `list_drafts` / `build_index` 之后全套跑出 `404 /__ud/drafts` 与
   `404 /__ud/rebuild_index`，而**十九套回归没有一套会红** ——
   前端调的是 HTTP 路由，而这个缺口正好在 `apitest`（只调它自己点名的那几条）
   和 `uitest`（跑得到的那几条）之间。

   > **判断一个前端调用会不会坏，不能只看「用户能不能点到它」 ——
   > 还要看「它会不会自己跑」**：`fetchDrafts` 是挂载时就调的，
   > `Sheets` 的重名检查是 `.catch(() => {})` 吞掉的（它失效之后，
   > 长得和「查过了，没有重名」一模一样）。

   ⚠️ **候选名单必须独立于「现在有什么」**（和上一节同一条纪律）——
   拿现存路由表去前端搜是循环的。这里从**调用写法** `core.get(…)` / `core.post(…)` 抽。
   ⚠️⚠️ **抽取方向是「宽松 + 排除」，不是「限定接收者名」** —— 这一条当场验证过：
   第一版限定 `core.get(…)`，读数 56 条，看着挺像全的；而宽松抽是 64 条，
   差值里有 **6 条真路由**（`hub.post("open_project")` · `api.post("reveal_dir")` ·
   `projectCore.get("project_settings")` · `(projectCore as Core).post("cache_clear")` …）——
   同一个 `Core` 实例，只是变量名不叫 `core`。
   > **两个方向的代价不对称**：宽松 + 排除，漏排一个 → 假阳性 → **判据当场红，有人看**；
   > 限定接收者名 + 白名单，漏收一个 → **静默少测一片**。
   > 这和 M14-3「安全线是白名单不是黑名单」恰好相反，而判准是同一条：
   > **错了之后，是会有人看见，还是没人看见。**
   排除的两个是前端真有的非 `Core` 接收者：`mem.get("us.tabs…")`（localStorage 包装）
   和 `REG.get("other")`（kind 注册表 Map）。
   ⚠️ 所以**抓到的总数本身也是一条判据**：有人用别名写（`const c = core; c.get(…)`）
   这个正则就抓不到，而「抓到 0 条」和「一条都没缺」在读数上长得一样（§160.4）。 */
{
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const APP = join(TOOL_ROOT, "app", "src");
  const apiSrc2 = await readFile(join(process.cwd(), "src", "api.ts"), "utf8");
  const hand2 = new Set([...apiSrc2.matchAll(/route === "([a-z_]+)"/g)].map((m) => m[1]!));
  /* ⚠️ `httpRoutes()` 回的是 **Map**。`new Set(map)` 会把 entries 数组当元素装进去，
     于是 `has("files")` 永远为假 —— 第一版就是这么报出 49 条假缺失的（含 `files`，
     而目录树天天在调它）。**「量到一堆缺失」的两种可能里，先排除仪器是零**（纪律④）。 */
  const caps2 = new Set(httpRoutes().keys());

  /* ⚠️⚠️ **泛型参数里可以再有 `>`**（`core.get<{ drafts?: Array<{ file: string }> }>("drafts")`）。
     第一版写成 `(<[^>(]*>)?`，于是这一类**整条抓不到** —— 而反向验证正是这么暴露的：
     我把 `Sheets` 的重名检查装回 `core.get(…)("drafts")`，**判据照样绿**。
     换成非贪婪限长之后多抓到 **4 条一直在用的真路由**（`file_refs` · `records_clear_stale` ·
     `who_handles` · `copy_into_project`）。
     > **一条抓取式判据的盲区，只有在盲区里真有东西的时候才看得见** ——
     > 所以反向验证要故意把样本放进最刁的那种写法里，而不是最常见的那种。 */
  const CALL = /\.(get|post)\s*(<[\s\S]{0,200}?>)?\s*\(\s*[`"']([a-z][a-z0-9_]*)/g;
  /** 这两个不是 `Core`，理由见上面那段注释。往前看 12 个字符就够认出接收者。 */
  const NOT_CORE = /\b(mem|REG)$/;
  const found = new Map<string, string>();     // 路由 → 第一次见到它的文件
  let scannedApp = 0;
  const walkApp = (dir: string): void => {
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      const full = join(dir, n);
      if (statSync(full).isDirectory()) { walkApp(full); continue; }
      if (!/\.(ts|tsx)$/.test(n)) continue;
      scannedApp++;
      const src = readFileSync(full, "utf8");
      for (const m of src.matchAll(CALL)) {
        if (NOT_CORE.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
        const route = m[3]!;
        if (!found.has(route)) found.set(route, n);
      }
    }
  };
  walkApp(APP);
  ok(scannedApp > 50, "扫到了前端源码（这一节要拿它当调用方来核）", `${scannedApp} 个文件`);
  /* 下限按当前读数（62）留一点余量。**只拦变少不拦变多** —— 掉下去说明
     要么正则抓不到新写法，要么前端真的少了一大片调用，两者都该当场知道。
     ⚠️ 这一条第一次跑就救了命：正则里的 `\b` 被写文件的脚本吃成了真的退格字节，
     于是**一条都没抓到**，而「前端用到的路由一条都没少」那条**照样绿**（0 条当然不缺）。
     > **「抓到 0 条」和「一条都没缺」在读数上长得一模一样**（§160.4 同族）。 */
  ok(found.size >= 62, "抓到的调用点数量没塌（抓不到 = 这一节静默失效）", `${found.size} 条路由`);
  const appMissing = [...found].filter(([r]) => !hand2.has(r) && !caps2.has(r)).map(([r, f]) => `${r}（${f}）`);
  ok(appMissing.length === 0, "**前端用到的路由一条都没少**（删能力前先核前端在不在用）", appMissing.join(" · "));
}

/* ── 源码里不许有裸 NUL（2026-09-30）──
   这条不测功能，测的是**别的判据还看不看得见源码**。
   `server/src/diff.ts` 里原来有一个字面 NUL（`const SEP = "␀"`，当分隔符用，
   语义没错），于是 `file` 把整份源码判成 `data`，而 ugrep / ripgrep 这类
   带「跳过二进制」的工具**整个跳掉这个文件** —— grep 它永远返回
   「什么都没有」而不是报错。

   ⚠️ 这是**判据层面**的缺陷，不是运行时的：代码跑得好好的，
   而所有拿 grep 当仪器的检查在这个文件上都静默失明。
   写成 `"\u0000"` 跑起来一模一样，文件又是纯文本了。 */
{
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const bad: string[] = [];
  let scanned = 0;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;
      const f = join(dir, e);
      if (statSync(f).isDirectory()) { walk(f); continue; }
      if (!/\.(ts|tsx|mts|cts|js|mjs|cjs|json|md|css|html)$/.test(e)) continue;
      scanned++;
      const b = readFileSync(f);
      const i = b.indexOf(0);
      if (i >= 0) bad.push(`${f}:${b.subarray(0, i).toString("utf8").split("\n").length}`);
    }
  };
  for (const root of ["src", join("..", "app", "src"), join("..", "plugins")]) {
    try { walk(root); } catch { /* 没这个目录就跳过 */ }
  }
  ok(scanned > 100, "源码扫到了（判据自己得先有东西可扫）", `${scanned} 个文件`);
  ok(bad.length === 0,
     "**源码里没有裸 NUL 字节**（有的话 grep 类工具会静默跳过整个文件）",
     bad.length ? bad.join(" · ") : `${scanned} 个文件都是纯文本`);
}

/* ── 旁数据的路径只有一处（M14-4 A 段，`doc/24` §17.1）──
   ⚠️ A 段的全部价值就是这一条，而**一次重构不会自己保持住** ——
   下一个人加一种资产时最省事的写法就是再 `join(p.dir, ".umbrastudio", …)` 一次，
   而那一处在 B 段搬去 `records/` 时会被漏掉 = 「这一类历史静默读不到」，
   **而「读不到」和「本来就没存过」在界面上长得一模一样**。
   所以装一道闸：代码行里同时出现 `join(` 和 `.umbrastudio`、而又不是
   `STATE_ROOT` / `TOOL_ROOT` 那种（它们本来就该直接拼），一律算红。
   ⚠️ 排除注释行 —— 本仓库注释里提 `.umbrastudio/` 的地方有三十多处，
   把它们算进来这条判据会永远红，然后被人删掉。 */
{
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join: j, relative: rel } = await import("node:path");
  const ROOT = new URL("../src", import.meta.url).pathname;
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = j(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith(".ts")) continue;
      if (e.name === "statedirs.ts" || /test\.ts$/.test(e.name)) continue;   // 出处自己 + 回归
      readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return;
        if (!/\.umbrastudio/.test(code) || !/join\(/.test(code)) return;
        if (/STATE_ROOT|TOOL_ROOT/.test(code)) return;
        offenders.push(`${rel(ROOT, p)}:${i + 1}`);
      });
    }
  };
  walk(ROOT);
  ok(offenders.length === 0,
     "**项目旁数据的路径只有 `statedirs.ts` 一处**（别处不许再 `join(dir, \".umbrastudio\", …)`）",
     offenders.length ? offenders.join(" · ") : `扫了 ${ROOT.replace(/.*\/server\//, "server/")}，零处`);
}

/* ── 壳页面引的东西，部署时一件都不许漏（2026-10-20）──

   `IconGlyph.dc.html` 第 11 行写着 `<script src="./icons.js">`，而 `icons.js` 住在 `ui/` ——
   既不在 `SHELLS`（那是稿）也不在 `RUNTIME_FILES`（那是 `runtime/` 的三件套），
   **两个清单都够不着它**，于是用户三个真实项目里它一个都没有。
   症状不是「控制台多一个 404」：`window.UMBRA_ICONS` 永远是 undefined，
   那份稿**一个图标都画不出来**，而稿本身打得开、排版也对 —— 看上去像设计侧把图标画丢了。

   ⚠️ 判据的两头都要独立于「现在拷了什么」：
   ① 候选从**真部署出去的页面**里抽（`<script src>` / `<link href>` 的相对引用），
      不从部署清单抽 —— 从清单抽是**循环的**：漏拷的那个压根不在清单里，永远不会被检查。
   ② 「在不在」**去盘上看**，不读清单。「清单里写了」和「文件真的到了」是两件事（`00` §144.4）。

   ⚠️ 只钉**加载时必取**的那两种（script / link）。`<a href>` 是点击才走的导航，
   另算一笔打出来（壳里那句 `./S1-稿件索引.dc.html` 在项目里叫 `index.dc.html`，
   是真的点不开 —— 但它和「图标画不出来」不是一个量级，不混进同一条判据里）。 */
/* ⚠️⚠️ **「壳自己引的旁挂资源部署了没有」这一节 2026-10-23（M16-7c-2a / C3）删了。**
 *  它钉的是 M14-6 那条：`IconGlyph.dc.html` 会被部署进项目，而它引的 `ui/icons.js`
 *  **掉在两个拷贝清单的缝里**（`SHELLS` 管稿、`ensureRuntimeBeside` 管 `runtime/`，它两边都不属于），
 *  症状是「那份稿一个图标都画不出来，而稿本身打得开、排版也对」。
 *  C3 之后没有部署这件事了 —— 两个拷贝清单都删了，缝也就没了。
 *  ⚠️ 它的判准设计值得留下来：**候选从真部署出去的页面里抽、「在不在」去盘上看** ——
 *  > 两头都独立于拷贝清单，所以清单漏一项它会红。
 *  以后再有「按清单把文件拷到某处」的代码，照这个办法钉。 */


/* ── 回归不许在用户的真实项目上起服务（Q71，2026-10-21）──

   `apitest` 从 2026-09-28 建起就是 `serveStart(buildProject(listProjectDirs()[0]))` ——
   **也就是 `projects/` 下的第一个项目，用户的那个**，每跑一次就在上面起一次真服务、
   打一整套真 HTTP。2026-10-20 才量到（查 `projects/` 目录时间戳时撞上的），而那之前跑了上百轮。

   > **「跑完没报错」和「跑的时候没碰别人的东西」是两件事**，
   > 而本项目的收尾纪律一直围着「我创建了哪些文件」写（`00` §166 那条教训的第五次）。

   ⚠️ **禁的是「起服务」不是「读」**：`selftest` 也拿 `listProjectDirs()` 取语料，
   但它只 `listDrafts` + `validateDraft`，**一个字节都不写** —— 那是有意的，也是对的
   （语料是用户自己的项目，它正是拿真稿查校验器误报）。
   所以判准是**两样同时出现**：`listProjectDirs` + `serveStart`。
   将来谁合法地同时用到这两样，它也会红 —— 那时来看一眼，**宁可红**。

   ⚠️ 注释里提它是允许的（这一节自己的注释就提了），所以要先剥注释再看 ——
   只按「行首是不是 `*`」判的话，多行块注释中间那些行会漏网（第一版实测误报 7 处）。 */
{
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join: j } = await import("node:path");
  const SRC = join(process.cwd(), "src");
  /* 剥注释走共用模块（`shared/stripcomments.ts`）—— 这件事原来在三套判据里
     各写了一遍，而「判据分不清代码和注释」这条教训犯过 5 次。理由全文在那个文件里。 */
  const codeOf = stripComments;
  const tests = readdirSync(SRC).filter((f) => /test\.ts$/.test(f) && f !== "captest.ts");
  ok(tests.length > 0, "扫得到回归源码（判据自己得先有东西可扫）", `${tests.length} 份`);
  const offenders: string[] = [];
  for (const f of tests) {
    const code = codeOf(readFileSync(j(SRC, f), "utf8"));
    if (code.includes("listProjectDirs") && code.includes("serveStart")) offenders.push(f);
  }
  ok(offenders.length === 0,
    "**回归不许在 `listProjectDirs()` 来的项目上 `serveStart`**（那是用户的 `projects/`，纪律⑥）",
    offenders.length ? offenders.join(" · ") : `扫了 ${tests.length} 份回归，零处`);
}

/* ── 收尾：自己造的兜底仓库（M14-6）──
   ⚠️ 这一套在系统临时目录下建过项目 → `STATE_ROOT/.umbrastudio/git/` 里多一个仓库，
   而删临时目录**删不掉它**（「清掉自己造的文件」和「清掉自己造的状态」是两件事，`00` §166）。
   判准只有一条：指向系统临时目录、而那个目录已经不在了。`onlyDead` 保证不碰还活着的。
   ⚠️ 这一条是**实测补的**：filetest / lifecycletest 装了收尾之后，跑完一整轮
   仓库数还是 2 → 5 —— 多出来的正是这三套（captest / difftest / apitest 的 rmw）。
   **「有的测装了收尾」不等于「残留不再增长」。** */
{
  const { dropLeftoversUnder, deadLeftoversUnder } = await import("./purge.js");
  const { tmpdir: td0 } = await import("node:os");
  const r = await dropLeftoversUnder(td0(), { onlyDead: true });
  if (r.removed.length) console.log(`  · （收尾）清掉自己造的兜底仓库 ${r.removed.length} 个`);
  /* ⚠️ **清完之后再数一次 —— 这一条测的是仪器本身。**（2026-10-21 新加）
     上面那句「清掉 N 个」**认不出来的那些既不删也不报**，于是
     「清掉 0 个」有两种可能：本来就没有，或者我们压根没认出来（纪律④）。
     实测真发生过：`apitest` 的夹具路径解过符号链接（`/private/var/…`），
     而清理按 `os.tmpdir()`（`/var/…`）比 —— **六轮攒了 6 个仓库，六次收尾都报 0**。 */
  /* ⚠️ **自带一个样本来验仪器。**（2026-10-21，反向验证第一版没红逼出来的）

     第一版只断言「清完之后没有死仓库」「跑完没新增」—— 而这一轮 `captest`
     **自己压根没造出仓库**（它建的临时项目没走写入口，不触发 git 兜底），
     于是装回缺陷之后两条照样绿。**判据在没有样本的时候，测的是「今天恰好没事」。**

     现在自己造一个：建一个临时项目 → `ensureRepo` → 删掉目录 → 看清理认不认得它。
     这样「清理仪器好不好用」变成一条**每轮都在跑**的读数，而不是「碰巧有残留才测得到」。 */
  {
    const { mkdtemp: mkt, rm: rmt } = await import("node:fs/promises");
    const { existsSync: ex2, realpathSync: rp2 } = await import("node:fs");
    const { ensureRepo } = await import("./gitkeep.js");
    const { gitDirOfProject } = await import("./gitkeep.js");
    /* ⚠️ 用 **realpath 过的** tmpdir —— macOS 上 `/var` 是链接，而这正是要验的那件事：
       清理按 `os.tmpdir()`（`/var/…`）比，仓库自报的是 `/private/var/…`。 */
    const sample = await mkt(join(rp2(td0()), "us-reposample-"));
    await ensureRepo(sample);
    const sampleGd = gitDirOfProject(sample);
    ok(ex2(sampleGd), "样本自己先成立：临时项目真的有了一个兜底仓库", sampleGd.split("/").pop() ?? "");
    await rmt(sample, { recursive: true, force: true });   // 目录没了 = 这个仓库从此是死的
    const r2 = await dropLeftoversUnder(td0(), { onlyDead: true });
    ok(!ex2(sampleGd), "**清理认得出「解过符号链接的临时目录」里的死仓库**（这一条测的是仪器本身）",
       ex2(sampleGd) ? "✗ 还在 —— 清理按一种路径写法比，而仓库自报的是另一种" : `清掉 ${r2.removed.length} 个`);
  }

  /* ⚠️ **记录目录那一半也要自带样本**（M14-4 B1，2026-10-21）。
     B1 之后残留多了一类：`STATE_ROOT/.umbrastudio/records/<ID>/`。
     和仓库那一半同一个做法 —— 自己造一个再看清理认不认得，
     否则这一条在「这一轮恰好没造出记录」时测的还是「今天恰好没事」。 */
  {
    const { mkdtemp: mkt2, rm: rmt2, writeFile: wf3, mkdir: mk3 } = await import("node:fs/promises");
    const { existsSync: ex3, realpathSync: rp3 } = await import("node:fs");
    const { recordDirOf } = await import("./records.js");
    const sample2 = await mkt2(join(rp3(td0()), "us-recsample-"));
    await wf3(join(sample2, "project.json"), JSON.stringify({ name: "recsample" }));
    const recDir = recordDirOf(sample2);
    await mk3(join(recDir, "snapshots"), { recursive: true });   // 真写一点东西进去
    ok(ex3(recDir), "样本自己先成立：临时项目真的有了一个记录目录", recDir.split("/").pop() ?? "");
    await rmt2(sample2, { recursive: true, force: true });
    const r3 = await dropLeftoversUnder(td0(), { onlyDead: true });
    ok(!ex3(recDir), "**清理认得出临时目录里的死记录**（B1 新增的那一类残留）",
       ex3(recDir) ? "✗ 还在" : `清掉记录 ${r3.records.length} 条`);
  }

  const stillDead = await deadLeftoversUnder(td0());
  ok(stillDead.length === 0, "**收尾之后临时目录下一个死仓库 / 死记录都不剩**",
     stillDead.length ? stillDead.join(" · ") : "0 个");
  /* ⚠️ 索引里没有、而盘上有的记录目录 —— **只可能是「写索引失败了」**，
     而那比「多占点地方」严重得多：那条记录谁也打不开，用户的历史够不着。 */
  const { unindexedRecordDirs } = await import("./records.js");
  const orphanDirs = unindexedRecordDirs();
  ok(orphanDirs.length === 0, "**没有「索引里没有而盘上有」的记录目录**（有的话说明写索引那一步失败过）",
     orphanDirs.length ? orphanDirs.join(" · ") : "0 个");
  /* 和开头那次比。**这一条不依赖任何匹配逻辑** —— 多出来就是红，不管为什么。 */
  const { readdir: rd2 } = await import("node:fs/promises");
  let reposAfter: string[] = [];
  try { reposAfter = await rd2(REPO_ROOT_FOR_CHECK); } catch { /* 没有就是没有 */ }
  const added = reposAfter.filter((n) => !reposBefore.has(n));
  ok(added.length === 0, "**跑完一轮没给自己留下兜底仓库**（和开头那次逐个比，不靠路径匹配）",
     added.length ? added.join(" · ") : `${reposAfter.length} 个，和开头一样`);
}
/* ══════════════════════════════════════════════════════════════════════
   ⑯ 品牌名散不散（品牌收口，2026-10-22）

   ⚠️ **为什么这一节住在 `captest`**：它的职责一直是「测的不是功能，是**散不散** ——
   声明了就两面都有、名字不打架」（本文件头那段）。品牌名正好是这个问题的新一例。

   ⚠️ **为什么必须有这一节**：`brand.ts` 只能让**能 import 它的人**读到它。
   而有两种消费者 import 不了 TS —— `shell/package.json`（electron-builder 的构建配置）
   和 `app/index.html`（首屏 `<title>`）。它们只能是字面量。
   > **「单一来源」对 import 不了它的消费者来说是一句空话，除非有人去对账。**
   下面每一条都是在对账，而不是在复制。
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n⑯ 品牌名散不散（2026-10-22）");
{
  const { readFileSync: rf } = await import("node:fs");
  const { join: jn } = await import("node:path");
  const B = await import("./shared/brand.js");
  /* ⚠️ 用 `TOOL_ROOT` 不是 `process.cwd()` —— npm 跑脚本时 cwd 是 `server/`，
     拿 cwd 拼出来的路径查不到 `shell/package.json`，而那会是一条**永远绿**的自检
     （`identitytest` 栽过同一条，`doc/00` §166）。 */
  const { TOOL_ROOT: R } = await import("./project.js");
  const pkgRaw = rf(jn(R, "shell", "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as {
    description?: string;
    build?: { productName?: string; appId?: string; artifactName?: string;
              mac?: { extendInfo?: Record<string, unknown> };
              fileAssociations?: { description?: string }[] };
  };
  const bld = pkg.build ?? {};
  const ext = (bld.mac?.extendInfo ?? {}) as Record<string, string>;

  /* ── ⓐ 显示层：英文系统的 Finder / Dock 读 Info.plist 这两个键 ── */
  /* ⚠️ 2026-10-23 跟着 `brand.ts` 改名：`displayNameEn` → `bundleDisplayName`。
     **改的不只是名字，是语义** —— plist 里这两个键**只有一份、所有语言环境共用**
     （没有 `.lproj` / `InfoPlist.strings`），所以「英文那一份」这个说法不成立。
     ⏳ 真要分语言得加 `InfoPlist.strings`，那时英文那份读 `studioNameEn`。 */
  /* ⚠️⚠️ **这两条的话 2026-10-24（M17-1）过期了，而值没变。**
     它们原来写着「**不分语言**」—— 那时 `Info.plist` 里确实只有一份。
     现在显示名**按语言分**（`.lproj/InfoPlist.strings`，由 `afterPack` 写），
     而 `Info.plist` 里这一份变成了**兜底值**。
     > **一个值没变而它的身份变了，判据的断言照样绿、而它的话开始骗人** ——
     > 这正是「文案里写着一个前提，前提变了文案就开始骗人」的同族（`validate.ts` 那条）。
     所以这两条改的是**措辞**，断言一个字没放松；分语言那一半的判据在 `packtest`
     （要真产物才验得到：`plutil` 解析 + `Bundle.preferredLocalizations` 的语言匹配）。 */
  ok(ext["CFBundleDisplayName"] === B.bundleDisplayName,
     "`CFBundleDisplayName` 等于 `bundleDisplayName`（它是**兜底值** —— 各语言那一份在 `.lproj`，`packtest` 验）",
     `${ext["CFBundleDisplayName"]} vs ${B.bundleDisplayName}`);
  /* ⚠️⚠️⚠️ **这一条 2026-10-24 从「等于显示名」翻成「等于身份名」，而它钉的是一条真缺陷。**
     Electron 按 `CFBundleName` 拼 helper 路径（`Contents/Frameworks/<它> Helper.app`），
     而 helper 目录名跟着**冻结的 `productName`**。改名把 `CFBundleName` 换成中文之后，
     **改名之后打的每一个包都起不来**（`FATAL … Unable to find helper app`，退出码 133），
     而没人发现 —— `packtest` 第二关在那之后没人跑过。
     > **一个键同时被当成「称呼」和「身份」，必然在其中一个上是错的。**
     所以这条闸的判准是 `appIdentityName`（和 `appId` / `productName` 同一类：身份）。
     ⚠️ 菜单栏显示名由 `app.setName()` 在运行期给，不靠这个键 —— 钉回身份名不会让用户看见代号。 */
  ok(ext["CFBundleName"] === B.appIdentityName,
     "**`CFBundleName` 等于 `appIdentityName`**（Electron 拿它找 helper —— 它是**身份**，不是称呼）",
     `${ext["CFBundleName"]} vs ${B.appIdentityName}`);


  /* ── 分语言那张表自己的性质（M17-1）──
     ⚠️ 这一条**不是** `packtest` 那几条的重复：那边验「产物里写对了没有」，
     这边验「**这张表本身的约定**」—— 而约定错了的话，产物会被正确地写错。
     判准两条：① 兜底值**是中文那一份**（`.lproj` 不生效时所有人看到它，
     选中文 = 不生效时和今天一样）· ② 英文那一份真的是英文名（不是又一份中文）。
     > **一个「哪种失败更糟」的取舍，要有一条判据钉着它，不然下一个人会按「哪个更规范」改掉它。** */
  ok(B.bundleDisplayName === B.studioName,
     "**兜底显示名是中文那一份**（`.lproj` 不生效时所有人看到它 —— 选中文是因为那时「和今天一样」）",
     `${B.bundleDisplayName}`);
  ok(B.bundleDisplayNameByLocale.en === B.studioNameEn
     && B.bundleDisplayNameByLocale.zh_CN === B.studioName
     && Object.keys(B.bundleDisplayNameByLocale).length >= 2,
     "**分语言那张表派生自 `studioName` / `studioNameEn`**（不是手抄的字面量）",
     JSON.stringify(B.bundleDisplayNameByLocale));
  /* ── ⓑ 「打开方式」右键菜单里那两行 + 包描述 ── */
  /* ⚠️ 这两条**分开数**：第一版把包描述也混进了「那两行」里，于是 `=== 2` 对不上而红 ——
     **判据红了而产品是对的**。两件事问的不是同一个问题，就不该用同一个数组。 */
  const assoc = (bld.fileAssociations ?? []).map((a) => a.description ?? "");
  const allDesc = [pkg.description ?? "", ...assoc];
  const badDesc = allDesc.filter((d) => d.includes(B.codename));
  ok(badDesc.length === 0, "包描述与「打开方式」那两行不再出现内部代号",
     badDesc.length ? badDesc.join(" · ") : `${allDesc.length} 条都干净`);
  ok(assoc.length === 2 && assoc.every((d) => d.startsWith(B.studioName)),
     "「打开方式」那两行都以 `studioName` 开头（右键菜单里用户直接读它）",
     assoc.join(" | "));
  /* ⚠️ `server/package.json` 也要对账 —— 它是**第三个** import 不了 TS 的消费者，
     而它的 `description` 会出现在 MCP 客户端的包信息里。
     不钉的话它就是一处「没人看着的字面量」，下一次改名会漏掉它。 */
  const srvPkg = JSON.parse(rf(jn(R, "server", "package.json"), "utf8")) as { description?: string };
  ok((srvPkg.description ?? "").startsWith(B.studioName) && !(srvPkg.description ?? "").includes(B.codename),
     "`server/package.json` 的 `description` 以 `studioName` 开头、不含内部代号",
     srvPkg.description ?? "（没有）");

  /* ── ⓒ 文件系统层：**冻结**，而且要证明它是冻结的 ──
     ⚠️ 这两条是**反方向**的判据：它们要求这几个值**不等于**品牌名。
     写成「等于旧值」的话，以后有人把旧值也改了、判据跟着改，就什么都没拦住。
     所以钉的是**那条不变量本身**：数据与身份不随显示名走。 */
  ok(bld.appId === "com.umbrastudio.app", "`appId` 冻结（换了它等于换一个应用：登录项 / TCC 授权 / 钥匙串全部重来）", String(bld.appId));
  ok(!(bld.productName ?? "").includes(B.productName),
     "`build.productName` **不含**新品牌名 —— 它决定 `.app` 文件名，改它会在用户 `/Applications` 里留下孤儿",
     String(bld.productName));

  const mainRaw = rf(jn(R, "shell", "main.mjs"), "utf8");
  const legacy = /const LEGACY_DATA_DIR = "([^"]+)"/.exec(mainRaw)?.[1] ?? "";
  ok(legacy !== "" && !legacy.includes(B.productName) && legacy !== B.studioName && legacy !== B.studioNameEn,
     "**`userData` 的目录名不等于任何品牌名派生值**（改一次名就搬一次用户的历史 = 静默丢数据）",
     legacy || "没找到 LEGACY_DATA_DIR");
  ok(/app\.setPath\("userData"/.test(mainRaw),
     "**`main.mjs` 显式 `setPath(\"userData\")`** —— 不再靠「应用名顺手当目录名」那个默认行为",
     "在");

  /* ── ⓓ 分发物文件名：ASCII ──
     ⚠️ 理由是实测的：win 的分发物是 `.zip`，而 `ziptest` 钉着「中文文件名要靠 bit 11，
     不是所有解压器都认」。`${...}` 是 electron-builder 自己的占位符，不是 JS 模板串。 */
  ok((bld.artifactName ?? "").startsWith(B.studioNameEn),
     "`artifactName` 以 `studioNameEn`（ASCII）开头", String(bld.artifactName));

  /* ── ⓔ `productNameEn` 的**用处**（2026-10-23 改）──
     ⚠️ **这一节换了钉法，而换的理由值得记。**
     原来它钉的是「那个拼音占位 **不许**露出到白名单以外」，依据是
     sam 2026-10-22 那条「英文名定下来之前不对外露出」。
     **sam 2026-10-23 定了英文名 Quetail，那条规则的理由就消失了** ——
     一条判据的依据没了，它就不该靠惯性留着（留着的话下一个人会以为
     「英文名还是不许露出」，而那是假的）。
     ⚠️ **换成什么不换成什么**：不钉 `"Quetail"` 这个新字面串（那只是把一个会过期的
     字面串换成另一个），改成钉**它的消费链没断** —— 这才是这个常量存在的理由。
     > **判据钉的是长期约束，不是一次性的迁移检查。**
     「全仓旧占位 0 处」属于后者：它下次改名又要改一次，所以那一条
     **改完当场 `git grep` 确认就够，不留长期判据**。 */
  ok(B.studioNameEn.startsWith(B.productNameEn),
     "**`studioNameEn` 真的由 `productNameEn` 派生**（不是另写一个字面串 —— 两处写着就会分叉）",
     `${B.studioNameEn} ← ${B.productNameEn}`);
  ok(/^[\x20-\x7E]+$/.test(B.studioNameEn),
     "**`studioNameEn` 是纯 ASCII** —— 它进安装包文件名，而 win 的分发物是 `.zip`（`ziptest` 钉着中文文件名要靠 bit 11）",
     B.studioNameEn);
  ok(!/[\\/:*?"<>|]/.test(B.studioNameEn),
     "而且不含文件名非法字符（它直接拼进 `artifactName`）", B.studioNameEn);

  /* ── ⓕ 中文间距规则（geek-99 2026-10-22，全端统一）──
     「长尾雀」挨着汉字或中文标点**不留空格**，挨着英文或数字留**一个**空格。
     ⚠️ 这条规则**原来只是一句话** —— 而一句话管不住几十处文案。
     这里把它变成读数：`长尾雀` + 空格 + 汉字/中文标点 = 红。 */
  /* ⚠️⚠️ **第一版是假判据**：用 `git grep -E '长尾雀 +[\x{4e00}-...]'`，而 git 的 ERE
     **不认 `\x{...}`** —— 它打印 `fatal: invalid character range` 退非零，
     被我自己写的 `catch` 吃成 `[]`，读数「0 处」**绿**。
     > **「量到零」的两种可能里，先排除仪器是零**（纪律④）——
     > 而这一次把仪器故障翻译成「世界是零」的，正是我自己那个 `catch`。
     改成**自己读文件扫**：没有外部命令，就没有「命令失败」这一档。 */
  const spaceBad: string[] = [];
  {
    const { readdirSync: rdd, readFileSync: rfs, statSync: stt } = await import("node:fs");
    const bad = new RegExp(B.productName + "[ \u3000]+[\u4e00-\u9fa5，。、；：？！「」（）]");
    const walk = (dir: string): void => {
      for (const e of rdd(dir)) {
        if (e === "node_modules" || e === "dist" || e === ".git" || e === "out" || e === "projects") continue;
        const f = jn(dir, e);
        if (stt(f).isDirectory()) { walk(f); continue; }
        if (!/\.(ts|tsx|mjs|cjs|html)$/.test(e)) continue;
        if (f.endsWith("captest.ts")) continue;              // 本判据自己写着那个样子
        /* ⚠️ 剥注释再扫：`brand.ts` 的注释里**故意**写着反例（「不是『长尾雀 账号』」），
           而间距只在**用户看得见的文案**里有意义。不剥的话这条判据会把
           「解释规则的那句话」报成「违反规则」—— §107 那条「分不清界面文案和
           解释它的注释」的第 4 次。HTML 用 `<!-- -->`，`codeOf` 不认，照原文扫。 */
        const body = /\.(ts|tsx|mjs|cjs)$/.test(e) ? stripComments(rfs(f, "utf8")) : rfs(f, "utf8");
        body.split("\n").forEach((ln, i) => {
          if (bad.test(ln)) spaceBad.push(`${f.slice(R.length + 1)}:${i + 1}`);
        });
      }
    };
    for (const d of ["server/src", "app/src", "app", "shell", "ui"]) {
      try { walk(jn(R, d)); } catch { /* 目录不在就跳过 */ }
    }
  }
  ok(spaceBad.length === 0, "**「长尾雀」后面紧跟汉字时没有多余空格**（原来给英文词留的那个空格，换成汉字就是错的）",
     spaceBad.length ? spaceBad.slice(0, 4).join(" · ") : `扫过的文件里 0 处`);

  /* ── ⓖ 首屏 `<title>`：HTML 读不了 TS，只能对账 ── */
  const idx = rf(jn(R, "app", "index.html"), "utf8");
  ok(new RegExp(`<title>${B.studioName}</title>`).test(idx),
     "`app/index.html` 的 `<title>` 等于 `studioName`（首屏那一帧用户就看见它）",
     /<title>([^<]*)<\/title>/.exec(idx)?.[1] ?? "没有 title");

  /* ── ⓗ 残留：用户看得见的代码里不该再有硬写的产品全名 ──
     ⚠️ 白名单里每一项都有理由，加新的必须显式加 —— 这是闸该有的样子。 */
  /* ⚠️ **第一版按「行首是不是注释符」判，而它漏了两种**：行尾注释
     （`icons.ts:79` 的 `// Umbra Studio`）和块注释的**续行**
     （`Workbench.tsx:690` 那行以中文开头）。于是三条合法命中全报成缺陷。
     > **判据测的那个东西，和产品实际用的那个东西，要是同一个**（`doc/00` §172.7）——
     > 产品用的是**会执行的代码**，所以判据该先把注释剥掉，而不是猜哪一行像注释。
     用顶层 `stripComments()`（⑮ 已经在用的那一个）。 */
  const stillOld: string[] = [];
  {
    const { readdirSync: rdd, readFileSync: rfs, statSync: stt } = await import("node:fs");
    const needle = `${B.codename} Studio`;
    /** 白名单，每一项都有理由；加新的必须显式加 —— 这是闸该有的样子。 */
    const allow = (rel: string) =>
      rel === "server/src/shared/brand.ts"     // 定义处：注释里讲历史
      || rel === "server/src/captest.ts"       // 本判据自己
      || rel === "server/src/filetest.ts"      // 测试项目名 `Umbra_design`，不是产品名
      || rel === "server/src/agenttest.ts"     // 打桩夹具稿的正文，不是产品文案
      /* ⚠️ 下面两处是**有意保留**的，不是漏改 —— 它们不是「名字」，是**键和身份**：
         · `gitexclude.ts` 的 `OPEN` 是写进用户 `.git/info/exclude` 的**段落匹配标记**。
           改了就认不出已经写进去的那一段 → 幂等失效 → 每次接管**重复追加**。
           （geek-99 2026-10-22 也明确把它划进「不改」那一类。）
         · `gitkeep.ts` 的 `-c user.name=` 是**写进 git 提交对象的作者身份**。
           改了之后同一个兜底仓库里会有两种作者名，而**已有的提交改不回来**。
         > **一个字符串是不是「名字」，看改了它之后坏掉的是观感还是数据。** */
      || rel === "server/src/gitexclude.ts"
      || rel === "server/src/gitkeep.ts";
    const walk = (dir: string): void => {
      for (const e of rdd(dir)) {
        if (e === "node_modules" || e === "dist" || e === ".git" || e === "out" || e === "projects") continue;
        const f = jn(dir, e);
        if (stt(f).isDirectory()) { walk(f); continue; }
        if (!/\.(ts|tsx)$/.test(e)) continue;
        const rel = f.slice(R.length + 1);
        if (allow(rel)) continue;
        stripComments(rfs(f, "utf8")).split("\n").forEach((ln, i) => {
          if (ln.includes(needle)) stillOld.push(`${rel}:${i + 1}`);
        });
      }
    };
    for (const d of ["server/src", "app/src"]) {
      try { walk(jn(R, d)); } catch { /* 不在就跳过 */ }
    }
  }
  ok(stillOld.length === 0, `**\`${B.codename} Studio\` 不再出现在会执行的 TS 代码里**（白名单之外）`,
     stillOld.length ? stillOld.slice(0, 4).join(" · ") : "0 处");

/* ── ⓘ 同一类错的**另一个长相**：`Umbra` 紧跟中文 ──
   ⚠️⚠️ **这一条是 ⓗ 漏掉之后补的**（2026-10-22 改名当天实测）。
   ⓗ 查的是 `${codename} Studio` **这一个串**，而 `ai_config.ts:177` 那条引擎名是
   `${platformName}服务端 AI` —— 判据那头硬写着 `Umbra 服务端 AI`，于是改名当天
   `uitest` 第 129 条当场红，**而读数长得像产品坏了**
   （「刷新后还是它 — 刷新后 长尾雀服务端 AI」，一眼看过去像是没写进会话文件）。
   > **一道闸按「一个具体的串」写，它守住的就只有那个串。**
   所以这一条不认串，认**形状**：代号后面紧跟一个非 ASCII 字符 ——
   那只可能是中文文案，而中文文案一律是给人看的。
   ⚠️ 这一条**连判据文件一起扫**（`*test.mjs` / `*check.mjs`）：
   回归自己写死品牌名，症状比产品写死更坏 —— 它会把「改名了」报成「功能坏了」。
   ⚠️ `Umbra Studio.app` 这种不会命中（`S` 是 ASCII），所以 `shell/*.mjs` 里那些
   **刻意冻结**的文件名照样放行 —— 形状判准正好把两类分开了。
   ⚠️ 要查的串**拼出来**，不然这条判据会命中自己（第 N 次）。 */
{
  const { readdirSync: rd9, readFileSync: rf9, statSync: st9 } = await import("node:fs");
  const re = new RegExp(B.codename + "[ \u3000]?[^\\x00-\\x7F]");
  const hits: string[] = [];
  const scan = (f: string): void => {
    const rel = f.slice(R.length + 1);
    if (rel === "server/src/captest.ts") return;          // 本判据自己
    stripComments(rf9(f, "utf8")).split("\n").forEach((ln, i) => {
      if (re.test(ln)) hits.push(`${rel}:${i + 1}`);
    });
  };
  const walk = (dir: string, pat: RegExp): void => {
    let names: string[] = [];
    try { names = rd9(dir); } catch { return; }
    for (const e of names) {
      if (e === "node_modules" || e === "dist" || e === ".git" || e === "out" || e === "projects") continue;
      const f = jn(dir, e);
      if (st9(f).isDirectory()) { walk(f, pat); continue; }
      if (pat.test(e)) scan(f);
    }
  };
  walk(jn(R, "server", "src"), /\.tsx?$/);
  walk(jn(R, "app", "src"), /\.tsx?$/);
  walk(jn(R, "app"), /(test|check)\.mjs$/);
  walk(jn(R, "shell"), /(test|check)\.mjs$/);
  ok(hits.length === 0,
     `**代号后面紧跟中文的地方一处都没有**（\`${B.codename}\` + 中文 = 一句给人看的话，该走常量）`,
     hits.length ? hits.slice(0, 4).join(" · ") : "0 处");
}

/* ── ⓙ 访达里那两个文档类型名（用户看得见，而**判据原来够不着**）──
   ⚠️ `fileAssociations[].name` / `.description` 进的是 `CFBundleTypeName` /
   `CFBundleTypeDescription` —— 右键「打开方式」和「显示简介」里显示的就是它。
   改名那一轮**只改了 `description`，漏了 `name`**，于是同一个条目里
   一个写「长尾雀 Studio 设计稿」、另一个还写着旧代号 —— 两句话自己打架。
   ⚠️ 为什么会漏：`package.json` 是 JSON，**import 不了 `brand.ts`**，
   所以那几处只能硬写，而 ⓗ / ⓘ 只扫代码。
   > **一处既不能引用单一来源、又没有判据扫得到的地方，就是下一次漏改的入口。**
   这一条正面钉它；反方向的 `build.productName` 必须**不等于**品牌名那一条在上面（ⓕ）。 */
{
  const { readFileSync: rfp } = await import("node:fs");
  const pkg = JSON.parse(rfp(jn(R, "shell", "package.json"), "utf8")) as {
    build?: { fileAssociations?: { name?: string; description?: string }[] };
  };
  const fa = pkg.build?.fileAssociations ?? [];
  const stale = fa.flatMap((a, i) => {
    const bad: string[] = [];
    if ((a.name ?? "").includes(B.codename)) bad.push(`#${i + 1} name=${a.name}`);
    if ((a.description ?? "").includes(B.codename)) bad.push(`#${i + 1} description=${a.description}`);
    return bad;
  });
  ok(fa.length >= 1 && stale.length === 0,
     "**访达里那两个文档类型名不含旧代号**（`fileAssociations` 的 `name` / `description` 是用户看得见的）",
     stale.length ? stale.join(" · ") : `${fa.length} 条，都不含 \`${B.codename}\``);
  ok(fa.every((a) => (a.description ?? "").includes(B.productName)),
     "**而且它们说得出自己是谁的**（描述里带产品名 —— 访达里一排类型名只有这个认得出来）",
     fa.map((a) => a.description ?? "(没有)").join(" · "));
}
}   /* ⑯ 完 */

/* ── 剥注释只许有一份实现（2026-10-22，geek-99 定）──
   ⚠️ 「判据分不清『代码』和『解释它的注释』」这条教训犯过 **5 次**，
   而每次的修法都是「在那一处内联一个正则」—— 于是同一件事长出了**三份实现**。
   > **一条教训被修了五次而每次只修一处，它就不是教训，
   > 是一个每次都要重新想起来的习惯。**
   这一条闸装在这里：判据源码里再出现那个内联正则一律红。
   ⚠️ 要查的那个字符串**拼出来**，不然这一条判据自己会命中自己
   （又一次「判据里出现的字符串要是它检查的那个东西本身，不是提到它的文字」）。 */
{
  const { readdirSync: rd7, readFileSync: rf7 } = await import("node:fs");
  const { join: j7 } = await import("node:path");
  const { TOOL_ROOT: TR7 } = await import("./project.js");
  const needle = "replace(/" + "\\/\\*[\\s\\S]*?\\*\\//g";
  const where: string[] = [];
  for (const [dir, pat] of [[j7(TR7, "server", "src"), /test\.ts$/], [j7(TR7, "app"), /test\.mjs$/]] as const) {
    let names: string[] = [];
    try { names = rd7(dir); } catch { continue; }
    for (const n of names) {
      if (!pat.test(n) || n === "captest.ts") continue;
      try { if (rf7(j7(dir, n), "utf8").includes(needle)) where.push(n); } catch { /* 读不到跳过 */ }
    }
  }
  ok(where.length === 0,
     "**剥注释没有第二份实现**（判据源码里不再内联那个正则，一律走 `shared/stripcomments.ts`）",
     where.length ? where.join(" · ") : "0 处");
  /* 仪器自检：那个共用模块真的在、而且真的会剥 —— 两个空值相等也会让上面那条绿（纪律④） */
  const { stripComments: sc } = await import("./shared/stripcomments.js");
  ok(sc("a /* 注释 */ b\n// 整行\nc").trim() === "a  b\n\nc".trim()
     && sc("x").trim() === "x",
     "（仪器自检）共用模块真的会剥注释、而且**行号不变**（报一个对不上的行号比不报更费时间）",
     JSON.stringify(sc("a /* 注释 */ b\n// 整行\nc")));
  /* ⚠️ 这一条是从 `plugintest` 那份变体里**吸收**过来的保守性：
     `//` 前面是 `:` 就不当注释，否则 `"http://x"` 会被剥成 `"http:`。
     > **收成一份的时候，共用的那一份应该是所有变体里最安全的那一个** ——
     > 挑最简单的那一份当标准，等于把别人想到过的坑又丢了一次。 */
  /* ⚠️ 断言「URL 还在 + 注释没了」，**不比精确字符串** ——
     第一版写死成 `'…/a";'`，而 `(^|[^:])` 会把 `//` 前那个字符（这里是空格）
     留在结果里，于是判据红了而产品是对的。
     > **一条判据如果比它要测的性质更精确，多出来的那部分精确就是它自己的脆弱。** */
  const got = sc('const u = "http://example.com/a"; // 说明');
  ok(got.includes("http://example.com/a") && !got.includes("说明"),
     "（仪器自检）**`http://` 不会被当成注释剥掉**，而行尾真注释照剥", JSON.stringify(got));
}

/* ── ⑰ 入参声明在**会校验它的那一层**说得对（2026-10-24）──
   ⚠️⚠️ **这一节在这里，而不在 `apitest` 里，本身就是这一轮的结论。**
   `chat_channel` 的 `tool` 从 `.optional()` 改成了 `.nullish()`（调用方真的会传 null，
   而 `null` 和「没给」在这件能力里含义完全一致）。我先去 `apitest` 写了三条
   「传 null 不被拒」——**它们在改之前就是绿的**：`api.ts:565` 是
   `cap.run(input as never, capCtx)`，**HTTP 门面从头到尾没有一次 `safeParse`**，
   `cap.input` 在那儿只用来猜类型做强转。
   > **一件能力的入参声明有两个消费者，而只有一个真的会照它拒人** ——
   > 判据写在不校验的那一层，就是一条永远绿的判据。

   `cap.input` 原样进 `server.registerTool(…, { inputSchema })`（`index.ts:441`），
   MCP SDK 按它校验。所以这里用**同一个对象**建 `z.object` 自己跑一次 ——
   跟 SDK 拿到的是同一份东西，不是抄一份形状。
   ⚠️ 两个方向都要：接受 null（改动真的生效了）**而且**仍然拒数字
   （`.nullish()` 放的是 null，不是「什么都行」—— 少了这一条，改成 `z.any()` 也全绿）。 */
console.log("\n⑰ 入参声明在会校验它的那一层说得对（2026-10-24）");
{
  const { z: zz } = await import("zod");
  type AnyZod = Parameters<typeof zz.object>[0][string];
  /* ⚠️ **按路由找，不按能力名找。** 第一版写 `c.name === "chat_channel"` —— 不在，
     那条样本有效性判据当场红（它存在的全部理由就是这个）：能力名是 `set_chat_channel`，
     而 `chat_channel` 是**路由名**。§104 那条「前端用了能力名而 HTTP 认路由名」同一族。
     这里认路由，因为出问题的那条调用（前端换引擎）走的就是路由。 */
  const cc = caps.find((c) => c.http?.route === "chat_channel");
  ok(!!cc, "按**路由名** `chat_channel` 找得到那件能力（样本有效性）",
     cc ? `能力名是 ${cc.name}（和路由名不一样 —— 别按名字找）` : "不在 —— 下面三条没验到");
  if (cc) {
    /* ⚠️ **用 `cap.input` 本身**，不另外写一份形状 —— MCP 面拿到的就是这个对象。 */
    const sch = zz.object(cc.input as Record<string, AnyZod>);
    const base = { session: "chat-1700000000000-ghost9", channel: "b" as const };
    ok(sch.safeParse({ ...base, tool: null }).success,
       "**`tool: null` 过得去**（`.nullish()`；MCP 面是唯一真按这份声明拒人的那一层）",
       JSON.stringify(sch.safeParse({ ...base, tool: null }).error?.issues?.[0]?.message ?? "通过"));
    ok(sch.safeParse(base).success && sch.safeParse({ ...base, tool: "claude" }).success,
       "（对照）不传、传字符串也都过得去 —— 不然上一条可能只是整个 schema 松了",
       "两种都通过");
    ok(!sch.safeParse({ ...base, tool: 123 }).success,
       "**而 `tool: 123` 仍然被拒**（闸不许开太大 —— 这一条是上一条的反面）",
       sch.safeParse({ ...base, tool: 123 }).error?.issues?.[0]?.code ?? "（居然过了）");
  }
}

/* ── ⑱ 上报给秘书的那一段描述，被截断之后还说得出要紧的事（2026-10-24，geek-99 定）──
   ⚠️⚠️ **UmbraPC 把 `summary` 当技能描述，而且只取前 160 个字**
   （`electron/core/providers/studio/rules.ts` 的 `clip`：先 `replace(/\s+/g," ")`
   把换行折成空格，再按 **UTF-16 长度**切）。所以：
   > **一段描述被下游截断时，「说全了」和「说在前面」是两回事** ——
   > 而决定模型会不会派这件技能的，是没被截掉的那一半。

   ⚠️ **这一条钉的是「那件事在不在那段窗口里」，不钉措辞**（§161.5 那条口径）：
   `move_file` 的第一句得把**两种引用都会跟着改**说出来 —— 它是 M16-8 ① 并进来的那件事，
   而秘书要据此决定「改名该派谁」。改文案不该让这一条红，漏掉那件事才该红。

   ⚠️ **截断函数照抄 PC 的实现，不自己近似** —— 我第一版按原始 `summary` 数字数，
   漏掉了 PC 先折空白这一步（这次两者差 2 个字，不影响结论；但
   **「近似一遍下游的变换」和「照抄一遍」会在边界上给出不同答案**）。 */
console.log("\n⑱ 上报给秘书的描述被截断之后还说得出要紧的事");
{
  /** 原样照抄 `UmbraPC/electron/core/providers/studio/rules.ts` */
  const clip = (x: string, n: number): string => (x.length > n ? x.slice(0, n - 1) + "…" : x);
  const asSkill = (text: string) => clip(text.replace(/\s+/g, " ").trim(), 160);
  /** PC 的 `CORE_SKILLS` 里和这一批有关的那几件 —— 不是全表，只要有判据的这些 */
  const mv = caps.find((c) => c.name === "move_file");
  ok(!!mv, "（样本有效性）`move_file` 这件能力在（它在 PC 的白名单里）", mv ? "在" : "不在 —— 下面两条没验到");
  if (mv) {
    const head = asSkill(String(mv.summary));
    ok(/dc-import/.test(head) && /跟着改|一起改/.test(head),
       "**`move_file` 被截到 160 字之后，仍然说得出「`<dc-import>` 的名字会跟着改」**（秘书据此派活）",
       head.slice(0, 70) + "…");
    /* ⚠️⚠️ **这一条我第一版写成了 `!A || B`，而那个 `||` 的第一支在「压根没出现」时也成立** ——
       `doc/24` §24.5 记过这个形状（「一个 `||` 里的某一支会在要测的那件事完全没发生时也成立」），
       而我隔了两天又写了一次。改成**直接量位置**：一个数，一个区间，没有分支。
       > **一条判据里只要出现 `||`，就要问「左边这一支为真的时候，右边那件事发生了吗」。**
       160 是上限不是目标 —— 贴着上限写等于没有余量，下一个人加半句话就把它挤出去了。 */
    const at = head.indexOf("dc-import");
    ok(at >= 0 && at < 100,
       "而且它在**前 100 字之内**就说了（给后面的人留余量 —— 贴着 160 写，加半句话就挤出去了）",
       at < 0 ? "✗ 压根没出现" : `dc-import 从第 ${at + 1} 字开始`);
  }
}

console.log(fail === 0 ? `\n✓ 能力注册表 ${pass}/${pass + fail}` : `\n✗ 能力注册表 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
