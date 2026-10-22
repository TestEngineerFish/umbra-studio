import { platformName, studioName } from "@shared/brand";
import { useCallback, useEffect, useState } from "react";
import type { Core } from "../api/client";
import { baseName, type CliStatus, type DirInfo } from "../api/types";
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

/** 接管那张表的一行。**文件数是必填的** —— 设计侧第 59 封 §零 A 抓到的那条：
 *  原来那张表只有「预览壳 8 份」这种混在标签里的数，于是**分项加不到合计**，
 *  而我自己从来没把它加一遍。
 *  > 把文件数变成一个必填的 prop，「忘了数」在类型上就不成立了
 *  > （和弹窗三段必填 props 同一个做法）。 */
const Row = ({ n, label, kb, why }: { n: number; label: string; kb: string; why: React.ReactNode }) => (
  <div className="px-3 py-2 flex items-baseline gap-2">
    <b className="text-text2 w-[96px] shrink-0">{label} {n} 个</b>
    <span className="text-muted w-[52px] shrink-0 text-right font-mono">{kb}</span>
    <span className="flex-1 leading-relaxed">{why}</span>
  </div>
);

/** 新建稿件：走 create_draft（唯一写入口），建完自动选中 */
interface TemplateRow { id: string; name: string; sub?: string }

/** 新建稿件（M8-24 重画，形制按设计侧第八轮 §三）。
 *
 *  用户原话：「新建稿件的样式也不对，**太过拥挤**」。
 *  设计侧的诊断：拥挤是因为**四样东西排在同一个密度里**，没有层次。
 *  所以改成四组、组间 18px、每组一个小标题、控件高 34。
 *
 *  最要紧的一条是**文件名下面实时写出完整路径** ——
 *  「点『新建』之前就能知道结果」。重名或非法字符当场变红说原因，钮变灰。
 */
