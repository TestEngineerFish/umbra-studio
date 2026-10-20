/** 能力注册表的回归（M11-1，Q36）。
 *
 *  **这份测的不是功能，是「散不散」。** 用户的原话是「加新东西要改的地方太散」，
 *  所以判据钉的全是**结构性质**：声明了就两面都有、名字不打架、入参没写重。
 *  功能本身有 `filetest` 管。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { allCaps, capsFor, httpRoutes } from "./cap/index.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};

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

/* ── 搬过来当场修掉的那个真缺陷，钉住它（M11-7）──
   HTTP 侧的 `create_draft` 原来**不认 `source: "template"`**，掉进 blank 分支，
   于是「选了模板，建出来是空白稿」，而界面只说「已新建」。
   MCP 侧一直是对的 —— 两个门面各写一遍，只有一边补了模板这一档。
   ⚠️ 判据钉在**能力的入参**上，不钉在某一侧的实现上：合成一份之后，
   两个门面用的就是同一份声明，一边有一边没有这种事从机制上不会再发生。 */
{
  const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildProject } = await import("./project.js");
  const cap = allCaps().find((c) => c.name === "create_draft")!;
  ok(!!cap, "create_draft 搬进 cap/ 了");
  ok(Object.keys(cap.input).includes("templateName"), "**create_draft 认得 template 这一档**（HTTP 侧原来没有）");

  const dir = await mkdtemp(join(tmpdir(), "umbrastudio-captest-"));
  await writeFile(join(dir, "project.json"), JSON.stringify({ name: "captest", title: "能力回归" }));
  await mkdir(join(dir, ".umbrastudio", "templates"), { recursive: true });
  await writeFile(join(dir, ".umbrastudio", "templates", "样板.dc.html"),
    '<!DOCTYPE html><html><head><script src="./support.js"></script></head><body><x-dc><div data-tpl-mark="来自模板">标记</div></x-dc></body></html>\n');
  const proj = await buildProject(dir);
  /* **两个门面各跑一次**：同一份声明，via 不同，结果必须一样 —— 
     以前这两条是两份实现，正是分叉的来源。 */
  for (const via of ["mcp", "http"] as const) {
    const out = await cap.run({ path: `套模板-${via}.dc.html`, source: "template", templateName: "样板" } as never,
      { project: proj, via });
    const src = (out.data as { source?: string } | null)?.source ?? "";
    ok(out.ok && src !== "空白骨架", `${via} 面：选模板建出来的**不是空白稿**`, `source=${src}`);
  }
  await rm(dir, { recursive: true, force: true });
}

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
    restore_draft: "还在，只是搬进了 cap/drafts.ts",
    /* MCP 侧原来**同时有** chat_list 和 list_chats、chat_get 和（没有）——
       前者是 HTTP 路由名混进了工具名。统一成动作在前的 list_chats / get_chat */
    chat_list: "和 list_chats 重复，统一成 list_chats（HTTP 路由仍叫 chat_list）",
    chat_get: "改名 get_chat（MCP 习惯动作在前；HTTP 路由仍叫 chat_get）",
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

