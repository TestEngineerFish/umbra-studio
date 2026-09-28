# entitlements.mac.plist 每一项为什么要（M9-5）

> ⚠️ **说明必须写在这里，不能写进 plist 里。**
> codesign 用的 AMFI 解析器比一般 plist 解析器严格得多：
> `<dict>` 里放 `<!-- -->` 会直接
> `Failed to parse entitlements: AMFIUnserializeXML: syntax error near line N`，
> 而且**注释里出现反引号也会让 `plutil` 报错**（`Unexpected character \` at line 6`）。
> 2026-09-28 两条都实测踩到 —— 第一条是签到一半整个打包失败，
> 第二条是 `plutil -lint` 当场抓住的。
>
> **验法（改完必须跑，别靠一次五分钟的打包去发现语法错）：**
> ```bash
> plutil -lint shell/build/entitlements.mac.plist
> cp /usr/bin/true /tmp/sigtarget
> codesign --sign "<你的 identity>" --force --options runtime \
>   --entitlements shell/build/entitlements.mac.plist /tmp/sigtarget
> codesign -dv --verbose=2 /tmp/sigtarget   # 期望 Authority=Developer ID… + flags=0x10000(runtime)
> ```

| key | 为什么要 |
| --- | --- |
| `cs.allow-jit` | V8 的 JIT。不给：Electron 起不来 |
| `cs.allow-unsigned-executable-memory` | V8 / WebAssembly 要可写可执行的内存 |
| **`cs.disable-library-validation`** | **我们特有的一条。** 核心跑在 `extraResources/core/` 下（`server/dist` + `node_modules`），由主进程用 `ELECTRON_RUN_AS_NODE` 起成子进程 —— 那不是同一 Team 签名的东西。少了它，子进程加载依赖时会被 dyld 拒掉，症状是**「打包版一起来就闪退」**，而开发模式下完全测不出来（`00` §63.1 那一族） |
| **`cs.allow-dyld-environment-variables`** | **我们特有的第二条。** 主进程起核心要设 `ELECTRON_RUN_AS_NODE`，插件沙箱还要传 `--permission` / `--require` 那套 execArgv。不给这一项，hardened runtime 会把带环境变量的子进程拦下来 |
| `files.user-selected.read-write`<br>`files.downloads.read-write` | ⚠️ **当前没有实际作用** —— 我们**没有开 App Sandbox**（没有 `com.apple.security.app-sandbox`），这是有意的：产品的核心功能是「打开用户任意目录」，沙盒下要靠 powerbox 逐个授权，和定位相反。官网分发（Developer ID）不要求沙盒，只有 Mac App Store 才要求。留着是为了将来真要上架时不用重新研究 |

## 另一条实测：打包会去签 `node_modules` 里的每一个文件

失败那一次的报错指向
`Contents/Resources/core/server/node_modules/playwright-core/lib/vite/dashboard/assets/codicon-DCmgc-ay.ttf`
—— 一个字体文件。electron-builder 会遍历签 `.app` 里的所有文件，
所以 **entitlements 一旦有语法错，第一个被签的文件就会让整个打包失败**。
好处是失败得早、失败得响；坏处是报错指向一个和问题毫无关系的 `.ttf`，
第一眼很容易以为是那个文件的问题。
