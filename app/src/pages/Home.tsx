import { useEffect, useState } from "react";
import type { Core } from "../api/client";
import { timeAgo, type ProjectRow } from "../api/types";
import type { HostAdapter } from "../host";
import { mem } from "../layout/layout";
import { toast } from "../ui/Toast";
import { PopItem, PopSep, Popover, usePopover } from "../ui/Popover";

/** 首页每一行的 `⋯` 菜单（2026-10-21 补）。
 *
 *  ⚠️ **补的是一个「说有而其实没有」的入口。** 服务端 M14-3 就有
 *  `remove_recent_project` / `forget_project` / `clear_stale_records` 三件能力，
 *  而 `app/src` 里**一处都没调过** —— 首页只在**失效的那几行**上有一颗「忘掉它」，
 *  正常的项目行什么都没有。于是「把这个项目从 Studio 里去掉」这件事，
 *  **在界面上根本做不到**，而我照着服务端的能力表以为它有。
 *  > **「能力在」和「够得着」是两件事**（和 §165「在不在 DOM 里 / 看不看得见 /
 *  > 碰不碰得到是三个问题」同一族）。能力表是给模型看的，不是给人看的。
 *
 *  ⚠️ **定义在模块级，不在 `Home` 里面** —— 在组件体里定义组件，每次渲染都是一个
 *  新的组件类型，React 会把整棵子树卸载重挂（§八十八 那条 `Wrap = mod.Provider ?? (内联箭头)`）。
 *  这里的后果会很具体：浮层刚打开就被卸掉。
 *
 *  「忘掉」是**两段式**：第一下只把说明摊开，第二下才真删。
 *  形制照首页原来那颗「忘掉它」和 `chat/History.tsx` 的删除 —— 这个仓库里危险动作
 *  的确认一直是行内/行就地的，再加一种确认弹窗会让两套并排一眼看出不是一家。 */
function RowMenu({ p, onReveal, onRemove, onForget }: {
  p: ProjectRow; onReveal: () => void; onRemove: () => void; onForget: () => void;
}) {
  const pop = usePopover();
  const [sure, setSure] = useState(false);
  /* 关掉就把「上膛」撤掉 —— 不撤的话下次打开直接就是「真的忘掉」那一步，
     而用户以为自己只是点开看看。**确认状态不许跨一次打开存活。** */
  useEffect(() => { if (!pop.open) setSure(false); }, [pop.open]);
  return (
    <>
      <button ref={pop.anchorRef as React.RefObject<HTMLButtonElement>} data-ud="home-more"
        className="ib" aria-expanded={pop.open} title="更多"
        onClick={(e) => { e.stopPropagation(); pop.toggle(); }}>⋯</button>
      <Popover pop={pop} tag="home-row" width={280}>
        {/* ⚠️ 失效那条**不给「在访达中显示」** —— 目录都没了，点了只会打开一个空窗 */}
        {!p.missing && <PopItem label="在访达中显示" onPick={() => { pop.close("pick"); onReveal(); }} />}
        {!p.missing && <PopSep />}
        <PopItem label="从列表移除" hint="不动文件" onPick={() => { pop.close("pick"); onRemove(); }} />
        {sure ? (
          <>
            {/* ⚠️⚠️ **这一段 2026-10-22 重写了，而原来那版有两处和实际行为对不上。**
                ① **它把要删的东西说少了。** 原文只写「版本历史（git 兜底仓库）」，
                   而 `forgetProject` 实际 `dropRecord` 掉**整个 `records/<ID>/`**：
                   快照 · 评论 · 回收站 · 模板 · 暂存草稿 · **AI 会话** —— 一样都没提。
                   > **一个二次确认把要删的东西说少了，比没有确认糟** ——
                   > 用户是照着那句话按下「真的忘掉」的，而他以为保住的评论和会话已经没了。
                ② 「目录里那份 `.umbrastudio/` 也不动」**指着一个不存在的东西**
                   （B1/B2 之后项目里没有它了），而这句话留着**反过来暗示我们往他目录里放了一个** ——
                   恰恰是我们花两天移走的那件事。旧那一份还可能在，但回执里有 `stillOnDisk`
                   专门报它，字面该跟着那个字段说、不该写死。

                ⚠️ **顺序按「最容易让人意外」排**（设计侧第 59 封 §9 裁的）：
                AI 会话排第一 —— 它是最不像「版本历史」、而确实会被删掉的那一样。 */}
            <div className="px-2 py-1.5 text-[11px] leading-relaxed text-muted whitespace-normal">
              会删掉我们为它存的<b className="text-text2">全部历史</b>，退不回来：
              <br />· <b className="text-text2">AI 会话</b> · 节点评论 · 稿件的版本快照
              <br />· 没落盘的草稿 · 回收站 · 模板
              <br />· 这条打开记录，以及我们为它单独存的 git 兜底仓库
              <br /><br />你目录里的文件<b className="text-text2">一个字节都不动</b>，删的全是我们自己目录里的东西。
            </div>
            <PopItem label="真的忘掉" danger onPick={() => { pop.close("pick"); onForget(); }} />
          </>
        ) : <PopItem label="忘掉这个项目…" danger onPick={() => setSure(true)} />}
      </Popover>
    </>
  );
}

