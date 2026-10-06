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
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setInfo(null); setRefs(null); setConfirm(false);
    void core.get<ReadFileResult>(`file?path=${encodeURIComponent(path)}`).then((r) => { if (r.ok && r.data) setInfo(r.data); });
    void core.get<{ referencedBy: Array<{ file: string; line: number }> }>(`file_refs?path=${encodeURIComponent(path)}`).then((r) => setRefs(r.data?.referencedBy ?? []));
  }, [core, path]);
  const cap = host.capabilities().revealInFinder;
  const name = path.split("/").pop() ?? path;
  const rename = async () => {
    const next = await askText({ title: "改成什么名字？", initial: name, selectBase: true, okLabel: "改名" });
    if (!next || next === name) return;
    const to = path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}/${next}` : next;
    const r = await core.post<MoveOut>("file_move", { from: path, to });
    if (!r.ok) { toast("改名失败", r.errors?.[0]?.message, "error"); return; }
    moveToast(r.data, `已改名为 ${next}`);
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
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1"><span className="text-muted">被引用</span><span className="font-mono">{refs?.length ?? "…"}</span></div>
          {refs && refs.length === 0 && <p className="text-muted leading-relaxed">没有稿件引用它，改名、移动、删除都不影响任何稿。</p>}
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
