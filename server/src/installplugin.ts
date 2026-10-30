/** 从一个 `.umbraplugin` 文件装插件 —— **命令行入口**。
 *
 *  用法：`node server/dist/installplugin.js <包的绝对路径>`
 *       （`npm --prefix server run installplugin -- <路径>` 等价）
 *
 *  ⚠️ **为什么要有它**：界面里**没有「从文件安装」的入口** —— 装插件的正路是市场
 *  （`doc/20`：下载 → 验签 → 装），而**还没上架**的插件在开发机 / 演示机上只能从文件装。
 *  原来唯一的办法是「在接了 Studio MCP 的会话里让模型调 `install_plugin`」，
 *  那要求演示机上先有一个接着 MCP 的模型客户端 —— 为了装一个包而先搭一条链路。
 *
 *  ⚠️ **它不是第二条安装路**：这里一行安装逻辑都没有，调的就是 `install_plugin`
 *  那件能力本身（解包 → 验签 → 校验清单 → 查路径逃逸 → 落盘，任何一步失败不落一个字节）。
 *  > **一个新入口和一条新路径的差别，在于它有没有自己的那份判断。**
 *
 *  ⚠️ 未签名的包要 `UMBRASTUDIO_PLUGIN_DEV=1` 才放行（`plugin/pack.ts`）。
 *  这个文件**刻意不自己设那个变量** —— 放行未签名包是调用方的决定；
 *  默认就放行的话，「开发模式」这个开关在这条路上等于不存在。
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { STATE_ROOT } from "./project.js";

await import("./cap/index.js");                       // 把能力注册进来
const { allCaps } = await import("./cap/registry.js");

const arg = process.argv[2] ?? "";
if (!arg || arg === "--help" || arg === "-h") {
  console.error("用法：node server/dist/installplugin.js <包的绝对路径>");
  console.error("      未签名的开发包要带 UMBRASTUDIO_PLUGIN_DEV=1");
  process.exit(2);
}
const file = resolve(arg);
if (!existsSync(file)) {
  console.error(`✗ 找不到这个文件：${file}`);
  process.exit(2);
}

const cap = allCaps().find((c) => c.name === "install_plugin");
if (!cap) { console.error("✗ 能力表里没有 install_plugin（核心没编译完整？）"); process.exit(1); }

/* `via` 这三个门面（mcp / http / plugin）都不是「命令行」—— 而 `install_plugin`
   不读它（它不写 changelog，没有「谁改的」这一问）。取 `mcp` 的理由只有一条：
   命令行和外部模型客户端是同一类「不在界面里」的调用者。 */
type Env = { ok: boolean; data: { id: string; version: string; previous: string | null; unsigned: boolean; kinds: string[]; note?: string } | null; errors?: Array<{ code?: string; message: string; fix?: string }>; warnings?: Array<{ message: string }> };
/* ⚠️⚠️ **这个 try 不是防御性编程，是补一层本来就存在的东西。**
   `installFromFile` 对「没签名」「不是合法包」这一类是 `throw new Error(...)`，
   而装进信封的那一步住在**门面**里（`index.ts` 的 MCP 包装 / `api.ts` 的 HTTP 包装）——
   命令行是第四个调用方，它不经那两层。实测没补之前：不带 `UMBRASTUDIO_PLUGIN_DEV=1`
   跑一次，打出来的是一段 **Node 栈**，而那句写得很清楚的「这个包没有签名，拒绝安装」
   被埋在第三行。
   > **一件能力的错误处理有一半住在门面里 —— 新开一个调用方才会发现那一半。** */
let r: Env;
try {
  r = await cap.run({ file } as never, { project: null, via: "mcp" } as never) as Env;
} catch (e) {
  const d = (e as { diagnostic?: { message: string; fix?: string } }).diagnostic;
  console.error(`✗ ${d?.message ?? (e as Error).message}`);
  if (d?.fix) console.error(`  → ${d.fix}`);
  if (!process.env.UMBRASTUDIO_PLUGIN_DEV) console.error("  → 未签名的开发包要带 UMBRASTUDIO_PLUGIN_DEV=1");
  process.exit(1);
}

if (!r.ok || !r.data) {
  for (const e of r.errors ?? []) console.error(`✗ ${e.message}${e.fix ? `\n  → ${e.fix}` : ""}`);
  if (!(r.errors ?? []).length) console.error("✗ 装不上，而且一条诊断都没有 —— 这本身是个缺陷，请报出来");
  process.exit(1);
}
const d = r.data;
console.log(`✓ ${d.id} ${d.version}${d.previous ? `（上一版 ${d.previous}）` : "（首次安装）"}${d.unsigned ? " · 未签名，开发模式放行" : ""}`);
console.log(`  认领的类型：${d.kinds.length ? d.kinds.join(" ") : "（没有）"}`);
console.log(`  落在 ${STATE_ROOT}/.umbrastudio/plugins/${d.id}/${d.version}`);
