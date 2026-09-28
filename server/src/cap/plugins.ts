import { z } from "zod";
import { envelope } from "../envelope.js";
import { allowedCapNames } from "../plugin/host.js";
import { HOST_API_MAJOR } from "../plugin/manifest.js";
import { hostCall } from "../plugin/host.js";
import { listInstalled, registerPluginKinds, uninstall } from "../plugin/store.js";
import { entitlementOf, verifyLicenseText, type Entitlement } from "../plugin/license.js";
import { installFromFile, pluginVersions, switchVersion } from "../plugin/install.js";
import { emit } from "../events.js";
import { defineCap } from "./registry.js";

/** 插件管理的能力（M11-4）。
 *
 *  ⚠️ 这几件**不给插件面**（`faces` 里没有 `plugin`）——
 *  插件能列出、装上、卸掉别的插件的话，一个恶意插件可以先把杀毒的那个卸了。
 */
defineCap({
  name: "list_plugins", title: "列出装了哪些插件", scope: "global",
  summary: "列出本机装的插件：id、名字、版本、认领哪些格式、要了什么权限。清单有毛病的也列出来并说清为什么 —— 静静不显示的话，用户只会看到「我装的插件不见了」。",
  input: {},
  faces: ["mcp", "http"],
  http: { route: "plugins", method: "GET" },
  run: async () => {
    const list = await listInstalled();
    /* **装了 ≠ 能用**（M11-12）：每一个都带上「现在还有效吗」。
       ⚠️ 这一项以前根本不存在 —— 验签只管「装的时候是不是我们签的」。
       「过期」是会真实出现的态：限时免费到期那天所有试用用户同时看到它。 */
    const ents = await Promise.all(list.map((p) => entitlementOf(p.manifest.id, { bundled: p.bundled })));
    const entOf = (id: string): Entitlement | undefined => ents.find((e) => e.plugin === id);
    return envelope({
      hostApi: HOST_API_MAJOR,
      /** 插件能调的宿主能力 —— 装插件时摆给用户看 */
      allowedCaps: allowedCapNames(),
      /** 系统时间被调回去过（单调高水位发现的）。界面要提一句 —— 
       *  不提的话「为什么我的插件突然过期了」没人答得上来 */
      clockRolledBack: ents.some((e) => e.rolledBack),
      plugins: list.map((p) => ({
        id: p.manifest.id, name: p.manifest.name, version: p.manifest.version,
        surfaces: p.manifest.surfaces, kinds: (p.manifest.kinds ?? []).map((k) => k.id), bundled: p.bundled,
        permissions: p.manifest.permissions, unsigned: p.unsigned, ok: p.problems.length === 0, problems: p.problems,
        /* 授权态四样：能不能用 · 到什么时候 · 一句给人看的话 */
        entitlement: entOf(p.manifest.id)?.state ?? "unlicensed",
        until: entOf(p.manifest.id)?.until ?? null,
        entitlementNote: entOf(p.manifest.id)?.note ?? "",
      })),
    }, [], { count: list.length, licensed: ents.filter((e) => e.state === "builtin" || e.state === "active").length });
  },
});

defineCap({
  name: "uninstall_plugin", title: "卸载一个插件", scope: "global",
  summary: "删掉插件自己的目录。**插件改过的文件不动** —— 那是用户的东西。卸载后那种格式退回通用文件卡，不是打不开。",
  input: { id: z.string() },
  faces: ["mcp", "http"],
  http: { route: "plugin_uninstall", method: "POST" },
  run: async ({ id }) => {
    /* 内置插件卸不掉。**在这里挡，不在删的时候挡** —— 到了删那一步再报错，
       用户已经点过「确定卸载」了，体验上是「点了没反应」。 */
    const found = (await listInstalled()).find((x) => x.manifest.id === id);
    if (found?.bundled) {
      return envelope({ id, removed: false }, [{ level: "error", code: "E_PLUGIN_BUNDLED",
        message: `${id} 是内置插件，跟主程序一起发的，卸不掉`,
        where: "(plugin)", at: { kind: "key", name: id }, fix: "内置插件免费且always在；要停用某种格式的编辑，用格式设置" } as never]);
    }
    const gone = await uninstall(id);
    if (gone) { await registerPluginKinds(); notify("uninstalled", id); }
    return envelope({ id, removed: gone }, [], {});
  },
});

defineCap({
  name: "plugin_call", title: "代插件调一件宿主能力", scope: "project",
  summary: [
    "插件的 UI 面（A 面）关在不透明源的 iframe 里，CSP 把网络全禁了，",
    "所以它要读写文件只能 postMessage 给前端，前端再走这一条。",
    "⚠️ **权限按那个插件的清单核，不是按调用方的令牌核** ——",
    "前端有完整 API 权限，插件没有；借着前端的手越权正是这条路要防的事。",
  ].join("\n"),
  input: { plugin: z.string(), cap: z.string(), input: z.unknown().optional() },
  /* **不给插件面** —— 插件能代别的插件调，等于权限清单形同虚设 */
  faces: ["http"],
  http: { route: "plugin_call", method: "POST" },
  run: async ({ plugin, cap, input }, c) => {
    const found = (await listInstalled()).find((x) => x.manifest.id === plugin);
    if (!found) return envelope(null, [{ level: "error", code: "E_PLUGIN_NOT_FOUND", message: `没装插件 ${plugin}`, where: "(plugin)", at: { kind: "key", name: plugin } } as never]);
    if (found.problems.length) {
      return envelope(null, [{ level: "error", code: "E_PLUGIN_BAD", message: `插件 ${plugin} 的清单有毛病，不给它调：${found.problems[0]!.field} ${found.problems[0]!.why}`, where: "(plugin)", at: { kind: "key", name: plugin } } as never]);
    }
    return hostCall({ manifest: found.manifest, project: c.project! }, cap, input ?? {});
  },
});

