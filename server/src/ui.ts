/** 给**人**用的入口：起本地服务 + 生成入口页 + 打开浏览器。
 *
 *  为什么要单独有它：`serve_start` 与 `build_index` 本来只暴露成 MCP 工具，
 *  于是「我想自己看看稿」这件事要先找一个大模型来调一次 —— 而界面
 *  （S1–S5、S7）早就是给人用的。这条命令把模型从人的路径上摘出去。
 *
 *  用法：
 *      npm --prefix server run ui               # 只有一个项目时直接起它
 *      npm --prefix server run ui -- <项目名>
 *      npm --prefix server run ui -- <项目名> --port 4173 --no-open
 *
 *  起来之后停在前台：回车重跑索引（改完稿用），Ctrl-C 退出。
 */
import { spawn } from "node:child_process";
import { buildProject, listProjectDirs, loadProject, projectsRoot, type Project } from "./project.js";
import { serveHold, serveStart } from "./serve.js";
import { studioName } from "./shared/brand.js";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) =>
  !a.startsWith("-") && argv[i - 1] !== "--port");

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const b = (s: string) => `\x1b[1m${s}\x1b[0m`;

/** 项目：给了名字就用它；没给且只有一个就用那一个；多个就列出来让人选。 */
async function pick(): Promise<Project> {
  if (positional[0]) return await loadProject(positional[0] as string);
  const dirs = await listProjectDirs();
  if (!dirs.length) {
    console.error(`${projectsRoot()} 下没有设计项目。`);
    console.error("新建一个目录，放一个 project.json 和 .dc.html 稿进去（见 README §5）。");
    process.exit(1);
  }
  if (dirs.length === 1) return await buildProject(dirs[0] as string);
  console.error("有多个项目，说清是哪一个：");
  for (const d of dirs) console.error("  " + (d.split(/[\\/]/).pop() ?? d));
  console.error("\n  npm --prefix server run ui -- <项目名>");
  process.exit(1);
}

function openInBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // 打不开浏览器不是错 —— 地址已经印在屏上了
  }
}

const p = await pick();
const serve = await serveStart(p, opt("--port") ? Number(opt("--port")) : undefined);
/* ⚠️⚠️ **这里原来 `await buildIndex(p, serve.url)`** —— 生成索引页、部署预览壳与运行时副本。
   C3（M16-7c）删掉设计稿那一整套之后它没有对象了，而**顺带解决了一件更要紧的事**：
   `npm run ui` 过去**一起服务就往用户的项目里写十几个文件**，
   而这个命令的用处只是「起服务 + 打开浏览器给人看」。
   > **一个「只是让我看一眼」的命令不该改我的目录。** */
// serve.ts 对静态服务做了 unref（MCP 不该被它挡住退出）——
// 前台用法里它就是唯一的存活理由，必须 ref 回来，否则打印完地址就退了。
serveHold(p.dir);   // issue #20

/* ⚠️ 地址里带上令牌（`11` Q42 的 (c)，用户 2026-09-28 定）。
   `/__app/` 不再无条件把令牌注进页面 —— 不带这个参数打开会看到「要从 Umbra Studio
   或带令牌的链接打开」。下面本来就会自动开浏览器，所以用户无感；
   代价只是「手敲 127.0.0.1:端口/__app/」不再直接可用，那正是这条要堵的口子。 */
const entry = `${serve.url}__app/?token=${encodeURIComponent(serve.token)}`;
console.log("");
console.log(`  ${b(studioName)}  ${p.title}`);
console.log(`  项目    ${p.dir}`);
console.log("");
console.log(`  ${b("打开 " + entry)}`);
console.log("");
console.log(dim("  首页是项目列表，进项目是左目录 / 中详情 / 右会话。没 build 过前端会提示去 npm --prefix app run build。"));
console.log("");
console.log(dim("  Ctrl-C = 退出"));
console.log("");

if (!flag("--no-open")) openInBrowser(entry);

/* ⚠️ **「回车 = 重跑索引」这一段 C3（M16-7c）删了。**
   它存在的理由是「索引是一次性扫目录的，之后改稿它不知道」—— 而索引页没有了。
   ⚠️ 同时删掉的是这个命令**唯一一处会往用户项目里写东西**的路径。
   > 一个交互式入口消失之前，先问它当初为什么要有：它防的那件事还在不在。 */

// 服务在前台挂住，Ctrl-C 退出
process.on("SIGINT", () => { console.log("\n  已停。"); process.exit(0); });
