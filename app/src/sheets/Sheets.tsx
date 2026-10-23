import { platformName, studioName } from "@shared/brand";
import { useCallback, useEffect, useState } from "react";
import type { Core } from "../api/client";
import { baseName, timeAgo, type CliStatus, type DirInfo } from "../api/types";
import type { HostAdapter } from "../host";
import type { LayoutState } from "../layout/layout";
import { currentChannel, pickChannel, type ChannelId } from "../chat/channel";
import { toast } from "../ui/Toast";

/** 弹窗外壳。
 *  **高度必须封顶 + 内容区能滚** —— 内容一多就撑出屏幕、底部按钮够不着，
 *  2026-09-24 用户实测撞到过（设置面板加了「本地 CLI」那一块之后）。
 *  所以它是三段式：标题条与操作条钉住，中间那段自己滚。
 *
 *  ⚠️⚠️ **三段是必填的 props，不是 `children`**（2026-10-21 改，sam 报「新建项目弹窗很丑」）。
 *  原来三段是 `Sheet.Head` / `Sheet.Body` / `Sheet.Foot` 三个**可选的**子组件，
 *  而**内边距全住在那三个里，外壳自己一点都没有** —— 于是不用它们的弹窗
 *  就是零内边距、零段间距。实测三个弹窗里**只有设置面板用了**：
 *
 *  | 弹窗 | 实测几何（到弹窗边框的距离） |
 *  | --- | --- |
 *  | 新建项目 | 上下左右全是 **1px**（那 1px 还是边框），段间距 **0** |
 *  | 新建稿件 | 左 1 · 上 1 · 下 1 · **右 59**（内容写死 460 而壳是 520，歪的） |
 *  | 设置 | 正常 |
 *
 *  > **一个需要人记得的方案和一个不需要记得的方案，选后者**（`kinds/media.tsx` 同一句）。
 *  > 改成必填 props 之后，**漏掉内边距这件事在类型上就不成立了**；
 *  > 而原来那种漏法**不会有任何东西报警** —— 和 §170.4 那条
 *  > 「输入框没写 class 就完全看不见」是同一族。 */
