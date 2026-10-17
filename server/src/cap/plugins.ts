import { z } from "zod";
import { envelope } from "../envelope.js";
import { allowedCapNames } from "../plugin/host.js";
import { HOST_API_MAJOR } from "../plugin/manifest.js";
import { hostCall } from "../plugin/host.js";
import { listInstalled, registerPluginKinds, uninstall } from "../plugin/store.js";
import { entitlementOf, loadLicense, saveLicenseText, type Entitlement } from "../plugin/license.js";
import { installFromFile, pluginVersions, switchVersion } from "../plugin/install.js";
import { compareVersion } from "../plugin/version.js";
import { buyStep, installFromUrl, licenseGrants, planAcquire, type PackageFetch } from "../plugin/acquire.js";
import { readCatalogDetailed } from "../plugin/catalog.js";
import { account } from "../account.js";
import { emit } from "../events.js";
import { allCaps, defineCap } from "./registry.js";
import { allVerbs, sandboxFailures } from "../plugin/verbs.js";

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
        /* 内置插件升过级（S4 §3）：界面把「卸载」换成「退回出厂版本 factoryVersion」 */
        upgraded: !!p.upgraded, factoryVersion: p.factoryVersion ?? null,
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
  summary: "删掉插件自己的目录。**插件改过的文件不动** —— 那是用户的东西。卸载后那种格式退回通用文件卡，不是打不开。内置插件卸不掉；**升过级的内置插件**「卸载」= 退回出厂版本（回包 `reverted: true`）。",
  input: { id: z.string() },
  faces: ["mcp", "http"],
  http: { route: "plugin_uninstall", method: "POST" },
  run: async ({ id }) => {
    /* 内置插件卸不掉。**在这里挡，不在删的时候挡** —— 到了删那一步再报错，
       用户已经点过「确定卸载」了，体验上是「点了没反应」。 */
    const found = (await listInstalled()).find((x) => x.manifest.id === id);
    /* 内置插件升过级（S4 §3）：「卸载」= 删掉 STATE_ROOT 里升级装的那份、**退回出厂版本**。
       出厂那份永远在 TOOL_ROOT，退回不会让这种格式变得打不开。 */
    if (found?.bundled && found.upgraded) {
      const gone = await uninstall(id);
      if (gone) { await registerPluginKinds(); notify("reverted", id); }
      return envelope({ id, removed: gone, reverted: gone, version: found.factoryVersion ?? null }, [], {});
    }
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
    const r = await saveLicenseText(text);
    /* 许可证变了 = 动词表变了（`plugin/verbs.ts` 订阅这条事件）：买完 / 续完不用重启，模型的工具表当场长出来 */
    if (r.ok) notify("license", "*");
    if (!r.ok) {
      return envelope({ ok: false }, [{ level: "error", code: "E_LICENSE_BAD",
        message: `许可证验不过：${r.why ?? "未知原因"}`, where: "(license)", at: { kind: "key", name: "license" },
        fix: "重新登录账号取一份新的许可证" } as never]);
    }
    return envelope({ ok: true, sub: r.license!.sub, grants: r.license!.grants.length });
  },
});

defineCap({
  name: "fetch_license", title: "向服务端取回这个账号的许可证", scope: "global",
  summary: "登录着就 `GET /plugins/license`，验签过了落盘（同 set_license 那条）。买过 / 会员赠送的授权都在这一份里；重新登录或换机器后用它取回。",
  input: {},
  faces: ["http"],
  http: { route: "license_fetch", method: "POST" },
  run: async () => {
    const r = await account.fetchLicense();
    if (r.ok) notify("license", "*");
    return r.ok ? envelope({ ok: true, grants: r.grants.length })
      : envelope({ ok: false, grants: 0 }, [{ level: "error", code: "E_LICENSE_FETCH", message: r.why, where: "(license)", at: { kind: "key", name: "license" } } as never]);
  },
});

/** 注入点：测试里换成假 fetch。正式跑用全局 fetch。 */
export let packageFetch: PackageFetch = (u, i) => fetch(u, i) as unknown as ReturnType<PackageFetch>;
export function setPackageFetch(f: PackageFetch): void { packageFetch = f; }

const pluginErr = (code: string, message: string, id: string, fix?: string) =>
  ({ level: "error", code, message, where: "(plugin)", at: { kind: "key", name: id }, fix }) as never;

