/** 插件市场的数据形状（M11-6 接线，形制见 `ui/S17-插件市场.dc.html`）。
 *
 *  ⚠️ 键名尽量跟着 S17 的 `d` 走，但**不照抄它的展示字段**（`stFg` `actBg` 这类）——
 *  那些是稿里为了演示态方便算好的样式值，进了代码就成了「颜色写在数据里」，
 *  换主题时改不动。样式由组件按 `state` 算。
 */
export type PluginState = "builtin" | "installed" | "bought" | "none";

export interface MarketTool {
  name: string; id: string; desc: string;
  /** B 面那道「读写账」。`without` 用枚举不用数字 —— 数字由前端按用户的文件算 */
  sample?: { task: string; without: "whole" | "none" | string; with: string };
}

export interface MarketRow {
  id: string; name: string; author: string; version: string;
  price: number; builtin?: boolean;
  brief: string;
  formats: string[];
  kinds: string[];
  permissions: { files?: string[]; net?: string[] };
  size?: string; updated?: string;
  tools?: MarketTool[];
  state: PluginState;
  installedVersion: string | null;
  hasUpdate: boolean;
  unsigned: boolean;
}

export interface InstalledRow {
  id: string; name: string; version: string;
  bundled: boolean;
  unsigned: boolean;
  kinds: string[];
  surfaces: string[];
  permissions: { files?: string[]; net?: string[] };
  ok: boolean;
  problems: Array<{ field: string; why: string }>;
  /** 授权态（M11-12）：**装了 ≠ 能用**。
   *  `builtin` 内置永远能用 · `active` 有效 · `expired` 过期 ·
   *  `not-yet` 还没生效 · `unlicensed` 没授权 · `bad-license` 许可证有问题。
   *  ⚠️ 这一项以前是**假的**（界面上根本没有过期这一态）——
   *  而限时免费到期那天所有试用用户同时看到它。 */
  entitlement?: "builtin" | "active" | "expired" | "not-yet" | "unlicensed" | "bad-license";
  /** 到期日；`null` = 永久（买断） */
  until?: string | null;
  /** 一句给人看的话，**每一种态都带出路** */
  entitlementNote?: string;
}

/** 权限三行。**不允许的也列出来** —— 设计侧第十轮：
 *  「让人敢装的是它**做不了什么**，所以不允许的两行比允许的那行更重要」。 */
export interface PermRow { allow: boolean; label: string; note: string }

export function permRows(p: { files?: string[]; net?: string[] }): PermRow[] {
  const files = p.files ?? [];
  const net = p.net ?? [];
  return [
    files.includes("write")
      ? { allow: true, label: "读写当前项目里的文件", note: "每一下都经过 Umbra，出不了项目目录" }
      : files.includes("read")
        ? { allow: true, label: "读当前项目里的文件", note: "只读，改不了任何东西" }
        : { allow: false, label: "碰文件 · 不允许", note: "它读不到也写不了你的文件" },
    net.length
      ? { allow: true, label: `联网 · 只连 ${net.join("、")}`, note: "别的地址一律发不出去" }
      : { allow: false, label: "联网 · 不允许", note: "它发不出任何网络请求" },
    /* ⚠️ `exec` 第一期没有，但**这一行照样写**（设计侧第十轮）：
       写成「Umbra 不给任何插件这个权限」，以后开放了再改成按清单来。
       不写的话用户会想「那它还能干什么」—— 列出来的空白比不列更让人安心。 */
    { allow: false, label: "启动外部程序 · 不允许", note: "Umbra 不给任何插件这个权限" },
  ];
}