function Sheet({ head, body, foot, onClose, wide }: { head: React.ReactNode; body: React.ReactNode; foot: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => { const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", on); return () => document.removeEventListener("keydown", on); }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 bg-black/25 flex items-start justify-center p-4 sm:py-[6vh] overflow-hidden"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true"
        className={`bg-panel border border-border rounded-lg shadow-2xl flex flex-col text-xs max-h-full min-h-0 ${wide ? "w-[880px] max-w-full" : "w-[520px] max-w-full"}`}>
        {/* 钉在顶部的标题条 */}
        <div className="px-5 pt-5 pb-3 shrink-0">{head}</div>
        {/* 会滚的内容区 —— 弹窗里所有可能变长的东西都在这里 */}
        <div className="px-5 flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">{body}</div>
        {/* 钉在底部的操作条：内容再长，「完成」也够得着 */}
        <div className="px-5 pt-3 pb-5 shrink-0 flex items-center justify-end gap-2 border-t border-border mt-4">{foot}</div>
      </div>
    </div>
  );
}
const Field = ({ label, children, note, err }: { label: string; children: React.ReactNode; note?: string; err?: boolean }) => <label className="flex flex-col gap-1"><span className="text-muted">{label}</span>{children}{note && <span className={err ? "text-err" : "text-muted"}>{note}</span>}</label>;
const inputCls = "h-8 px-3 rounded border border-border bg-bg outline-none focus:border-accent";

/* ⚠️ **`Row`（接管那张表的一行）2026-10-23（M16-7c-2a / C3）随那张表一起删了。**
   它的设计值得留一句：文件数是**必填 prop** —— 设计侧第 59 封 §零 A 抓到那张表
   「分项加不到合计」（8+4+2+1=15≠17），而我自己从来没把它加一遍。
   > **把一个「容易忘了填」的东西变成必填 prop，「忘了」在类型上就不成立了。**
   （同一个做法：弹窗外壳的三段必填 props。） */


/** 新建文件（M16-8 ⑥，2026-10-24 从「新建稿件」改过来）。
 *
 *  ### ⚠️⚠️ 为什么是「改」而不是「删」
 *  `create_draft` 退场（四档里三档在造设计稿，C3 定的是设计稿那一整套删掉）。
 *  而**删之前量出来**：界面上**唯一**能新建文件的入口就是这一颗，
 *  而 `dir/View.tsx` 的空态文案已经在让用户「用项目菜单里的「新建文件」」——
 *  **指向一个不存在的入口**。
 *  > **退场一件 dc 能力，不该顺手把「能新建文件」一起退掉** ——
 *  > 而这两件事在这个入口上是同一颗按钮。
 *  所以 geek-99 定：入口改成「新建文件…」走 **`write_file`**（第二条写入口，本来就是通用的），
 *  而那句空态文案**就此变成真的**。
 *
 *  ### 这一屏减掉了什么
 *  · **类型（页稿 / 组件稿）** —— dc 的概念（`kind` 只给 `.dc.html` 用）；
 *  · **起始模板那一组** —— 模板是 `.dc.html` 模板，整摊同一批退场；
 *  · **「从现有稿复制…」** —— 交给右键的「复制一份」（`duplicate_draft`，同一天通用化了：
 *    后缀跟着源走 + 二进制逐字节复制）。**两个入口做同一件事时，留在它该在的地方。**
 *  剩下的就是 geek-99 定的两项：**名字**和**所在目录**。
 *
 *  ### ⚠️ 名字带 `.dc.html` 也只建空文件
 *  geek-99 明确：**不塞骨架**。原来「空白」那一档会写 `<x-dc>` + 运行时那一套，
 *  而那正是要退场的东西。于是 `.dc.html` 在这里和别的扩展名一视同仁。
 *  ⚠️ 也**不再自动补扩展名** —— 原来不带后缀就补 `.dc.html`，而现在我们不知道用户想建什么。
 *  > **一个只对一种格式成立的默认值，在这个入口变成通用之后就是在替用户猜。**
 *
 *  最要紧的那条形制留着：**文件名下面实时写出完整路径**（「点『新建』之前就能知道结果」），
 *  重名或非法字符当场变红说原因、钮变灰。
 */
export function NewDraftSheet({ core, dir, onClose, onCreated }: {
  core: Core; dir: string; onClose: () => void; onCreated: (file: string) => void;
  /* ⚠️ `current` 这个 prop 没了 —— 它只为「从现有稿复制…」那条文字链服务。 */
}) {
  const [name, setName] = useState("");
  const [existing, setExisting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /* ⚠️⚠️ **重名检查原来调 `drafts`（`list_drafts`），而那件能力 2026-10-23（M16-7c）删了。**
     不改的话它会**静默 404** —— `.catch(() => {})` 把失败吞掉，`existing` 停在空数组，
     于是「这个目录里已经有同名的了」这句提示**永远不出现**，而界面看不出任何异常。
     > **一个被 catch 吞掉的查询失效之后，长得和「查过了，没有重名」一模一样。**
     换成列**这一个目录**（`list_files`），而它比原来对：重名只发生在同一个目录里。 */
  useEffect(() => {
    void core.get<{ entries?: Array<{ name: string }> }>(`files?dir=${encodeURIComponent(dir)}`)
      .then((r) => setExisting((r.data?.entries ?? []).map((e) => e.name))).catch(() => {});
  }, [core, dir]);

  const n = name.trim();
  const fileName = n;   // ⚠️ 不补扩展名，见上
  const full = fileName ? (dir ? `${dir}/${fileName}` : fileName) : "";
  const illegal = !!n && /[\\/:*?"<>|]/.test(n);
  const dup = !!fileName && existing.includes(fileName);
  const why = illegal ? '名字里不能有 \\ / : * ? " < > |' : dup ? "这个目录里已经有同名的了" : "";
  const blocked = !fileName || !!why || busy;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    /* ⚠️ `expectSha256: "0"` = **这个文件必须还不存在**（写前校验那条路的约定）——
       上面的重名检查是给人看的，这一条是给盘上那份文件把关的。
       > **界面上问过一次，和落盘那一刻再问一次，防的是两件事**：
       > 前者防用户看错，后者防「我问完到我写完之间别人建了同名的」。 */
    const r = await core.post("file_write", { path: full, content: "", expectSha256: "0" });
    if (r.ok) { toast(`已新建 ${fileName}`, dir || "项目根", "ok"); onCreated(full); onClose(); }
    else { toast("新建文件失败", r.errors?.[0]?.message, "error"); setBusy(false); }
  };

  return <Sheet onClose={onClose}
    head={<h2 className="text-base font-semibold">新建文件</h2>}
    foot={<>
      <button className="btn sm" onClick={onClose}>取消</button>
      <button className="btn sm primary" disabled={blocked} onClick={() => void submit()}>新建</button>
    </>}
    body={<>
    <div className="grid gap-[18px]" onKeyDown={(e) => {
      /* ⚠️ Enter 挂在**容器**上（issue #124）：挂在输入框上的话，焦点在别处时按 Enter 没反应。
         ⚠️ 只在焦点真在 `INPUT` 里时才算 —— 不然点开弹窗按一下 Enter 就建了。 */
      if (e.key !== "Enter" || blocked) return;
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== "INPUT") return;
      e.preventDefault(); void submit();
    }}>
      <div className="grid gap-1.5">
        <label className="text-[11px] text-muted">文件名</label>
        <input className="w-full h-[34px] px-2.5 rounded border border-border bg-panel2 text-xs" autoFocus
          placeholder="例如 说明.md" value={name} onChange={(e) => setName(e.target.value)} data-ud="newfile-name" />
        {/* 实时写出完整路径 —— 「点『新建』之前就能知道结果」 */}
        <div className="text-[11px] leading-relaxed" style={{ color: why ? "var(--tool-err)" : "var(--muted)" }} data-ud="newfile-path">
          {why || (full ? `会建在 ${full}` : "在这个目录里建一个新文件")}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="text-[11px] text-muted">所在目录</label>
        <div className="text-xs px-2.5 py-2 rounded border border-border bg-panel2 truncate" data-ud="newfile-dir">{dir || "项目根"}</div>
      </div>
    </div>
    </>} />;
}

/** 新建 / 导入目录：目录本身成为项目根；已有稿被接管不改动 */
export function NewProjectSheet({ hub, host, initialDir, onClose, onOpen }: { hub: Core; host: HostAdapter; initialDir?: string; onClose: () => void; onOpen: (dir: string) => void }) {
  const [dir, setDir] = useState(initialDir ?? ""); const [name, setName] = useState(""); const [title, setTitle] = useState(""); const [info, setInfo] = useState<DirInfo | null>(null); const [busy, setBusy] = useState(false);
  const cap = host.capabilities().pickDirectory;
  const inspect = async (d: string) => { if (!d.trim()) return; const r = await hub.get<DirInfo>("inspect_dir?dir=" + encodeURIComponent(d.trim())); if (r.ok && r.data) { setInfo(r.data); if (!name && r.data.suggestedName) setName(r.data.suggestedName); } };
  useEffect(() => { if (initialDir) void inspect(initialDir); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async () => { const d = await host.pickDirectory({ title: "选择项目目录" }); if (!d) { if (!cap.ok) toast("选目录", cap.why); return; } setDir(d); if (!name) setName(baseName(d).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")); void inspect(d); };
  const nm = name.trim(); const nameBad = !!nm && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(nm);
  const submit = async () => {
    setBusy(true);
    const r = await hub.post<{ dir?: string; name?: string }>("create_project", { name: nm, dir: dir.trim(), title: title.trim() || undefined });
    if (r.ok && r.data) { toast("项目创建成功", r.data.name ?? nm, "ok"); onClose(); onOpen(r.data.dir ?? dir.trim()); } else { toast("创建项目失败", r.errors?.[0]?.message, "error"); setBusy(false); }
  };
  return <Sheet onClose={onClose}
    head={<h2 className="text-base font-semibold">新建项目</h2>}
    foot={<>
      <button className="btn" onClick={onClose}>取消</button>
      <button className="btn primary" disabled={!dir.trim() || !nm || nameBad || !!info?.isProject || busy} onClick={() => void submit()}>{busy ? "正在建…" : "新建项目"}</button>
    </>}
    body={<>
    <p className="text-muted leading-relaxed">项目就是磁盘上一个目录。选一个目录，它本身成为项目根 —— <b className="text-text2">你原来的文件一个字节都不会被改</b>。</p>
    {/* ⚠️⚠️ **这一条是 2026-10-21 补的，补的是一句假回执**（sam 用它打开 `Geek/doc` 之后发现的）。
        ⚠️ **数字 2026-10-22 重新量过**（B 段做完之后）：23 个文件 / 780 KB → **18 个 / 754 KB**。
        少掉的那 5 个是 `.umbrastudio/` 那一摊（快照、评论、缓存…）—— 它们搬进软件自己的目录了。
        剩下的 18 个搬不走，而且**不该搬**：壳页面和运行时副本是 ⓒ 档（`doc/24` §八），
        稿自己按相对路径引它们，搬走等于「双击这份稿是白屏」。
        > **一个数写在界面上就会过期 —— 所以每次动了落点都要回来重量一次，
        > 而不是等用户发现它不对。**
        原文写的是「里面已有的稿件会被接管，**不会被改动**…**只加 project.json**」，
        而实测「新建 + 第一次打开」往那个目录里写了 **23 个文件 · 约 780 KB**，
        还**改了他的 `.gitignore`**。
        「原来的文件不被改」是真的，「只加 project.json」是假的 —— **两句话混在一起，
        假的那半借了真的那半的可信度**。
        ⚠️ 这些东西该搬走（`11` Q62 / `12` M14-4 的 B 段），**但在搬走之前这句话必须照实说** ——
        `CLAUDE.md` §8 第 7 条：**一个说谎的数比没有数糟，因为它看起来是读数**；
        而这里更糟，因为用户是照着这句话决定要不要把自己的文档目录交给我们的。 */}
    <div className="rounded border border-border bg-panel2 px-3 py-2 leading-relaxed">
      <b className="text-text2">但它会往这个目录里加一批工具文件</b> —— 入口页、8 份预览壳、运行时副本，
      实测 <b className="text-text2">18 个文件 · 约 750 KB</b>。
      <br /><b className="text-text2">你的 <code className="font-mono text-[11px]">.gitignore</code> 不动</b> ——
      这个目录在 git 仓库里的话，排除规则记在本机那份 <code className="font-mono text-[11px]">.git/info/exclude</code> 里（不进版本）。
      <br />这些都是生成物，删掉下次打开会重建。
      <span className="text-muted">快照、评论、回收站、缓存<b className="text-text2">不在</b>这个目录里（在软件自己那边）。</span>
    </div>
    <Field label="目录" note={info && info.exists === false ? "目录还不存在，会自动创建" : cap.ok ? undefined : cap.why}><div className="flex gap-2"><input className={inputCls + " flex-1"} value={dir} onChange={(e) => setDir(e.target.value)} onBlur={() => void inspect(dir)} placeholder="/Users/…/我的项目" /><button className="btn" onClick={() => void pick()}>选择</button></div></Field>
    {info?.isProject && <div className="rounded border border-border bg-panel2 px-3 py-2 flex items-center gap-2"><span className="flex-1">这个目录已经是一个项目（有 project.json）。</span><button className="btn sm" onClick={() => { onClose(); onOpen(dir.trim()); }}>直接打开</button></div>}
    {info && !info.isProject && info.draftCount > 0 && <div className="rounded border border-border bg-panel2 px-3 py-2">这个目录里已有 {info.draftCount} 份稿。新建会把它们接管进项目，<b className="text-text2">这些稿一个字节不动</b> —— 加进来的是 project.json 和上面说的那批工具文件。</div>}
    <Field label="项目名" note={nameBad ? "只能用英文、数字、- 和 _，且以英文或数字开头" : "也是 MCP 里的项目标识"} err={nameBad}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="英文 / 数字 / - _" /></Field>
    <Field label="标题"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="给人看的名字，可选" /></Field>
    </>} />;
}

/** 设置：外观三档 + 会话栏位置；项目级设置嵌 S8 壳（?embed=1，走本地 API） */

/** 通道 B 用哪个本地 CLI（M2-13）。
 *
 *  为什么值得有这一块：这些 CLI 走的是**登录态**而不是 API key —— 用户已经在付的订阅
 *  （Claude、Cursor、ChatGPT…）能直接用上，不必再按量买 token。
 *
 *  界面上要照实说三件事，都是实测出来的差异（`00` §六十五）：
 *  ① 没实测过的适配器标出来，别装得像验过；② 要不要往项目里写配置文件；
 *  ③ 报不报 token 用量（cursor-agent 不报，那「这一轮多贵」就是空的）。
 *  **密钥不在这里** —— 那个只在 ai_config.json 里手改。
 */
function CliPicker({ core }: { core: Core }) {
  /* 当前通道用共用规则算（`chat/channel.ts`）—— **不要在这儿另判一遍**：
     「mem 没值就跟 defaultChannel」这条规则自己写一遍，就会和 useChat 对不上。 */
  const [channel, setChannel] = useState<ChannelId>(() => currentChannel(null));
  const pick2 = (c: ChannelId) => { setChannel(c); pickChannel(c); };
  const [rows, setRows] = useState<CliStatus[] | null>(null);
  const [cur, setCur] = useState<{ cli: string; model: string; via?: string } | null>(null);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [listing, setListing] = useState(false);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      core.get<{ clis: CliStatus[] }>("local_clis"),
      core.get<{ channelB?: { model: string; via?: string; cli?: string } | null; defaultChannel?: ChannelId }>("ai_config"),
    ]);
    if (a.ok && a.data) setRows(a.data.clis);
    const cb = b.ok ? b.data?.channelB : null;
    if (cb) { setCur({ cli: cb.cli ?? "claude", model: cb.model, via: cb.via }); setModel(cb.model); }
    // defaultChannel 要一起拿：没手动选过时当前通道就是它
    setChannel(currentChannel(b.ok ? b.data?.defaultChannel ?? null : null));
    setModels(null);
  }, [core]);
  useEffect(() => { void load(); }, [load]);

  const pick = async (cli: string, nextModel?: string) => {
    setBusy(true);
    const r = await core.post<{ cli: string; model: string; label: string; verified: boolean; note: string }>("ai_channel_b", { cli, model: nextModel ?? model });
    setBusy(false);
    if (!r.ok) { toast("没存上", r.errors?.[0]?.message ?? r.errors?.[0]?.fix, "error"); return; }
    toast(`通道 B 换成 ${r.data?.label}`, r.data?.verified ? undefined : "这个适配器还没在真机上验过", r.data?.verified ? "ok" : undefined);
    await load();
  };

  const sel = rows?.find((r) => r.id === (cur?.cli ?? "claude"));
  const askModels = async () => {
    if (!sel) return;
    setListing(true);
    const r = await core.get<{ models: string[] }>(`local_cli_models?cli=${encodeURIComponent(sel.id)}`);
    setListing(false);
    const ms = r.ok ? (r.data?.models ?? []) : [];
    setModels(ms);
    if (!ms.length) toast("列不出清单", `${sel.label} 没有「列模型」这条命令，或者它还没登录 —— 按 ${sel.modelHint} 的写法手填`);
  };
  return (
    <section className="rounded-lg border border-border bg-panel p-3 flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-sm font-semibold shrink-0">通道 B · 本地 CLI</h3>
        <span className="text-[11px] text-muted flex-1 min-w-[12rem]">走 CLI 自己的登录态，用你已经在付的订阅，不按量买 token</span>
        <button className="btn sm ghost shrink-0" onClick={() => void load()} title="重新扫一遍这台机器">重新扫描</button>
      </div>
      {/* 这里配的是**通道 B 用哪个 CLI**，而会话栏此刻用的可能是别的通道 ——
          不把这个断层说出来，就会「我明明选了 Codex，左下角却还是通道 C」（用户实测撞到）。 */}
      {channel !== "b" && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded text-[11px]"
          style={{ background: "var(--tool-warn-soft)", borderLeft: "2px solid var(--tool-warn)", color: "var(--tool-warn)" }}>
          <span className="flex-1">这里选的是<b>通道 B 用哪个 CLI</b>。会话栏现在用的是<b>通道 {channel.toUpperCase()}</b> —— 光在这儿选不会切过去。</span>
          <button className="btn sm shrink-0" onClick={() => { pick2("b"); toast("会话已切到通道 B", sel ? `用 ${sel.label}` : undefined, "ok"); }}>切到通道 B</button>
        </div>
      )}
      {channel === "b" && (
        <div className="text-[11px] text-muted">会话栏正用着通道 B —— 下面选的就是这一轮真正跑的那个。</div>
      )}
      {!rows ? <div className="text-xs text-muted py-2">正在扫这台机器…</div> : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const on = r.id === (cur?.cli ?? "claude");
            return (
              <li key={r.id}>
                <button disabled={!r.installed || busy} onClick={() => void pick(r.id, r.id === cur?.cli ? model : "")}
                  className={`w-full text-left rounded border px-2.5 py-2 flex flex-col gap-1 transition-colors ${on ? "border-accent bg-accentSoft" : r.installed ? "border-border hover:border-borderStrong" : "border-border opacity-45 cursor-not-allowed"}`}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`w-3 shrink-0 ${on ? "text-accent" : "text-muted"}`}>{on ? "●" : r.installed ? "○" : "·"}</span>
                    <b className="font-semibold">{r.label}</b>
                    <code className="text-[11px] text-muted font-mono">{r.bin}</code>
                    {r.version && <span className="text-[11px] text-muted font-mono truncate">{r.version}</span>}
                    <span className="flex-1" />
                    {!r.installed && <span className="lvl">没装</span>}
                    {r.installed && !r.verified && <span className="lvl" style={{ background: "var(--tool-warn-soft)", color: "var(--tool-warn)" }}>没实测过</span>}
                    {r.installed && r.verified && <span className="lvl" style={{ background: "var(--tool-ok-soft)", color: "var(--tool-ok)" }}>已实测</span>}
                    {r.output === "text" && <span className="lvl" title="没有 JSON 事件流，界面上看不到工具行">看不到工具行</span>}
                    {!r.reportsUsage && <span className="lvl" title="这条通道不报 token 用量">不报用量</span>}
                    {r.mcpVia === "workspace-file" && <span className="lvl" title="要在项目里落一个 MCP 配置文件">写项目文件</span>}
                    {r.mcpVia === "global-config" && <span className="lvl" title="要你自己往全局配置里加一次 MCP server">要手配 MCP</span>}
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed pl-5">{r.installed ? r.note : r.loginHint}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {sel?.installed && (
        <div className="flex items-center gap-2 text-xs pt-0.5">
          <span className="text-muted shrink-0">模型</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => { if (model.trim() && model !== cur?.model) void pick(sel.id); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            list={models?.length ? "us-cli-models" : undefined}
            placeholder={sel.modelHint} className="flex-1 h-8 px-2.5 rounded border border-border bg-bg outline-none focus:border-accent font-mono" />
          {models?.length ? <datalist id="us-cli-models">{models.map((m) => <option key={m} value={m} />)}</datalist> : null}
          {sel.listModelsArgs && <button className="btn sm ghost" disabled={listing} onClick={() => void askModels()} title="问它有哪些模型可用（按账号来的，写死一定过时）">{listing ? "问着…" : models ? `${models.length} 个` : "列一下"}</button>}
          {cur?.via === "endpoint" && <span className="lvl" title="baseUrl / apiKey 填了，走的是你配的 Anthropic 兼容端点">走自配端点</span>}
        </div>
      )}
      <p className="text-[11px] text-muted leading-relaxed">
        密钥不在这里改 —— `.umbrastudio/ai_config.json` 手改（密钥属于机器，不经过界面和 HTTP）。
        登录要你自己在终端做一次：{sel?.loginHint ?? "见上面每一项的说明"}。
      </p>
    </section>
  );
}

