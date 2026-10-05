/** 生命周期回归测试。M1-13
 *
 * 在临时目录里走完完整的生命周期，每步后校验引用完整性：
 *   建项目 → 建组件稿 → 建页面稿（引组件）→ 改名 → 移动 → 删除 → 恢复
 * 每步之后 validate_draft 的 E_IMPORT_MISSING 必须为 0。
 *
 * 用法：node dist/lifecycletest.js
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createProject, createDraft, loadProject, listDrafts, buildProject, updateProject, archiveProject } from "./project.js";
import { buildRefGraph, renameDraft, moveDraft, deleteDraft, restoreDraft, listTrash, deleteDraftImpact } from "./refs.js";
import { validateDraft } from "./validate.js";
import { touchProject, listRecentProjects } from "./workspace.js";

const bar = (s: string) => console.log("\n" + "─".repeat(4) + " " + s + " " + "─".repeat(Math.max(0, 62 - s.length)));
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
/** 带判断的那一种。
 *  ⚠️ **这个文件的 `ok()` 只打印、不判断** —— 写成 `ok("…", cond)` 的话
 *  那个条件会被当成多余的参数**丢掉**，于是判据永远绿（2026-10-05 差点这么写）。
 *  **一个只打印的函数，长得和判据一模一样。** 需要判断的一律走这个。 */
const expect = (cond: boolean, msg: string) => { if (cond) ok(msg); else fail(msg); };
const fail = (msg: string) => { console.log(`  ✗ ${msg}`); failed.push(msg); };

const failed: string[] = [];
let TEMP: string;
let p: Awaited<ReturnType<typeof loadProject>>;

async function main() {
  // 创建临时目录
  TEMP = join(tmpdir(), `umbrastudio-lifecycle-${Date.now()}`);
  await mkdir(TEMP, { recursive: true });
  console.log(`临时目录 ${TEMP}`);

  try {
    await step1_createProject();
    await step2_createDrafts();
    await step3_checkReferences();
    await step4_renameDraft();
    await step5_moveDraft();
    await step6_deleteAndImpact();
    await step7_restoreFromTrash();
    await step8_workspaceTracking();
    await step9_updateProject();
    await step10_archiveProject();
    await step11_sameNameProjects();

    bar("总结");
    if (failed.length === 0) {
      ok("生命周期回归全通过");
    } else {
      console.log(`  ✗ ${failed.length} 条失败：`);
      for (const f of failed) console.log(`    — ${f}`);
      process.exitCode = 1;
    }
  } finally {
    // 清理临时目录（如果 archive 没把它移走的话）
    if (existsSync(TEMP)) {
      await rm(TEMP, { recursive: true, force: true });
    }
    // 清理归档目录
    const archiveParent = join(tmpdir());
    try {
      for (const d of await readdir(archiveParent)) {
        if (d.startsWith("umbrastudio-archived-")) {
          await rm(join(archiveParent, d), { recursive: true, force: true });
        }
      }
    } catch { /* 忽略 */ }
  }
}

/** 检查整个项目里没有任何 E_IMPORT_MISSING */
async function checkNoMissingImports(label: string): Promise<boolean> {
  const drafts = await listDrafts(p);
  let missing = 0;
  for (const abs of drafts) {
    const rel = abs.slice(p.dir.length + 1).split("/").join("/");
    const src = await readFile(abs, "utf8");
    const v = validateDraft(p, rel, src, rel);
    missing += v.diags.filter((d) => d.code === "E_IMPORT_MISSING").length;
  }
  if (missing === 0) {
    ok(`${label}：E_IMPORT_MISSING = 0（${drafts.length} 份稿）`);
    return true;
  } else {
    fail(`${label}：E_IMPORT_MISSING = ${missing}`);
    return false;
  }
}