defineCap({
  name: "install_plugin_from_url", title: "从网址装一个插件", scope: "global",
  summary: [
    "下载 `.umbraplugin`（**只认 https**，上限 50 MB、30 秒超时）到临时文件 → 走 install_plugin 同一条路（解包 → 验签 → 校验 → 落盘）→ 删临时文件。",
    "任何一步失败都不落一个字节。",
  ].join("\n"),
  input: { url: z.string().describe("https 的 .umbraplugin 下载地址") },
  faces: ["http"],
  http: { route: "plugin_install_url", method: "POST" },
  run: async ({ url }) => {
    try {
      const r = await installFromUrl(url, packageFetch);
      notify("installed", r.id);
      return envelope(r, r.unsigned ? [{ level: "warning", code: "W_PLUGIN_UNSIGNED", message: `${r.id} 是**未签名**的插件（开发模式放行）`, where: "(plugin)", at: { kind: "key", name: r.id } } as never] : []);
    } catch (e) {
      return envelope(null, [pluginErr("E_PLUGIN_INSTALL", (e as Error).message, url)]);
    }
  },
});

/** 一场 acquire 每一步的结果，**全部回给前端** —— 「买了但没装上」和「没买成」是两种完全不同的下一步。 */
export interface AcquireResult {
  id: string;
  bought: boolean | null;      // null = 这一步没走（已有授权 / 赠送 / 免费）
  already: boolean;
  licensed: boolean;
  installed: boolean;
  version: string | null;
  note: string;
  /** 这次真扣了多少积分 / 会员折掉多少（买的回包里的；没买这步就没有） */
  charged?: number;
  discount?: number;
}

