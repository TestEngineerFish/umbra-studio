import { useEffect, useState } from "react";
import type { Core } from "../api/client";
import { fmtSize, timeAgo, type ReadFileResult } from "../api/types";
import type { HostAdapter } from "../host";
import { toast, moveToast, type MoveOut } from "../ui/Toast";
import { askText } from "../ui/Ask";

/** 通用文件卡（S15 形制，M8-5）：没有专用预览器的文件 —— 元数据 + 被谁引用 + 四个动作。
 *  一张居中卡片，最宽 520。禁用项的原因直接写在按钮下面，不藏在 hover 里。 */
/** ⚠️ `projectDir` 是 issue #109 加的：「在访达中显示」要**绝对路径**，
 *  而这个组件原来只有相对项目根的 `path`。 */
export function FileCard({ core, host, path, projectDir, onOpen }: { core: Core; host: HostAdapter; path: string; projectDir: string; onOpen: (p: string, isDir: boolean) => void }) {
  const [info, setInfo] = useState<ReadFileResult | null>(null);
  const [refs, setRefs] = useState<Array<{ file: string; line: number }> | null>(null);
  /** 引用扫描到上限就停了（`list_file_refs` 的 `truncated`）。
   *  ⚠️ **必须和「没人引用」分开说**：它们在一个空列表上长得一模一样，
   *  而一个是「我没查完」，另一个是一个结论。 */
  const [refsCut, setRefsCut] = useState(false);
  const [refsLimit, setRefsLimit] = useState(0);
  const [confirm, setConfirm] = useState(false);
  /** 用户点过「用纯文本打开」—— 跳过嗅探再读一次（M14-11 / Q76）。
   *  ⚠️ 换文件时要**清掉**：不清的话下一份文件会继承上一份的「强制按文本」。 */
  const [forceText, setForceText] = useState(false);
  useEffect(() => { setForceText(false); }, [path]);
  useEffect(() => {
    setInfo(null); setRefs(null); setRefsCut(false); setConfirm(false);
    void core.get<ReadFileResult>(`file?path=${encodeURIComponent(path)}${forceText ? "&asText=true" : ""}`).then((r) => { if (r.ok && r.data) setInfo(r.data); });
    void core.get<{ referencedBy: Array<{ file: string; line: number }>; truncated?: boolean; scanLimit?: number }>(`file_refs?path=${encodeURIComponent(path)}`)
      .then((r) => { setRefs(r.data?.referencedBy ?? []); setRefsCut(!!r.data?.truncated); setRefsLimit(r.data?.scanLimit ?? 0); });
  }, [core, path, forceText]);
  const cap = host.capabilities().revealInFinder;
  const name = path.split("/").pop() ?? path;
  const rename = async () => {
    const next = await askText({ title: "改成什么名字？", initial: name, selectBase: true, okLabel: "改名" });
    if (!next || next === name) return;
    const to = path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}/${next}` : next;
    const r = await core.post<MoveOut>("file_move", { from: path, to });
    if (!r.ok) { toast("改名失败", r.errors?.[0]?.message, "error"); return; }
    moveToast(r.data, `已改名为 ${next}`);
    /* ⚠️ **`onOpen` 只换详情区**（issue #105）：页签还叫旧名、`dirtyStore` 里那颗点
       和 `us.lastDraft` 都还挂在旧路径上。工作台听这条事件把它们一起迁。 */
    window.dispatchEvent(new CustomEvent("ud-renamed", { detail: { from: path, to } }));
    onOpen(to, false);
  };
  const del = async () => {
    const r = await core.post("file_trash", { path });
    if (r.ok) { toast(`${name} 已移到回收站`, "在项目设置的回收站里能找回", "ok"); onOpen(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "", true); }
    else toast("删除失败", r.errors?.[0]?.message, "error");
  };
  return (
    <div className="flex-1 min-w-0 overflow-auto bg-bg grid place-items-center p-6">
      <div className="w-[520px] max-w-full rounded-lg border border-border bg-panel overflow-hidden text-xs">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <span className="w-11 h-11 rounded border border-border grid place-items-center text-xl text-muted shrink-0">▢</span>
          <div className="min-w-0"><div className="text-base font-semibold truncate">{name}</div><div className="font-mono text-muted truncate">{info?.kind === "other" ? guessMime(name) : info?.kind ?? "…"}</div></div>
        </div>
        <dl className="grid grid-cols-[60px_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 border-b border-border">
          <dt className="text-muted">大小</dt><dd className="font-mono">{info ? fmtSize(info.size) : "…"}</dd>
          <dt className="text-muted">修改</dt><dd>{info ? `${new Date(info.updatedAt).toLocaleString()}（${timeAgo(info.updatedAt)}）` : "…"}</dd>
          <dt className="text-muted">位置</dt><dd className="font-mono break-all">{path}</dd>
        </dl>
        {/* ── 正文（M14-11 / Q76，用户 2026-10-21：「任何文件都要能看，至少有通用的兜底」）──
            在这之前这张卡**只有元数据和四个动作** —— 一个 `.log` / `.conf` 打开后看不到一个字。
            ⚠️ 服务端对 `kind === "other"` 会嗅探（无 NUL + 解得出 UTF-8 就当文本），
            所以多数情况下这里直接就有正文；嗅探认为是二进制时下面那颗钮是**出路**。 */}
        {info?.content !== null && info?.content !== undefined && (
          <div className="border-b border-border">
            <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
              <span className="text-muted">正文</span>
              {info.lines !== undefined && <span className="font-mono text-muted">{info.lines} 行</span>}
              {info.truncated && <span style={{ color: "var(--tool-warn)" }}>{info.why}</span>}
              {!info.truncated && info.why && <span style={{ color: "var(--tool-warn)" }}>{info.why}</span>}
            </div>
            {/* 只读。**这张卡不是编辑器** —— 编辑归插件（用户定的边界：Studio 管通用查看）。
                `whitespace-pre-wrap` 而不是 `pre`：一行几千字的日志横着滚没法看。 */}
            <pre className="px-4 pb-3 m-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all overflow-auto"
                 style={{ maxHeight: 360 }} data-ud="fallback-text">{info.content}</pre>
          </div>
        )}
        {/* 嗅探说它不是文本 —— 给一条出路，而不是让用户以为这文件打不开。
            ⚠️ 只在 `other` 这一档给：`.png` 按文本读没有意义，给了这颗钮只会让人点了失望。 */}
        {info && info.content === null && info.kind === "other" && !forceText && (
          <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-muted">{info.why ?? "没给正文"}</span>
            <button className="btn sm" data-ud="fallback-astext" onClick={() => setForceText(true)}>还是按纯文本打开</button>
          </div>
        )}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1"><span className="text-muted">被引用</span><span className="font-mono">{refs?.length ?? "…"}</span></div>
          {/* ⚠️⚠️ **这一块 2026-10-23（M16-7c-2d）之前有一段时间是「永远空」的**：
              `list_file_refs` 的数据源原来是 `listDrafts`（只有设计稿），C3 之后它恒回空 ——
              而界面照旧说「**没有稿件引用它**，改名、移动、删除都不影响任何稿」。
              > **那是一句用户看得见的假话，而「没人引用」和「这个功能坏了」在界面上长得一样。**
              现在它扫 html / htm / css / svg / md / markdown 六种，文案也不再说「稿」。 */}
          {refs && refs.length === 0 && !refsCut &&
            <p className="text-muted leading-relaxed">没有文件引用它，改名、移动、删除都不影响别的文件。</p>}
          {/* ⚠️ **到上限了就照实说，而且不说「没有引用」** —— 那两句话不能同时出现
              （geek-99 2026-10-23 定：「超出就照实告诉用户只查了前 N 个文件」）。 */}
          {refs && refsCut &&
            <p className="leading-relaxed" style={{ color: "var(--tool-warn)" }}>
              这个项目太大，**只查了前 {refsLimit || 5000} 个文件**{refs.length === 0 ? " —— 没查到引用，但不等于没有" : "，可能还有没查到的"}。
            </p>}
          {refs && refs.length > 0 && <>
            <ul className="flex flex-col gap-1 mb-2">{refs.map((r, i) => <li key={i}><button className="font-mono text-accent hover:underline" onClick={() => onOpen(r.file, false)}>{r.file}:{r.line}</button></li>)}</ul>
            <p className="leading-relaxed" style={{ color: "var(--tool-warn)" }}>改名或移动会一并改写这些引用；删除会让它们变成 404。</p>
          </>}
        </div>
        <div className="p-4 flex flex-wrap items-start gap-2">
          <button className="btn sm" onClick={() => void rename()}>改名</button>
          <button className="btn sm" onClick={() => toast("移动", "在目录视图里选中它，用底部的「移动…」")}>移动</button>
          <div className="flex flex-col gap-1">
            {/* ⚠️ **绝对路径**（issue #109，2026-10-06）：`path` 是**相对项目根**的，
                而别的三处调用点传的都是 `${projectDir}/${path}` —— 只有这一处传相对路径。
                两个宿主拿到相对路径都没法用（Electron 的 `showItemInFolder` 要完整路径；
                浏览器那条在核心侧按**进程 cwd** 解析，几乎必然报「目录不存在」）。
                ⚠️ 而且原来**没有 `.catch`** —— 浏览器模式下是一条未处理的 rejection，
                桌面版下什么都不发生，**两种情况都没有任何提示**。
                于是用户看到两颗同名按钮（这里一颗、`⋯` 菜单里一颗），**一颗能用一颗不能用**。 */}
            <button className="btn sm" disabled={!cap.ok}
              onClick={() => { void host.revealInFinder(`${projectDir}/${path}`).catch((e) => toast("打不开", String(e?.message ?? e), "error")); }}>在访达中显示</button>
            {!cap.ok && <span className="text-muted">{cap.why}</span>}
          </div>
          <span className="flex-1" />
          {confirm
            ? <span className="flex items-center gap-2"><span style={{ color: "var(--tool-warn)" }}>移到回收站？</span><button className="btn sm danger" onClick={() => void del()}>确认</button><button className="btn sm ghost" onClick={() => setConfirm(false)}>取消</button></span>
            : <button className="btn sm danger" onClick={() => setConfirm(true)}>删除</button>}
        </div>
      </div>
    </div>
  );
}

function guessMime(name: string): string {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const m: Record<string, string> = { zip: "application/zip", pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", woff2: "font/woff2", ttf: "font/ttf", csv: "text/csv" };
  return m[ext] ?? (ext ? `application/${ext}` : "未知类型");
}