async function step1_createProject() {
  bar("步骤 1：创建项目");
  const name = "lifecycle-test";

  const r = await createProject(name, {
    dir: TEMP,
    title: "生命周期测试项目",
  });

  ok(`项目创建在 ${r.dir}`);

  // 验证 project.json 存在
  const projJson = JSON.parse(await readFile(join(r.dir, "project.json"), "utf8"));
  if (projJson.name !== name) { fail("project.json name 不对"); return; }
  ok("project.json 正确");

  // 加载项目（用 buildProject 因为临时目录不在 projectsRoot 下）
  p = await buildProject(r.dir);

  // 验证 .gitignore 存在
  if (!existsSync(join(r.dir, ".gitignore"))) { fail(".gitignore 缺失"); return; }
  ok(".gitignore 存在");
}

async function step2_createDrafts() {
  bar("步骤 2：创建稿件");

  // 2a. 创建组件稿
  await createDraft(p, "PC 按钮.dc.html", { kind: "blank" });
  ok("组件稿创建：PC 按钮.dc.html");

  // 2b. 创建页面稿（空白）
  await createDraft(p, "登录页.dc.html", { kind: "blank" });
  ok("页面稿创建：登录页.dc.html");

  // 2c. 手动修改页面稿，让它引用组件稿
  const pageAbs = join(p.dir, "登录页.dc.html");
  let pageSrc = await readFile(pageAbs, "utf8");
  pageSrc = pageSrc.replace("<x-dc>", `<x-dc>\n<dc-import name="PC 按钮" hint-props='{"tone":"primary"}'></dc-import>`);
  await writeFile(pageAbs, pageSrc, "utf8");
  ok("页面稿已插入 dc-import 引用组件");

  // 验证两份稿都能通过校验（没有 E_IMPORT_MISSING）
  await checkNoMissingImports("创建后");

  /* ── 新建的稿**真的走了写入口**（issue #71，2026-10-05）──
     `create_draft` 给 AI 的说明写的是「走的是唯一写入口（归一化 → @ds 展开 →
     `__resources` 注入 → 快照），所以断网也能打开」，而实现是三条路都
     `writeAtomic` 直写 —— 实测**四样一个都没有**。
     ⚠️ 这一步原来只断言「文件存在」，所以**测不出来**（回归盲区）。

     后果都是实打实的：没有 `__resources` → `support.js` 去 unpkg 拉 React →
     **断网白屏**（§十五 实测踩过）· 没有节点地址 → **点选不可用**（#31 同族）·
     没有 v1 快照 → `startsAtV1: true` 这个返回值名不副实。 */
  {
    const { snapDir } = await import("./history.js");
    const { readdirSync, readFileSync: readFileSyncLocal } = await import("node:fs");
    const check = (rel: string) => {
      const abs = join(p.dir, rel);
      const t = existsSync(abs) ? readFileSyncLocal(abs, "utf8") : "";
      const dir = rel.includes("/") ? join(p.dir, rel.split("/").slice(0, -1).join("/")) : p.dir;
      let snaps = 0;
      try { snaps = readdirSync(snapDir(p, rel)).length; } catch { snaps = 0; }
      return {
        res: /__resources|umbradesign:resources/.test(t),
        node: /data-ud-node/.test(t),
        rt: existsSync(join(dir, "support.js")),
        snaps,
      };
    };
    const a = check("登录页.dc.html");
    expect(a.res, `新建的稿有 \`__resources\`（没有它断网白屏）：${a.res}`);
    expect(a.node, `新建的稿打了节点地址（没有它点选不可用）：${a.node}`);
    expect(a.rt, `同目录分发了运行时 \`support.js\`：${a.rt}`);
    expect(a.snaps > 0, `新建就有一版快照（\`startsAtV1\` 才不是空话）：${a.snaps} 份`);

    /* ⚠️ **建到新子目录**单独验 —— 运行时三件套是**按目录**分发的，
       根目录有不代表子目录有，而「子目录里的稿直接打开白屏」正是 #71 列的后果之一。 */
    await createDraft(p, "新子目录/深一层.dc.html", { kind: "blank" });
    const b = check("新子目录/深一层.dc.html");
    expect(b.rt, `**建到新子目录时那个目录也有运行时**（根目录有不代表子目录有）：${b.rt}`);
    expect(b.res, `子目录里的稿也有 \`__resources\`：${b.res}`);

    /* ── 来源不许跨出项目（issue #69，p0）+ 副本名不许是路径（issue #70）── */
    const { duplicateDraft } = await import("./project.js");
    const outside = join(p.dir, "..", `_lct-项目外-${Date.now()}.dc.html`);
    await writeFile(outside, readFileSyncLocal(join(p.dir, "登录页.dc.html"), "utf8"), "utf8");
    const before = (await listDrafts(p)).length;
    const evilSources: Array<[string, { kind: "copy"; sourceFile: string } | { kind: "template"; templatePath: string }]> = [
      ["copy 项目外的 .dc.html", { kind: "copy", sourceFile: `../${outside.split(sep).pop()}` }],
      ["copy 项目外的绝对路径", { kind: "copy", sourceFile: outside }],
      ["template 绝对路径", { kind: "template", templatePath: outside }],
    ];
    for (const [what, src] of evilSources) {
      let threw = false;
      try { await createDraft(p, `偷来的-${Math.random().toString(36).slice(2, 6)}.dc.html`, src); } catch { threw = true; }
      expect(threw, `**拒绝：${what}**（issue #69，p0 —— 原来能把 ai_config.json 读进一份新稿）`);
    }
    /* ⚠️ **判据要钉住它自己说的那道闸** —— 2026-10-05 反向验证实测：
       把 `plainNameProblem` 撤掉之后这四条里**三条照样绿**，
       因为它们各自被别的机制挡住了（`../逃出去` 和 `..` 撞在写入口的
       `isInside` 上、`a/b` 撞在「子目录里的稿有 error 级诊断」上）。
       「它被拒了」是真的，但**不是因为 #70 修的那道闸** ——
       于是闸没了判据也不会红。改成认**拒因**。 */
    for (const nm of ["../逃出去", "a/b", "..", ".hidden"]) {
      let why = "";
      try { await duplicateDraft(p, "登录页.dc.html", { newName: nm }); } catch (e) { why = String((e as Error)?.message ?? e); }
      expect(/副本名不合法/.test(why), `**拒绝副本名 ${JSON.stringify(nm)}**（issue #70）：${why || "✗ 没拒"}`);
    }
    /* ⚠️ **「被拒」和「没留下东西」是两件事** —— 分开验 */
    expect((await listDrafts(p)).length === before, `而项目里没多出稿（${before} 份没变）`);
    expect(!readdirSync(join(p.dir, "..")).some((f) => f.includes("逃出去")), "项目外也没多出「逃出去」");
    /* 正面：正常的副本名还得能用（闸不该把功能也挡掉） */
    const dup = await duplicateDraft(p, "登录页.dc.html", { newName: "正常副本" }).catch(() => null);
    expect(dup?.newPath === "正常副本.dc.html", `**正常副本名照常能用**：${dup?.newPath ?? "✗ 失败"}`);
    await rm(outside, { force: true });

    /* ⚠️ **把这一节造的稿清掉** —— 它们也引用那个组件，
       而后面几步断言的是「PC 按钮被 **1** 份稿引用」。
       （2026-10-05 实测栽过：不清的话后面三条红，而红的原因在这一节。
       **判据之间会互相干扰，而干扰的症状出现在别的判据上。**） */
    for (const leftover of ["正常副本.dc.html", "新子目录/深一层.dc.html"]) {
      await rm(join(p.dir, leftover), { force: true });
      try { await rm(snapDir(p, leftover), { recursive: true, force: true }); } catch { /* 没有就算了 */ }
    }
    await rm(join(p.dir, "新子目录"), { recursive: true, force: true });
  }
}