/** 设置里的「账号」块（一·a，2026-10-10）：登没登 Umbra 账号、是谁、登录 / 登出。
 *  登录本身在核心进程（`server/src/account.ts`）：这里只拿授权地址去开系统浏览器，然后轮询 `account` 看结果。
 *  **令牌从不经过这里**（`account` 那几件能力不回令牌）。 */
/** 字节 → 给人看（与 server/account.ts 的 fmtBytes 同一条规矩；两边不共享源码所以各一份）。 */
function fmtBytes(b: number): string {
  if (!(b > 0)) return "0";
  const mb = b / 1048576;
  if (mb < 1) return `${Math.round(b / 1024)} KB`;
  if (mb >= 1024) return `${String(Math.round(mb / 1024 * 100) / 100)} GB`;
  return `${mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** 设置 › Umbra 账号的邮箱密码表单（服务端说 local 时；Claude Design 批次 270 §一，稿《公用/批次 270 · Studio 账号登录》）。
 *  竖排、宽 340：邮箱、密码上下两格，下面一行是主钮 +「忘了密码」。失败不用吐司——挂在密码格下面一条三段式，
 *  改完再点登录才消失；试太多时秒数真的在走、主钮置灰写「N 秒后再试」，到 0 自动恢复；连不上那一档给［重试］。
 *  「忘了密码」Studio 自己做（接 /auth/forgot）：密码格收起、钮变「发重置信」；发完不管邮箱有没有账号都回同一句（同 PC 登录窗）。 */
/** 显示名那一行（`PATCH /auth/me`）。形制照「服务端」那一行：平时是值 + 一颗「改」，点了变输入框 + 保存 / 取消。
 *
 *  ⚠️ **空串是合法的值**，不是「没填」—— 服务端的意思是「不要显示名」，界面退回显示邮箱
 *  （Umbra 主会话 2026-10-21 确认）。所以保存钮**不按空串禁用**。 */
function DisplayNameRow({ core, value, onSaved }: { core: Core; value: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const save = async () => {
    setBusy(true); setFail("");
    const r = await core.post<{ saved: boolean }>("account_display_name", { displayName: name });
    setBusy(false);
    if (r.ok && r.data?.saved) { setEditing(false); toast("显示名已改"); onSaved(); }
    else setFail(r.errors?.[0]?.message || "没改成");
  };
  if (!editing) {
    return <div data-ud="account-display-name" className="flex items-center gap-2 text-xs">
      <span className="text-muted shrink-0">显示名</span>
      <span className="truncate flex-1 min-w-0">{value || <span className="text-muted">（没设，界面显示邮箱）</span>}</span>
      <button className="btn" onClick={() => { setName(value); setFail(""); setEditing(true); }}>改</button>
    </div>;
  }
  return <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted shrink-0">显示名</span>
      <input className="flex-1 min-w-0" value={name} maxLength={64} placeholder="留空 = 不要显示名"
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} autoFocus />
      <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? "存…" : "保存"}</button>
      <button className="btn" disabled={busy} onClick={() => { setEditing(false); setFail(""); }}>取消</button>
    </div>
    {fail && <span className="text-xs pl-12" style={{ color: "var(--tool-warn)" }}>{fail}</span>}
  </div>;
}

/** 改密码那一行（`POST /auth/password`）。
 *
 *  ⚠️ **把失败的话画在那一格底下**（服务端 400 `invalid_field` 带 `field`，`"current"` = 当前密码不对）——
 *  画在表单顶上的话用户得自己猜是哪一栏。
 *  ⚠️ 成功之后说清「另外几台被下线了」（服务端回的 `logged_out`，**不含这一台**）——
 *  不说的话，用户在别的设备上被登出会以为是出了故障。
 *  ⚠️ 这里失败**一个字都不碰登录状态**：当前密码不对是 400，不是会话失效，两件事下一步完全不同。 */
function PasswordRow({ core }: { core: Core }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<{ what: string; field: string } | null>(null);
  const close = () => { setEditing(false); setCurrent(""); setNext(""); setFail(null); };
  const save = async () => {
    setBusy(true); setFail(null);
    const r = await core.post<{ changed: boolean; loggedOut: number }>("account_password", { current, password: next });
    setBusy(false);
    if (r.ok && r.data?.changed) {
      const n = r.data.loggedOut;
      toast("密码已改", n > 0 ? `另外 ${n} 台设备已经下线，这一台不用重登` : "这一台不用重登");
      close();
    } else {
      setFail({ what: r.errors?.[0]?.message || "没改成", field: String(r.stats?.field || "") });
    }
  };
  if (!editing) {
    return <div data-ud="account-password" className="flex items-center gap-2 text-xs">
      <span className="text-muted shrink-0">密码</span>
      <span className="flex-1 min-w-0 text-muted truncate">改完其他设备会下线，这一台不用重登</span>
      <button className="btn" onClick={() => { setFail(null); setEditing(true); }}>改密码</button>
    </div>;
  }
  const errFor = (f: string) => (fail && (fail.field === f || (!fail.field && f === "current")) ? fail.what : "");
  return <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted shrink-0">密码</span>
      <input className="flex-1 min-w-0" type="password" autoComplete="current-password" placeholder="当前密码"
        value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
      <input className="flex-1 min-w-0" type="password" autoComplete="new-password" placeholder="新密码"
        value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && current && next) void save(); }} />
      <button className="btn primary" disabled={busy || !current || !next} onClick={() => void save()}>{busy ? "改…" : "保存"}</button>
      <button className="btn" disabled={busy} onClick={close}>取消</button>
    </div>
    {errFor("current") && <span className="text-xs pl-12" style={{ color: "var(--tool-warn)" }}>{errFor("current")}</span>}
    {errFor("password") && <span className="text-xs pl-12" style={{ color: "var(--tool-warn)" }}>{errFor("password")}</span>}
  </div>;
}

function PasswordLogin({ core, serverUrl, onSignedIn }: { core: Core; serverUrl: string; onSignedIn: (status: unknown) => void }) {
  type Fail = { kind: "bad" | "locked" | "offline" | "other"; what: string; wait: number };
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Fail | null>(null);
  // 试太多：还要等几秒（每秒减一，到 0 清掉错误条、主钮恢复）。
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => { if (left <= 1) { setLeft(0); setFail(null); } else setLeft(left - 1); }, 1000);
    return () => clearTimeout(t);
  }, [left]);
  const failOf = (r: { errors?: { message: string }[]; stats?: Record<string, unknown> }): Fail => {
    const kind = (r.stats?.fail as Fail["kind"]) || "other";
    return { kind, what: r.errors?.[0]?.message || "没成", wait: Number(r.stats?.wait || 0) };
  };
  const submit = async () => {
    if (busy || left > 0) return;
    setBusy(true); setFail(null);
    if (mode === "forgot") {
      const r = await core.post<{ sent: boolean }>("account_forgot", { email });
      setBusy(false);
      if (r.ok && r.data?.sent) { setMode("sent"); return; }
      setFail(failOf(r));
      return;
    }
    const r = await core.post<unknown>("account_login_password", { email, password });
    setBusy(false);
    if (r.ok && !r.errors?.length) { setPassword(""); onSignedIn(r.data); return; }
    const f = failOf(r);
    if (f.kind === "locked") setLeft(f.wait > 0 ? f.wait : 60);
    setFail(f);
  };
  // 第二段：服务端以后给更具体的原因就换掉（设计稿原话）。
  const why = (f: Fail): string => f.kind === "bad" ? "改一下再点登录。连错几次会暂时锁住。"
    : f.kind === "locked" ? "为了防止有人猜密码，服务器暂时不收这个邮箱的登录。"
    : f.kind === "offline" ? "网络断了，或者服务器没在跑。" : "";
  const what = (f: Fail): string => f.kind === "bad" ? `登不进去：${f.what}` : f.kind === "locked" ? `试得太多了，${left} 秒后再试`
    : f.kind === "offline" ? `连不上 ${serverUrl}` : f.what;
  if (mode === "sent") return <div className="flex flex-col gap-2.5 max-w-[440px]">
    <div className="flex gap-2 items-start rounded-[10px] px-3.5 py-3" style={{ background: "var(--success-soft, rgba(15,118,110,.12))" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success, #0F766E)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[3px]"><path d="M3 7.5h18v11H3zM3 7.5l9 6.5 9-6.5" /></svg>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--success, #0F766E)" }}>如果这个邮箱有账号，重置信已经发出去了</span>
        <span className="text-xs leading-[1.7]">点信里那条链接，在浏览器里设新密码。链接 1 小时内有效；改完之后所有设备都会退出，包括这台上的 Studio，要用新密码重新登录。</span>
      </div>
    </div>
    <button type="button" className="self-start text-[12.5px]" style={{ color: "var(--accent, #e8873a)" }} onClick={() => { setMode("login"); setFail(null); }}>回去登录</button>
  </div>;
  const forgot = mode === "forgot";
  const off = busy || left > 0;
  const main = forgot ? "发重置信" : left > 0 ? `${left} 秒后再试` : busy ? "正在登录" : "登录";
  return <form data-ud="account-password-login" className="flex flex-col gap-3 w-full max-w-[340px]" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    {forgot && <span className="text-[12.5px] leading-[1.7]">填登录用的邮箱，重置信发到那里。</span>}
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold tracking-[.06em] text-muted">邮箱</span>
      <input className="h-8" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
    </label>
    {!forgot && <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold tracking-[.06em] text-muted">密码</span>
      <input className="h-8" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
        style={fail?.kind === "bad" ? { borderColor: "var(--tool-danger, #d33)" } : undefined} aria-invalid={fail?.kind === "bad"} />
    </label>}
    {fail && <div role="alert" className="flex gap-2 items-start rounded-[9px] px-3 py-2.5" style={{ background: "var(--danger-soft, rgba(180,35,24,.1))" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tool-danger, #d33)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[2px]"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15 9l-6 6M9 9l6 6" /></svg>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--tool-danger, #d33)" }}>{what(fail)}</span>
        {why(fail) && <span className="text-xs leading-[1.65]">{why(fail)}</span>}
      </div>
      {fail.kind === "offline" && <button type="button" className="btn shrink-0" onClick={() => void submit()}>重试</button>}
    </div>}
    <div className="flex items-center gap-3.5">
      <button className="btn primary" type="submit" disabled={off || !email || (!forgot && !password)} style={{ fontVariantNumeric: "tabular-nums" }}>{main}</button>
      <button type="button" className="text-[12.5px]" style={{ color: "var(--accent, #e8873a)" }}
        onClick={() => { setMode(forgot ? "login" : "forgot"); setFail(null); setLeft(0); }}>{forgot ? "想起来了，去登录" : "忘了密码"}</button>
    </div>
  </form>;
}

function AccountPanel({ core, host }: { core: Core; host: HostAdapter | null }) {
  type Status = { serverUrl: string; signedIn: boolean; user: { id: number; display_name?: string; email?: string; name?: string; is_owner?: boolean } | null; pending: boolean; lastError: string; provider: string; serverAi: boolean };
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState("");
  const [editServer, setEditServer] = useState(false);
  /* 服务端怎么登录：`local`（邮箱密码 —— 接账号中心之后线上就是这一种）/ `oidc`（打开浏览器）/ `unknown`（还没问到）。
     ⚠️ **判的是 `!== "oidc"` 而不是 `=== "local"`**（2026-10-21 改）：初值是 `unknown`，
     按 `=== "local"` 判的话**打开设置页的第一帧画的是「打开浏览器登录」**，一个网络往返之后才跳成密码表单；
     而 `/auth/config` 问不到时（断网）就一直停在错的那一支。
     回退期间的代价问过 Umbra 主会话：「开了回退开关」和「同时又问不到 /auth/config」是两件坏事同时发生，
     概率很低，撞上了也只是密码表单登不上、等问到就自己切回去；
     而闪一下 / 断网停在错的那一支是**天天都会遇到**的。 */
  const [provider, setProvider] = useState("unknown");
  // 存储容量那一行（Umbra 草案 §十一）：只看不管。null = 没登录 / 老服务端，整行不画。
  type Storage = { used: number; limit: number; pct: number; warn: "ok" | "warn" | "critical" | "full"; tier: string | null };
  const [storage, setStorage] = useState<Storage | null>(null);
  const load = useCallback(async () => {
    /* ⚠️ **这里调的是 `account_check` 不是 `account`** —— 它会真去问一次 `/auth/me`。
       三端契约：令牌是不透明长串、**没有刷新令牌、也没有 exp**，所以「快过期就先刷新」那套
       （2026-10-17 修 10-17 那个 bug 时加的）在新令牌上**完全不成立**；
       而界面那个「已登录」只看本机有没有令牌 —— 不问一次就永远不知道它还认不认。
       `check()` 在没登录时直接回状态、**不发请求**，所以这一下不额外费网络。
       断网 / 5xx 一律不动登录状态（它内部保证），界面不会卡在「检查中」。
       另一半由信号层兜着：任何一次打 Umbra 的响应带失效信号都会当场清掉登录（`account.ts` 的 `noteSessionInvalid`）。
       （Umbra 主会话 2026-10-21 给的做法，和 PC / iOS 一致：启动 / 打开账号页各核一次，之后靠每个请求报信。）*/
    const r = await core.get<Status>("account_check");
    if (r.ok && r.data) { setSt(r.data); setServer(r.data.serverUrl); }
    const sr = await core.get<{ storage: Storage | null }>("account_storage");
    setStorage(sr.ok && sr.data ? sr.data.storage : null);
  }, [core]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void core.get<{ provider: string }>("account_provider").then((r) => { if (r.ok && r.data) setProvider(r.data.provider); }); }, [core, st?.serverUrl]);
  // 登录进行中：每 1.5 秒看一眼，登上 / 失败 / 5 分钟就停。
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(async () => {
      const r = await core.get<Status>("account");
      if (!r.ok || !r.data) return;
      const d = r.data;
      setSt(d);
      if (d.signedIn || d.lastError || !d.pending || Date.now() - t0 > 5 * 60_000) {
        setBusy(false);
        if (d.signedIn) toast(`已登录${platformName}账号`);
        else if (d.lastError) toast(d.lastError);
        /* 停了之后再读一次（#137 的保险）：万一停在「收尾还没写完」的那一刻，之后落盘的登录态 / 失败原因也能显示出来 */
        setTimeout(() => { void load(); }, 1500);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [busy, core, load]);
  const login = async () => {
    setBusy(true);
    const r = await core.post<{ url: string }>("account_login", {});
    if (!r.ok || !r.data?.url) { setBusy(false); toast(r.errors?.[0]?.message || "登录没开始"); void load(); return; }
    if (host) await host.openExternal(r.data.url); else window.open(r.data.url, "_blank", "noopener");
  };
  const logout = async () => { const r = await core.post<Status>("account_logout", {}); if (r.ok && r.data) setSt(r.data); };
  const saveServer = async () => {
    const r = await core.post<Status>("account_server", { serverUrl: server });
    if (!r.ok || !r.data) { toast(r.errors?.[0]?.message || "地址不对"); return; }
    setSt(r.data); setEditServer(false);
  };
  const who = st?.user ? (st.user.display_name || st.user.name || st.user.email || `#${st.user.id}`) : "";
  const toggleServerAi = async () => {
    const r = await core.post<Status>("account_server_ai", { on: !st?.serverAi });
    if (!r.ok || !r.data) { toast(r.errors?.[0]?.message || "没切成"); return; }
    setSt(r.data);
    toast(r.data.serverAi ? "通道 A 已切到服务端 AI（按积分扣）" : "通道 A 回到自填端点");
  };
  return <section data-ud="account" className="rounded-lg border border-border bg-panel p-3 flex flex-col gap-2.5">
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold shrink-0">{platformName}账号</h3>
        <span className="text-muted text-xs truncate">{st ? (st.signedIn ? `已登录 · ${who}${st.user?.is_owner ? " · 主人" : ""}${st.user?.email ? ` · ${st.user.email}` : ""}` : "未登录（单机使用；同步、服务端 AI、插件市场要登录）") : "…"}</span>
      </div>
      <span className="text-muted text-xs">和 {platformName} PC、iOS 用同一个账号。</span>
    </div>
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted shrink-0">服务端</span>
      {editServer
        ? <><input className="flex-1 min-w-0" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://umbra.example.com" />
            <button className="btn" onClick={saveServer}>保存</button><button className="btn" onClick={() => { setEditServer(false); setServer(st?.serverUrl || ""); }}>取消</button></>
        : <><span className="truncate">{st?.serverUrl || "…"}</span><button className="btn" onClick={() => setEditServer(true)}>改</button></>}
    </div>
    <div className="flex items-center gap-2">
      {st?.signedIn
        ? <button className="btn" onClick={logout}>退出登录</button>
        : provider !== "oidc"
          ? <PasswordLogin core={core} serverUrl={st?.serverUrl || ""} onSignedIn={(d) => { setSt(d as Status); toast(`已登录${platformName}账号`); void load(); }} />
          : <button data-ud="account-oidc-login" className="btn primary" disabled={busy} onClick={login}>{busy ? "等浏览器那边登录…" : "打开浏览器登录"}</button>}
      {busy && provider === "oidc" && <span className="text-muted text-xs">浏览器没有自动打开的话，再按一次。</span>}
      {/* ⚠️ `lastError` **一律显示，不按 provider 过滤**（2026-10-21 改）：它现在承载的是
          「这条会话为什么失效了」（`noteSessionInvalid` / `check()` 写的），而那是两种登录方式
          都会发生的事。原来写的是 `provider !== "local"`，于是密码登录模式下
          **用户只会看到自己突然变回未登录、而一个字的原因都没有**。
          和密码登录自己的错误不重复：`loginPassword` 失败只抛 `LoginFail`（表单内部画），不写 `lastError`。 */}
      {!busy && st?.lastError && <span className="text-xs" style={{ color: "var(--tool-warn)" }}>{st.lastError}</span>}
    </div>
    {/* 登录之后才有的两行（2026-10-21，Q74 ①②）：显示名与改密码。形制照上面「服务端」那一行。 */}
    {st?.signedIn && <DisplayNameRow core={core} value={st.user?.display_name || ""} onSaved={() => void load()} />}
    {st?.signedIn && provider !== "oidc" && <PasswordRow core={core} />}
    {st?.signedIn && storage && (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted shrink-0">存储</span>
        <span className="h-1.5 w-28 rounded-full bg-panel2 overflow-hidden shrink-0" aria-label={`已用 ${storage.pct}%`}>
          <span className="block h-full rounded-full" style={{ width: `${Math.max(storage.used > 0 ? 1 : 0, storage.pct)}%`, background: storage.warn === "full" ? "var(--tool-danger, #d33)" : storage.warn === "critical" ? "var(--tool-warn)" : "var(--accent, #e8873a)" }} />
        </span>
        <span>{fmtBytes(storage.used)} / {fmtBytes(storage.limit)} · {storage.pct}%</span>
        <span className="text-muted">{storage.tier ? "会员" : "免费档"} · 清理与管理在 {platformName} PC / iOS 的账号页</span>
      </div>
    )}
    {st?.signedIn && (
      <div className="flex items-center gap-2 text-xs">
        <button className={`btn ${st.serverAi ? "primary" : ""}`} onClick={toggleServerAi}>{st.serverAi ? "服务端 AI：开" : "用服务端 AI（会员额度）"}</button>
        <span className="text-muted">开了之后通道 A 走{platformName}服务端，模型由服务端定，每次对话按积分扣；当前用哪条通道不变（要用就在引擎选择器里选通道 A），本地 CLI（通道 B）不受影响。</span>
      </div>
    )}
  </section>;
}

