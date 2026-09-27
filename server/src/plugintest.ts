/** 插件机制的回归（M11-4）。**重点不是"插件能跑"，是"关不关得住"。**
 *
 *  `fixtures/插件/com.umbra.demo` 里那个插件同时是**攻击样本**：
 *  它的 `probe` 能力故意去做插件不该做的四件事。
 *  沙箱不被攻一次，等于没验 —— 「没出事」和「关住了」在日志上长得一样。
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkManifest, HOST_API_MAJOR } from "./plugin/manifest.js";
import { PluginSandbox } from "./plugin/sandbox.js";
import { allowedCapNames } from "./plugin/host.js";
import { buildProject } from "./project.js";
import { BUILTIN, kindOf, registerKind, unregisterKindsFrom } from "./shared/kinds.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};

const DIR = join(process.cwd(), "..", "fixtures", "插件", "com.umbra.demo");

console.log("插件机制（M11-4）");

/* ── ① 清单校验：信任边界上的第一道关 ── */
const raw = JSON.parse(await readFile(join(DIR, "manifest.json"), "utf8"));
const good = checkManifest(raw);
ok(good.ok, "演示插件的清单合法", good.problems.map((p) => p.field).join(" "));

const bads: Array<[string, unknown, string]> = [
  ["id 里有路径分隔符", { ...raw, id: "../../etc" }, "id 兼做目录名，能逃出去就能写到别处"],
  ["入口路径带 ..", { ...raw, tools: "../../../server/dist/index.js" }, "能加载我们的文件"],
  ["hostApi 对不上", { ...raw, hostApi: "^99" }, `本机是 v${HOST_API_MAJOR}，插件独立更新，版本错配是常态`],
  ["没声明 permissions", (() => { const { permissions: _p, ...r } = raw; return r; })(), "默认不是「全给」，是「拒装」"],
  ["清单里写了 exec", { ...raw, permissions: { ...raw.permissions, exec: ["ffmpeg"] } }, "P1：连槽位都不留，写了当场拒"],
  ["扩展名不带点", { ...raw, kinds: [{ ...raw.kinds[0], ext: ["csv"] }] }, "不带点会把 abc.mycsv 也认成 csv"],
];
for (const [what, m, why] of bads) {
  const r = checkManifest(m);
  ok(!r.ok, `清单拒绝：${what}`, why);
}

/* ── ② 类型注册：插件加的格式立刻生效，卸载就退回去 ── */
const k = good.manifest!.kinds![0]!;
registerKind({ id: k.id, label: k.label, icon: k.icon, priority: k.priority!, textual: k.textual,
  match: (n) => k.ext.some((e) => n.endsWith(e)), from: good.manifest!.id });
ok(kindOf("data/表.csv") === "csv", "插件加的类型立刻生效");
ok(kindOf("x.dc.html") === BUILTIN.dc, "没动到内置类型");

/* ── ③ 沙箱：先证明它活着，再看它关不关得住 ── */
const sb = new PluginSandbox(good.manifest!, DIR);
let started = true;
try { await sb.start(); } catch (e) { started = false; ok(false, "沙箱起得来", (e as Error).message); }