/* ══════════ 界面稿也是调用方（M11-7 第一批栽过，`00` §九十）══════════
   本项目的设计稿是**可运行**的：`ui/*.dc.html` 自己会 `fetch` 本地 API。
   所以「这条路由没人调」不能只看 `app/src` —— 那只是半个世界。

   M11-7 第一批就是这么栽的：判定 8 条路由「前端零调用」，
   顺手合并了 `restore_draft`、改了 `delete_draft` 的入参，**当场把 S1 弄坏了**，
   而全套回归照样全绿 —— 因为**没有任何判据覆盖「稿调 API」这条路**。

   这一节就是补那个缺口：把稿里出现的路由名全抓出来，逐个核对它还在不在。 */
{
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { httpRoutes } = await import("./cap/index.js");
  const UI = join(process.cwd(), "..", "ui");
  const apiSrc = await readFile(join(process.cwd(), "src", "api.ts"), "utf8");
  const handwritten = new Set([...apiSrc.matchAll(/route === "([a-z_]+)"/g)].map((m) => m[1]!));
  const fromCaps = httpRoutes();

  let files: string[] = [];
  try { files = (await readdir(UI)).filter((f) => f.endsWith(".dc.html")); } catch { /* 没有 ui/ 就跳过 */ }
  ok(files.length > 0, "找得到界面稿（这一节要拿它们当调用方来核）", `${files.length} 份`);

  /* ⚠️ **候选名单必须独立于「现在有什么」**（M11-7 第二批栽过）。
     第一版是「拿现存路由表去稿里搜」—— 那是**循环的**：
     路由一改名就从名单里消失，判据永远不会检查它，于是永远绿着。
     它看起来在工作（30 条全过），实际上**对它要防的那件事完全免疫**。

     改成按**调用写法**从稿里抽候选。目前两种：
     ① `this.api("路由名", …)` ② 存进数据再调（`{ route: "project_archive" }`）。
     稿里换新写法时要在这里补一条 —— 抓不到的那一条就是下一个盲区。 */
  const PATTERNS = [/\bapi\(\s*["'`]([a-z][a-z0-9_]*)["'`]/g, /\broute\s*:\s*["'`]([a-z][a-z0-9_]*)["'`]/g];

  const missing: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const src = await readFile(join(UI, f), "utf8");
    for (const re of PATTERNS) {
      for (const m of src.matchAll(re)) {
        const route = m[1]!;
        if (seen.has(route)) continue;
        seen.add(route);
        if (!handwritten.has(route) && !fromCaps.has(route)) missing.push(`${route}（${f}）`);
      }
    }
  }
  ok(seen.size > 0, "稿里真的有调 API", `用到 ${seen.size} 条路由`);
  ok(missing.length === 0, "**界面稿用到的路由一条都没少**（改路由前先想想稿在不在用）", missing.join(" · "));
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
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
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
{
  const { mkdtemp, rm, readdir, readFile: rf } = await import("node:fs/promises");
  const { existsSync, realpathSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { buildProject } = await import("./project.js");
  const { buildIndex } = await import("./indexpage.js");

  const dir = await mkdtemp(join(realpathSync(tmpdir()), "us-shellasset-"));
  try {
    await buildIndex(await buildProject(dir), null);
    const pages = (await readdir(dir)).filter((f) => f.endsWith(".dc.html"));
    ok(pages.length > 0, "部署真的把壳写出去了（这一节要拿它们当调用方）", `${pages.length} 份`);

    const LOAD = [/<script\b[^>]*\bsrc="(\.\/[^"]+)"/g, /<link\b[^>]*\bhref="(\.\/[^"]+)"/g];
    const NAV = /<a\b[^>]*\bhref="(\.\/[^"]+\.dc\.html)"/g;
    const wanted = new Map<string, string>();   // 相对路径 → 哪份页面引的
    const deadNav = new Set<string>();
    for (const f of pages) {
      const src = await rf(join(dir, f), "utf8");
      for (const re of LOAD) for (const m of src.matchAll(re)) if (!wanted.has(m[1]!)) wanted.set(m[1]!, f);
      for (const m of src.matchAll(NAV)) {
        const t = decodeURI(m[1]!).replace(/^\.\//, "");
        if (!existsSync(join(dir, t))) deadNav.add(`${t}（${f}）`);
      }
    }
    ok(wanted.size > 0, "壳里真的引了本地资源", `${wanted.size} 件`);

    const absent: string[] = [];
    for (const [ref, from] of wanted) {
      if (!existsSync(join(dir, decodeURI(ref).replace(/^\.\//, "")))) absent.push(`${ref}（${from}）`);
    }
    ok(absent.length === 0,
      "**壳页面加载时要取的本地文件，部署后一件不缺**（漏一件 = 那份稿里的功能静默失效）",
      absent.length ? absent.join(" · ") : `${[...wanted.keys()].join(" · ")} 全在`);

    if (deadNav.size) console.log(`  · （另记，不计分）壳里点不开的导航链接：${[...deadNav].join(" · ")}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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
  /** 剥掉块注释与行注释，只留下真正会执行的那部分 */
  const codeOf = (src: string): string => {
    const out: string[] = [];
    let inBlock = false;
    for (let ln of src.split("\n")) {
      if (inBlock) {
        const e = ln.indexOf("*/");
        if (e < 0) { out.push(""); continue; }
        ln = ln.slice(e + 2); inBlock = false;
      }
      for (;;) {
        const b = ln.indexOf("/*");
        if (b < 0) break;
        const e = ln.indexOf("*/", b + 2);
        if (e < 0) { ln = ln.slice(0, b); inBlock = true; break; }
        ln = ln.slice(0, b) + ln.slice(e + 2);
      }
      out.push(ln.replace(/\/\/.*$/, ""));
    }
    return out.join("\n");
  };
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
  const { dropFallbackReposUnder } = await import("./purge.js");
  const { tmpdir: td0 } = await import("node:os");
  const r = await dropFallbackReposUnder(td0(), { onlyDead: true });
  if (r.removed.length) console.log(`  · （收尾）清掉自己造的兜底仓库 ${r.removed.length} 个`);
}
console.log(fail === 0 ? `\n✓ 能力注册表 ${pass}/${pass + fail}` : `\n✗ 能力注册表 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