export function NewDraftSheet({ core, current, dir, projectDir, designProject, onClose, onCreated, onAdopted }: {
  core: Core; current: string | null; dir: string; onClose: () => void; onCreated: (file: string) => void;
  /** 项目根的**绝对**路径（`adopt_project` 要它）。`dir` 是项目内的相对目录，两回事 */
  projectDir: string;
  /** 这个目录接管过没有（`project.json` 在不在）。`false` = 普通目录，先问一句 */
  designProject?: boolean;
  /** 接管成功之后通知工作台（它要把 `designProject` 翻过来、横条退场） */
  onAdopted?: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"page" | "component">("page");
  const [tpl, setTpl] = useState("blank");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** 这一次已经接管过了（父组件的 `designProject` 还没刷到的时候靠它翻面） */
  const [adoptedHere, setAdoptedHere] = useState(false);

  useEffect(() => {
    void core.get<{ templates?: TemplateRow[] }>("templates").then((r) => setTemplates(r.data?.templates ?? [])).catch(() => {});
    void core.get<{ drafts?: Array<{ file: string }> }>("drafts").then((r) => setExisting((r.data?.drafts ?? []).map((d) => d.file))).catch(() => {});
  }, [core]);

  const n = name.trim();
  const fileName = n ? (n.endsWith(".dc.html") ? n : n + ".dc.html") : "";
  const full = fileName ? (dir ? `${dir}/${fileName}` : fileName) : "";
  const illegal = !!n && /[\\/:*?"<>|]/.test(n);
  const dup = !!full && existing.includes(full);
  const why = illegal ? '名字里不能有 \\ / : * ? " < > |' : dup ? "这个目录里已经有同名的稿了" : "";
  const blocked = !fileName || !!why || busy;

  /* ── 第一段：这个目录还没接管，先问一句（M14-4 收尾，2026-10-22）──
     ⚠️⚠️ **「新建稿件」原来是 B3 那道闸的一条后门。** B3 让「打开一个普通目录」
     一个字节都不写，而在同一个目录里建一份稿，实测**静默写 5 个文件 · 227 KB**
     （那份稿 1 KB + 运行时副本 4 份 226 KB），而且写完还是半残的：
     预览壳 `S2-单稿预览壳.dc.html` 不在 → **编辑档那个 iframe 404**。

     ### 为什么是「问」而不是「写进去再提醒」
     提醒是事后的。这件事的代价（往他的目录里写 227 KB）在他点下去之前就定了，
     **而他点「新建稿件」的时候脑子里想的是「建一份稿」，不是「改造这个目录」**。

     ### 为什么是两段，而不是在表单上加一条横条
     表单上按 Enter 就提交（`blocked === false` 时），**横条是可以被 Enter 跳过的** ——
     那就又回到「写完才知道」。两段式让那一问**必须被看见一次**；
     而接管是**每个目录一次**的事，之后这一段就不出现了。
     （这和首页「忘掉这个项目」的二次确认是同一个形制，不新造一种。）

     ### 为什么没有第三颗按钮「只建这一份，先不接管」
     算一下就知道那个选项没有意义：**它已经要写 227 KB**，而接管总共才
     753 KB —— 多出来的 526 KB 换来的是属性面板、点选、就地编辑、版本对比全都能用。
     > **那颗按钮用全部功能换了几乎没有的代价。**
     不接管也照旧能做的事一条没少：看、改已有的文件、圈给 AI —— 那些路上没有这道闸。 */
  const needAdopt = designProject === false && !adoptedHere;
  const adopt = async () => {
    setBusy(true);
    const r = await core.post<{ deployed: number | null }>("adopt_project", { dir: projectDir });
    setBusy(false);
    if (!r.ok) { toast("接管失败", r.errors?.[0]?.message ?? "", "error"); return; }
    setAdoptedHere(true); onAdopted?.();
    toast("已接管为设计项目", "预览壳与运行时副本都放好了，接着填稿名", "ok");
  };

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    const body: Record<string, unknown> = { path: full, kind };
    if (tpl === "blank") body.source = "blank";
    else if (tpl.startsWith("copy:")) { body.source = "copy"; body.sourceFile = tpl.slice(5); }
    else { body.source = "template"; body.templateName = tpl; }
    const r = await core.post("create_draft", body);
    if (r.ok) { toast(`已新建 ${fileName}`, dir || "项目根", "ok"); onCreated(full); onClose(); }
    else { toast("新建稿件失败", r.errors?.[0]?.message, "error"); setBusy(false); }
  };

  if (needAdopt) return <Sheet onClose={onClose}
    head={<h2 className="text-base font-semibold">先接管这个目录？</h2>}
    foot={<>
      <span className="flex-1" />
      <button className="btn" onClick={onClose}>取消 Esc</button>
      <button className="btn primary" data-ud="adopt-then-new" disabled={busy} onClick={() => void adopt()}>{busy ? "正在接管…" : "接管并继续"}</button>
    </>}
    body={<>
      <p className="leading-relaxed">
        这是一个<b className="text-text2">普通目录</b> —— 我们到现在<b className="text-text2">一个字节都没往里写</b>。
        要在这里建设计稿，得先放几样工具文件进来。
      </p>
      {/* ⚠️ 这些数是**量出来的**（2026-10-22），不是估的。
          一个说谎的数比没有数糟，因为它看起来是读数 —— 而上一个版本的「只加 project.json」
          正是这么来的。
          ⚠️ **写「约」不是含糊，是照实**：实测 749–759 KB，随目录里已有几份稿浮动
          （入口页要装索引数据，壳要注入 `__resources`）。
          写一个精确到个位的数反而是假精度。**文件数是 17 个，那个不浮动。**
          ⚠️ `apitest` ⑰ 真接管一个干净目录、数盘上的字节，和这几个数对账 ——
          `hometest` 那条只证明界面显示了这些数（**那是循环的**，它读的就是这里的字面量）。 */}
      <div className="rounded border border-border bg-panel2 divide-y divide-border text-[11px]">
        {/* ⚠️⚠️ **每一行都写文件数，而且加起来必须等于 17**（设计侧第 59 封 §零 A）。
            原来这张表只有四行：`8 + 4 + 2 + 1 = 15 ≠ 17` ——
            我把 `icons.js`（图标表）**折进了「预览壳」那一行**而没有数它，
            又**整个漏掉了 `_ds-tool/tokens.css`**（皮肤）。
            > **一张「合计」对得上、而分项加不起来的表，是一张还没被人加过的表。**
            设计侧是**把数加了一遍**发现的 —— 那是我自己从来没做的一步。 */}
        <Row n={8} label="预览壳" kb="413 KB" why={<>属性面板、点选、就地编辑、版本对比、项目设置用它们。<b className="text-text2">没有它们这几样会 404</b></>} />
        <Row n={1} label="图标表" kb="8 KB" why={<><code className="font-mono">icons.js</code> —— 预览壳里的图标靠它，缺了那几份稿<b className="text-text2">一个图标都画不出来</b></>} />
        {/* ⚠️ 「4 份」而正文只列了 3 样（`support.js` 和两个 React）—— 漏的是点选桥，
            设计侧也点出来了。**一个写着「4 份」而只列了 3 样的说明，比不列更坏**。 */}
        <Row n={4} label="运行时副本" kb="226 KB" why={<><code className="font-mono">support.js</code>、两个 React、点选桥。稿自己按相对路径引它们，<b className="text-text2">没有它们这份稿双击打开是白屏</b></>} />
        <Row n={2} label="入口页 + 索引" kb="100 KB" why="稿件索引那一页" />
        <Row n={1} label="皮肤" kb="2 KB" why={<><code className="font-mono">_ds-tool/tokens.css</code> —— 稿里按这个相对路径引它</>} />
        <Row n={1} label="project.json" kb="一行" why="「这个目录是设计项目」的标记" />
        <div className="px-3 py-2 flex items-baseline gap-2 bg-panel">
          <b className="text-text2 w-[96px] shrink-0">合计 17 个</b>
          <span className="w-[52px] shrink-0 text-right font-mono"><b className="text-text2">约 750 KB</b></span>
          <span className="flex-1 text-muted leading-relaxed">都是生成物，删掉下次打开会重建</span>
        </div>
      </div>
      <p className="text-muted leading-relaxed">
        <b className="text-text2">你原来的文件一个字节都不会被改</b>，<code className="font-mono text-[11px]">.gitignore</code> 也不动
        —— 这个目录在 git 仓库里的话，排除规则记在本机那份 <code className="font-mono text-[11px]">.git/info/exclude</code> 里（不进版本）。
        快照、评论、回收站这些也都不在这个目录里。
      </p>
      {/* ⚠️ 这一段回答的是用户一定会想的那句「我就建一份稿，非得改造整个目录吗」。
          不答的话他只会觉得这是个强制推销。答案是**算得出来的**，所以把算式给他。 */}
      {/* ⚠️ **默认只留一句，算账收进可展开里**（设计侧 §5）：
          「正文 3 太长，用户还没问就先答了」。那段算账一个字没删，只是不默认占屏。 */}
      <p className="text-muted leading-relaxed">
        只是<b className="text-text2">看、改已有的文件、圈给 AI</b>，一直不需要接管。
      </p>
      <details className="text-muted leading-relaxed">
        <summary className="cursor-pointer hover:text-text">为什么不能只建这一份？</summary>
        <p className="mt-1.5">
          <b className="text-text2">建一份稿本身就要写上面那 226 KB 的运行时副本</b>，
          而预览壳不在的话属性面板和点选会 404 ——
          那等于写了 226 KB 只换来半个能用的编辑器，所以这里不给那条路。
        </p>
      </details>
    </>} />;

  return <Sheet onClose={onClose}
    head={<h2 className="text-base font-semibold">新建稿件</h2>}
    foot={<>
      {/* 「从现有稿复制…」**不能跟着模板那一组一起消失**，所以它在底部成一个文字链 */}
      {current && (
        <button className={`text-[11px] underline underline-offset-2 ${tpl.startsWith("copy:") ? "text-accent" : "text-muted hover:text-text"}`}
          onClick={() => setTpl(tpl.startsWith("copy:") ? "blank" : `copy:${current}`)}
          title={tpl.startsWith("copy:") ? "点一下取消" : `复制 ${current}`}>
          {tpl.startsWith("copy:") ? `✓ 从 ${current.split("/").pop()} 复制` : "从现有稿复制…"}
        </button>
      )}
      <span className="flex-1" />
      <button className="btn" onClick={onClose}>取消 Esc</button>
      <button className="btn primary" disabled={blocked} onClick={() => void submit()}>{busy ? "正在建…" : "新建 ⏎"}</button>
    </>}
    body={<>
    {/* ⚠️ **Enter 只在文件名输入框里当提交**（issue #124，2026-10-06）。
        原来是在**容器**上统一拦的、不看焦点落在哪里，于是：
          · Tab 到「取消」按 Enter → `preventDefault()` 吃掉按钮自己的激活 → **提交** ——
            **按「取消」却新建了一份稿**；
          · Tab 到「组件稿」按 Enter 想选它 → 直接提交，类型还是原来的「页稿」；
          · 走到「从现有稿复制…」按 Enter → 没切到复制，用当前模板直接建了。
        只要文件名已经合法（`blocked === false`）以上都会**真落盘**。
        **一个「全局快捷键」挂在容器上，就会把容器里每个控件的回车都吃掉。** */}
    {/* ⚠️ 2026-10-21 三颗按钮**挪进了 `foot`**（弹窗外壳改成三段必填 props 那一下），
        于是它们干脆不在这个 `onKeyDown` 的子树里了 —— #124 那道闸**更紧了一格**，
        不是放松：原来靠「看焦点是不是 INPUT」拦，现在连事件都到不了这里。
        ⚠️ 宽度从写死的 `w-[460px]` 改成跟着内容区走：原来 460 在 520 的壳里
        **右边空 59px**，而那正是「没有内边距」的另一种长相。 */}
    <div className="grid gap-[18px]" onKeyDown={(e) => {
      if (e.key !== "Enter" || blocked) return;
      /* 焦点在别的控件上时让它走原生行为（按钮激活、单选切换…） */
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== "INPUT") return;
      e.preventDefault();
      void submit();
    }}>
      <div className="grid gap-1.5">
        <label className="text-[11px] text-muted">文件名</label>
        <div className="flex items-center gap-0 h-[34px] rounded border bg-bg overflow-hidden" style={{ borderColor: why ? "var(--tool-err)" : "var(--tool-border)" }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：设置 · 账号与凭据"
            className="flex-1 min-w-0 h-full px-3 bg-transparent outline-none text-xs" />
          {/* 扩展名**固定显示在右边**，用户不用自己打 */}
          <span className="px-2.5 h-full grid place-items-center font-mono text-[11px] text-muted border-l border-border bg-panel2 shrink-0">.dc.html</span>
        </div>
        {/* 实时写出完整路径 —— 点「新建」之前就知道结果 */}
        <div className={`text-[11px] font-mono leading-relaxed break-all ${why ? "text-err" : "text-muted"}`}>
          {why || (full ? `将创建 ${full}` : "会自动补 .dc.html")}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="text-[11px] text-muted">位置</label>
        <div className="h-[34px] px-3 flex items-center gap-2 rounded border border-border bg-panel2">
          <span className="flex-1 min-w-0 truncate font-mono text-[11px]">{dir || "项目根"}</span>
          <span className="text-[11px] text-muted shrink-0">右键哪个目录就建在哪</span>
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="text-[11px] text-muted">类型</label>
        <div className="grid grid-cols-2 gap-2">
          {([["page", "页稿", "一整屏，能演示、能当原型点"], ["component", "组件稿", "可被别的稿 import 的一块"]] as const).map(([k, label, sub]) => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`text-left p-2.5 rounded border transition-colors ${kind === k ? "border-accent bg-accentSoft" : "border-border hover:bg-hover"}`}>
              <div className={`text-xs font-semibold ${kind === k ? "text-accent" : ""}`}>{label}</div>
              <div className="text-[11px] text-muted leading-relaxed mt-0.5">{sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 起始模板（第九轮 §十.2）═══
          **项目里一个模板都没有时整组不出** —— 那时它只剩「空白」和「复制现有稿」两项，
          是个空架子。「用户永远不知道有模板」这件事，解法放在**模板从哪来**的地方：
          `.dc.html` 的 `⋯` 里加了「存为模板…」，存过一次这一组就出现了。 */}
      {templates.length > 0 && (
        <div className="grid gap-1.5">
          <label className="text-[11px] text-muted">起始模板 · 可选</label>
          <div className="max-h-[132px] overflow-auto rounded border border-border divide-y divide-border">
            {[{ id: "blank", name: "空白", sub: "只有骨架和运行时" }, ...templates].map((t) => (
              <button key={t.id} onClick={() => setTpl(t.id)} aria-pressed={tpl === t.id}
                className={`w-full text-left px-2.5 py-2 flex items-center gap-2 hover:bg-hover ${tpl === t.id ? "bg-accentSoft" : ""}`}>
                <span className={`w-3 shrink-0 text-accent ${tpl === t.id ? "" : "opacity-0"}`}>✓</span>
                <span className="text-xs shrink-0">{t.name}</span>
                {t.sub && <span className="text-[11px] text-muted truncate">{t.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

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

export function SettingsSheet({ core, host, projectUrl, projectCore, layout, setLayout, onClose }: { core: Core | null; host: HostAdapter | null; projectUrl: string | null; projectCore: Core | null; layout: LayoutState; setLayout: (l: LayoutState) => void; onClose: () => void }) {
  const s8 = projectUrl ? `${projectUrl}${encodeURIComponent("S8-项目设置.dc.html")}?embed=1` : null;
  return <Sheet onClose={onClose} wide={!!s8}
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
      {/* iframe 的高度给固定值，别用 vh —— 它在会滚的内容区里，用 vh 会和外层的滚动打架 */}
      {s8 ? <iframe src={s8} title="项目设置" className="w-full border border-border rounded bg-panel shrink-0" style={{ height: 560 }} />
        : <p className="text-muted">打开一个项目后，这里还有设计系统、限额、回收站与危险操作。</p>}
    </>} />;
}
