import { useCallback, useEffect, useMemo, useState } from "react";
import { boot as readBoot, Core, type ProjectEntry, type ProjectHandle } from "./api/client";
import { getHost } from "./host";
import { applyTheme, loadLayout, saveLayout, type LayoutState } from "./layout/layout";
import { Home } from "./pages/Home";
import { Market } from "./market/Market";
import { NewProjectSheet, SettingsSheet } from "./sheets/Sheets";
import { Toasts, toast } from "./ui/Toast";
import { dirtyStore, guardUnsaved } from "./ui/dirty";
import { auditKindsOrThrow } from "./kinds";
import { loadPlugins } from "./kinds/plugin/loader";
import { Workbench } from "./workbench/Workbench";
import { DropAsk, pathsFromDrop, useWindowFileDrop } from "./host/drop";

/** 两个核心句柄：hub（托管本页的服务，首页与全局路由走它）与 project（当前项目自己的服务）。
 *  浏览器入口（npm run ui -- <项目>）时两者是同一个服务；桌面壳里 hub 不属于任何项目，项目服务由 open_project 按需起。 */
export default function App() {
  const b = useMemo(readBoot, []);
  const hub = useMemo(() => (b ? Core.fromBoot(b) : null), [b]);
  const host = useMemo(() => (hub ? getHost({ post: (r, body) => hub.post(r, body) }) : null), [hub]);
  /** 这个窗口里**并存**着的那几个项目（M15-1 S2）。顺序 = 切换器里的顺序。
   *
   *  ⚠️ **做法是「全部挂上、只显示一个」**，不是「切项目时换 `Workbench` 的 props」。
   *  后者（`doc/25` S2 原来写的「拿掉 `key=`」）要审的面比方案估的大得多：
   *  32 处 `project.*` 之外，`useProject` 还有 13 份 state 全靠
   *  `useEffect([dir])` 重拉**一部分**，剩下的会把上一个项目的值带过来。
   *  挂一份实例只服务一个项目（`key={dir}`，一生不换），那个不变量就原样保留。
   *  > **与其把一个不变量拆掉再逐处补回来，不如让它继续成立。**
   *  代价换成了另一笔、而且是可枚举的那笔：**哪些 effect 只许当前那个跑**
   *  （标题、快捷键、`ud-renamed`）—— 见 `Workbench` 的 `hidden` 注释。 */
  const [entries, setEntries] = useState<ProjectEntry[]>(() => {
    if (!(b && b.name && b.dir)) return [];
    const h: ProjectHandle = { url: b.url, token: b.token, ws: b.ws, name: b.name, title: b.title ?? b.name, dir: b.dir };
    return [{ handle: h, core: new Core(h.url, h.token, h.ws) }];
  });
  const [activeDir, setActiveDir] = useState<string | null>(() => (b && b.dir ? b.dir : null));
  /** 一个窗口里最多并存几个（`doc/25` 取舍 C，geek-99 定「先给 4 并标【判断】」）。
   *  ⚠️ **这个数没有量过** —— 没有「几个项目开始卡」的读数，它是一个保守的起点。
   *  S2 做完要量一次「开 4 个」的内存与切换耗时，太重就降（那次读数补进 `doc/25` §四 C）。 */
  const MAX_PROJECTS = 4;
  const [page, setPage] = useState<"home" | "work" | "market">(() => (location.pathname.endsWith("/home") || !(b && b.name) ? "home" : "work"));
  const [layout, setLayoutRaw] = useState<LayoutState>(loadLayout);
  /** 打开项目之后要自动选中的那一份（「打开方式」打开单个文件时用，M14-5）。
   *  ⚠️ **用完要清**：不清的话下次从首页点同一个项目，它还会把人送回那份文件。 */
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: "newProject"; dir?: string } | { kind: "settings" } | null>(null);
  /** 从系统里拖进来、还没决定怎么处理的那几个路径（场景 ①，M14-5 下半） */
  const [dropped, setDropped] = useState<string[] | null>(null);
  const [projectsVersion, bump] = useState(0);
  const setLayout = useCallback((l: LayoutState) => { setLayoutRaw(l); saveLayout(l); }, []);
  /** 当前这个项目的 **handle + core 绑在一起那个对象**（M15-1 S1）。
   *
   *  ⚠️ 原来这里和 `Workbench` 里**各自 `new Core(…)` 了一次** —— 同一个项目两个客户端实例。
   *  那今天不出错（它们指向同一台服务），但它是「`core` 和 `project` 是两个独立的值」
   *  这件事的第二个证据：**谁要用就自己造一个**，而没有任何东西保证他们造的是同一个项目的。
   *  现在收成一个出处：窗口持有它，`Workbench` 和设置页**读同一个**。
   *  ⚠️ 设置页里「清掉当前项目的缓存」要打它（`scope: "project"`）——
   *  桌面壳里 **hub 不属于任何项目**，用 hub 调项目域的能力会被门面拒掉。 */
  /** 当前显示的那一个。`null` = 首页 */
  const activeEntry = useMemo(() => entries.find((e) => e.handle.dir === activeDir) ?? null, [entries, activeDir]);
  /** 当前项目的 handle —— 下面那些「当前项目是谁」的判断照旧读它，**一个字都不用改** */
  const project = activeEntry?.handle ?? null;
  const projectCore = activeEntry?.core ?? null;
  /** 切换器要的那张表（只给它需要的两样，不把 `core` 递下去） */
  const windowProjects = useMemo(() => entries.map((e) => ({ dir: e.handle.dir, title: e.handle.title || e.handle.name })), [entries]);
  /* 刷新 / 关窗前拦一下没落盘的改动（`00` §一二一）。挂一次，整个应用生效。 */
  useEffect(() => guardUnsaved(), []);
  useEffect(() => { applyTheme(layout.theme); const mq = window.matchMedia("(prefers-color-scheme: dark)"); const on = () => applyTheme(layout.theme); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, [layout.theme]);
  /* ⚠️ **整地址时要把 query 原样留着**（`11` Q42，2026-09-28 实测抓到）。
     浏览器入口的令牌就在 `?token=` 里（方案 (c)）。原来这里写死成 `/__app/`，
     等于**每次切页就把令牌从地址里抹掉** —— 当场看不出问题（boot 已经读进内存了），
     但**一刷新就废**：地址里没令牌了，页面直接变成「拿不到访问令牌」。
     uitest 那条「刷新后引擎还是它」就卡在这里，连 treeitem 都等不出来。
     桌面壳里地址本来就不带令牌（走 preload），所以这句对它是空操作。 */
  useEffect(() => { history.replaceState(null, "", (page === "work" ? "/__app/" : "/__app/home") + location.search); }, [page]);
  /* 插件接线（M11-5）。**装不上的要说出来** —— 静静不显示的话，
     用户只会看到「我装的插件不见了」，而他刚付过钱。
     `loadPlugins` 可以重复调（装完 / 卸完再调一次），内部按 id 去重。 */
  const wirePlugins = useCallback(() => {
    if (!hub) return;
    void loadPlugins(hub).then(({ off }) => {
      for (const x of off) toast(`插件 ${x.id} 没能接上`, x.why, "error");
      /* 插件接完线才自检 —— `md` 现在由内置插件认领，接线前查必然误报 */
      auditKindsOrThrow();
    });
  }, [hub]);
  useEffect(() => { wirePlugins(); }, [wirePlugins]);
  /* ⚠️ **装 / 切版本 / 卸完要当场重新接线**（M11-10）。
     不接这一句的话，服务端那边已经生效了，界面却要刷新页面才看得见 ——
     而用户刚点完「安装」，那一刻最不该让他刷新。 */
  useEffect(() => {
    if (!hub) return;
    return hub.events((e) => {
      if (e.type !== "plugin") return;
      const { what, id } = (e.payload ?? {}) as { what?: string; id?: string };
      wirePlugins();
      toast(`插件 ${id ?? ""} ${what === "uninstalled" ? "已卸载" : what === "reverted" ? "已退回出厂版本" : what === "switched" ? "已切换版本" : "已装好"}`, undefined, "ok");
    });
  }, [hub, wirePlugins]);
  const open = useCallback(async (dir: string) => {
    if (!hub) return;
    /* 已经在这个窗口里开着了 → **只切过去，不重新 open_project**（M15-1 S2）。
       ⚠️ 重新 open 也「能用」，但它会让那个实例的 `entry` 换一个新对象 →
       `key={dir}` 不变所以不重挂，而 `core` 换了 —— 白白重建一次客户端。
       更要紧的是：那样「切过去」和「第一次打开」就成了两条路，而它们该是一条。 */
    const already = entries.find((e) => e.handle.dir === dir);
    if (already) { setActiveDir(dir); setPage("work"); return; }
    if (entries.length >= MAX_PROJECTS) {
      /* ⚠️ **到上限要说出数，并给出路** —— 只说「打不开」用户会以为是那个目录的问题。 */
      toast(`这个窗口最多并存 ${MAX_PROJECTS} 个项目`, "先关掉一个（项目名菜单里），或者在新窗口里打开", "error");
      return;
    }
    const r = await hub.post<ProjectHandle & { app: string; identity?: string; designProject?: boolean; editable?: boolean }>("open_project", { dir });
    if (!r.ok || !r.data) { toast("打开项目失败", r.errors?.[0]?.message ?? "", "error"); return; }
    /* ⚠️ **这个位置换了一个目录**（M14-2，Q68）：同名重建会让它静默继承旧的快照 / 评论 / 回收站，
       而静默继承**不会报错** —— 用户只会觉得「这软件的历史是乱的」。所以这一句必须说。
       只在 `replaced`（指纹齐、但对不上）时说；老记录没指纹回 `unknown`，**一个字都不说**。 */
    if (r.data.identity === "replaced")
      toast("这个位置换了一个目录", "和上次打开的不是同一个（新建的同名目录也算）。它的历史从这次重新算，旧的那份还留着。", "error");
    const handle: ProjectHandle = { url: r.data.url, token: r.data.token, ws: r.data.ws, name: r.data.name, title: r.data.title, dir: r.data.dir, designProject: r.data.designProject, editable: r.data.editable };
    /* ⚠️ **`core` 在这里和 handle 一起造**，而不是让谁去 `new` 一个 —— 理由在 `ProjectEntry` 的注释里。
       ⚠️ 按 `dir` 去重：`open_project` 回的 `dir` 是服务端 `resolve` 过的，
       可能和调用方给的那个字面不同（软链、尾斜杠），所以**用回执里那个**。 */
    setEntries((xs) => (xs.some((e) => e.handle.dir === handle.dir) ? xs : [...xs, { handle, core: new Core(handle.url, handle.token, handle.ws) }]));
    setActiveDir(handle.dir);
    setPage("work"); bump((v) => v + 1);
  }, [hub, entries]);

  /** 把一个项目从这个窗口里关掉（M15-1 S2 · 取舍 B / D）。
   *
   *  ⚠️ **取舍 B（geek-99 定 B1）：有一轮 AI 在跑就拦一句。**
   *  B2「后台继续跑」的后果是**文件被改了而变更卡那一屏他从来没见过** ——
   *  那是假成功的一种。而拦一句有现成的形制（`LeaveGuard`），不新造一种。
   *  ⏳ **这一期先拦「没落盘」那一类**（`dirtyStore` 按项目分之后问得准了）；
   *  「正在跑的那一轮」要拦得准，得先有「切回来接上正在跑的那一轮」那件事 ——
   *  **而那件今天压根不存在**（`useChat.ts:174` 自己写着「切项目再切回来它都是 false
   *  而服务端那一轮还在跑」）。所以这里**照实只拦得到一半**，另一半登记成 S3 的事。
   *
   *  ⚠️ **取舍 D（D1）：停服务要带引用计数，而那在服务端** —— S3 做。
   *  这一期关掉只是从这个窗口的列表里去掉，服务照旧活着。 */
  const closeProject = useCallback((dir: string) => {
    const stuck = dirtyStore.list().filter((k) => k.startsWith(dir + "/"));
    if (stuck.length) {
      toast(`${stuck.length} 份还没落盘，先没关掉`,
        `${stuck.map((k) => k.slice(dir.length + 1)).join(" · ")} —— 切过去落了盘再关`, "error");
      return;
    }
    setEntries((xs) => xs.filter((e) => e.handle.dir !== dir));
    setActiveDir((cur) => (cur === dir ? (entries.find((e) => e.handle.dir !== dir)?.handle.dir ?? null) : cur));
  }, [entries]);
  /** 导入目录：已是项目直接开；只是一堆稿 / 空目录进新建面板接管 */
  const importDir = useCallback(async () => {
    if (!host || !hub) return;
    const dir = await host.pickDirectory({ title: "打开目录" });
    if (!dir) { if (!host.capabilities().pickDirectory.ok) setSheet({ kind: "newProject" }); return; }
    /* 同上：**打开目录就是打开**，不再按「是不是项目」分流到新建面板。
       首页那颗「新建项目」还在，那是用户**明说要建一个新项目**的入口。 */
    void open(dir);
  }, [host, hub, open]);
  /* ── 从系统里拖文件 / 文件夹进来（场景 ①②，`doc/24` §22.1）──
     ⚠️ **一条硬约束先摆着**（用户 2026-10-21 原话，和 Q62 同一句）：
     「无论是导入还是拖拽导入都不应该把文件放入到我们的 `projects` 中，
     我们项目中绝对不重复存储用户的文件」。
     所以**拖进来打开 = 零复制**：以它所在的位置为根打开，和「打开方式」同一条路。
     唯一会复制的是把它拖进**文件列**那一下（场景 ③，在 `FileTree.tsx`），
     而那一下不违反约束 —— **复制是用户自己点的，落点是他自己的项目目录**。

     分流只有一条判准：**当前有没有开着项目**。
     · 首页（没项目）→ 直接打开。多一个问句只会让人问「不然还能干嘛」。
     · 工作台（有项目）→ 问一句。因为「在当前窗口打开」会**离开他正在看的项目**，
       而那是一个他没要求的后果。
     ⚠️ 用户给的 ① 原文是「问：新开窗口，还是在当前窗口里并存」——
     **「并存」那一档是 M15-1（一个窗口多个项目），不在这一期**（理由 `doc/24` §22.2：
     它是一个新架构不是一个按钮）。所以这一问现在是「新窗口 / 当前窗口」两档，
     少的那一档**照实缺着**，不拿一个假的「并存」糊上去。 */
  const onFileDrop = useCallback((e: DragEvent) => {
    if (!host) return;
    const paths = pathsFromDrop(host, e);
    if (!paths.length) {
      /* ⚠️ **拖了而拿不到路径要说话**：浏览器里 `files` 有、路径没有（见 `host/types.ts`）。
         静静没反应的话用户只会以为「拖拽坏了」，而真相是这个宿主给不出路径。 */
      const cap = host.capabilities().dropPaths;
      if (!cap.ok) toast("这里拖不进来", cap.why, "error");
      return;
    }
    if (!project || page !== "work") { void open(paths[0]!); return; }
    setDropped(paths);
  }, [host, project, page, open]);
  useWindowFileDrop(onFileDrop);

  useEffect(() => host?.onEvent?.((e) => {
    /* ⚠️ **直接打开，不再拦去「新建项目」**（M14-4 B3，2026-10-21）。
       原来：不是项目 → 弹新建项目面板 → 用户照做 → 我们往他的目录里写 780 KB。
       sam 想做的只是「用 Studio 看一份 .md」，而我们让他把自己的文档目录
       变成了一个设计项目。**「打开」和「接管」是两件事，原来被做成了一件。**
       现在打开就是打开（一个字节不写），要预览设计稿时工作台里那条横条再问。 */
    if (e.type === "open-dir") void open(e.dir);
    /* 「打开方式」给的是**一个文件**（M14-5 / `doc/11` Q59）：以父目录为根打开、选中它。
       ⚠️ 父目录**不会被写进任何东西**（M14-4 B3）—— B3 之前这条路会在用户的
       下载文件夹里部署 780 KB，所以当时 Q59 做不了。 */
    if (e.type === "open-file") void (async () => { setOpenAt(e.rel); await open(e.dir); })();
    if (e.type === "go-home") setPage("home");
    if (e.type === "dirty-restart") toast("上次没有正常退出", "如果当时有没落盘的改动，请在稿的版本历史里核对一下", "error");
  }), [host, hub, open]);
  /* ⚠️ 拿不到启动数据，现在**最常见的原因变了**（`11` Q42，2026-09-28）：
     不是「核心没起来」，而是**拿不到令牌** —— `/__app/` 不再无条件把令牌注进页面。
     而**浏览器和桌面壳的令牌走的是两条完全不同的路**（query vs preload），
     所以出路也是两条不同的，必须分开说。
     ⚠️ 第一版没分：桌面壳里也在说「用终端打印的那个带 token 的地址打开」——
     反向验证时当场看到这一屏，才发现它在跟桌面用户讲一件他做不到的事。
     `window.umbraHost` 是 preload 挂的另一样东西，它在而 `__UD_APP` 不在，
     说明**确实是壳，只是注入那一步坏了** —— 这时候该让他重启，不是让他去找终端。
     只说「没有拿到启动数据」会让人去查核心起没起，而那多半不是原因。 */
  if (!b || !hub || !host) {
    const inShell = typeof (window as unknown as { umbraHost?: unknown }).umbraHost === "object";
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-[420px] text-center text-sm leading-relaxed">
          <div className="font-semibold text-text">这个页面还拿不到访问令牌</div>
          {inShell ? (
            <p className="mt-2 text-muted text-xs">
              桌面版的令牌是<b className="text-text2">启动时直接交给页面的</b>，不经地址 —— 拿不到说明这一步出了岔。
              <br />先<b className="text-text2">完全退出再打开一次</b>；还是这样的话，把启动日志发过来
              （<code className="font-mono">UMBRASTUDIO_CHANNEL_B_LOG</code> 那类环境变量不用管，看终端里的报错就行）。
            </p>
          ) : (
            <p className="mt-2 text-muted text-xs">
              浏览器里要用 <b className="text-text2">终端打印的那个带 token 的地址</b> 打开
              （<code className="font-mono">npm --prefix server run ui -- &lt;项目&gt;</code> 会自动开，也可以从终端复制）。
              <br />用桌面版则不需要地址，它直接拿令牌。
            </p>
          )}
          <p className="mt-2 text-muted text-[11px]">
            为什么要这样：本机任何程序都能访问 127.0.0.1，令牌写在页面里就等于谁都能拿走。
          </p>
        </div>
      </div>
    );
  }
  return (
    <>
      {/* 首页的「商城」（sam 2026-10-17）：没开项目也能逛 —— 和工作台里「插件市场…」是同一个组件，走 hub 的全局能力；
          商品以 Umbra 后台上架的为准（`list_market` 每次当场问服务端）。关掉回首页。 */}
      {page === "market"
        ? <div className="h-full flex min-h-0"><Market core={hub} onClose={() => setPage("home")} onSettings={() => setSheet({ kind: "settings" })} /></div>
        : page === "home" || !project
        ? <Home core={hub} host={host} onOpen={(d) => void open(d)} onNewProject={() => setSheet({ kind: "newProject" })} onImport={() => void importDir()} onSettings={() => setSheet({ kind: "settings" })} onMarket={() => setPage("market")} projectsVersion={projectsVersion} />
        /* ⚠️ `key={project.dir}` **S1 刻意留着** —— 拿掉它是 S2 的事，
           而拿掉的那一刻 `Workbench` 里 32 处 `project.*` 同时变成可疑点
           （理由全文在 `ProjectEntry` 的注释里）。S1 只换「`core` 从哪来」，**零行为变化**。 */
        /* ── 并存：**全部挂上、只显示一个**（M15-1 S2）──
           ⚠️ `key={e.handle.dir}` **留着，而且是这个做法的全部依据**：
           一份实例一生只服务一个项目，于是 `Workbench` 里 32 处 `project.*`
           和 `useProject` 那 13 份 state 的不变量**原样成立**，一处都不用审。
           ⚠️ 隐藏用 `display:none` 而不是不渲染 —— 不渲染就等于卸载，
           那正是我们要避免的那件事（state 没了、正在跑的轮次没人收尾）。
           ⚠️ 外层这个 `div` 必须自己是 `h-full flex`：`Workbench` 的根是
           `h-full flex flex-col`，它要一个有高度的父节点。 */
        : entries.map((e) => (
            <div key={e.handle.dir} data-ud="workbench-slot" data-dir={e.handle.dir}
              data-active={e.handle.dir === activeDir || undefined}
              className="h-full flex flex-col min-h-0"
              style={e.handle.dir === activeDir ? undefined : { display: "none" }}>
              <Workbench entry={e} hidden={e.handle.dir !== activeDir}
                windowProjects={windowProjects}
                onSwitchProject={(d) => { setActiveDir(d); bump((v) => v + 1); }}
                onCloseProject={closeProject}
                host={host} openAt={e.handle.dir === activeDir ? openAt : null} onOpenedAt={() => setOpenAt(null)}
                layout={layout} setLayout={setLayout}
                onHome={() => { setPage("home"); bump((v) => v + 1); }}
                onSettings={() => setSheet({ kind: "settings" })} />
            </div>
          ))}
      {dropped && host && (
        <DropAsk paths={dropped} kind="outside" host={host}
          onClose={() => setDropped(null)}
          onOpenHere={() => { const ps = dropped; setDropped(null); void open(ps[0]!); }}
          onNewWindow={() => {
            const ps = dropped; setDropped(null);
            void host.openInNewWindow(ps).then((okWin) => {
              /* ⚠️ 开不成要说出来 —— 回执是 `false` 时静静什么都不发生，
                 就是又一条「点了没反应」。 */
              if (okWin) return;
              toast("没能开新窗口", "已经在当前窗口里打开了", "error");
              void open(ps[0]!);
            });
          }} />
      )}
      {sheet?.kind === "newProject" && <NewProjectSheet hub={hub} host={host} initialDir={sheet.dir} onClose={() => setSheet(null)} onOpen={(d) => void open(d)} />}
      {sheet?.kind === "settings" && <SettingsSheet core={hub} host={host} projectUrl={page === "work" && project ? project.url : null} projectCore={page === "work" ? projectCore : null} layout={layout} setLayout={setLayout} onClose={() => setSheet(null)} />}
      <Toasts />
    </>
  );
}
