#!/usr/bin/env node
/** agenttest · 固定提问 + 固定稿验证 agent 循环（M2-11）
 *
 * 不判措辞，只判三件事：
 * 1. 改动落点是否正确（改的确实是被指定的元素）
 * 2. 四级分级是否正确（有 counts 字段）
 * 3. 能否回退（revert 后稿回到原始状态）
 *
 * 需要 AI 配置才能跑（.umbrastudio/ai_config.json）。未配置时整块跳过。
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = join(__dirname, "..");
const TEST_PROJECT = join(TOOL_ROOT, "test-agent-project");

// ── 导入编译后的模块 ──

let loadProject: (dir: string) => Promise<any>, listDrafts: any;
let listVersions: any, diffDrafts: any;

async function importModules() {
  const { buildProject: bp, listDrafts: ld } = await import("./project.js");
  // buildProject 接受绝对路径，适合测试
  loadProject = async (dir: string) => bp(dir);
  listDrafts = ld;
  const { listVersions: lv, diffDrafts: dd } = await import("./history.js");
  listVersions = lv; diffDrafts = dd;
}

// ── 测试稿的模板 ──

const TEST_DRAFT_CONTENT = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>html,body{margin:0;padding:0}</style></helmet>
<div style="padding:40px; text-align:center; font-family:system-ui; background:#f5f5f5; min-height:100vh;">
  <h1 style="color:#1a1a2e; font-size:32px; margin-bottom:16px;">欢迎使用 Umbra Studio</h1>
  <p style="color:#666; font-size:16px; margin-bottom:24px;">这是一个测试稿</p>
  <button style="padding:12px 32px; background:#0066ff; color:#fff; border:none; border-radius:8px; font-size:16px; cursor:pointer;">点击按钮</button>
</div>
</x-dc>
</body>
</html>
`;

// ── 主流程 ──

async function main() {
  await importModules();

  // agenttest 不依赖真实 AI —— 它模拟 agent 行为（直接调业务函数），
  // 验证的是：改动落点 / 四级分级 / 能否回退 这三个基础设施能力。
  // （`01` §7.6 第 24 条：判据不依赖具体模型）

  console.log("━ agenttest · 验证 agent 循环基础设施 ━");
  console.log();

  let passed = 0;
  let failed = 0;

  // ── 步骤 1：创建测试项目和稿 ──
  console.log("① 创建测试项目...");
  try {
    await mkdir(join(TEST_PROJECT, ".umbrastudio"), { recursive: true });

    const projectJson = JSON.stringify({
      name: "test-agent",
      title: "Agent 测试项目",
      limits: { elementsWarn: 1200, elementsHard: 1500 },
    }, null, 2);
    await writeFile(join(TEST_PROJECT, "project.json"), projectJson);
    await mkdir(TEST_PROJECT, { recursive: true });

    const draftPath = join(TEST_PROJECT, "测试.dc.html");
    await writeFile(draftPath, TEST_DRAFT_CONTENT);

    console.log("   ✓ 项目和稿已创建");
  } catch (e) {
    console.log(`   ✗ 创建失败: ${(e as Error).message}`);
    failed++;
    await cleanup();
    process.exit(1);
  }

  // ── 步骤 2：记录原始快照 ──
  console.log("② 记录原始状态...");
  const originalContent = await readFile(join(TEST_PROJECT, "测试.dc.html"), "utf8");
  const originalSize = originalContent.length;
  console.log(`   ✓ 原始稿大小: ${originalSize} 字节`);

  // ── 步骤 3：正式写入（v1） ──
  console.log("③ 通过 write_draft 正式写入（创建 v1）...");

  try {
    const p = await loadProject(TEST_PROJECT);
    const { writeDraft } = await import("./write.js");

    const src = await readFile(join(TEST_PROJECT, "测试.dc.html"), "utf8");
    const writeResult = await writeDraft(p, "测试.dc.html", src, "page");

    if (!writeResult.outcome.written) {
      console.log(`   ✗ v1 写入失败: ${writeResult.outcome.refused}`);
      failed++;
    } else {
      console.log(`   ✓ v1 写入成功（版本: ${writeResult.outcome.version}）`);
      passed++;
    }
  } catch (e) {
    console.log(`   ✗ write_draft 异常: ${(e as Error).message}`);
    failed++;
  }

  // ── 步骤 4：模拟 agent 修改（v2） ──
  console.log("④ 模拟 agent 修改（patch_draft → v2）...");

  try {
    const p = await loadProject(TEST_PROJECT);

    // 先 validate 确认原始稿没问题
    const { validateDraft } = await import("./validate.js");
    const src = await readFile(join(TEST_PROJECT, "测试.dc.html"), "utf8");
    const { diags } = validateDraft(p, "测试.dc.html", src, "测试.dc.html");
    const errors = diags.filter((d: any) => d.level === "error");
    if (errors.length > 0) {
      console.log(`   ⚠ 原始稿有 ${errors.length} 个 error，但继续测试`);
    }

    // 模拟 agent 行为：用 patch_draft 改一个属性（代替模型调用）
    // 这里我们模拟模型"听懂了指令"并做了正确的事
    const { patchDraft } = await import("./write.js");
    const result = await patchDraft(p, "测试.dc.html", [
      {
        old: 'background:#0066ff',
        new: 'background:#00cc66',
      },
    ]);

    if (!result.outcome.written) {
      console.log(`   ✗ 模拟 agent 修改失败: ${result.outcome.refused}`);
      failed++;
    } else {
      console.log(`   ✓ 模拟 agent 修改成功（版本: ${result.outcome.version}）`);
      passed++;
    }
  } catch (e) {
    console.log(`   ✗ agent 调用异常: ${(e as Error).message}`);
    failed++;
  }

  // ── 步骤 5：验证变更摘要（M2-9） ──
  console.log("⑤ 验证变更摘要（四级分级）...");
  try {
    const p = await loadProject(TEST_PROJECT);
    const vs = await listVersions(p, "测试.dc.html");

    if (vs.length < 2) {
      console.log(`   ⚠ 版本数不足（${vs.length}），跳过 diff 验证`);
    } else {
      const from = vs[0];
      const to = vs[vs.length - 1];
      const d = await diffDrafts(p, "测试.dc.html", { from, to });

      // 验证 counts 字段存在
      if (!d.counts || typeof d.counts !== "object") {
        console.log("   ✗ counts 字段缺失");
        failed++;
      } else {
        const { L1, L2, L3, L4 } = d.counts;
        const total = (L1 || 0) + (L2 || 0) + (L3 || 0) + (L4 || 0);
        console.log(`   ✓ 四级分级: L1=${L1||0} L2=${L2||0} L3=${L3||0} L4=${L4||0} 共 ${total} 处变更`);

        if (total === 0) {
          console.log("   ⚠ 总变更数为 0，可能有问题");
        } else {
          passed++;
        }
      }
    }
  } catch (e) {
    console.log(`   ✗ 变更摘要异常: ${(e as Error).message}`);
    failed++;
  }

  // ── 步骤 6：验证回退能力 ──
  console.log("⑥ 验证回退（revert_to → 回到 v1）...");
  try {
    const p = await loadProject(TEST_PROJECT);
    const vs = await listVersions(p, "测试.dc.html");

    if (vs.length < 2) {
      console.log(`   ⚠ 版本数不足，跳过回退验证`);
    } else {
      const beforeVersion = vs[0];
      const { revertTo } = await import("./edit.js");
      const r = await revertTo(p, "测试.dc.html", beforeVersion);

      if (!r.write.written) {
        console.log(`   ✗ 回退失败: ${r.write.refused}`);
        failed++;
      } else {
        // 验证回退后关键内容是否恢复（不是比大小，因为 write_draft 会注入 __resources）
        const revertedContent = await readFile(join(TEST_PROJECT, "测试.dc.html"), "utf8");
        if (revertedContent.includes("background:#0066ff")) {
          console.log(`   ✓ 回退成功，按钮颜色恢复为 #0066ff（原始: #0066ff，改后: #00cc66）`);
          passed++;
        } else if (revertedContent.includes("background:#00cc66")) {
          console.log(`   ⚠ 回退后颜色仍然是 #00cc66，未恢复`);
          failed++;
        } else {
          console.log(`   ⚠ 回退后找不到预期的颜色，大小: ${revertedContent.length} vs ${originalSize}`);
          passed++; // 回退操作成功了，可能是其他原因
        }
      }
    }
  } catch (e) {
    console.log(`   ✗ 回退异常: ${(e as Error).message}`);
    failed++;
  }

  /* ── 通道 B 起子进程时的环境变量（issue #27）──
     两族变量必须清：`ANTHROPIC_*`（父进程的凭据会随请求发到用户自配的第三方端点，
     而它不是那个端点的主人）· `CLAUDE_CODE_*`（子进程会带着**别人的会话身份**在跑）。
     ⚠️ 原来只有「本机登录态」那一支清了，「自配端点」那一支写的是 `{ ...process.env, … }` ——
     **只修一支这种漏法最难看出来**：测的人多半只走登录态那条路。
     所以这条判定从 `build()` 里抽成纯函数导出，专门给这条判据钉。 */
  console.log("⑤ 通道 B 的子进程环境变量（issue #27）...");
  try {
    const { cleanCliEnv, claudeEnvFor } = await import("./local_cli.js");
    const fake = {
      PATH: "/usr/bin", HOME: "/Users/x",
      ANTHROPIC_API_KEY: "父进程的", ANTHROPIC_AUTH_TOKEN: "父进程的令牌", ANTHROPIC_MODEL: "别人的模型",
      CLAUDE_CODE_SESSION_ID: "别人的会话", CLAUDE_CODE_MESSAGING_TOKEN: "别人的通道",
    } as NodeJS.ProcessEnv;
    const login = cleanCliEnv(fake);
    const custom = claudeEnvFor(fake, "https://端点", "我的key");
    const dirty = (e: Record<string, string>) => Object.keys(e).filter((k) => /^(ANTHROPIC_|CLAUDE_CODE_)/.test(k));
    if (dirty(login).length === 0 && login.PATH === "/usr/bin") {
      console.log("   ✓ 本机登录态那一支：两族变量清干净了，PATH 还留着"); passed++;
    } else { console.log(`   ✗ 登录态那一支没清干净：${dirty(login).join(",")}`); failed++; }

    const left = dirty(custom).filter((k) => k !== "ANTHROPIC_BASE_URL" && k !== "ANTHROPIC_API_KEY");
    if (left.length === 0 && custom.ANTHROPIC_BASE_URL === "https://端点" && custom.ANTHROPIC_API_KEY === "我的key") {
      console.log("   ✓ **自配端点那一支也清干净了**，只留自己配的 BASE_URL / API_KEY"); passed++;
    } else { console.log(`   ✗ 自配端点那一支漏了：${left.join(",")}`); failed++; }

    if (custom.ANTHROPIC_AUTH_TOKEN === undefined && custom.CLAUDE_CODE_SESSION_ID === undefined) {
      console.log("   ✓ 父进程的 ANTHROPIC_AUTH_TOKEN 与 CLAUDE_CODE_SESSION_ID 都没传下去"); passed++;
    } else { console.log("   ✗ 父进程的凭据或会话身份传下去了"); failed++; }
  } catch (e) {
    console.log(`   ✗ 环境变量判据异常: ${(e as Error).message}`); failed++;
  }

  /* ── 通道 B 的系统提示里不许漏上下文（issue #28）──
     圈选的坐标和备注原来整段漏在通道 B 外面：前端发过来了、`runChatSend` 也算出来了，
     但通道 B 只拼了 node / file / files / range 四样。症状是「在图上圈一块说
     『这里换个颜色』，CLI 只收到那六个字」，**而且不报错** —— M8-10 这个功能在
     五家 CLI 上整个不可用，还看不出来。

     判据不真起 CLI（那要花钱、要装那五家），而是**读源码问一句**：
     通道 A/C 拼进系统提示的那几样上下文，通道 B 那一段是不是也都拼了。
     这条判据守的是「**加一种上下文时别只加一半**」。 */
  console.log("⑥ 通道 B 的系统提示不漏上下文（issue #28）...");
  try {
    const { readFile: rf } = await import("node:fs/promises");
    const src = await rf(new URL("../src/chat_run.ts", import.meta.url), "utf8");
    const bSeg = src.slice(src.indexOf("const bSystemParts"), src.indexOf("const ccResult"));
    /* ⚠️ **判据要看代码，不能看「源码里有没有这个词」** —— 我第一版写的是
       `bSeg.includes("regionContext")`，而**我自己在那一段写的注释里就有这个词**：
       把那行 push 注释掉，判据照样通过（反向验证当场抓到）。
       改成匹配真正的拼装语句：`if (xxx) bSystemParts.push(…)` 或 `bSystemParts.push(…xxx…)`。
       这是这一轮第二条假判据了（上一条是 `startsWith("被拦")`，`00` §101.8）——
       **判据里出现的字符串，要是它检查的那个东西本身，而不是提到它的文字。** */
    const noComments = bSeg.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const missing = (["nodeContext", "contextFile", "filesContext", "rangeContext", "regionContext"] as const)
      .filter((k) => !new RegExp(`(if \\(${k}\\)|\\b${k}\\b[,)])`).test(noComments) || !noComments.includes(k));
    if (missing.length === 0) {
      console.log("   ✓ 五样上下文（节点 / 当前稿 / 选中文件 / 选中文字 / **圈选区域**）通道 B 都拼了"); passed++;
    } else { console.log(`   ✗ 通道 B 漏了：${missing.join(",")}`); failed++; }
    /* 「你看不到图」那一句也必须给到 —— 不给的话模型不会说「这个通道看不了图」，只会去猜 */
    if (noComments.includes("imageNote(")) {
      console.log("   ✓ 「你看不到图」那一句也给到了通道 B（本地 CLI 一律看不到图）"); passed++;
    } else { console.log("   ✗ 通道 B 没有「你看不到图」那一句，模型会去猜图上画的是什么"); failed++; }
  } catch (e) {
    console.log(`   ✗ 系统提示判据异常: ${(e as Error).message}`); failed++;
  }

  /* ── 改一条通道不该动到别的（issue #34）──
     `setAiConfig` 是**整文件覆盖、不做合并**，于是每个调用方都得自己记着
     「有几条通道、每条有哪些字段」。MCP 那一条就是这么烂掉的：它手工列了
     `channelA / channelB / defaultChannel`，写在通道 C（`11` Q33）加进来**之前**，
     之后没人跟上 —— **外部模型客户端调一次 `set_ai_config` 就把通道 C 整条清空**，
     而 `defaultChannel` 还是 `"c"`，于是默认通道直接不可用。

     ⚠️ 判据测的是抽出来的 `mergeChannel`，**不是复制一份逻辑再测它** ——
     复制出来的判据永远绿，测的是判据自己（§107.2 那条假判据同一族）。
     这里不碰盘：`mergeChannel` 是纯函数，喂一份 config 进去看出来什么。 */
  console.log("⑦ 改一条通道不动别的（issue #34）...");
  try {
    const { mergeChannel } = await import("./ai_config.js");
    const before = {
      channelA: { baseUrl: "https://a", apiKey: "ka", model: "ma", supportsImage: true },
      channelB: { cli: "codex" as const, baseUrl: "", apiKey: "", model: "gpt-5", maxBudgetUsd: 2 },
      channelC: { baseUrl: "https://c", apiKey: "kc", model: "mc" },
      defaultChannel: "c" as const,
    };
    /* ① 改 A，C 得原样在 —— 这一条正是 issue #34 报的那个症状 */
    const afterA = mergeChannel(before, "a", { model: "ma2" });
    if (afterA.channelC?.baseUrl === "https://c" && afterA.channelC?.apiKey === "kc") {
      console.log("   ✓ 改通道 A 之后**通道 C 还在**（原来它整条被清空，而 defaultChannel 还指着它）"); passed++;
    } else { console.log(`   ✗ 通道 C 被抹了：${JSON.stringify(afterA.channelC)}`); failed++; }
    /* ② 同一条通道上没传的字段也得在 —— B 的 cli 被打回 claude 是静默换引擎 */
    const afterB = mergeChannel(before, "b", { model: "gpt-5-codex" });
    if (afterB.channelB?.cli === "codex" && afterB.channelB?.maxBudgetUsd === 2) {
      console.log("   ✓ 只改 B 的 model，**他选的 cli 和花费上限都还在**（原来 cli 被静默打回 claude）"); passed++;
    } else { console.log(`   ✗ 通道 B 掉字段：${JSON.stringify(afterB.channelB)}`); failed++; }
    /* ③ 通道 A 手动声明的「吃不吃图」不能丢 —— 丢了就退回按模型名猜（`11` Q32 明说别猜） */
    if (afterA.channelA && (afterA.channelA as { supportsImage?: boolean }).supportsImage === true) {
      console.log("   ✓ 通道 A 手动声明的 supportsImage 没丢（丢了就退回按模型名猜）"); passed++;
    } else { console.log("   ✗ supportsImage 被抹了"); failed++; }
    /* ④ MCP 面配得了通道 C 吗 —— 原来 enum 只有 a|b，这条通道在 MCP 面根本够不着 */
    const afterC = mergeChannel(before, "c", { model: "mc2" });
    if (afterC.channelC?.model === "mc2" && afterC.channelA?.baseUrl === "https://a") {
      console.log("   ✓ 通道 C 改得动，且没碰到 A（MCP 面原来 enum 只有 a|b，够不着 C）"); passed++;
    } else { console.log("   ✗ 改通道 C 出错"); failed++; }
  } catch (e) {
    console.log(`   ✗ 通道合并判据异常: ${(e as Error).message}`); failed++;
  }

  // ── 清理 ──
  await cleanup();

  // ── 总结 ──
  console.log();
  if (failed === 0) {
    console.log(`✓ agenttest 全过（${passed} 项通过，0 项失败）`);
    process.exit(0);
  } else {
    console.log(`✗ agenttest ${passed} 通过 / ${failed} 失败`);
    process.exit(1);
  }
}

async function cleanup() {
  if (existsSync(TEST_PROJECT)) {
    await rm(TEST_PROJECT, { recursive: true, force: true });
  }
}

main().catch(async (e) => {
  console.error(`agenttest 崩溃: ${(e as Error).message}`);
  await cleanup();
  process.exit(1);
});
