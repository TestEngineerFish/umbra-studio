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
  IO: "E_IO",
} as const;

export type Code =
  | (typeof E)[keyof typeof E]
  | (typeof W)[keyof typeof W]
  | (typeof X)[keyof typeof X];
