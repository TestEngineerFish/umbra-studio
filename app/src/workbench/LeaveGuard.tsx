/** 关页签前那一张确认卡（设计侧第十二轮 S18 §一.1）。
 *
 *  **为什么是「离开时才拦」而不是横条常驻**：设计侧的原话 ——
 *  「代码的横条会一直挂着，挂久了用户就不看它了，而且它每次出现都把正文往下推 20px」。
 *  所以平时只在工具条上一颗点，**只在真的要丢东西的时候**出这张卡。
 *
 *  ⚠️ 这一张由**工作台**画，不是插件画的。稿里它在正文区中间，
 *  但触发它的动作（关页签）在工作台 —— 让插件画就得先有一轮「能不能走」的协商，
 *  而那条协议现在还不需要。**落盘这件事仍然归格式模块**（见 `onSave` 那段注释）。
 */
export function LeaveGuard({ path, onCancel, onDiscard, onSave }: {
  path: string; onCancel: () => void; onDiscard: () => void; onSave: () => void;
}) {
  const name = path.split("/").pop() ?? path;
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-14 bg-black/25"
      onClick={onCancel}>
      <div role="alertdialog" aria-label="还没落盘"
        className="w-[360px] p-4 rounded-lg border border-border bg-panel shadow-lg"
        onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold mb-1 truncate" title={path}>{name} 还没落盘</div>
        <div className="text-xs leading-relaxed text-muted mb-3">关掉以后这些改动不会留。</div>
        <div className="flex items-center gap-1.5">
          {/* 「不要了」放最左、描边而不是红色 —— 它是个正当选择，不是危险操作 */}
          <button className="btn sm" onClick={onDiscard}>不要了</button>
          <span className="flex-1" />
          <button className="btn sm ghost" onClick={onCancel}>回去接着改</button>
          <button className="btn sm primary" onClick={onSave}>落盘再关 ⌘S</button>
        </div>
      </div>
    </div>
  );
}
