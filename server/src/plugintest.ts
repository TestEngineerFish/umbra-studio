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
  /* ⑤ 联网（issue #24）。⚠️ **判据是 `ERR_ACCESS_DENIED`，不是「连不上」** ——
     `ECONNREFUSED` 也是连不上，这一件当初就是这么被漏掉的：
     四件攻击样本里没有联网，而注释写着「（不给 --allow-net）不许联网」。
     Node 24.x 的权限模型根本不拦网络（实测 24.11 / 24.21 都是 ECONNREFUSED）。 */
  ok(r.net === "被拦 ERR_ACCESS_DENIED", "⑤ **插件联不出去**（判据是 ERR_ACCESS_DENIED，不是「连不上」）", r.net);
  /* ⚠️ 这一条判据我第一版写成了 `startsWith("被拦")`，**撤掉桩之后它照样通过** ——
     因为 `fetch` 连不上关着的端口时消息是 `fetch failed`，也以「被拦」开头。
     反向验证当场抓住的（纪律④）。和 ⑤ 同一个道理：**要的是错误码，不是「失败了」**。 */
  ok(r.fetch === "被拦 ERR_ACCESS_DENIED", "⑤b fetch 也封了（undici 那一套不经 net.connect）", r.fetch);
  /* ⑥ env 白名单：原来 `...process.env` 把宿主 93 个变量整份交过去 */
  {
    const keys = (r.envKeys ?? "").split(",").filter(Boolean);
    /* `NODE_CHANNEL_*` 是 `fork` 自己为 IPC 加的（不加就没有 `process.send`）。
       `__CF_USER_TEXT_ENCODING` 是 **macOS 往每个进程注入的** ——
       实测「只传 PATH 起一个子进程」它照样出现，所以不是我们漏传。
       写进允许列表并注明，免得下一个人以为白名单漏了一项而去"修"它。 */
    const allowed = ["ELECTRON_RUN_AS_NODE", "NODE_CHANNEL_FD", "NODE_CHANNEL_SERIALIZATION_MODE",
                     "PATH", "UD_PLUGIN_DIR", "UD_PLUGIN_ENTRY", "__CF_USER_TEXT_ENCODING"];
    const extra = keys.filter((k) => !allowed.includes(k));
    ok(extra.length === 0, "⑥ **插件只看得到白名单里那几个环境变量**（原来是宿主的全部）", extra.length ? "多出来：" + extra.join(",") : `${keys.length} 个`);
    /* 再钉一条"意图判据"：宿主一定有、插件一定不该有的那几个。
       上面那条会随平台注入项变化，这一条不会 —— 两条一起才说得清"要防的是什么"。 */
    const hostOnly = ["HOME", "USER", "SHELL", "TMPDIR"].filter((k) => k in process.env && keys.includes(k));
    ok(hostOnly.length === 0, "⑥b 宿主的 HOME / USER / SHELL / TMPDIR 一个都没传过去", hostOnly.join(",") || "一个都没有");
  }
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
    /* ⚠️ **版本号要用一个别处不用的**（0.9.9）：`installPackage` 的顺序是
       先 `rm(target)` 再逐个查路径，所以拿 `0.1.0` 来试会把**真装着的那一版清空** ——
       我第一版就是这么写的，结果 `uitest` 里依赖演示插件的 9 条整块没跑到，
       而 `plugintest` 自己全绿。判据不许破坏别的判据要用的东西（同 M11-9b 那条）。 */
    const mfEvil = { ...JSON.parse(Buffer.from(pkg.files["manifest.json"]!, "base64").toString("utf8")) as object, version: "0.9.9" };
    const evil2 = { ...pkg, manifest: { ...pkg.manifest, version: "0.9.9" },
      files: { ...pkg.files, "manifest.json": Buffer.from(JSON.stringify(mfEvil), "utf8").toString("base64"),
               "a\\..\\..\\pwned.txt": Buffer.from("x").toString("base64") } };
    evil2.signature = edSign(null, canonical(evil2), privateKey).toString("base64");
    let t2 = ""; try { await installPackage(evil2 as typeof pkg); } catch (e) { t2 = (e as Error).message; }
    ok(t2.includes("逃出插件目录"), "**包里带反斜杠的路径被拦**（posix 上是一个文件名，到 win 上就是三级路径）", t2.slice(0, 32));
  }

  /* ══════════ 授权：装了 ≠ 能用（M11-12 · `doc/20` §四）══════════
     M11-6 的验签管「装的时候这个包是不是我们签的」；这一层管「**用的时候**还有效吗」。
     ⚠️ 「过期」是会真实出现的态：**限时免费到期那天，所有试用用户同时看到它**。
     所以判据要覆盖每一种态，而不只是「有授权能用」那一种。 */
  {
    const { verifyLicenseText, entitlementOf, nowMonotonic } = await import("./plugin/license.js");
    const { STATE_ROOT } = await import("./project.js");
    const licFile = join(STATE_ROOT, ".umbrastudio", "license.json");
    const clockFile = join(STATE_ROOT, ".umbrastudio", "clock.json");
    const day = (offset: number) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);
    const sign = (lic: unknown) => {
      const payload = JSON.stringify(lic);
      return JSON.stringify({ payload, signature: edSign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64") });
    };

    /* ① 签名是这一层的地基 —— 改一个字节就得验不过 */
    const good = sign({ sub: "u1", grants: [{ plugin: "com.a.buy", from: day(-10), until: null, src: "purchase" }] });
    ok(verifyLicenseText(good).ok === true, "签过的许可证验得过");
    const tampered = JSON.parse(good) as { payload: string; signature: string };
    tampered.payload = tampered.payload.replace("com.a.buy", "com.a.pro");
    ok(verifyLicenseText(JSON.stringify(tampered)).ok === false,
       "**改一个插件名就验不过**（不然改一行就把没买的插件写成买了）");
    ok(verifyLicenseText("{}").ok === false, "缺 payload / signature 的许可证拒收");

    /* ② 四种态：买断 · 限时未到期 · 限时已过期 · 没授权。
       ⚠️ 「过期」这一态必须单独验 —— 它是这一整层存在的理由。 */
    await wf(licFile, sign({
      sub: "u1",
      grants: [
        { plugin: "com.a.buy", from: day(-10), until: null, src: "purchase" },
        { plugin: "com.a.trial", from: day(-10), until: day(7), src: "promo" },
        { plugin: "com.a.over", from: day(-40), until: day(-3), src: "promo" },
        { plugin: "com.a.soon", from: day(7), until: day(30), src: "gift" },
      ],
    }), "utf8");
    const buy = await entitlementOf("com.a.buy");
    ok(buy.state === "active" && buy.until === null, "买断：active 且永久（`until: null`）", buy.note);
    ok((await entitlementOf("com.a.trial")).state === "active", "限时未到期：active");
    const over = await entitlementOf("com.a.over");
    ok(over.state === "expired" && !!over.until, "**限时已过期：expired，而且说得出到期日**", over.note);
    ok(over.note.includes("购买"), "过期那一态**给了出路**（不是只说「不可用」）", over.note);
    ok((await entitlementOf("com.a.soon")).state === "not-yet", "还没生效：not-yet");
    ok((await entitlementOf("com.a.none")).state === "unlicensed", "没这一条授权：unlicensed");
    ok((await entitlementOf("com.umbra.markdown", { bundled: true })).state === "builtin",
       "内置插件永远能用（builtin，不看许可证）");

    /* ③ 买断应该盖过已过期的试用 —— **同一个插件先试用后买断**是最常见的路径。
       取错一条（比如取第一条 / 取最早的）会让「买过的人因为试用过期而用不了」，
       那是这一层最糟的一种错：**它惩罚付过钱的人。** */
    await wf(licFile, sign({
      sub: "u1",
      grants: [
        { plugin: "com.a.both", from: day(-40), until: day(-3), src: "promo" },
        { plugin: "com.a.both", from: day(-2), until: null, src: "purchase" },
      ],
    }), "utf8");
    const both = await entitlementOf("com.a.both");
    ok(both.state === "active" && both.until === null,
       "**先试用后买断：取最宽松的那一条**（不能让买过的人被过期的试用挡住）", both.note);

    /* ④ 时钟回拨：本地记「见过的最晚时间」，只许前进不许后退。
       ⚠️ 这挡的是顺手改时间，挡不住会改文件的人 —— 离线授权一定可破解，
       那是「离线可用」自带的代价（`doc/20` §4.2），不是实现没做好。 */
    await wf(clockFile, JSON.stringify({ seen: Date.now() + 10 * 86400e3 }), "utf8");
    const back = await nowMonotonic();
    ok(back.rolledBack === true, "**系统时间被调回去了 → 认出来**（高水位比系统时间晚）");
    ok(back.now.getTime() > Date.now() + 5 * 86400e3, "认出回拨之后用的是高水位那个时间，不是系统时间");
    /* 回拨状态下，过期的那条**不能**因此复活 */
    await wf(licFile, sign({ sub: "u1", grants: [{ plugin: "com.a.over", from: day(-40), until: day(3), src: "promo" }] }), "utf8");
    const revived = await entitlementOf("com.a.over");
    ok(revived.state === "expired",
       "**把时间调回去也救不活过期的授权**（判的是高水位，不是系统时间）", revived.note);
    ok(revived.rolledBack === true, "回拨这件事本身要报出来（界面要提一句，不然「为什么突然过期」没人答得上）");

    /* ⑤ 半个 clock.json 不能让这道检查静悄悄失效 ——
       坏文件解析出来是「时间零」，而 `Math.max(now, 0) === now`，**失效的方向正好是放行**。
       这和 §100.2「坏掉的安全检查看起来和通过一模一样」是同一族。 */
    await wf(clockFile, '{"seen":', "utf8");
    const broken = await nowMonotonic();
    ok(broken.rolledBack === false && Math.abs(broken.now.getTime() - Date.now()) < 5000,
       "clock.json 坏了就当没见过（退回系统时间），不当成「时间零」");
    await rmp(licFile, { force: true });
    await rmp(clockFile, { force: true });
  }

  /* 收尾：公钥是这一节临时造的，删掉；插件留着给 uitest 用 */
  await rmp(KEYS, { recursive: true, force: true });
  await rmp(join(PLUGINS_DIR, "com.umbra.demo", "0.2.0"), { recursive: true, force: true });
  await rmp(join(PLUGINS_DIR, "com.umbra.demo", "0.9.9"), { recursive: true, force: true });
  await wf(join(PLUGINS_DIR, "com.umbra.demo", "current"), "0.1.0", "utf8");
  /* ⚠️ **收尾自检**：`uitest` 的插件端到端那一组（9 条）靠这个目录存在。
     不检的话，本文件里任何一条把它删掉的改动都表现成「plugintest 全绿、
     uitest 少 9 条」——而"少跑 9 条"和"9 条都过了"在输出里长得一样。
     实测栽过一次（加反斜杠那条判据时）。 */
  {
    const { pluginDirOf: pdo } = await import("./plugin/store.js");
    const d = pdo("com.umbra.demo");
    const { existsSync: ex2 } = await import("node:fs");
    ok(!!d && ex2(join(d, "index.html")), "收尾后演示插件还在（uitest 那 9 条靠它）", d ?? "没了");
  }
  void decodePackage; void encodePackage;
}

console.log(fail === 0 ? `\n✓ 插件机制 ${pass}/${pass + fail}` : `\n✗ 插件机制 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