/** 设置里的「插件沙箱」块（2026-10-19，服务端 `plugin/limits.ts`）。
 *
 *  几项限额原来写死在核心里（128 MB / 10 秒 / 100 MB / 文本 2 MB），插件因此只吃得下二三十 MB 的文件。
 *  合法范围和默认值**由服务端给**（`plugin_limits` 的 `ranges`），这里不抄一份 —— 抄了迟早对不上。
 *  失焦或回车就存；越界在这里先拦一道（少一次来回），服务端照样再核（门面不信前端）。
 *  存上之后新的调用按新值起新的沙箱进程；正在跑的那一次照旧跑完再退（优雅换池）—— 用户不用重启 Studio。 */
type LimitKey = "memoryMB" | "deadlineSec" | "binaryReadMaxMB" | "textReadMaxMB";
type LimitRanges = Record<LimitKey, { min: number; max: number; def: number }>;
const LIMIT_ROWS: Array<{ key: LimitKey; label: string; unit: string; note: string }> = [
  { key: "memoryMB", label: "内存", unit: "MB",
    note: "插件工具一次调用最多可用的内存。调大能让插件处理更大的文件，也会让单个插件最多多占这么多内存。" },
  { key: "deadlineSec", label: "单次时限", unit: "秒",
    note: "插件工具一次调用最多跑多久，到点就打断。调大能让插件处理完更大的文件，代价是插件卡住时要等更久才报错。" },
  { key: "binaryReadMaxMB", label: "二进制读取上限", unit: "MB",
    note: "插件一次能从宿主读进去多少字节（整份读 PDF / 压缩包，或分段读一段）。超过这个大小的文件插件只能分段读。" },
  { key: "textReadMaxMB", label: "文本读取上限", unit: "MB",
    note: "插件一次能整份读进去多大的文本文件（日志、大 JSON / CSV）。只管插件；AI 读文件仍是 2 MB，不会因为这里调大而把大文件塞进对话。" },
];
/** 表单草稿：每项一个字符串（输入框里可能是半截数字） */
const draftOf = (c: Record<LimitKey, number>) =>
  Object.fromEntries(LIMIT_ROWS.map((r) => [r.key, c[r.key] === undefined ? "" : String(c[r.key])])) as Record<LimitKey, string>;