if (started) {
  ok(sb.caps.length === 2, "插件声明的能力报上来了", `${sb.caps.map((c) => c.name).join(" / ")}`);
  ok(sb.caps.every((c) => c.name.startsWith("com.umbra.demo.")), "能力名带插件 id 前缀（防两个插件撞名）");

  /* **先做正向**：不先证明这条路是通的，后面「被拦住」就分不清是关住了还是本来就没通
     —— 纪律④ 要的对照组。
     ⚠️ 项目用临时目录，**不碰 `projects/`** —— 那是用户自己的东西（纪律⑥）。 */
  const TMP = join(tmpdir(), `umbrastudio-plugintest-${Date.now()}`);
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await writeFile(join(TMP, "project.json"), JSON.stringify({ name: "plugintest", title: "插件回归" }));
  await writeFile(join(TMP, "表.csv"), "name,role\n甲,设计\n乙,开发\n");
  const p = await buildProject(TMP);

  let normal: Record<string, unknown> = {};
  try { normal = await sb.invoke("com.umbra.demo.rows", { path: "表.csv" }, p) as Record<string, unknown>; }
  catch (e) { normal = { ok: false, why: (e as Error).message }; }
  ok(normal.ok === true && normal.rows === 3,
    "**对照组**：插件经 host.call 真读到了文件（这条不通，下面的「被拦」就不算数）",
    JSON.stringify(normal).slice(0, 70));

  /* 攻击样本 */
  const r = await sb.invoke("com.umbra.demo.probe", {}, p) as Record<string, string>;
  ok(!!r.readEtc?.startsWith("被拦"), "① 插件读不了 /etc/hosts（Node 权限模型）", r.readEtc);
  ok(!!r.write?.startsWith("被拦"), "② 插件一个字节都写不了盘（没给 --allow-fs-write）", r.write);
  ok(!!r.exec?.startsWith("被拦"), "③ **插件起不了子进程**（P1 的落点）", r.exec);
  ok(!!r.offWhitelist?.startsWith("被拦"), "④ 白名单外的宿主能力调不到（write_draft 不在白名单里）", r.offWhitelist);
  sb.stop();
}

/* ── ④ 白名单是白名单，不是黑名单 ── */
const names = allowedCapNames();
ok(!names.includes("write_draft") && !names.includes("chat_send"),
  "白名单里没有设计稿写入口和会话 —— 没列的一律调不到，包括将来新加的能力");

ok(unregisterKindsFrom("com.umbra.demo") === 1, "卸载把类型摘干净");
ok(kindOf("data/表.csv") === BUILTIN.other, "卸载后退回 other（文件卡），不是打不开");
await rm(join(tmpdir(), "x"), { recursive: true, force: true }).catch(() => {});

/* ── ⑤ A 面的 CSP：**真起一次 http 打穿看看** ──
   这是整套机制唯一的安全断言，不实测不算数。
   ⚠️ 判据看的是**响应头**不是页面里的 meta —— 头是插件碰不到的那一层。 */
{
  const { PLUGINS_DIR } = await import("./plugin/store.js");
  await mkdir(join(PLUGINS_DIR, "com.umbra.demo", "0.1.0"), { recursive: true });
  await writeFile(join(PLUGINS_DIR, "com.umbra.demo", "0.1.0", "manifest.json"), await readFile(join(DIR, "manifest.json"), "utf8"));
  await writeFile(join(PLUGINS_DIR, "com.umbra.demo", "0.1.0", "index.html"), "<b>plugin ui</b>");
  const { pluginDirOf } = await import("./plugin/store.js");
  ok(pluginDirOf("com.umbra.demo") !== null, "装进 STATE_ROOT 之后找得到它的目录");
  /* 目录逃逸：id 里带路径分隔符，或者文件路径带 .. */
  ok(pluginDirOf("../../etc") === null, "id 逃不出插件目录");
  const { listInstalled } = await import("./plugin/store.js");
  const installed = await listInstalled();
  ok(installed.some((x) => x.manifest.id === "com.umbra.demo" && x.problems.length === 0), "列得出来且清单没毛病");
  /* ⚠️ **不删，装回去**（M11-9b 改）：`uitest` 的插件端到端那一组要靠它。
     原来这里删掉，结果 `plugintest` 跑完再跑 `uitest`，那一组（9 条）**整块消失**，
     而总数照样打勾 —— 「119/119 全过」和「127/127 全过」在输出里都是一个 ✓。
     判据整块消失不会报警，它和「这些判据通过了」长得一模一样。
     演示插件是开发期夹具，`.umbrastudio/` 不进仓库，留着没有代价。 */
  const { cp } = await import("node:fs/promises");
  await cp(DIR, join(PLUGINS_DIR, "com.umbra.demo", "0.1.0"), { recursive: true });
  ok(true, "演示插件已装好（uitest 的插件端到端那一组要用它）");
}