async function step3_checkReferences() {
  bar("步骤 3：引用图谱查询");

  const graph = await buildRefGraph(p);

  // 检查 PC 按钮 被谁引用
  const compEntry = graph.files.get("PC 按钮.dc.html");
  if (!compEntry) { fail("图谱里找不到 PC 按钮.dc.html"); return; }
  if (compEntry.importedBy.length !== 1) { fail(`PC 按钮应该被 1 份稿引用，实际 ${compEntry.importedBy.length}`); return; }
  if (compEntry.importedBy[0]?.rel !== "登录页.dc.html") { fail(`引用方不对：${compEntry.importedBy[0]?.rel ?? "(none)"}`); return; }
  ok("PC 按钮 被 登录页.dc.html 引用");

  // 检查 登录页 引用了谁
  const pageEntry = graph.files.get("登录页.dc.html");
  if (!pageEntry) { fail("图谱里找不到 登录页.dc.html"); return; }
  if (pageEntry.imports.length !== 1) { fail(`登录页应该引用了 1 份稿，实际 ${pageEntry.imports.length}`); return; }
  ok("登录页 引用了 PC 按钮");
}

async function step4_renameDraft() {
  bar("步骤 4：重命名组件稿");

  const renameR = await renameDraft(p, "PC 按钮.dc.html", "主按钮");
  ok(`组件重命名：PC 按钮 → 主按钮（修了 ${renameR.referencesUpdated} 处引用）`);

  // 验证文件名变了
  const oldAbs = join(p.dir, "PC 按钮.dc.html");
  const newAbs = join(p.dir, "主按钮.dc.html");
  if (existsSync(oldAbs)) { fail("旧文件还在"); return; }
  if (!existsSync(newAbs)) { fail("新文件不在"); return; }
  ok("文件已重命名");

  // 验证引用方的 dc-import name 被更新了
  const pageAbs = join(p.dir, "登录页.dc.html");
  const pageSrc = await readFile(pageAbs, "utf8");
  if (pageSrc.includes('name="PC 按钮"')) { fail("引用方里的 dc-import name 没有更新"); return; }
  if (!pageSrc.includes('name="主按钮"')) { fail("引用方里的 dc-import name 不是新名字"); return; }
  ok("引用方里的 dc-import name 已更新");

  // 验证引用完整性
  await checkNoMissingImports("重命名后");
}