/** 「存储与缓存」（M14-3，`doc/24` §8.7）。用户 2026-10-20：「清除缓存这个功能目前应该没有，可以补充一个」。
 *
 *  ⚠️ **两颗按钮都不碰算不出来的东西**，所以**都不要确认** ——
 *  要确认的那一件（「忘掉一个项目，连历史」）在首页那条失效记录上，行内两段式。
 *  把「清缓存」也套一层确认框，只会让人以为它危险，然后再也不点它。
 *
 *  ⚠️ 「清缓存」是**当前项目**的（`scope: "project"`），所以没开项目时按钮不出现 ——
 *  不是灰着：一个灰着的按钮会让人找不到「要怎样才能点」。
 *
 *  ⚠️ **两颗按钮打的不是同一个服务**，这一条差点写错：
 *  `clear_project_cache` 是 `scope: "project"` —— 要打**项目自己那个服务**（`projectCore`）；
 *  `clear_stale_records` 是全局的 —— 打 hub。
 *  桌面壳里 **hub 不属于任何项目**，拿 hub 去调项目域的能力会被门面拒掉，
 *  而浏览器模式下两者恰好是同一个服务 → **在浏览器里测不出来，一上桌面版就坏**
 *  （和 `Ask.tsx` 头注那条「这件事在 Electron 里也成立吗」同一族）。 */