/* ══════════ 装 / 验签 / 切版本（M11-6）══════════
   **重点仍然是「拦不拦得住」** —— 装插件是信任边界上最危险的一步：
   它把别人给的字节写进用户的机器。所以这里和 §85.5 一样，用攻击样本来验。 */
{
  const { generateKeyPairSync, sign: edSign } = await import("node:crypto");
  const { canonical, encodePackage, decodePackage, packDir, verifyPackage } = await import("./plugin/pack.js");
  const { installPackage, pluginVersions, switchVersion } = await import("./plugin/install.js");
  const { PLUGINS_DIR } = await import("./plugin/store.js");
  const { writeFile: wf, mkdir: md, rm: rmp } = await import("node:fs/promises");

  const KEYS = join(process.cwd(), "..", "keys");
  const pub = join(KEYS, "publisher.pub");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  await md(KEYS, { recursive: true });
  await wf(pub, publicKey.export({ type: "spki", format: "pem" }));

  const pkg = await packDir(DIR);
  ok(Object.keys(pkg.files).length >= 4, "打包读到了插件的文件", `${Object.keys(pkg.files).length} 个`);

  /* ① 没签名 → 拒装（本机有公钥，不是开发模式） */
  delete process.env.UMBRASTUDIO_PLUGIN_DEV;
  ok(verifyPackage(pkg).ok === false, "**没签名的包拒装**（默认拒绝，例外要显式打开）");

  /* ② 签了 → 过 */
  pkg.signature = edSign(null, canonical(pkg), privateKey).toString("base64");
  ok(verifyPackage(pkg).ok === true, "签过的包验得过");

  /* ③ **篡改一个字节就得验不过** —— 这是签名唯一要保证的事，
     不验这一条的话「签名机制」可能只是把一串 base64 存了又读回来。 */
  const tampered = { ...pkg, files: { ...pkg.files, "manifest.json": Buffer.from(
    Buffer.from(pkg.files["manifest.json"]!, "base64").toString("utf8").replace('"read"', '"write"'), "utf8").toString("base64") } };
  ok(verifyPackage(tampered as typeof pkg).ok === false, "**包被改过一个字节就验不过**（把权限从 read 偷改成 write）");

  /* ④ 路径逃逸：包里塞一个跑到插件目录外面的路径 */
  const evil = { ...pkg, files: { ...pkg.files, "../../../../pwned.txt": Buffer.from("x").toString("base64") } };
  evil.signature = edSign(null, canonical(evil), privateKey).toString("base64");   // 连签名都是真的
  let threw = "";
  try { await installPackage(evil as typeof pkg); } catch (e) { threw = (e as Error).message; }
  ok(threw.includes("逃出插件目录"), "**包里逃出目录的路径被拦**（签名真也不行 —— 签名只证明是谁给的，不证明它安全）", threw.slice(0, 40));

  /* ⑤ 真装一次 */
  await rmp(join(PLUGINS_DIR, "com.umbra.demo"), { recursive: true, force: true });
  const r1 = await installPackage(pkg);
  ok(r1.id === "com.umbra.demo" && r1.previous === null, "首次安装", `${r1.id} ${r1.version}`);
  ok(r1.unsigned === false, "签过的包不标未签名");
  ok(r1.kinds.includes("csv"), "**装完类型立刻注册上了，不用重启**（M11-10）", r1.kinds.join("/"));

  /* ⑥ 装第二版 → 切回第一版 */
  const v2 = JSON.parse(JSON.stringify(pkg)) as typeof pkg;
  v2.manifest.version = "0.2.0";
  v2.files["manifest.json"] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(pkg.files["manifest.json"]!, "base64").toString("utf8")), version: "0.2.0" }), "utf8").toString("base64");
  v2.signature = edSign(null, canonical(v2), privateKey).toString("base64");
  const r2 = await installPackage(v2);
  ok(r2.previous === "0.1.0", "更新时认得出上一版", `previous=${r2.previous}`);
  let vs = await pluginVersions("com.umbra.demo");
  ok(vs.current === "0.2.0" && vs.versions.length === 2, "两版都在，指针指向新版", `${vs.versions.join("/")} → ${vs.current}`);
  await switchVersion("com.umbra.demo", "0.1.0");
  vs = await pluginVersions("com.umbra.demo");
  ok(vs.current === "0.1.0", "**切回上一版只改指针**（回退很便宜）", `→ ${vs.current}`);

  /* ⚠️ **绕过安装流程放进去的目录要认出来是未签名**（M11-6 接线实测踩到）。
     原来存的是一个 `.unsigned` 结论文件 —— 手动 `cp` 进去的目录没有它，
     于是被当成「已签名」，界面上一点提示都没有。
     判据改成「**现在有没有 `.sig`**」之后这一条才成立。 */
  {
    const { cp } = await import("node:fs/promises");
    const hand = join(PLUGINS_DIR, "com.umbra.handcopy");
    await rmp(hand, { recursive: true, force: true });
    await cp(DIR, join(hand, "0.1.0"), { recursive: true });
    /* id 和目录名要一致，否则被判成「装错地方」而不是「未签名」 */
    const mf = JSON.parse(await readFile(join(hand, "0.1.0", "manifest.json"), "utf8")) as { id: string };
    mf.id = "com.umbra.handcopy";
    await wf(join(hand, "0.1.0", "manifest.json"), JSON.stringify(mf), "utf8");
    const { listInstalled } = await import("./plugin/store.js");
    const row = (await listInstalled()).find((x) => x.manifest.id === "com.umbra.handcopy");
    ok(!!row && row.unsigned === true, "**手动拷进去的目录被认出是未签名**（判据是「现在有没有签名」，不是「装的时候标过没有」）");

    /* ⚠️ **随便写一个 `.sig` 不能冒充已签名**。
       判据挪过两次，第二版（「目录里有没有 .sig」）就是被这一手绕过的 ——
       「有签名」和「签名验得过」是两件事。 */
    await wf(join(hand, "0.1.0", ".sig"), "这不是签名，只是一串字", "utf8");
    const fake = (await listInstalled()).find((x) => x.manifest.id === "com.umbra.handcopy");
    ok(!!fake && fake.unsigned === true, "**随便写一个 `.sig` 冒充不了已签名**（真验一次，不是看文件在不在）");
    await rmp(hand, { recursive: true, force: true });
  }
  {
    const row2 = (await (await import("./plugin/store.js")).listInstalled()).find((x) => x.manifest.id === "com.umbra.markdown");
    ok(!!row2 && row2.unsigned === false, "内置插件不算未签名（跟主程序一起发，主程序的签名就是它的）");
  }

  /* ── ⑦ **调用方给的 id / version 逃不出插件目录**（issue #23，p0；#25）──
     这一组和上面四件攻击样本的区别：上面攻的是**包里的内容**，这里攻的是**参数**。
     `uninstall_plugin` / `list_plugin_versions` / `switch_plugin_version` 都在 MCP 面上，
     id 来自调用方而**不来自清单**，所以 `checkManifest` 那道正则根本护不到它们。
     原来 `uninstall("../..")` 会 `rm -rf` 掉 `STATE_ROOT`（开发模式下就是整个仓库）。

     ⚠️ **判据本身不许有破坏力**：这里一律用「指向不存在的目录」的逃逸 id 当探针 ——
     闸生效就抛，闸万一失效也只是无害地返回 false。
     绝不写一个「修得不对就删掉仓库」的用例：回归自己不能是那把刀。 */
  {
    const { uninstall, pluginDirOf, PLUGINS_DIR: PD } = await import("./plugin/store.js");
    const { isInside, pluginIdDir } = await import("./plugin/paths.js");
    const path = await import("node:path");
    const { existsSync: ex } = await import("node:fs");

    for (const evilId of ["../..", "../../不存在的目录-xyz", "com.umbra.demo/../../x", "..\\..\\x", ""]) {
      let t = "";
      try { await uninstall(evilId); } catch (e) { t = (e as Error).message; }
      ok(t.includes("形状不对") || t.includes("外面"), `卸载拒绝逃逸的 id：${JSON.stringify(evilId)}`, t.slice(0, 28));
    }
    ok(ex(PD), "拒绝之后插件目录还在（判据自己没造成破坏）");

    /* `pluginDirOf` 走的是另一条路（同步、在 http 静态路径上，不抛）。
       ⚠️ 原来这里唯一的判据是 `pluginDirOf("../../etc") === null` —— 它通过
       **只是因为那个目录正好不存在**。换成一个真实存在的目录就穿了：
       `../../projects` 拼出来是用户的项目目录。判据要盯形状，不能靠运气。 */
    ok(pluginDirOf("../../projects") === null, "**查目录拒绝逃逸的 id，哪怕目标真的存在**（原判据靠「那个目录不存在」侥幸通过）");
    ok(pluginDirOf("../../etc") === null, "id 逃不出插件目录");

    const { pluginVersions: pv, switchVersion: sw } = await import("./plugin/install.js");
    let tv = ""; try { await pv("../.."); } catch (e) { tv = (e as Error).message; }
    ok(tv.includes("形状不对"), "列版本拒绝逃逸的 id（原来它能列出任意目录的文件名）", tv.slice(0, 28));
    let tw = ""; try { await sw("../..", "0.1.0"); } catch (e) { tw = (e as Error).message; }
    ok(tw.includes("形状不对"), "切版本拒绝逃逸的 id", tw.slice(0, 28));

    /* version 也兼做目录名 —— 原来 `checkManifest` 只查它非空 */
    const badV = checkManifest({ ...raw as object, version: "../../.." });
    ok(!badV.ok && badV.problems.some((x) => x.field === "version"), "**清单拒绝逃逸的版本号**（它兼做目录名，原来只查非空）");
    let ti = ""; try { pluginIdDir(PD, "com.umbra.ok"); } catch (e) { ti = (e as Error).message; }
    ok(ti === "", "正常 id 照过（闸不许误伤）", ti);

    /* ── #25：逃逸判据必须平台无关 ──
       原判据 `abs.startsWith(target + "/")` 在 Windows 上把**每一个正常文件**
       都判成逃逸，于是 win 上任何插件都装不上。
       这两条用 `path.win32` 跑同一个函数：**在 mac 上验 win 的行为，不需要真机**。 */
    const tgt = path.win32.join("C:\\S\\plugins\\com.a.b", "1.0.0");
    ok(isInside(tgt, path.win32.join(tgt, "manifest.json"), path.win32),
       "**win 规则下正常文件不算逃逸**（原判据硬编码 posix 的 /，win 上装不了任何插件）");
    ok(!isInside(tgt, path.win32.join(tgt, "..\\..\\pwned.txt"), path.win32), "win 规则下逃逸路径判得出来");
    const ptgt = "/s/plugins/com.a.b/1.0.0";
    ok(isInside(ptgt, ptgt + "/manifest.json", path.posix), "posix 规则下正常文件不算逃逸");
    ok(!isInside(ptgt, path.posix.join(ptgt, "../../pwned.txt"), path.posix), "posix 规则下逃逸路径判得出来");
    ok(!isInside(ptgt, ptgt, path.posix), "目录自己不算「在里面」（写到目录身上没有意义）");

    /* 包里的路径带反斜杠：包格式约定用 `/` 分隔，`a\..\..\x` 在 posix 上是**一个文件名**，
       拷到 win 上就变成三级路径。收下它等于把逃逸推迟到别人的机器上发生。 */
    const evil2 = { ...pkg, files: { ...pkg.files, "a\\..\\..\\pwned.txt": Buffer.from("x").toString("base64") } };
    evil2.signature = edSign(null, canonical(evil2), privateKey).toString("base64");
    let t2 = ""; try { await installPackage(evil2 as typeof pkg); } catch (e) { t2 = (e as Error).message; }
    ok(t2.includes("逃出插件目录"), "**包里带反斜杠的路径被拦**（posix 上是一个文件名，到 win 上就是三级路径）", t2.slice(0, 32));
  }

  /* 收尾：公钥是这一节临时造的，删掉；插件留着给 uitest 用 */
  await rmp(KEYS, { recursive: true, force: true });
  await rmp(join(PLUGINS_DIR, "com.umbra.demo", "0.2.0"), { recursive: true, force: true });
  await wf(join(PLUGINS_DIR, "com.umbra.demo", "current"), "0.1.0", "utf8");
  void decodePackage; void encodePackage;
}

console.log(fail === 0 ? `\n✓ 插件机制 ${pass}/${pass + fail}` : `\n✗ 插件机制 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
