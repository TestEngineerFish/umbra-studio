/** 诊断码。与 doc/00 §六 逐条对应，值是稳定标识，不要改字面。 */

/** error：拒绝落盘（00 §6.1） */
export const E = {
  TAG_UNBALANCED: "E_TAG_UNBALANCED",
  LOGIC_SYNTAX: "E_LOGIC_SYNTAX",
  HOLE_EXPRESSION: "E_HOLE_EXPRESSION",
  HOLE_UNRESOLVED: "E_HOLE_UNRESOLVED",
  RETURN_PATH_GAP: "E_RETURN_PATH_GAP",
  IMPORT_MISSING: "E_IMPORT_MISSING",
  IMPORT_SELF_CLOSING: "E_IMPORT_SELF_CLOSING",
  COMMENT_TAG: "E_COMMENT_TAG",
  DS_PATH: "E_DS_PATH",
  CONTROL_IN_TABLE: "E_CONTROL_IN_TABLE",
  /** set_prop 的目标不是字面量（值来自洞），不能直接覆盖 —— doc/09 §3.2 */
  SLOT_NOT_EDITABLE: "E_SLOT_NOT_EDITABLE",
  /** 模板里有洞，却没有逻辑类 —— 没有东西能填它们，整页的洞都渲染成空 */
  HOLES_WITHOUT_LOGIC: "E_HOLES_WITHOUT_LOGIC",
  /** 有 <x-dc> 却没引 support.js —— 运行时根本不加载，模板原样当 HTML 显示 */
  RUNTIME_NOT_LOADED: "E_RUNTIME_NOT_LOADED",
} as const;

/** warning：放行但必须回报（00 §6.2） */
export const W = {
  DEAD_KEY: "W_DEAD_KEY",
  ELEMENTS_WARN: "W_ELEMENTS_WARN",
  ELEMENTS_HARD: "W_ELEMENTS_HARD",
  UNKNOWN_TAG: "W_UNKNOWN_TAG",
  HELMET_DUP: "W_HELMET_DUP",
  FIXED_BLUR: "W_FIXED_BLUR",
  HINT_IGNORED: "W_HINT_IGNORED",
  COMMENT_TAG: "W_COMMENT_TAG",
  /** 洞写在浏览器「解析时就会动作/校验」的属性上（src/href/SVG d 等）—— doc/00 §22.5 */
  HOLE_IN_PARSED_ATTR: "W_HOLE_IN_PARSED_ATTR",
} as const;

/** 非校验类（00 §6.4） */
export const X = {
  PATCH_ANCHOR: "E_PATCH_ANCHOR",
  GIT_DISABLED: "E_GIT_DISABLED",
  PROJECT_UNKNOWN: "E_PROJECT_UNKNOWN",
  DRAFT_NOT_FOUND: "E_DRAFT_NOT_FOUND",
  SNAPSHOT_MISSING: "E_SNAPSHOT_MISSING",
  BAD_INPUT: "E_BAD_INPUT",
  /** 这个目录还没解锁（M14-7 / Q70），所以一个字节都不写。
   *
   *  ⚠️ **2026-10-23 从 `E_IO` 拆出来**（M16-1 的判据抓到的）：两条写入口原来都用 `E_IO`，
   *  而「这个目录还没解锁」**不是一个 IO 错误** —— 它是一个状态问题，而且**有出路**
   *  （点「开始编辑」）。用 `E_IO` 的后果在插件那一侧：
   *  **「不让写」和「磁盘满了」对插件长得一样**，于是它没法按码分支，
   *  只能把拒因原文抛给用户。
   *  > **一个通用错误码会把「有出路的拒绝」和「真的出错了」混成一件事。** */
  NOT_EDITABLE: "E_NOT_EDITABLE",
  /* ── 本机桥接（2026-10-30，契约 `doc/S8`）──
     ⚠️ **七种拒分开立码，不共用一个。** 理由就是上面 `NOT_EDITABLE` 那段：
     插件要按码分支，而「没声明」「没授权」「对端没在跑」三件事**用户要做的动作完全不同**
     （改清单 / 去设置里允许 / 把 SketchUp 打开）。合成一个码，插件只能把原文抛给用户。
     > **一个通用错误码会把「有出路的拒绝」和「真的出错了」混成一件事。** */
  LOCAL_NOT_DECLARED: "E_LOCAL_NOT_DECLARED",
  LOCAL_NOT_GRANTED: "E_LOCAL_NOT_GRANTED",
  LOCAL_NOT_PAIRED: "E_LOCAL_NOT_PAIRED",
  LOCAL_TIMEOUT: "E_LOCAL_TIMEOUT",
  LOCAL_DISCONNECTED: "E_LOCAL_DISCONNECTED",
  LOCAL_FRAME_TOO_BIG: "E_LOCAL_FRAME_TOO_BIG",
  LOCAL_REMOTE: "E_LOCAL_REMOTE",
  /* ── 图像编辑（2026-10-30，出效果图）──
     同一条理由（上面那两段）：**用户要做的动作不同就分开立码**。
     「没配图像编辑模型」要去填配置 · 「对端拒了」多半是密钥或模型 id ·
     「太大了」要换一张 · 「等太久了」可以重试 —— 四件事里只有最后一件适合重试，
     合成一个码的话插件只能一律建议「再试一次」。 */
  IMAGE_EDIT_NOT_CONFIGURED: "E_IMAGE_EDIT_NOT_CONFIGURED",
  IMAGE_EDIT_REMOTE: "E_IMAGE_EDIT_REMOTE",
  IMAGE_EDIT_TOO_BIG: "E_IMAGE_EDIT_TOO_BIG",
  IMAGE_EDIT_TIMEOUT: "E_IMAGE_EDIT_TIMEOUT",
  IO: "E_IO",
} as const;

export type Code =
  | (typeof E)[keyof typeof E]
  | (typeof W)[keyof typeof W]
  | (typeof X)[keyof typeof X];