defineCap({
  name: "acquire_plugin", title: "买下 / 领取并装上一个插件", scope: "global",
  summary: [
    "市场里那颗「购买并安装 / 安装 · 随会员免费」按钮背后的整条路：已有授权就跳过购买 → 否则用积分买（`POST /plugins/{id}/buy`）",
    "→ 取许可证（`GET /plugins/license`）→ 目录里有 `package_url` 就装，没有就回 `{licensed: true, installed: false}` 并说明「发布方还没放安装包」。",
    "每一步的结果都回：买了没装上和没买成是两种下一步。",
  ].join("\n"),
  input: { id: z.string().describe("插件 id，如 com.umbra.video") },
  faces: ["http"],
  http: { route: "plugin_acquire", method: "POST" },
  run: async ({ id }) => {
    const { entries } = await readCatalogDetailed();
    const c = entries.find((x) => x.id === id);
    if (!c) return envelope(null, [pluginErr("E_PLUGIN_NOT_FOUND", `市场里没有 ${id}`, id)]);
    const found = (await listInstalled()).find((x) => x.manifest.id === id);
    const st = await account.status();
    const perks = await account.perks();
    const gift = perks.gift.includes(id);
    const ent = await entitlementOf(id, { bundled: found?.bundled });
    /* 内置插件：目录里的版本比本机正在用的高 = 可更新（S4 §3），走「从 URL 装」那一步，不买不取许可证 */
    const builtin = !!c.builtin || !!found?.bundled;
    const update = builtin && !!found && compareVersion(c.version, found.manifest.version) > 0;
    const plan = planAcquire({ signedIn: st.signedIn, builtin, update, installed: !!found, entitled: ent.state === "active",
      gift, price: c.price, packageUrl: c.package_url });
    const out: AcquireResult = { id, bought: null, already: false, licensed: ent.state === "active", installed: !!found, version: found ? (found.manifest.version ?? null) : null, note: "" };
    if (plan.refuse) {
      const code = st.signedIn ? "E_PLUGIN_ACQUIRE" : "E_ACCOUNT_LOGIN";
      return envelope(out, [pluginErr(code, plan.refuse, id, st.signedIn ? undefined : "在设置里登录 Umbra 账号")]);
    }
    /* ⚠️ 买之前先取一次许可证（issue #145）：会员赠送的插件服务端会并进许可证，已有授权就不该买。
       会员信息这次没问到的话分不清是不是赠送 —— 宁可这次不买，也不按价扣积分。 */
    let step: "buy" | "skip" | "refuse" = "skip";
    if (plan.buy) {
      const pre = await account.fetchLicense();
      const grantedNow = pre.ok && licenseGrants((await loadLicense())?.license, id);
      step = buyStep({ planBuy: true, perksOk: perks.ok, grantedNow });
      if (grantedNow) out.licensed = true;
    }
    if (step === "refuse") {
      return envelope(out, [pluginErr("E_PLUGIN_ACQUIRE", "没问到会员信息，为免误扣积分这次不买", id, "稍后在市场里再点一次")]);
    }
    if (step === "buy") {
      try {
        const b = await account.buyPlugin(id);
        out.bought = true; out.already = b.already;
        if (!b.already) { out.charged = b.charged; out.discount = b.discount; }
      } catch (e) {
        return envelope(out, [pluginErr("E_PLUGIN_BUY", (e as Error).message, id)]);
      }
    }
    if (plan.license) {
      const r = await account.fetchLicense();
      if (!r.ok) return envelope(out, [pluginErr("E_LICENSE_FETCH", out.bought ? `已购买，但许可证没取到：${r.why}` : r.why, id, "稍后在市场里再点一次「安装」，或重新登录")]);
      const lic = await loadLicense();
      out.licensed = licenseGrants(lic?.license, id);
      if (!out.licensed) {
        return envelope(out, [pluginErr("E_LICENSE_NO_GRANT", gift ? "许可证里没有这个插件的会员赠送授权 —— 会员可能已到期，或后台把它从赠送清单移走了" : "许可证里没有这个插件的授权（服务端没记上这笔购买？）", id, "联系发布方核对订单")]);
      }
    }
    /* 会员价扣过的要让人看见（草案 §3.3「账本记原价 · 折扣 · 实扣」，这里是给人看的那一句） */
    const paid = out.discount && out.discount > 0 ? `已按会员价扣 ${out.charged ?? 0} 积分（省 ${out.discount}）。` : "";
    if (!plan.install) {
      out.note = paid + (found ? "已经装着了，这次只补了授权" : "已授权，但发布方还没放安装包 —— 放上后在市场里点「安装」即可");
      return envelope(out);
    }
    try {
      const r = await installFromUrl(c.package_url!, packageFetch);
      notify("installed", r.id);
      out.installed = true; out.version = r.version;
      out.note = paid + (update ? `内置插件已升级到 ${r.version}${r.unsigned ? "（未签名，开发模式放行）" : ""}，立刻生效；不想要了可以在「已装」里退回出厂版本` : r.unsigned ? "装好了（未签名，开发模式放行）" : "装好了，立刻生效");
      return envelope(out);
    } catch (e) {
      return envelope(out, [pluginErr("E_PLUGIN_INSTALL", `已授权，但安装没成功：${(e as Error).message}`, id, "在市场里再点一次「安装」")]);
    }
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

defineCap({
  name: "plugin_verbs", title: "插件现在能给模型哪些动词", scope: "global",
  summary: [
    "列出装着的插件声明的全部动词（B 面 `tools.mjs` 里 `defineCap` 的那些），每件带对外工具名、插件、授权态、是否免费、此刻挂没挂出去。",
    "`exposed: false` 的是**没授权且不免费**的 —— 模型的工具表里看不到它（`doc/22` §3.3）。沙箱起不来的插件列在 `failures`。",
  ].join("\n"),
  input: {},
  faces: ["mcp", "http"],
  http: { route: "plugin_verbs", method: "GET" },
  run: async () => {
    const verbs = await allVerbs();
    return envelope({ verbs, failures: sandboxFailures() }, [], { count: verbs.length, exposed: verbs.filter((v) => v.exposed).length });
  },
});

defineCap({
  name: "list_capabilities", title: "现在能调的全部能力", scope: "global",
  summary: [
    "一件回全表：核心能力（名字、标题、作用域、暴露到哪些面）+ 插件动词（带插件、授权态、此刻挂没挂出）+ 起不来的沙箱。",
    "秘书上报能力目录用它；人查「为什么这件能力没了」也看它。核心能力固定，动词随装了什么与授权变。",
  ].join("\n"),
  input: {},
  faces: ["mcp", "http"],
  http: { route: "capabilities", method: "GET" },
  run: async () => {
    const verbs = await allVerbs();
    const core = allCaps().map((c) => ({ name: c.name, title: c.title, scope: c.scope, faces: c.faces ?? ["mcp", "http"], source: "core" as const }));
    return envelope({ core, verbs, failures: sandboxFailures() }, [], { core: core.length, verbs: verbs.length, exposed: verbs.filter((v) => v.exposed).length });
  },
});