function StoragePanel({ core, projectCore }: { core: Core; projectCore: Core | null }) {
  const [busy, setBusy] = useState<"" | "cache" | "stale">("");
  const clearCache = async () => {
    setBusy("cache");
    const r = await (projectCore as Core).post<{ removed: string[]; freedBytes: number; kept: string[] }>("cache_clear", {});
    setBusy("");
    if (!r.ok) { toast("没清掉", r.errors?.[0]?.message ?? "", "error"); return; }
    const kb = Math.round((r.data?.freedBytes ?? 0) / 1024);
    /* ⚠️ **把「没动的那几样」说出来** —— 用户点「清除缓存」时最怕的就是
       「我的版本历史是不是也被清了」。回执里的 `kept` 正是为这一句存在的。 */
    toast(r.data?.removed.length ? `缓存清掉了，腾出约 ${kb} KB` : "本来就没有缓存可清",
      `快照 / 评论 / 回收站 / 模板 / 草稿 / 会话一个字节都没动。下次打开时索引和缩略图会自己长回来。`, "ok");
  };
  const clearStale = async () => {
    setBusy("stale");
    const r = await core.post<{ removed: Array<{ name: string }>; freedBytes: number; left: number }>("records_clear_stale", {});
    setBusy("");
    if (!r.ok) { toast("没清掉", r.errors?.[0]?.message ?? "", "error"); return; }
    const n = r.data?.removed.length ?? 0;
    toast(n ? `清掉 ${n} 条失效记录` : "没有失效的记录",
      n ? `腾出约 ${Math.round((r.data?.freedBytes ?? 0) / 1024)} KB（连它们的版本兜底仓库）；列表里还剩 ${r.data?.left} 条` : "「最近打开」里每一条的目录都还在", "ok");
  };
  return (
    <section className="border-t border-border pt-3">
      <h3 className="text-sm font-semibold mb-1">存储与缓存</h3>
      <p className="text-[11px] text-muted leading-relaxed mb-2">
        体检报告、缩略图、索引数据是<b className="text-text2">算得回来的</b>，清掉只是下次打开慢一点。
        <br />快照、评论、回收站、模板、会话<b className="text-text2">算不回来</b> —— 这里两颗按钮都不碰它们。
      </p>
      <div className="flex flex-wrap gap-2">
        {projectCore && <button className="btn" disabled={busy !== ""} onClick={() => void clearCache()}>{busy === "cache" ? "正在清…" : "清掉当前项目的缓存"}</button>}
        <button className="btn" disabled={busy !== ""} onClick={() => void clearStale()}>{busy === "stale" ? "正在清…" : "清掉已失效的打开记录"}</button>
      </div>
      {!projectCore && <p className="text-[11px] text-muted mt-2">「清掉缓存」是针对当前项目的 —— 打开一个项目后它会出现在这里。</p>}
    </section>
  );
}

/** 设置里的「文件树」块（2026-10-21，Q77，服务端 `uiprefs.ts`）。
 *
 *  用户 2026-10-21 定的：**点文件也是文件，默认要显示**。
 *  默认值**由服务端给**（`ui_prefs` 的 `defaults`），这里不抄一份 —— 抄了迟早对不上
 *  （同 `PluginLimitsPanel` 的 `ranges`）。
 *
 *  ⚠️ 这个开关**管不着我们自己产的东西**（`.umbrastudio/` · `_runtime` · `.DS_Store` …）：
 *  那些由服务端的 `isOurArtifact` 一律隐藏。说清这一点是因为不说的话，
 *  用户打开开关却没看到 `.umbrastudio/` 会以为开关坏了 —— **一个「没反应」的开关
 *  比一个没有的开关糟**。
 */
function FileTreePanel({ core }: { core: Core }) {
  const [prefs, setPrefs] = useState<{ showHiddenFiles: boolean } | null>(null);
  const [defaults, setDefaults] = useState<{ showHiddenFiles: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  type Shape = { prefs: { showHiddenFiles: boolean }; defaults: { showHiddenFiles: boolean } };
  const load = useCallback(async () => {
    const r = await core.get<Shape>("ui_prefs").catch(() => null);
    if (r?.ok && r.data) { setPrefs(r.data.prefs); setDefaults(r.data.defaults); setLoadErr(null); }
    else setLoadErr(r?.errors?.[0]?.message ?? "读不到界面偏好（核心可能是旧版本）");
  }, [core]);
  useEffect(() => { void load(); }, [load]);

  const save = async (next: boolean) => {
    setBusy(true);
    const r = await core.post<Shape>("ui_prefs", { showHiddenFiles: next })
      .catch((e) => ({ ok: false, errors: [{ message: String((e as Error)?.message ?? e) }] } as const));
    setBusy(false);
    if (!r.ok || !("data" in r) || !r.data) { toast("没存上", r.errors?.[0]?.message ?? "", "error"); return; }
    setPrefs(r.data.prefs);
    /* ⚠️ **存完要让树重列** —— 不发这一下，用户会以为开关没生效
       （设置面板关掉、再点开目录才看到变化）。 */
    window.dispatchEvent(new CustomEvent("ud-prefs-changed"));
  };

  return (
    <section className="rounded-lg border border-border bg-panel p-3 flex flex-col gap-2.5" data-ud="prefs">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-sm font-semibold shrink-0">文件树</h3>
        <span className="text-[11px] text-muted flex-1 min-w-[12rem]">目录里显示哪些东西</span>
      </div>
      {loadErr && <div className="text-xs text-err">{loadErr}</div>}
      {prefs && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer" data-ud="prefs-hidden">
            <input type="checkbox" disabled={busy} checked={prefs.showHiddenFiles}
              onChange={(ev) => void save(ev.target.checked)} />
            <span>显示隐藏文件（以 <code className="font-mono">.</code> 开头的）</span>
            {defaults && prefs.showHiddenFiles === defaults.showHiddenFiles
              && <span className="text-[11px] text-muted">默认</span>}
          </label>
          <p className="text-[11px] text-muted leading-relaxed pl-6">
            关掉之后 <code className="font-mono">.gitignore</code> / <code className="font-mono">.env</code> 这类文件不在树里显示。
            {studioName} 自己产的东西（<code className="font-mono">.umbrastudio/</code> · <code className="font-mono">_runtime/</code>）
            <strong>两种情况下都不显示</strong> —— 它们由工具维护，改了会被下一次重建覆盖。
          </p>
          <p className="text-[11px] text-muted leading-relaxed pl-6">
            <code className="font-mono">.git</code> 会列出来让你知道它在，但里面的内容我们不碰，也不计入项目的文件统计。
          </p>
        </div>
      )}
    </section>
  );
}

function PluginLimitsPanel({ core }: { core: Core }) {
  const [cfg, setCfg] = useState<Record<LimitKey, number> | null>(null);
  const [ranges, setRanges] = useState<LimitRanges | null>(null);
  const [draft, setDraft] = useState<Record<LimitKey, string>>({ memoryMB: "", deadlineSec: "", binaryReadMaxMB: "", textReadMaxMB: "" });
  const [errs, setErrs] = useState<Partial<Record<LimitKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const apply = (d: { config: Record<LimitKey, number>; ranges: LimitRanges }) => {
    setCfg(d.config); setRanges(d.ranges);
    setDraft(draftOf(d.config));
  };
  const load = useCallback(async () => {
    const r = await core.get<{ config: Record<LimitKey, number>; ranges: LimitRanges }>("plugin_limits").catch(() => null);
    if (r?.ok && r.data) { apply(r.data); setLoadErr(null); }
    else setLoadErr(r?.errors?.[0]?.message ?? "读不到插件限额（核心可能是旧版本）");
  }, [core]);
  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<Record<LimitKey, number>>, keys: LimitKey[]) => {
    setBusy(true);
    const r = await core.post<{ config: Record<LimitKey, number>; ranges: LimitRanges }>("plugin_limits", patch).catch((e) => ({ ok: false, errors: [{ message: String((e as Error)?.message ?? e) }] } as const));
    setBusy(false);
    if (!r.ok || !("data" in r) || !r.data) {
      const why = r.errors?.[0]?.message ?? "没存上";
      setErrs((x) => ({ ...x, ...Object.fromEntries(keys.map((k) => [k, why])) }));
      return;
    }
    apply(r.data);
    setErrs({});
    toast("插件限额已保存", "下一次调用起按新值跑；正在跑的那一次不受影响", "ok");
  };
  const commit = (k: LimitKey) => {
    if (!cfg || !ranges) return;
    const raw = draft[k].trim();
    const n = Number(raw);
    const rg = ranges[k];
    if (!raw || !Number.isInteger(n)) { setErrs((x) => ({ ...x, [k]: `要填整数（${rg.min}–${rg.max}）` })); return; }
    if (n < rg.min || n > rg.max) { setErrs((x) => ({ ...x, [k]: `超出范围 ${rg.min}–${rg.max}` })); return; }
    setErrs((x) => ({ ...x, [k]: undefined }));
    if (n === cfg[k]) return;
    void save({ [k]: n }, [k]);
  };
  /* 只摆服务端给了范围的那几项：核心比界面旧（还不认 textReadMaxMB）时少一行，而不是整块崩 */
  const rows = ranges ? LIMIT_ROWS.filter((r) => ranges[r.key]) : [];
  const isDefault = !!cfg && !!ranges && rows.every((r) => cfg[r.key] === ranges[r.key].def);

  return (
    <section className="rounded-lg border border-border bg-panel p-3 flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-sm font-semibold shrink-0">插件沙箱</h3>
        <span className="text-[11px] text-muted flex-1 min-w-[12rem]">插件工具（B 面）在隔离的沙箱里跑，这几项是它能用多少资源</span>
        <button className="btn sm ghost shrink-0" disabled={!ranges || busy || isDefault}
          onClick={() => ranges && void save(Object.fromEntries(rows.map((r) => [r.key, ranges[r.key].def])), rows.map((r) => r.key))}
          title="几项都回到出厂值">恢复默认</button>
      </div>
      {loadErr && <div className="text-xs text-err">{loadErr}</div>}
      {cfg && ranges && rows.map((row) => {
        const rg = ranges[row.key];
        const e = errs[row.key];
        return (
          <div key={row.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0">{row.label}</span>
              <input type="number" inputMode="numeric" min={rg.min} max={rg.max} step={1} disabled={busy}
                value={draft[row.key]} onChange={(ev) => setDraft((d) => ({ ...d, [row.key]: ev.target.value }))}
                onBlur={() => commit(row.key)}
                onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                className={inputCls + " w-28 font-mono" + (e ? " border-err" : "")} />
              <span className="text-muted">{row.unit}</span>
              <span className="text-[11px] text-muted">范围 {rg.min}–{rg.max}，默认 {rg.def}</span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed pl-[7.5rem]">{row.note}</p>
            {e && <p className="text-[11px] text-err pl-[7.5rem]">{e}</p>}
          </div>
        );
      })}
    </section>
  );
}