defineCap({
  name: "plugin_manifest", title: "读一个插件的完整清单", scope: "global",
  summary: "前端接线要清单里的细节（认哪些扩展名、UI 入口在哪），`list_plugins` 给的是摘要。",
  input: { id: z.string() },
  faces: ["mcp", "http"],
  http: { route: "plugin_manifest", method: "GET" },
  run: async ({ id }) => {
    const found = (await listInstalled()).find((x) => x.manifest.id === id);
    if (!found) return envelope(null, [{ level: "error", code: "E_PLUGIN_NOT_FOUND", message: `没装插件 ${id}`, where: "(plugin)", at: { kind: "key", name: id } } as never]);
    return envelope({ manifest: found.manifest, problems: found.problems });
  },
});

/** 装完 / 切版本 / 卸完都要让前端**重新接线** —— 类型表、模块表、面板标题都得跟着变。
 *  不发这个事件的话，用户点完「安装」得刷新页面才看得见（M11-10 就是这条）。 */
const notify = (what: string, id: string) => emit("plugin", null, { what, id });

defineCap({
  name: "install_plugin", title: "装一个插件", scope: "global",
  summary: [
    "从一个 `.umbraplugin` 文件装。顺序：解包 → 验签 → 校验清单 → 查路径逃逸 → 落盘。",
    "**任何一步失败都不落一个字节** —— 半装的插件比没装还糟（类型认得、模块不全，界面落到文件卡上，看着像没装）。",
    "装完立刻生效，**不用重启**。",
  ].join("\n"),
  input: { file: z.string().describe(".umbraplugin 文件的绝对路径") },
  /* **不给插件面**：插件能装插件的话，一个恶意插件可以自己装个后门 */
  faces: ["mcp", "http"],
  http: { route: "plugin_install", method: "POST" },
  run: async ({ file }) => {
    const r = await installFromFile(file);
    notify("installed", r.id);
    return envelope(r, r.unsigned
      ? [{ level: "warning", code: "W_PLUGIN_UNSIGNED", message: `${r.id} 是**未签名**的插件（开发模式放行）`,
          where: "(plugin)", at: { kind: "key", name: r.id },
          fix: "正式发布的插件都带签名；未签名的只应出现在开发机上" } as never]
      : []);
  },
});

defineCap({
  name: "set_license", title: "放一份许可证进来", scope: "global",
  summary: [
    "把服务端签好的许可证写到本机。**本地验签，全程不联网** —— 用户要求离线可用。",
    "⚠️ 验不过就**不落盘**：一份存着但验不过的许可证只会让「为什么我买了却不能用」更难查。",
  ].join("\n"),
  input: { text: z.string().describe("许可证原文：{ payload, signature }") },
  faces: ["mcp", "http"],
  http: { route: "license_set", method: "POST" },
  run: async ({ text }) => {
    const r = verifyLicenseText(text);
    if (!r.ok) {
      return envelope({ ok: false }, [{ level: "error", code: "E_LICENSE_BAD",
        message: `许可证验不过：${r.why ?? "未知原因"}`, where: "(license)", at: { kind: "key", name: "license" },
        fix: "重新登录账号取一份新的许可证" } as never]);
    }
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { STATE_ROOT } = await import("../project.js");
    await mkdir(join(STATE_ROOT, ".umbrastudio"), { recursive: true });
    await writeFile(join(STATE_ROOT, ".umbrastudio", "license.json"), text, "utf8");
    return envelope({ ok: true, sub: r.license!.sub, grants: r.license!.grants.length });
  },
});

defineCap({
  name: "plugin_entitlement", title: "这个插件现在能不能用", scope: "global",
  summary: [
    "**装了 ≠ 能用**：验签管的是装的时候，这一件管的是用的时候。",
    "六种态：builtin（内置，永远能用）· active · expired · not-yet · unlicensed · bad-license。",
    "⚠️ 每一种都带一句给人看的话，而且**每一种都有出路** —— 只说「不可用」等于什么都没说。",
  ].join("\n"),
  input: { id: z.string() },
  faces: ["mcp", "http"],
  http: { route: "plugin_entitlement", method: "GET" },
  run: async ({ id }) => {
    const found = (await listInstalled()).find((x) => x.manifest.id === id);
    return envelope(await entitlementOf(id, { bundled: found?.bundled }));
  },
});

defineCap({
  name: "list_plugin_versions", title: "一个插件装了哪几版", scope: "global",
  summary: "版本各占一个目录，**切换只改指针**，所以回退很便宜。只留最近两版。",
  input: { id: z.string() },
  faces: ["mcp", "http"],
  http: { route: "plugin_versions", method: "GET" },
  run: async ({ id }) => envelope(await pluginVersions(id)),
});

defineCap({
  name: "switch_plugin_version", title: "切到插件的某一版（回退）", scope: "global",
  summary: "**只改指针，不动文件**。更新之后发现不对，切回上一版就行。",
  input: { id: z.string(), version: z.string() },
  faces: ["mcp", "http"],
  http: { route: "plugin_switch", method: "POST" },
  run: async ({ id, version }) => {
    const r = await switchVersion(id, version);
    notify("switched", r.id);
    return envelope(r);
  },
});
