import { useCallback, useEffect, useMemo, useState } from "react";
import { boot as readBoot, Core, type ProjectHandle } from "./api/client";
import { getHost } from "./host";
import { applyTheme, loadLayout, saveLayout, type LayoutState } from "./layout/layout";
import { Home } from "./pages/Home";
import { Market } from "./market/Market";
import { NewProjectSheet, SettingsSheet } from "./sheets/Sheets";
import { Toasts, toast } from "./ui/Toast";
import { guardUnsaved } from "./ui/dirty";
import { auditKindsOrThrow } from "./kinds";
import { loadPlugins } from "./kinds/plugin/loader";
import { Workbench } from "./workbench/Workbench";

/** 两个核心句柄：hub（托管本页的服务，首页与全局路由走它）与 project（当前项目自己的服务）。
 *  浏览器入口（npm run ui -- <项目>）时两者是同一个服务；桌面壳里 hub 不属于任何项目，项目服务由 open_project 按需起。 */
export default function App() {
  const b = useMemo(readBoot, []);
  const hub = useMemo(() => (b ? Core.fromBoot(b) : null), [b]);
  const host = useMemo(() => (hub ? getHost({ post: (r, body) => hub.post(r, body) }) : null), [hub]);
  const [project, setProject] = useState<ProjectHandle | null>(() => (b && b.name && b.dir ? { url: b.url, token: b.token, ws: b.ws, name: b.name, title: b.title ?? b.name, dir: b.dir } : null));
  const [page, setPage] = useState<"home" | "work" | "market">(() => (location.pathname.endsWith("/home") || !(b && b.name) ? "home" : "work"));
  const [layout, setLayoutRaw] = useState<LayoutState>(loadLayout);
  /** 打开项目之后要自动选中的那一份（「打开方式」打开单个文件时用，M14-5）。
   *  ⚠️ **用完要清**：不清的话下次从首页点同一个项目，它还会把人送回那份文件。 */
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: "newProject"; dir?: string } | { kind: "settings" } | null>(null);
  const [projectsVersion, bump] = useState(0);
  const setLayout = useCallback((l: LayoutState) => { setLayoutRaw(l); saveLayout(l); }, []);
  /** 项目自己那个服务的句柄 —— 设置页里「清掉当前项目的缓存」要打它（`scope: "project"`）。
   *  ⚠️ 桌面壳里 **hub 不属于任何项目**，用 hub 调项目域的能力会被门面拒掉。 */
  const projectCore = useMemo(() => (project ? new Core(project.url, project.token, project.ws) : null), [project]);
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
    if (project && dir === project.dir) { setPage("work"); return; }
    const r = await hub.post<ProjectHandle & { app: string; identity?: string; designProject?: boolean }>("open_project", { dir });
    if (!r.ok || !r.data) { toast("打开项目失败", r.errors?.[0]?.message ?? "", "error"); return; }
    /* ⚠️ **这个位置换了一个目录**（M14-2，Q68）：同名重建会让它静默继承旧的快照 / 评论 / 回收站，
       而静默继承**不会报错** —— 用户只会觉得「这软件的历史是乱的」。所以这一句必须说。
       只在 `replaced`（指纹齐、但对不上）时说；老记录没指纹回 `unknown`，**一个字都不说**。 */
    if (r.data.identity === "replaced")
      toast("这个位置换了一个目录", "和上次打开的不是同一个（新建的同名目录也算）。它的历史从这次重新算，旧的那份还留着。", "error");
    setProject({ url: r.data.url, token: r.data.token, ws: r.data.ws, name: r.data.name, title: r.data.title, dir: r.data.dir, designProject: r.data.designProject });
    setPage("work"); bump((v) => v + 1);
  }, [hub, project]);
  /** 导入目录：已是项目直接开；只是一堆稿 / 空目录进新建面板接管 */
  const importDir = useCallback(async () => {
    if (!host || !hub) return;
    const dir = await host.pickDirectory({ title: "打开目录" });
    if (!dir) { if (!host.capabilities().pickDirectory.ok) setSheet({ kind: "newProject" }); return; }
    /* 同上：**打开目录就是打开**，不再按「是不是项目」分流到新建面板。
       首页那颗「新建项目」还在，那是用户**明说要建一个新项目**的入口。 */
    void open(dir);
  }, [host, hub, open]);
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
        : <Workbench key={project.dir} project={project} host={host} openAt={openAt} onOpenedAt={() => setOpenAt(null)} layout={layout} setLayout={setLayout} onHome={() => { setPage("home"); bump((v) => v + 1); }} onSettings={() => setSheet({ kind: "settings" })} />}
      {sheet?.kind === "newProject" && <NewProjectSheet hub={hub} host={host} initialDir={sheet.dir} onClose={() => setSheet(null)} onOpen={(d) => void open(d)} />}
      {sheet?.kind === "settings" && <SettingsSheet core={hub} host={host} projectUrl={page === "work" && project ? project.url : null} projectCore={page === "work" ? projectCore : null} layout={layout} setLayout={setLayout} onClose={() => setSheet(null)} />}
      <Toasts />
    </>
  );
}