/** `get_project`（HTTP 路由 `project_settings`）回的那一份，**只列这一屏用得到的**。
 *
 *  ⚠️ 它还回 `designSystem` / `limits` / `drafts` 三样，这里**刻意不写进类型** ——
 *  那两块的 UI 在 M16-6 里没有实现（它们在 M16-7 之后没有对象，`doc/12` M16-6）。
 *  ⚠️ `trash` **只在 `via === "http"` 时才给**（`cap/projects.ts` 那一行三元）——
 *  也就是说这一屏能直接从这一个请求里拿到回收站，不用再调 `list_trash`。 */
type ProjInfo = {
  name: string;
  title: string | null;
  dir: string;
  draftCount: number;
  /** ⚠️ `listTrash` 真实返回的就是这四个字段 —— **没有 `size`**。
      原稿里有 `{{ item.size }}`，那是演示态的字段，画它只会显示 `undefined`。 */
  trash?: Array<{ trashPath: string; originalPath: string; originalName: string; deletedAt: string; deletedAtIso?: string | null }>;
};

/* ══════════ 项目设置的三块（M16-6，2026-10-23）══════════
 *
 *  ⚠️ **这三块原来是一份 `.dc.html` 嵌在这个弹窗里**（`S8-项目设置.dc.html?embed=1`）。
 *  M16-7 要把设计稿那一整套删掉，而**这一屏是真功能**，所以它得先搬成原生
 *  （`doc/12` M16-6；顺序不能换 —— 反过来做中间会有一个版本的设置页是空的）。
 *
 *  ⚠️ **稿里是五块，这里只有三块**，而那不是漏了：
 *  · **设计系统**（`@ds` / tokens / icons）—— `@ds` 只在 dc 稿里展开，C3 之后没有对象；
 *  · **元素数限额** —— 实测唯一读它的是 `validate.ts` 的 `validate_draft`，甲组 12 件之一，M16-7 要删。
 *  geek-99 2026-10-23 定甲：这两块的入口直接去掉。中间这一版它们还能走 MCP
 *  `update_project` 设，功能没丢。
 *
 *  ⚠️ **三处文案跟着改了**（原稿的说法在 M16-7 之后就不成立）：
 *  「标题用于**索引页**显示」→ 索引页是 `build_index` 生成的，一起删；
 *  「被删的**稿**」/「恢复后**引用关系**也会恢复」→ 回收站对任何文件成立，而引用关系是 dc 的概念。 */

/* ⚠️⚠️ **`trashTimeIso()` 2026-10-23（M16-7c-2c）删了 —— 服务端改好了，前端不用再补救。**
 *
 *  它当初存在的理由，以及那条教训，整段留着：
 *  `listTrash` 给的 `deletedAt` **不是 ISO，而它长得像** ——
 *  那是回收站里那个时间戳**目录的名字**，建目录时做过
 *  `new Date().toISOString().replace(/[:.]/g, "-")`（文件名不能有冒号）。
 *  所以它是 `2026-10-23T10-45-00-123Z` 这种形状，`new Date()` 解析不了，
 *  直接喂给 `timeAgo` 界面上会写「删于 **Invalid Date**」（实测踩到）。
 *  > **一个字段叫 `deletedAt`、长得像时间戳、而实际是目录名 ——
 *  > 我按名字信了它，没去看它怎么产生的。**
 *
 *  ⚠️ 而更该记的是**为什么拖到今天才修**：那段注释自己写着
 *  「更干净的做法是服务端另给一个真 ISO 字段 —— 那要改 `listTrash` 的返回形状，
 *  而它今天还有第二个消费者（那份稿），**M16-7 删了稿之后可以做**」。
 *  稿 7c-2b 删了，于是这件事到期了。
 *  > **一个「等某件事发生之后再做」的尾巴，要写在它会被重新读到的地方** ——
 *  > 这一条写在了它自己头上，所以删那份稿的人（我）正好看见它。
 *
 *  现在服务端给 `deletedAtIso`（还原不出来就是 `null`），界面照实说「时间不详」。 */


