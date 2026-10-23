import { useCallback, useEffect, useRef, useState } from "react";
import type { Core, UdEvent } from "../api/client";

/** 一个项目在前端的状态：**当前选中的文件、WS 连接、以及「这个文件什么时候变的」**。
 *
 *  ⚠️⚠️ **这个文件 2026-10-23（M16-7c / C3）从 19 个导出砍到 5 个。**
 *  砍掉的 14 个全是设计稿那一套：
 *  `drafts` / `indexed` / `fetchDrafts`（稿清单 + 自动建索引）·
 *  `diags` / `fetchDiagnostics`（诊断，读 `validate_draft`）·
 *  `comments` / `stash` / `fetchComments` / `fetchStash`（**节点评论**和它的暂存区，M8-32）·
 *  `changes` / `fetchChanges`（稿的语义变更清单）·
 *  `source` / `fetchSource`（dc 的源码视图）·
 *  `checking` / `runCheck`（`render_check` 体检）· `rebuildIndex`。
 *
 *  ⚠️ **删法是「先删掉，让编译错误带路」**，而不是先 grep 一遍再删 ——
 *  本项目反复证明过 grep 找不全（M16-7b 那两条 404 就是 grep 漏掉的）：
 *  > **让「漏掉」变成编译错误，比让「漏掉」变成一条要人记得的纪律可靠。**
 *
 *  留下的五个和 dc 无关：`selected` / `select`（当前文件）·
 *  `lastEvent` / `wsState`（WS）· `fileTick`（文件什么时候变的）。 */
export function useProject(core: Core, dir: string) {
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<UdEvent | null>(null);
  const [wsState, setWsState] = useState<"open" | "closed">("closed");
  const sel = useRef<string | null>(null); sel.current = selected;

  const select = useCallback((file: string | null) => {
    setSelectedRaw(file); sel.current = file;
  }, []);

  /* 「这个文件什么时候变的」——**以文件系统为准，不管是谁改的**。
   *
   * 原来右侧详情靠 `write` 事件刷新，而 `write` 只有我们自己进程里的写入口会发。
   * 通道 B 的 CLI 起的是**独立的 MCP server 进程**，它的 emit 到不了这条总线，
   * 于是「Codex 改完文件，右边还是旧的」（2026-09-24 用户实测）。
   * 换成认 `fs`（serve 里的 fs.watch，macOS 上底层就是 FSEvents）之后，
   * 别的编辑器、终端、甚至 Finder 改的也一样能刷 —— 判据从「谁改的」换成「文件变没变」。
   * `write` 仍然收：它比文件事件早到一点。 */
  const [changedAt, setChangedAt] = useState<Record<string, number>>({});
  useEffect(() => core.events((e) => {
    setLastEvent(e);
    if (e.type === "write" || e.type === "fs") {
      const p = e.payload as { file?: string; changes?: string[] };
      const touched = [...(p.file ? [p.file] : []), ...(p.changes ?? [])];
      if (touched.length) setChangedAt((m) => { const n = { ...m }; const t = Date.now(); for (const f of touched) n[f] = t; return n; });
    }
  }, setWsState), [core]);
  /** 某个文件最后一次变化的时刻。视图把它放进 deps 就会跟着重载。 */
  const fileTick = useCallback((path: string | null) => (path ? changedAt[path] ?? 0 : 0), [changedAt]);
  /* ⚠️ `dir` 现在只是「换项目时让这个 hook 重新来一遍」的信号 —— 原来它还驱动
     `fetchDrafts` 的 effect。留着它（而不是去掉这个参数）是因为**换项目时
     `selected` 必须清掉**，否则新项目会带着上一个项目的选中文件。 */
  useEffect(() => { setSelectedRaw(null); sel.current = null; }, [dir]);

  return { selected, select, lastEvent, wsState, fileTick };
}
export type ProjectStore = ReturnType<typeof useProject>;
