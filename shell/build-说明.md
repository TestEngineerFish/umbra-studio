# `shell/package.json` 的 `build` 字段：两段说明

⚠️⚠️ **这两段原来直接写在 `build` 对象里**（键名 `_品牌说明` / `_electronFuses说明`），
2026-10-24 搬到这里 —— 因为 **electron-builder 26.15.3 拒绝配置里的未知键**：

```
⨯ Invalid configuration object. electron-builder 26.15.3 has been initialized using a
  configuration object that does not match the API schema.
 - configuration has an unknown property '_品牌说明'
 - configuration has an unknown property '_electronFuses说明'
```

`devDependencies` 写的是 `^26.0.12`，装到的是 **26.15.3** ——
**一个 caret 范围里的小版本升级收紧了 schema 校验**，于是这两个「只是注释」的键
从被忽略变成致命错误，而**没有人改过一行代码**。
上一次打包成功时它们还是被忽略的。

> **一个依赖的版本范围，能在没人动代码的情况下让打包从「能跑」变成「跑不起来」。**
> 而这件事**只有真打一次包才暴露** —— `packtest` 测的是产物（产物是上一次打的），
> `tsc` 和二十套回归一个都碰不到 `shell/package.json` 的 schema。

⚠️ electron-builder **没有「被忽略的注释键」这种东西**，所以不是换个键名的问题 ——
说明只能住在配置对象外面。放在这份文件里，并在它该被读到的地方指回来。

---

## 品牌说明（原 `_品牌说明`）

`productName` 与 `appId` **冻结在改名之前的值** —— 它们决定 `.app` 文件名与应用身份
（`userData` / TCC 授权 / 钥匙串）。改了用户 `/Applications` 里会多一个孤儿、
**已装的数据也会失联**。

显示层走 `CFBundleDisplayName` / `CFBundleName`，读 `brand.ts` 的 `bundleDisplayName`。
分发物文件名用 ASCII 的 `productNameEn`（2026-10-23 sam 定为 **Quetail**），
理由是 win 的分发物是 zip，而 `ziptest` 钉着「中文文件名要靠 bit 11，不是所有解压器都认」。

⚠️ **2026-10-24（M17-1）起显示名按语言分**：`extendInfo` 里那一份是**兜底值**（中文），
各语言的在 `.app/Contents/Resources/<语言>.lproj/InfoPlist.strings`，由 `afterPack.cjs` 写，
出处是 `brand.ts` 的 `bundleDisplayNameByLocale`（**那里写了兜底为什么留中文**）。
原来这里写着「只有这一份、所有语言环境共用（没有 .lproj）」—— 那句话现在过期了。

## electron fuses 说明（原 `_electronFuses说明`）

见下面 electronFuses 的三条；放在这里是因为 JSON 不能写注释，而这几个值的理由比值本身长。① enableNodeOptionsEnvironmentVariable=false：关掉 NODE_OPTIONS=--require 这条注入口。已核 sandbox.ts 的 env 是白名单、故意不透传 NODE_OPTIONS（issue #24），所以关掉不碰现有功能。② enableNodeCliInspectArguments=false：关掉 --inspect 挂调试器进主进程。已核 execArgv 里只有 --permission / --allow-fs-read / --require。③ runAsNode 刻意不关（issue #138 第二步要拍板）：插件 B 面的 runner 和通道 B 的 MCP 入口都靠 ELECTRON_RUN_AS_NODE=1 起，关了打包版两处都静默失效，而开发模式一定测不出来（fuses 只写进打包的二进制）。出路是改用 Electron 的 utilityProcess.fork，但 Node 的 --permission 在 utility process 里是否同样生效没有实测过 —— 那是这条路最大的未知，要先 spike。