/** 基本信息：现在只剩标题（`update_project` 的另外六个字段都属于那两块要删的）。 */
function ProjectBasicPanel({ core, info, reload }: { core: Core; info: ProjInfo | null; reload: () => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  /* ⚠️ 外部数据到了再填一次 —— 不这么做的话首帧是空的，用户会以为标题被清了 */
  useEffect(() => { setTitle(info?.title ?? ""); }, [info?.title]);
  if (!info) return null;
  const dirty = title.trim() !== (info.title ?? "");
  const save = async () => {
    setBusy(true);
    const r = await core.post("project_update", { title: title.trim() }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast("没存上", r?.errors?.[0]?.message ?? "", "error"); return; }
    toast("标题存好了", title.trim() || "（清空了）", "ok");
    reload();
  };
  return (
    <section className="rounded-lg border border-border bg-panel p-3 flex flex-col gap-2.5" data-ud="proj-basic">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold">基本信息</h3>
        {/* ⚠️ 目录路径是只读的 —— 「移动项目」后端没有这个操作（见危险操作那一块） */}
        <span className="text-[11px] text-muted truncate" title={info.dir}>{info.dir}</span>
      </div>
      <Field label="项目名" note="目录名决定它，这里改不了">
        <input className="inp" value={info.name} readOnly disabled />
      </Field>
      {/* ⚠️ 原稿这里写的是「项目名称和标题，用于**索引页**显示」——
          索引页（`build_index` 生成的那份 `index.dc.html`）M16-7 要一起删，所以换了说法。 */}
      <Field label="标题" note="首页的项目卡上显示它；留空就显示项目名">
        <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder={info.name} maxLength={120} data-ud="proj-title" />
      </Field>
      <div className="flex gap-2 items-center">
        <button className="btn primary" disabled={busy || !dirty} onClick={() => void save()} data-ud="proj-title-save">
          {busy ? "存着…" : "保存标题"}
        </button>
        {dirty && <span className="text-[11px] text-muted">有未保存的改动</span>}
      </div>
    </section>
  );
}

/** 回收站：列、恢复、永久删一项、清空。 */
function TrashPanel({ core, info, reload }: { core: Core; info: ProjInfo | null; reload: () => void }) {
  const [busy, setBusy] = useState("");
  const items = info?.trash ?? [];
  const act = async (route: string, body: Record<string, unknown>, key: string, okWhat: string) => {
    setBusy(key);
    const r = await core.post(route, body).catch(() => null);
    setBusy("");
    if (!r?.ok) { toast("没做成", r?.errors?.[0]?.message ?? "", "error"); return; }
    toast(okWhat, "", "ok");
    reload();
  };
  return (
    <section className="rounded-lg border border-border bg-panel p-3 flex flex-col gap-2.5" data-ud="proj-trash">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold">回收站</h3>
        <span className="text-[11px] text-muted">{items.length ? `${items.length} 项` : "空的"}</span>
      </div>
      {/* ⚠️ 原稿写的是「被删的**稿**在这里，恢复后**引用关系**也会恢复」——
          两处都要改：回收站对**任何文件**都成立（`trash_file` 不只收稿），
          而「引用关系」是 `<dc-import>` 的概念，M16-7 之后没有对象。 */}
      {!items.length ? (
        <p className="text-[11.5px] text-muted">删掉的文件会先到这里，不会立刻消失 —— 可以从这里恢复，也可以永久删掉。</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5 max-h-[220px] overflow-auto" data-ud="trash-list">
            {items.map((it) => (
              <li key={it.trashPath} className="flex items-center gap-2 rounded border border-border px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate" title={it.originalPath}>{it.originalName}</div>
                  {/* ⚠️ **不显示大小** —— 原稿有 `{{ item.size }}`，而 `listTrash` 真实返回的
                      四个字段里没有 size。画一个取不到的字段只会显示 `undefined`。 */}
                  {/* ⚠️ `deletedAtIso` 为 `null`（存量目录名是别的格式）时照实说「时间不详」——
                      给一个看起来像时间的垃圾（`Invalid Date`）比不给糟。 */}
                  <div className="text-[11px] text-muted truncate">{it.originalPath} · {it.deletedAtIso ? `删于 ${timeAgo(it.deletedAtIso)}` : "删除时间不详"}</div>
                </div>
                <button className="btn" disabled={!!busy}
                        onClick={() => void act("trash_restore", { trashPath: it.trashPath }, it.trashPath, `恢复了 ${it.originalName}`)}>
                  恢复
                </button>
                <button className="btn" disabled={!!busy} title="永久删掉这一项，恢复不了"
                        onClick={() => void act("trash_purge", { trashPath: it.trashPath }, it.trashPath, `永久删掉了 ${it.originalName}`)}>
                  永久删
                </button>
              </li>
            ))}
          </ul>
          {/* 「恢复到原位置」这句话做得到：`restore_trashed` 的 summary 写着
             「原位置已被占用时会换个名字，不会覆盖」—— 所以说出来是实话。 */}
          <p className="text-[11px] text-muted">恢复会放回原来的位置；那儿已经有同名文件的话会换个名字，不覆盖。</p>
          <div>
            <button className="btn danger" disabled={!!busy} data-ud="trash-empty"
                    onClick={() => void act("trash_empty", {}, "all", "回收站清空了")}>
              清空回收站（{items.length} 项）
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** 危险操作四项。⚠️ 其中两项后端**没有**，而它们照旧列出来并说出路 ——
 *  这是原稿做对的一件事（`unsupported: true`）：
 *  **「看起来能用但其实是假的」比「明说还没做」糟得多**（`doc/00` §100）。 */
function DangerPanel({ core, info, onProjectGone }: { core: Core; info: ProjInfo | null; onProjectGone: () => void }) {
  const [arm, setArm] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  if (!info) return null;

  const DANGERS = [
    { key: "rename", title: "重命名项目", btn: "重命名", unsupported: true,
      body: "改目录名和 project.json 里的 name。后端还没有这个操作 —— 标题在上面「基本信息」里改，目录名请用系统的文件管理器改，再从首页重新打开。" },
    { key: "move", title: "移动项目", btn: "移动", unsupported: true,
      body: "把项目目录移到别的位置。后端还没有这个操作 —— 用系统的文件管理器移，再从首页重新打开（「最近打开」里那一条会显示成已失效，可以移除）。" },
    { key: "archive", title: "归档项目", btn: "归档", route: "project_archive", tone: "warn" as const,
      confirm: "归档只是把目录搬到工具目录下的 .archived/，随时能搬回来 —— 所以这一步不用敲项目名。归档后这个项目会从应用里关闭。",
      confirmLabel: "确认归档" },
    /* ⚠️ **「删除」其实也是归档，而这件事必须说出来。**
       `delete_project` 的 summary 自己写着「实际上也是移到 `.archived/`
       —— 我们不真删用户的目录」。按钮文案照原稿用「确认移走」而不是「确认删除」：
       **一个说「删除」而其实没删的按钮，会让人以为自己已经清理掉了。** */
    { key: "delete", title: "删除项目", btn: "删除", route: "project_delete", tone: "err" as const, needsType: true,
      body: "现在的「删除」= 归档到 .archived/（历史版本随目录一起搬走，不销毁）。要彻底删除，归档之后手动删那个目录。",
      confirm: "目录会被移走、应用里关闭；历史版本随目录一起搬走。要继续，把项目名敲一遍。",
      confirmLabel: "确认移走" },
  ];

  const run = async (d: typeof DANGERS[number]) => {
    if (!d.route) return;
    setBusy(true);
    const r = await core.post(d.route, d.needsType ? { confirm: true, typed: typed.trim() } : {}).catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast(`${d.title}没成`, r?.errors?.[0]?.message ?? "", "error"); return; }
    toast(`${d.title}完成`, "这个项目已经从应用里关闭", "ok");
    setArm(null); setTyped("");
    /* ⚠️⚠️ **这里原来接的是 `onClose`（关设置弹窗），而那不是承诺的那件事。**
       稿里写的是「归档后这个项目会**从应用里关闭**」—— 而我把「关弹窗」当成了「关项目」。
       后果实测到了：归档之后目录没了，而工作台还开着它、继续请求 `drafts` → **400**。
       > 一个回调叫 `onClosed`，而「关什么」有两个可能的答案 ——
       > **我接了手边那个，没问它该是哪个。**
       所以改名 `onProjectGone`（说准它是什么），由 `App` 接成「把这个项目摘掉」。 */
    onProjectGone();
  };

  return (
    <section className="rounded-lg border border-border bg-panel p-3 flex flex-col gap-2.5" data-ud="proj-danger">
      <h3 className="text-[12.5px] font-semibold" style={{ color: "var(--tool-danger, #d33)" }}>危险操作</h3>
      <p className="text-[11.5px] text-muted">这些操作会动你磁盘上的目录。⚠️ 归档和删除**都不销毁文件** —— 它们把目录搬到 <code>.archived/</code>。</p>
      {DANGERS.map((d) => (
        <div key={d.key} className="rounded border border-border px-2.5 py-2 flex flex-col gap-1.5" data-ud={`danger-${d.key}`}>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold flex-1">{d.title}</span>
            {d.unsupported
              /* ⚠️ **灰掉而不是藏起来** —— 藏了用户不知道这件事存在，只会去别处找。
                 §100 那条：不画假按钮，但也别让人以为「这个功能不该有」。 */
              ? <button className="btn" disabled title="后端还没有这个操作，下面写了怎么绕">{d.btn}</button>
              : <button className={d.tone === "err" ? "btn danger" : "btn"} disabled={busy}
                        onClick={() => { setArm(arm === d.key ? null : d.key); setTyped(""); }}>
                  {arm === d.key ? "取消" : d.btn}
                </button>}
          </div>
          {d.body && <p className="text-[11px] text-muted leading-relaxed">{d.body}</p>}
          {arm === d.key && (
            <div role="alertdialog" className="rounded px-2.5 py-2 flex flex-col gap-2"
                 style={{ background: "var(--danger-soft, rgba(180,35,24,.1))" }}>
              <p className="text-[11.5px] leading-relaxed">{d.confirm}</p>
              {d.needsType && (
                <input className="inp" value={typed} onChange={(e) => setTyped(e.target.value)}
                       placeholder={info.name} aria-label="把项目名敲一遍" data-ud="danger-typed" />
              )}
              <div className="flex gap-2">
                <button className={d.tone === "err" ? "btn danger" : "btn primary"}
                        disabled={busy || (!!d.needsType && typed.trim() !== info.name)}
                        onClick={() => void run(d)} data-ud={`danger-go-${d.key}`}>
                  {busy ? "执行中…" : d.confirmLabel}
                </button>
                <button className="btn" disabled={busy} onClick={() => { setArm(null); setTyped(""); }}>算了</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}


export function SettingsSheet({ core, host, projectCore, layout, setLayout, onClose, onProjectGone }: { core: Core | null; host: HostAdapter | null; projectCore: Core | null; layout: LayoutState; setLayout: (l: LayoutState) => void; onClose: () => void;
  /** 归档 / 删除之后**这个项目已经不在盘上了** —— 由 `App` 把它从打开的项目里摘掉。
   *  ⚠️ **不走 `closeProject`**：那条路会先问「有没有未落盘的 / 有没有一轮在跑」，
   *  而目录都没了，那两个检查只会把「关掉它」变成做不到的事（而未落盘的也救不回来）。 */
  onProjectGone: () => void }) {
  /* ⚠️ **这里原来是一个 iframe**：`S8-项目设置.dc.html?embed=1`（M16-6 改的，`doc/12`）。
     M16-7 要把设计稿那一整套删掉，而这一屏是真功能 —— 所以它得先搬成原生。
     ⚠️ `projectUrl` 这个 prop 随之不再需要（它只用来拼那个 iframe 的地址）。 */
  const [info, setInfo] = useState<ProjInfo | null>(null);
  const load = useCallback(async () => {
    if (!projectCore) { setInfo(null); return; }
    const r = await projectCore.get<ProjInfo>("project_settings").catch(() => null);
    setInfo(r?.ok && r.data ? r.data : null);
  }, [projectCore]);
  useEffect(() => { void load(); }, [load]);
  return <Sheet onClose={onClose} wide={!!projectCore}
    head={<h2 className="text-base font-semibold">设置</h2>}
    foot={<button className="btn primary" onClick={onClose}>完成</button>}
    body={<>
      <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-3 items-center">
        {/* 「会话栏在左 / 在右」这一项**删掉了**（M8-18）：会话栏固定在左，
            换边那一态在第八轮有意去掉了。三块区域的显隐在顶栏，不在设置里 ——
            那是每天要点好几次的东西，埋进设置面板不合适。 */}
        <span className="text-muted">外观</span><div className="seg self-start">{(["system", "light", "dark"] as const).map((t) => <button key={t} className={layout.theme === t ? "on" : ""} onClick={() => setLayout({ ...layout, theme: t })}>{{ system: "跟随系统", light: "浅色", dark: "深色" }[t]}</button>)}</div>
      </div>
      {core && <AccountPanel core={core} host={host} />}
      {core && <CliPicker core={core} />}
      {core && <FileTreePanel core={core} />}
      {core && <PluginLimitsPanel core={core} />}
      {core && <StoragePanel core={core} projectCore={projectCore} />}
      {/* 项目那三块（M16-6）。⚠️ 没开项目时这句话也要跟着改 ——
          原来写的是「还有设计系统、限额、回收站与危险操作」，而前两块已经没有入口了
          （`doc/12` M16-6：它们在 M16-7 之后没有对象，geek-99 2026-10-23 定甲去掉入口）。 */}
      {projectCore ? <>
        <ProjectBasicPanel core={projectCore} info={info} reload={() => void load()} />
        <TrashPanel core={projectCore} info={info} reload={() => void load()} />
        <DangerPanel core={projectCore} info={info} onProjectGone={onProjectGone} />
      </> : <p className="text-muted">打开一个项目后，这里还有它的标题、回收站与危险操作。</p>}
    </>} />;
}