async function step5_moveDraft() {
  bar("步骤 5：移动组件稿到子目录");

  const moveR = await moveDraft(p, "主按钮.dc.html", "Components");
  ok(`组件移动到 Components/（修了 ${moveR.referencesUpdated} 处引用）`);

  // 验证文件在新位置
  const oldAbs = join(p.dir, "主按钮.dc.html");
  const newAbs = join(p.dir, "Components", "主按钮.dc.html");
  if (existsSync(oldAbs)) { fail("旧位置文件还在"); return; }
  if (!existsSync(newAbs)) { fail("新位置文件不在"); return; }
  ok("文件已移动");

  // 验证引用方的 dc-import name 变成了相对路径
  const pageAbs = join(p.dir, "登录页.dc.html");
  const pageSrc = await readFile(pageAbs, "utf8");
  if (!pageSrc.includes("Components/主按钮")) { fail("引用方里的 dc-import name 没有更新为相对路径"); return; }
  ok("引用方里的 dc-import name 已更新为相对路径");

  // 验证引用完整性
  await checkNoMissingImports("移动后");

  /* ── 移动一份**自己有引用**的页面稿（issue #82，2026-10-05）──
     ⚠️ **这里原来是回归盲区**：上面移动的是**组件**稿，它自己没有任何
     `dc-import`，所以 `checkNoMissingImports` 一直全绿。
     而 `dc-import name` 是相对引用方所在目录解析的 —— 页面稿换了目录，
     它自己那些引用的基准就变了，而 `moveDraft` 原来只改「引用它的稿」。
     **页面稿几乎都引用组件，所以这是最常见的整理动作里最容易中的一刀。** */
  {
    const mv = await moveDraft(p, "登录页.dc.html", "Pages");
    const movedSrc = await readFile(join(p.dir, "Pages", "登录页.dc.html"), "utf8");
    expect(/name="\.\.\/Components\/主按钮"/.test(movedSrc),
      `**移动后它自己的 dc-import 也改了**：${movedSrc.match(/<dc-import[^>]*name="([^"]*)"/)?.[1] ?? "(没有)"}`);
    expect(mv.ownImportsUpdated.length === 1,
      `回执里说清改了自己几条引用：${mv.ownImportsUpdated.length}`);
    const vm = validateDraft(p, "Pages/登录页.dc.html", movedSrc, "Pages/登录页.dc.html");
    const miss = vm.diags.filter((d) => d.code === "E_IMPORT_MISSING");
    expect(miss.length === 0, `**移动后它引用的组件没缺**：E_IMPORT_MISSING = ${miss.length}`);
    // 搬回来，后面几步照旧；搬回来也得是对的（相当于反向走一次）
    await moveDraft(p, "Pages/登录页.dc.html", ".");
    const backSrc = await readFile(join(p.dir, "登录页.dc.html"), "utf8");
    expect(/name="Components\/主按钮"/.test(backSrc),
      `搬回项目根时引用也跟着回来：${backSrc.match(/<dc-import[^>]*name="([^"]*)"/)?.[1] ?? "(没有)"}`);
  }
}

