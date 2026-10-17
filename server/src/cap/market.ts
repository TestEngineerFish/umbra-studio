import { z } from "zod";
import { envelope } from "../envelope.js";
import { KIND_OF_EXT, readCatalogDetailed, whoHandles } from "../plugin/catalog.js";
import { account } from "../account.js";
import { memberPrice } from "../plugin/acquire.js";
import { listInstalled } from "../plugin/store.js";
import { pluginVersions } from "../plugin/install.js";
import { defineCap } from "./registry.js";

/** 插件市场（M11-6 接线，形制按 `ui/S17-插件市场.dc.html`）。
 *
 *  ⚠️ **买和付这一层还没有**（账号 / 支付 / 积分都等产品）。
 *  这里给的是「有什么可装 + 本机装了什么」，够把市场和已装两屏接成真的；
 *  价格与余额前端会接成**明确的未启用态**，不做成看起来能用但点了没反应。
 */
defineCap({
  name: "list_market", title: "市场里有什么插件", scope: "global",
  summary: [
    "目录 + 本机状态一次给全：每个插件带 `state`（`builtin` / `installed` / `bought` / `none`）、`gift`（随会员赠送）、`member_price`（登录且会员档有折扣时的实扣，草案 §3.3）；回包带 `source`（server / cache / bundled）。",
    "⚠️ **权限的权威出处是包里的 manifest**，目录里那份只是装之前给用户看的。",
  ].join("\n"),
  input: {},
  faces: ["mcp", "http"],
  http: { route: "market", method: "GET" },
  run: async () => {
    /* 每次打开商城都当场问服务端（`fresh`）：商品以后台上架为准，刚上 / 下架的不能等 memo 过期 */
    const { entries: catalog, source } = await readCatalogDetailed({ fresh: true });
    /* 登录着就问一次「我这档会员送哪些插件」（后台配的）；失败当没有 —— 标不标赠送不该让市场打不开 */
    const perks = await account.perks();
    const gift = new Set(perks.gift);
    /* 本机没有许可证、或许可证不是当前账号的 → 静默取一次（换机器 / 重新登录后买过的插件要能找回来） */
    try { await account.syncLicense(); } catch { /* 静默 */ }
    const installed = await listInstalled();
    const byId = new Map(installed.map((x) => [x.manifest.id, x]));
    const rows = await Promise.all(catalog.map(async (c) => {
      const got = byId.get(c.id);
      const vs = got && !got.bundled ? await pluginVersions(c.id) : { versions: [], current: null };
      return {
        ...c,
        kinds: [...new Set(c.formats.map((f) => KIND_OF_EXT[f.toLowerCase()]).filter(Boolean))],
        /* ⚠️ `bought` 这一态**现在永远不会出现** —— 没有账号就没有「买过」这回事。
           留着是因为它是设计稿里的四态之一，接线时前端要认得它；
           等账号做好了这里改一行就有了。**不把它删掉**，删了将来会忘。 */
        state: got?.bundled ? "builtin" : got ? "installed" : "none",
        installedVersion: got?.bundled ? c.version : vs.current,
        /* 装着的版本比目录里的旧 = 有新版本 */
        hasUpdate: !!got && !got.bundled && !!vs.current && vs.current !== c.version,
        unsigned: !!got && got.unsigned,
        /* 随当前会员赠送（服务端 `/membership.gift_plugins`）：前端价格那格画「随会员」 */
        gift: gift.has(c.id),
        /* 会员价：登录且档位有折扣、且这个插件要花积分买时才有（目录接口不认人，这里按 `/membership.discount_pct` 算；
           真扣多少以买的回包 `charged` 为准）。赠送 / 内置 / 免费的没有这一格 */
        member_price: perks.discountPct < 100 && c.price > 0 && !c.builtin && !gift.has(c.id) ? memberPrice(c.price, perks.discountPct) : undefined,
      };
    }));
    /* `source`：目录来自服务端 / 上次的缓存 / 出厂清单 —— 后两种前端提示一句「可能不是最新」 */
    return envelope({ plugins: rows, kinds: [...new Set(rows.flatMap((r) => r.kinds))], source }, [], { count: rows.length });
  },
});

defineCap({
  name: "who_handles", title: "有没有插件能编辑这种文件", scope: "global",
  summary: [
    "按扩展名问市场。**✎ 那颗钮要问它** —— 用户定的模型是：",
    "文件预览页右上角永远显示编辑图标，装了且在有效期内就直接编辑，否则引导去市场。",
    "所以「市场里有没有」和「本机装没装」是两个问题，这件答前一个。",
  ].join("\n"),
  input: { ext: z.string().describe("带点的小写扩展名，如 .mp4") },
  faces: ["mcp", "http"],
  http: { route: "who_handles", method: "GET" },
  run: async ({ ext }) => {
    const hits = await whoHandles(ext);
    return envelope({ ext, plugins: hits.map((c) => ({ id: c.id, name: c.name, price: c.price })) }, [], { count: hits.length });
  },
});
