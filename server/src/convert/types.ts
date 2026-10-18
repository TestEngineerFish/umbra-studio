// 来源：UmbraPC electron/core/convert/types.ts（2026-10-18 a72ac3a），改动：无（逐字）
// 格式转换：转换器的形状（照 Filee 的 IConverter，doc/格式转换-方案调研-2026-10-18.md §9.3）。
//
// 一个转换器只登记「A → B」这种**直接一步**（边），由 route.ts 在格式图上找最便宜的路线。
// 加一个工具就自动多出一批组合（docx → html → pdf），不用一条条手写矩阵。

export interface Edge {
  from: string;
  to: string;
  /** 代价：10 = 正常；有损 / 慢 / 排版走样的边写高一点，让有更好的路时不走它。 */
  cost?: number;
  /** 给人看的一句提醒（「只转第 1 页」「排版简化」）—— 走了这条边，结果卡上要说出来。 */
  note?: string;
}

/** 工具现在能不能用。不能用时 `reason` 给人看（「没装 LibreOffice」），`hint` 给一行能照做的（安装命令）。 */
export type ToolStatus =
  | { ok: true; version?: string }
  | { ok: false; reason: string; hint?: string };

export interface StepOptions {
  /** 有损图片格式的质量 1–100；不给用工具的默认值。 */
  quality?: number;
}

/** 一步转换的输入。转换器**只许**写 `output` 这一个路径（引擎分配的、在任务临时目录里），
 *  别的文件（中间产物）只许放 `workDir`；源文件只读不碰。 */
export interface ConvertStep {
  input: string;
  from: string;
  to: string;
  output: string;
  workDir: string;
  options: StepOptions;
  signal: AbortSignal;
  /** 进度 0–1；不知道总量时给 null（界面显示转圈）。 */
  progress: (fraction: number | null) => void;
}

export interface Converter {
  /** 稳定的 id，设置 / 日志里用。 */
  id: string;
  /** 给人看的名字（「系统 · sips」「LibreOffice」）。 */
  name: string;
  edges: readonly Edge[];
  /** 同一个转换器同时最多跑几个（视频编码器自己就吃满所有核，开多了只会更慢）。 */
  maxParallel: number;
  status(): Promise<ToolStatus>;
  convert(step: ConvertStep): Promise<void>;
}