async function step6_deleteAndImpact() {
  bar("步骤 6：删除前影响分析 + 删除");

  /* ⚠️ 这里原来写着「**先把稿移回顶层**（restore_draft 恢复后放在基名位置，
     不在子目录）」—— 测试**绕开了**那个限制，于是 issue #81 一直测不出来：
     子目录里的稿删了再恢复，回到的是项目根，引用照样断。
     **一句「为了让测试能跑，先把环境改成它要的样子」的注释，
     往往正是一条缺陷的藏身处。** 现在直接删子目录里的那一份。 */
  // 6a. 影响分析
  const impact = await deleteDraftImpact(p, "Components/主按钮.dc.html");
  if (impact.affectedCount !== 1) { fail(`影响分析应该显示 1 个引用方，实际 ${impact.affectedCount}`); return; }
  if (!impact.importedBy.some((r) => r.rel === "登录页.dc.html")) { fail("影响分析没列出 登录页.dc.html"); return; }
  ok(`影响分析正确：1 个引用方（${impact.importedBy[0]?.rel ?? "(none)"}）`);

  // 6b. 执行删除
  const delR = await deleteDraft(p, "Components/主按钮.dc.html");
  ok(`组件已删除，移入回收站：${delR.trashPath}`);

  // 验证原文件不在了
  const compAbs = join(p.dir, "Components", "主按钮.dc.html");
  if (existsSync(compAbs)) { fail("组件文件还在（没被移进回收站）"); return; }
  ok("组件文件已移走");

  // 验证回收站目录里有东西
  const trashItems = await listTrash(p);
  if (trashItems.length !== 1) { fail(`回收站里应该有 1 项，实际 ${trashItems.length}`); return; }
  ok(`回收站有 ${trashItems.length} 项`);

  // 删除后引用方应该报 E_IMPORT_MISSING —— 这是预期的
  const pageAbs = join(p.dir, "登录页.dc.html");
  const pageSrc = await readFile(pageAbs, "utf8");
  const v = validateDraft(p, "登录页.dc.html", pageSrc, "登录页.dc.html");
  const missing = v.diags.filter((d) => d.code === "E_IMPORT_MISSING");
  if (missing.length !== 1) { fail(`删除后页面稿应该报 1 个 E_IMPORT_MISSING，实际 ${missing.length}`); return; }
  ok("删除后引用方正确报 E_IMPORT_MISSING（预期行为）");
}