/** 首页：项目列表（列表 / 网格、搜索、星标、最近打开、缩略图）+ 导入目录 + 新建项目（M6-6 平移）+ 商城入口（`onMarket`，2026-10-17） */
export function Home({ core, host, onOpen, onNewProject, onImport, onSettings, onMarket, projectsVersion }: { core: Core; host: HostAdapter; onOpen: (dir: string) => void; onNewProject: () => void; onImport: () => void; onSettings: () => void; onMarket: () => void; projectsVersion: number }) {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [q, setQ] = useState(""); const [view, setView] = useState<"list" | "grid">(() => mem.get("us.homeView", "list"));
  const [stars, setStars] = useState<string[]>(() => mem.get("us.stars", [])); const [starOnly, setStarOnly] = useState(false);
  /** 失效的记录被点到：**不去打开它**（那会得到一句「打开项目失败」，等于什么都没说明），
   *  而是说清发生了什么和能做什么 —— 用户 2026-10-20 要的就是这一句。 */
  const sayMissing = () => toast("这个目录已经不在了", "可能被删掉或移走了。这条记录还留着；行尾 ⋯ 菜单里的「忘掉这个项目」会把它和我们为它存的版本历史一起清掉。", "error");
  /** 只从列表去掉。**和「忘掉」是两回事** —— 服务端那两件能力的 summary 也是这么分的。 */
  const removeRow = async (dir: string) => {
    const r = await core.post<{ removed: boolean }>("recent_remove", { dir });
    if (!r.ok) { toast("没移除", r.errors?.[0]?.message ?? "", "error"); return; }
    toast("已从列表移除", "目录和里面的文件一个字节都没动；再「打开目录」就又回来了", "ok");
    setProjects((xs) => (xs ?? []).filter((x) => x.dir !== dir));
  };
  const forget = async (dir: string) => {
    const r = await core.post<{ freedBytes: number; stillOnDisk: string | null }>("project_forget", { dir, confirm: true });
    if (!r.ok) { toast("没忘掉", r.errors?.[0]?.message ?? "", "error"); return; }
    const mb = Math.max(1, Math.round((r.data?.freedBytes ?? 0) / 1024));
    toast("已经忘掉它了", `腾出约 ${mb} KB${r.data?.stillOnDisk ? "；那个目录里的 .umbrastudio/ 不在我们这边，没动" : ""}`, "ok");
    setProjects((xs) => (xs ?? []).filter((x) => x.dir !== dir));
  };
  useEffect(() => { let alive = true; void core.get<{ projects: ProjectRow[] }>("projects").then((r) => { if (!alive) return; if (!r.ok) toast("读项目列表失败", r.errors?.[0]?.message, "error"); setProjects(r.data?.projects ?? []); }); return () => { alive = false; }; }, [core, projectsVersion]);
  const toggleStar = (dir: string) => { const s = stars.includes(dir) ? stars.filter((x) => x !== dir) : [...stars, dir]; setStars(s); mem.set("us.stars", s); };
  const pickView = (v: "list" | "grid") => { setView(v); mem.set("us.homeView", v); };
  let rows = (projects ?? []).filter((p) => !q || `${p.name} ${p.title} ${p.dir}`.toLowerCase().includes(q.toLowerCase()));
  if (starOnly) rows = rows.filter((p) => stars.includes(p.dir));
  rows = rows.slice().sort((a, b) => (b.lastOpened ?? "").localeCompare(a.lastOpened ?? "") || a.name.localeCompare(b.name));
  /* ⚠️ **同名项目要能分清**（issue #12）。`project.json` 的 `name` 不唯一 ——
     拷一份项目做实验就重名，而那是常见做法。
     列表视图第二行本来就是完整路径，分得清；**网格卡第二行是
     「有 title 就显示 title」**，而拷出来的副本 title 也一样 → 两张卡一模一样。

     ⚠️ **只在真重名时才把路径顶上来**，不是一律显示路径 ——
     不重名时 title 比路径有用（它是人给项目起的名字），
     而「为了防一种少见情况，把常见情况也变差」是不划算的。 */
  const nameCount = new Map<string, number>();
  for (const p of projects ?? []) nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1);
  const isDup = (p: ProjectRow) => (nameCount.get(p.name) ?? 0) > 1;
  /* 重名时显示**能区分它们的那一段** —— 父目录加自己，前面用 … 省掉。
     完整路径太长，在一张窄卡片里会被 truncate 成一样的开头（`/Users/sam/Doc…`），
     **那等于没显示**。 */
  /* ⚠️ **两种分隔符都要认**（issue #55，2026-10-05 —— 这是 #12 修法自己的漏洞）。
     第一版只按 `/` 切，而 Windows 上 `p.dir` 是 `C:\Users\sam\…`：
     `split("/")` 只得到**一段** → 走 else 分支 → 输出 `/C:\Users\sam\…`，
     而卡片第二行是 `truncate` 的，两张同名卡都显示成 `/C:\Users\sam\Doc…` ——
     **正是 #12 注释里说的「那等于没显示」，这个修法在 Windows 上压根不生效**。
     顺带还给不重名的卡多加了一个不存在的前导 `/`。

     ⚠️ 这一条提醒的是：**修一个「分不清」的问题时，自己的实现也可能分不清** ——
     而我在 mac 上测，看不到。同仓 `chat_run.ts` 早就在做
     `.split("\\").join("/")`，说明服务端给出的就是原生分隔符。

     不拼回前导分隔符：**路径短到只有两段时，原样给比拼一个可能错的前缀好** ——
     `C:\shop` 拼成 `/C:\shop` 是个不存在的路径。 */
  const shortDir = (dir: string) => {
    const parts = dir.replace(/[\\/]+$/, "").split(/[\\/]+/).filter(Boolean);
    return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : dir;
  };

  const reveal = (p: ProjectRow) => void host.revealInFinder(p.dir).catch((e: Error) => toast("打开目录失败", e.message, "error"));
  const Star = ({ p }: { p: ProjectRow }) => <button className={`ib ${stars.includes(p.dir) ? "text-warn" : ""}`} onClick={(e) => { e.stopPropagation(); toggleStar(p.dir); }} title={stars.includes(p.dir) ? "取消星标" : "星标"}>{stars.includes(p.dir) ? "★" : "☆"}</button>;
  const Thumb = ({ p }: { p: ProjectRow }) => <div className="bg-canvas text-muted text-[11px] grid place-items-center overflow-hidden h-full w-full">{p.thumb ? <img src={p.thumb} alt="" className="h-full w-full object-cover object-top" /> : p.missing ? "目录不在" : p.drafts ? `${p.drafts} 份稿` : "空项目"}</div>;
  return (
    <div className="h-full flex flex-col">
      <header className="h-11 px-4 flex items-center gap-3 border-b border-border bg-panel shrink-0">
        <span className="font-semibold text-sm">Umbra Studio</span><span className="flex-1" />
        <span className="text-[11px] text-muted mr-2">{host.kind === "desktop" ? "桌面" : "浏览器"}</span>
        <button className="btn ghost sm" onClick={onMarket} data-ud="home-market" title="插件商城：上架的插件、已装、积分">商城</button>
        <button className="btn ghost sm" onClick={onSettings}>设置</button>
        <button className="btn sm" onClick={onImport} title="选一个目录直接打开 —— 我们不会往里写任何东西">打开目录</button>
        <button className="btn sm primary" onClick={onNewProject}>新建项目</button>
      </header>
      <main className="flex-1 overflow-auto"><div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6"><h1 className="text-xl font-semibold tracking-tight">项目</h1><p className="text-xs text-muted mt-1">本地目录工作台 · 稿存在自己电脑上</p></div>
        <div className="flex items-center gap-2 mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索项目" className="h-8 px-3 rounded border border-border bg-panel text-xs w-64 outline-none focus:border-accent" />
          <span className="flex-1" />
          <button className={`ib ${starOnly ? "text-warn" : ""}`} onClick={() => setStarOnly((s) => !s)} title="只看星标">{starOnly ? "★" : "☆"}</button>
          <div className="seg"><button className={view === "list" ? "on" : ""} onClick={() => pickView("list")}>列表</button><button className={view === "grid" ? "on" : ""} onClick={() => pickView("grid")}>网格</button></div>
        </div>
        {projects === null ? <div className="text-muted text-xs py-10 text-center">正在读项目列表…</div>
          : rows.length === 0 ? <div className="text-muted text-xs py-10 text-center leading-relaxed">{projects.length ? "没有匹配的项目" : <>还没有项目<br />「新建项目」从一个目录起步，或「导入目录」接管已有的稿件目录</>}</div>
          : view === "grid" ? (
            <ul className="grid grid-cols-2 lg:grid-cols-3 gap-3">{rows.map((p) => <li key={p.dir} data-ud="project-row" data-name={p.name} className={`group rounded-lg border bg-panel cursor-pointer overflow-hidden hover:border-borderStrong ${p.current ? "border-accent" : "border-border"} ${p.missing ? "opacity-55" : ""}`} onClick={() => (p.missing ? sayMissing() : onOpen(p.dir))}><div className="h-28"><Thumb p={p} /></div><div className="px-3 py-2 flex items-start gap-2"><div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate flex items-center gap-1" title={p.dir}>
                    <span className="truncate">{p.name}</span>
                    {/* ⚠️ 光把路径顶上来还不够 —— 要让人知道**为什么**这张卡显示的是路径。
                        不说的话他只会觉得「这张卡格式怎么和别的不一样」。 */}
                    {isDup(p) && <span className="shrink-0 text-[10px] font-normal text-warn border border-warnBorder rounded px-1" title={`有 ${nameCount.get(p.name)} 个项目叫「${p.name}」，这一行显示的是目录`}>同名</span>}
                    {/* ⚠️ 网格卡原来**一个字都不说**（列表视图早就有「找不到」那一列，而网格没有）——
                        同一条记录在两种视图下说法不同，是比两边都不说更糟的一种。 */}
                    {p.missing && <span className="shrink-0 text-[10px] font-normal text-err border border-err/40 rounded px-1" title="这个目录已经不在了">找不到</span>}
                  </div><div className="text-[11px] text-muted truncate font-mono" data-ud="grid-sub">{isDup(p) ? shortDir(p.dir) : p.title && p.title !== p.name ? p.title : shortDir(p.dir)}</div></div><div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}><Star p={p} /><RowMenu p={p} onReveal={() => reveal(p)} onRemove={() => void removeRow(p.dir)} onForget={() => void forget(p.dir)} /></div></div></li>)}</ul>
          ) : (
            <div className="rounded-lg border border-border bg-panel overflow-hidden">
              <div className="grid grid-cols-[56px_minmax(0,1fr)_110px_72px_72px] items-center px-3 h-8 text-[11px] text-muted border-b border-border"><span /><span>名称</span><span>最近打开</span><span>稿件</span><span /></div>
              {rows.map((p) => <div key={p.dir} data-ud="project-row" data-name={p.name} className={`grid grid-cols-[56px_minmax(0,1fr)_110px_72px_72px] items-center px-3 h-14 border-b border-border last:border-0 cursor-pointer hover:bg-hover group ${p.current ? "bg-accentSoft/40" : ""} ${p.missing ? "opacity-55" : ""}`} onClick={() => (p.missing ? sayMissing() : onOpen(p.dir))} title={p.dir}>
                <div className="w-11 h-9 rounded overflow-hidden border border-border"><Thumb p={p} /></div>
                <div className="min-w-0 pr-3"><div className="text-sm font-semibold truncate">{p.name}{p.title && p.title !== p.name && <span className="font-normal text-muted"> · {p.title}</span>}</div><div className="text-[11px] text-muted truncate font-mono">{p.dir}</div></div>
                <span className="text-[11px] text-muted">{p.lastOpened ? timeAgo(p.lastOpened) : "—"}</span>
                <span className="text-[11px] text-muted">{p.missing ? <span className="text-err">找不到</span> : `${p.drafts ?? "—"} 份`}</span>
                {/* ⚠️ 失效那条**不给「在访达中显示」** —— 目录都没了，点了只会打开一个空窗（或者什么都不发生）。
                    给的是真能做的那件事：忘掉它。第一下只「上膛」，第二下才真删（见 `armed`）。 */}
                {/* ⚠️ `⋯` **不跟着 hover 隐藏**（星标和它一起常驻）：
                    2026-10-21 之前这一列整个是 `opacity-0 group-hover:opacity-100`，
                    而「从列表移除 / 忘掉」这两件事**没有别的入口** ——
                    一个只在鼠标悬停时才出现的唯一入口，等于告诉用户「这件事做不到」。
                    失效那条原来的两段式「忘掉它」留着：它是失效行**最该点的那一下**，
                    藏进菜单会多一步。 */}
                {/* ⚠️ 原来失效行上那颗独立的「忘掉它」**去掉了** —— 它和 `⋯` 并排时，
                    72px 的那一列塞不下三颗，实测文字被挤成竖排的「忘 掉 它」
                    （正是 sam 说弹窗「很丑」的同一种长相）。
                    **一件事一个入口**：忘掉现在只在 `⋯` 里，失效行和正常行走同一条路。 */}
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Star p={p} />
                  <RowMenu p={p} onReveal={() => reveal(p)} onRemove={() => void removeRow(p.dir)} onForget={() => void forget(p.dir)} />
                </div>
              </div>)}
            </div>
          )}
      </div></main>
    </div>
  );
}
