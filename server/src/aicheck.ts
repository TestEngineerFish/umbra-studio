/** **离线**体检：这台机器上的缺省通道现在能不能跑一轮对话。
 *
 *  用法：`node server/dist/aicheck.js`（不带参数；读的是 `STATE_ROOT/.umbrastudio/ai_config.json`）
 *
 *  ⚠️ **一条网络请求都不发**，所以它答得了的只有「配置这一层立不立得住」——
 *  端点通不通、密钥有没有过期，要 `probe_image_support` 那种真打一次的东西才知道。
 *  这条线划在这里的理由：**演示前要知道的是「有没有少配一步」，而不是「服务端今天好不好」**。
 *
 *  ⚠️⚠️ **判断不在这个文件里。** 「能不能用」问的就是 `getOpenAiChannel()` ——
 *  会话真跑起来时走的是同一个函数，连拒绝的那句话都是同一句。
 *  自己在这里写一遍「useAccount 为真就要查登录」的话，这个体检和界面会分叉，
 *  而**分叉的那一天它会说「没问题」**。
 *  > **一个体检，要用被检的那段代码自己的判断。**
 */
import { engineView, getAiConfig, getOpenAiChannel, type AiConfig } from "./ai_config.js";

const cfg: AiConfig = await getAiConfig();
const ch = (cfg.defaultChannel ?? "a") as "a" | "b" | "c";
const view = engineView(cfg, ch, cfg.channelB?.cli);
const name = { a: "A", b: "B", c: "C" }[ch];

if (ch === "b") {
  /* 通道 B 是本机 CLI 子进程，走**它自己的登录态** —— 盘上的配置里没有能用来判断
     「登没登」的东西（那是 `~/.claude` 那一类）。照实说，不猜。 */
  console.log(`模型：缺省通道 ${name} · 本机 ${cfg.channelB?.cli ?? "claude"}（${view.billing}），模型 ${cfg.channelB?.model || "（没填）"}`);
  console.log(`  ⚠️ 它用的是那个 CLI 自己的登录态，这个体检验不到 —— 演示前在会话里发一句试试`);
} else {
  try {
    const c = await getOpenAiChannel(ch);
    const host = (() => { try { return new URL(c.baseUrl).host; } catch { return c.baseUrl; } })();
    console.log(`模型：缺省通道 ${name} · ${view.engine}（${view.billing}） → ${host} · ${c.model}${c.apiKey ? "" : " · ⚠️ 没有密钥"}`);
  } catch (e) {
    /* 这句话就是用户在会话里会看到的那一句 —— 原样打出来，不改写 */
    console.log(`⚠️ 模型：缺省通道 ${name} 现在跑不起来 —— ${(e as Error).message}`);
    console.log(`  → 出路（设置里做，一次就够）：`);
    if (cfg.channelA?.useAccount && ch === "a") {
      console.log(`     ① 设置 → 账号：登录（之后通道 A 走服务端，扣会员额度）`);
      console.log(`     ② 设置 → 账号：关掉「用服务端 AI」${cfg.channelA?.baseUrl ? `（通道 A 回到你自填的 ${(() => { try { return new URL(cfg.channelA!.baseUrl).host; } catch { return cfg.channelA!.baseUrl; } })()}，密钥${cfg.channelA?.apiKey ? "已经在配置里" : "还要填"}）` : ""}`);
    }
    const alt = (["c", "b", "a"] as const).find((x) => x !== ch && (x === "b" ? !!cfg.channelB : !!cfg[x === "a" ? "channelA" : "channelC"]));
    if (alt) console.log(`     ③ 会话框的引擎选择器里换一条：通道 ${{ a: "A", b: "B", c: "C" }[alt]} · ${engineView(cfg, alt, cfg.channelB?.cli).engine}`);
  }
}