async function step7_restoreFromTrash() {
  bar("步骤 7：从回收站恢复");

  const trashItems = await listTrash(p);
  const trashItem = trashItems[0];
  if (!trashItem) { fail("回收站里没有项"); return; }
  const trashPath = trashItem.trashPath;

  const restoreR = await restoreDraft(p, trashPath);
  ok(`组件已从回收站恢复到 ${restoreR.originalPath}`);

  // 验证文件回来了
  const restoredAbs = join(p.dir, restoreR.originalPath);
  if (!existsSync(restoredAbs)) { fail("恢复后的文件不在"); return; }
  /* ⚠️ **「回来了」和「回到原位置」是两件事**（issue #81）——
     原来恢复一律落在项目根，而引用方写的是 `Components/主按钮`，
     于是文件在、引用断，`restore_draft` 的回执还说「恢复成功」。 */
  expect(restoreR.originalPath === "Components/主按钮.dc.html",
    `**恢复到的是原位置而不是项目根**：${restoreR.originalPath}`);
  expect(existsSync(join(p.dir, "Components", "主按钮.dc.html")), "文件真在 Components/ 下");
  expect(trashItem.originalPath === "Components/主按钮.dc.html",
    `list_trash 说得出原路径（说明里承诺过）：${trashItem.originalPath}`);

  // 验证引用完整性（恢复后应该不再报 E_IMPORT_MISSING）
  await checkNoMissingImports("恢复后");

  // 验证回收站空了
  const trashAfter = await listTrash(p);
  if (trashAfter.length !== 0) { fail(`恢复后回收站应该为空，实际 ${trashAfter.length} 项`); return; }
  ok("回收站已空");

  /* ── 恢复 / 改名只能在项目里动（issue #80，p1，2026-10-05）──
     `trashPath` 和 `newName` 都是 `z.string()` 原样透传的。 */
  {
    // 项目外造一个「兄弟项目」，看它会不会被搬进来
    const sibling = join(p.dir, "..", `_lct-兄弟项目-${Date.now()}`);
    await mkdir(sibling, { recursive: true });
    await writeFile(join(sibling, "标记.txt"), "我在项目外", "utf8");
    const draftsBefore = (await listDrafts(p)).length;
    const evil: Array<[string, () => Promise<unknown>]> = [
      ["restore 项目外的目录（rename 对目录同样生效）", () => restoreDraft(p, `../${basename(sibling)}`)],
      ["restore 项目外的绝对路径", () => restoreDraft(p, sibling)],
      ["restore 项目内一份正常的稿（会被静默挪到项目根）", () => restoreDraft(p, "登录页.dc.html")],
      ["restore 回收站根自己", () => restoreDraft(p, ".umbrastudio/trash")],
    ];
    for (const [what, run] of evil) {
      let why = "";
      try { await run(); } catch (e) { why = String((e as Error)?.message ?? e); }
      expect(/只能恢复回收站里的条目|回收站路径里没有原文件/.test(why), `**拒绝 ${what}**：${why || "✗ 没拒"}`);
    }
    expect(existsSync(join(sibling, "标记.txt")), "**兄弟项目还在原地**（被拒 ≠ 没留下东西，分开验）");
    expect((await listDrafts(p)).length === draftsBefore, `项目里也没多出稿（${draftsBefore} 份没变）`);
    await rm(sibling, { recursive: true, force: true });

    // 改名：名字不是路径，而且改坏之前**不许先把引用方改了**
    const pageBefore = await readFile(join(p.dir, "登录页.dc.html"), "utf8");
    for (const nm of ["../逃出去", "a/b", ".."]) {
      /* ⚠️ **先看夹具还在不在**（2026-10-05 反向验证实测）：闸破了的时候
         第一条真把稿改名走了，后两条报的是「找不到稿」——
         于是它们在**破了的实现下也算「被拒」**。
         **判据说不出「我根本没跑」的时候，它的绿和红都不可信。** */
      const had = existsSync(join(p.dir, "Components", "主按钮.dc.html"));
      let why = "";
      try { await renameDraft(p, "Components/主按钮.dc.html", nm); } catch (e) { why = String((e as Error)?.message ?? e); }
      expect(had && /新名字不合法/.test(why),
        `**拒绝改名成 ${JSON.stringify(nm)}**：${had ? (why || "✗ 没拒") : "✗ 夹具已被前一条毁掉，这一条压根没跑"}`);
    }
    expect(await readFile(join(p.dir, "登录页.dc.html"), "utf8") === pageBefore,
      "改名被形状闸拒掉时引用方没动");
    /* ⚠️ 这一条测的是**顺序 + 回滚**（issue #80 第 3 点）：原来是先改完所有
       引用方、最后才 `rename`，改名失败时引用方已经落盘改坏且没有回滚。

       **样本必须是「过了闸之后才失败」的那一种** —— 上面那三个被形状闸
       当场拒掉，`rename` 压根没跑，所以顺序对不对它们都绿（§142.4 同一个坑，
       我差点第二次踩）。这里用一个 **300 字符的名字**：形状合法，
       而文件系统报 `ENAMETOOLONG`，于是失败点正好落在 `rename` 上。 */
    {
      let why = "";
      try { await renameDraft(p, "Components/主按钮.dc.html", "长".repeat(300)); }
      catch (e) { why = String((e as Error)?.message ?? e); }
      expect(/ENAMETOOLONG|too long/i.test(why), `（样本有效性）300 字的名字确实栽在 rename 上：${why.slice(0, 60) || "✗ 没抛"}`);
      expect(await readFile(join(p.dir, "登录页.dc.html"), "utf8") === pageBefore,
        "**改名在 rename 这一步失败时，已改的引用方被退回去了**（原来：引用改坏、文件没改名、没有回滚）");
      expect(existsSync(join(p.dir, "Components", "主按钮.dc.html")), "而稿还在原来的名字上");
    }
    // 正面：正常改名还得能用
    const rn = await renameDraft(p, "Components/主按钮.dc.html", "主按钮改名").catch(() => null);
    expect(rn?.newPath === "Components/主按钮改名.dc.html", `**正常改名照常能用**：${rn?.newPath ?? "✗ 失败"}`);
    await checkNoMissingImports("正常改名后");
    await renameDraft(p, "Components/主按钮改名.dc.html", "主按钮");
  }

  /* ── 从文件面删的东西在回收站里是一份**文件**，不是一个目录（issue #81 第 3 点）──
     `trashFile` 用的布局是 `<stamp>/<原相对路径>`，而 `listTrash` 原来只读一层，
     于是 `assets/img/a.png` 在列表里显示成目录名 `assets`，
     对它「恢复」会把整个 `assets` 目录搬到项目根，撞名时还变成 `assets 2.dc.html`。 */
  {
    const { trashFile } = await import("./files.js");
    await mkdir(join(p.dir, "assets", "img"), { recursive: true });
    await writeFile(join(p.dir, "assets", "img", "a.png"), "png", "utf8");
    await trashFile(p, "assets/img/a.png");
    const items = await listTrash(p);
    const hit = items.find((it) => it.originalName === "a.png");
    expect(!!hit, `**回收站里是那份文件本身**（不是目录名 assets）：${items.map((i) => i.originalName).join(" / ") || "(空)"}`);
    expect(hit?.originalPath === "assets/img/a.png", `原路径完整：${hit?.originalPath}`);
    const back = await restoreDraft(p, hit!.trashPath);
    expect(back.originalPath === "assets/img/a.png", `**恢复回原来那层目录**：${back.originalPath}`);
    expect(existsSync(join(p.dir, "assets", "img", "a.png")), "文件真回到 assets/img/ 下");
    expect((await listTrash(p)).length === 0, "回收站又空了（空目录一层层收掉）");
  }
}

