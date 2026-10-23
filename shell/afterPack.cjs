/** 打完包立刻补一次**完整的** ad-hoc 签名（M9-4）。
 *
 *  为什么要补：`identity: null` 下 electron-builder 不签名，产物只剩 Electron 二进制出厂时的
 *  linker 签名 —— 它签的是那个可执行文件，**不覆盖我们塞进 Resources 的 core/**。
 *  于是 `codesign -v --deep --strict` 报
 *  「code has no resources but signature indicates they must be present」，
 *  用户下载后双击看到的是**「已损坏，移到废纸篓」**，右键打开也救不回来（实测）。
 *
 *  补签之后签名自洽。Gatekeeper 依然会拦 —— ad-hoc 没有 Apple 证书也没公证，这是必然的 ——
 *  但拦的理由从「已损坏」变成「无法验证开发者」，右键打开或系统设置里放行就能用。
 *  要彻底不拦得买开发者证书走 notarytool 公证，那是另一件事（`doc/12` M9-5）。
 */
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const { existsSync, mkdirSync, writeFileSync, readdirSync } = require("node:fs");
const { pathToFileURL } = require("node:url");

/** `Info.plist` 的显示名**按系统语言分**（M17-1，2026-10-24）。
 *
 *  中文系统的 Finder / Dock 显示「长尾雀 Studio」，英文系统显示「Quetail Studio」。
 *  做法是往 `.app/Contents/Resources/<语言>.lproj/InfoPlist.strings` 里写那两个键 ——
 *  `Info.plist` 里那一份是**兜底值**（没被覆盖的语言看它），分语言这张表的出处是
 *  `server/src/shared/brand.ts` 的 `bundleDisplayNameByLocale`（**那里写了兜底为什么留中文**）。
 *
 *  ⚠️⚠️ **必须在补签之前写** —— 补签签的是整个 `.app`（`--deep`），
 *  写在签名之后就是「改了已签名的包」：`codesign -v --deep --strict` 会报
 *  resource 对不上，而那在用户那头的症状是**「已损坏，移到废纸篓」**（下面那段注释的原话）。
 *  > **往一个会被整体签名的东西里塞文件，只有「签之前」一个时机。**
 *
 *  ⚠️ 语言目录名用 Electron 自己声明的那几个（实测产物里有 55 个 `.lproj`，
 *  中英文是 `zh_CN` / `zh_TW` / `en` / `en_GB`，都是空目录）。**目录不在就不写** ——
 *  另造一个 `.lproj` 等于给这个应用**多声明一种语言**，那是另一件事。
 *  目录不在时**打印出来**：静默跳过的话，哪天 Electron 改了目录名，
 *  这件事会无声失效而**读数看着完全正常**。
 *
 *  ⚠️ 读 `brand.js` 用**动态 `import()`** 而不是 `require()`：`server/` 是 `"type": "module"`，
 *  而 CJS `require()` 一个 ESM 模块**只在新 Node 上**可以（实测本机 24.11 能用）。
 *  `import()` 在 CJS 里也能用、而且不挑版本 —— 严格更稳的那一个。
 *  > **「在我这台机器上能用」和「能用」之间差的就是这一个选择。**
 *
 *  ⚠️ `.strings` 的转义：值走 `JSON.stringify` ——
 *  `.strings` 用的是 C 风格字符串字面量，和 JSON 的转义在这个范围内一致，
 *  而手拼引号一定会在某个名字上漏一种。文件按 **UTF-8** 写（现代 `plutil` / CFBundle 都认）。 */
async function writeLocalizedNames(app) {
  /* 从编译产物读，不在这里抄一份字面量 —— 抄一份就是第二处定义。 */
  const B = await import(pathToFileURL(join(__dirname, "..", "server", "dist", "shared", "brand.js")).href);
  const byLocale = B.bundleDisplayNameByLocale;
  const res = join(app, "Contents", "Resources");
  const have = new Set(existsSync(res) ? readdirSync(res) : []);
  const wrote = [];
  const missing = [];
  for (const [loc, name] of Object.entries(byLocale)) {
    const dir = `${loc}.lproj`;
    if (!have.has(dir)) { missing.push(dir); continue; }
    /* ⚠️⚠️ **只本地化 `CFBundleDisplayName`，绝不碰 `CFBundleName`**（2026-10-24）。
       `CFBundleName` 是 Electron 找 helper 的键
       （`Contents/Frameworks/<CFBundleName> Helper.app`），而 helper 目录名跟着
       冻结的 `productName`。本地化它 = 在某些系统语言下让 Electron 去找一个不存在的 helper
       → `FATAL … Unable to find helper app`，退出码 133。
       > **本地化一个被当成身份用的键，等于按用户的系统语言随机破坏启动。**
       改名那一批把 `Info.plist` 里那一份换成中文时就已经踩了这个（每个包都起不来）；
       这里差一点把它变成「只在中文系统上起不来」—— **那更难查**。 */
    const body = `/* 自动生成（shell/afterPack.cjs）—— 出处 server/src/shared/brand.ts */\n`
      + `/* 只有 CFBundleDisplayName：CFBundleName 是 Electron 找 helper 的键，不许本地化 */\n`
      + `CFBundleDisplayName = ${JSON.stringify(name)};\n`;
    mkdirSync(join(res, dir), { recursive: true });
    writeFileSync(join(res, dir, "InfoPlist.strings"), body, "utf8");
    wrote.push(`${dir}=${name}`);
  }
  console.log(`  • 分语言的显示名已写入 ${wrote.length} 个 .lproj：${wrote.join(" · ")}`
    + `（兜底值仍是 Info.plist 里的「${B.bundleDisplayName}」）`);
  if (missing.length) {
    console.log(`  ⚠️ 这几个语言目录不在产物里，没写：${missing.join(" · ")}`
      + ` —— Electron 可能改了语言目录名，去核 brand.ts 的 bundleDisplayNameByLocale`);
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  await writeLocalizedNames(app);    // ⚠️ 在补签之前，见上
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  // 签完立刻自己验一次：签名坏掉和签名没签在下游长得一样，不验等于没签
  execFileSync("codesign", ["-v", "--deep", "--strict", app], { stdio: "inherit" });
  console.log(`  • ad-hoc 签名已补并自洽  ${app.replace(process.cwd() + "/", "")}`);
};