async function step8_workspaceTracking() {
  bar("步骤 8：工作区与最近项目");

  // touch 这个项目
  await touchProject(p.dir, p.name, p.title);
  ok("已 touch 项目");

  // 查最近项目列表
  const recents = await listRecentProjects(5);
  if (recents.recents.length < 1) { fail("最近项目列表为空"); return; }

  const first = recents.recents[0];
  if (!first) { fail("最近项目列表为空"); return; }

  // 我们的项目应该在列表最前面
  if (first.dir !== p.dir) { fail(`最近项目应该是我们刚 touch 的，实际是 ${first.dir}`); return; }
  ok(`最近项目列表第一条是我们：${first.name}`);
}

async function step9_updateProject() {
  bar("步骤 9：更新项目配置");

  await updateProject(p, {
    title: "生命周期测试项目-改名后",
    elementsWarn: 800,
    elementsHard: 1000,
  });
  ok("项目配置已更新");

  // 重新加载验证
  const p2 = await buildProject(p.dir);
  if (p2.title !== "生命周期测试项目-改名后") { fail("标题没更新"); return; }
  if (p2.limits.elementsWarn !== 800) { fail("elementsWarn 没更新"); return; }
  if (p2.limits.elementsHard !== 1000) { fail("elementsHard 没更新"); return; }
  ok("重新加载后配置正确");
}

async function step10_archiveProject() {
  bar("步骤 10：归档项目");

  const archiveDir = join(tmpdir(), `umbrastudio-archived-${Date.now()}`);
  const archiveR = await archiveProject(p, archiveDir);

  ok(`项目已归档到 ${archiveR.archivePath}`);

  // 验证原目录不在了
  if (existsSync(p.dir)) { fail("项目目录还在（归档没生效）"); return; }
  ok("原项目目录已移走");

  // 验证归档目录存在
  if (!existsSync(archiveR.archivePath)) { fail("归档目录不存在"); return; }
  ok("归档目录存在");
}

/** 两个**不同目录、同名**的项目（issue #20）。
 *
 *  `project.json` 的 name 不唯一，而服务表原来按名字索引：打开第二个同名项目时
 *  `running.get(name)` 命中，**原样返回第一个项目的服务** ——
 *  用户看到的、编辑的、让 AI 改的都是第一个项目的文件，界面标题却写着第二个。
 *  改动落在错的项目上，而且界面一句话都不说。
 *
 *  判据钉在「两条服务各是各的」上：端口不同、`dir` 各自正确、停掉一个不影响另一个。
 */
async function step11_sameNameProjects() {
  bar("同名项目不串号（issue #20）");
  const { serveStart, serveStop, serveOf } = await import("./serve.js");
  const a = join(TEMP, "同名A", "Demo");
  const b = join(TEMP, "同名B", "Demo");        // 目录不同、name 同为 Demo
  for (const d of [a, b]) {
    await mkdir(d, { recursive: true });
    await writeFile(join(d, "project.json"), JSON.stringify({ name: "Demo" }, null, 2), "utf8");
  }
  const pa = await loadProject(a);
  const pb = await loadProject(b);
  if (pa.name !== pb.name) { fail(`前提不成立：两个项目的 name 该相同，实际 ${pa.name} / ${pb.name}`); return; }

  const sa = await serveStart(pa);
  const sb = await serveStart(pb);
  if (sa.port === sb.port) fail(`同名项目串号了：两个项目拿到同一个服务（端口 ${sa.port}）`);
  else ok(`同名项目各起各的服务（端口 ${sa.port} / ${sb.port}）`);
  if (sa.dir === sb.dir) fail("两条服务的 dir 相同 —— 第二个项目拿到的是第一个的服务");
  else ok("两条服务的 dir 各自正确");

  /* 按目录查，各自查得到自己的 */
  const oa = serveOf(a), ob = serveOf(b);
  if (oa?.port === sa.port && ob?.port === sb.port) ok("按目录查服务，各自查得到自己的");
  else fail(`按目录查串号了：${oa?.port} / ${ob?.port}（该是 ${sa.port} / ${sb.port}）`);

  /* 停掉一个不影响另一个 —— 原来 `serveStop(name)` 会停掉另一个同名项目的服务 */
  serveStop(a);
  if (serveOf(a) === null && serveOf(b)?.port === sb.port) ok("停掉一个，另一个还活着（原来按名字停会误伤）");
  else fail("停一个把另一个也停了（或者停错了那一个）");
  serveStop(b);
}

// ─── 入口 ───
main().catch((e) => {
  console.error("lifecycletest 异常：", e);
  process.exitCode = 1;
  process.exit(1);
});
