/** 「一段字节能不能转成 base64 字符串」的运行时上限（issue #180）。
 *
 *  ### 为什么它自己一个文件
 *  ⚠️ 这个常量有**两个消费者**：`files.ts`（转之前判一次）和
 *  `plugin/limits.ts`（设置页的 `max` 不许大过它）。而那两个模块之间
 *  **本来就有一条动态 import 的环**（`files.ts` 用前动态 import `limits.ts`，
 *  注释里写着「静态引会绕回本文件成环」）。
 *  把常量放进其中任何一个，另一个静态 import 它就会在**模块求值期**撞上 TDZ ——
 *  第一版就是这样：`ReferenceError: Cannot access 'BASE64_SAFE_MAX' before initialization`。
 *  > **一个被多处用到的常量，放在任何一个「有依赖的模块」里都会制造环** ——
 *  > 叶子模块才是它的住处（和 `tmpfiles.ts` 同一条理由，M14-9）。
 *  ⚠️ **本文件只许 import node 内置的东西。**
 *
 *  ### 这个数是什么
 *  V8 单个字符串最长 `constants.MAX_STRING_LENGTH` 个字符
 *  （Node 24.11 / Electron 44 实测 536870888），而 base64 每 **3 字节变 4 字符**，
 *  所以能转的字节数 ≈ `MAX_STRING_LENGTH × 3/4` ≈ **384 MB**。
 *  超过它 `buf.toString("base64")` 抛 `ERR_STRING_TOO_LONG`，而那条异常会被包成
 *  `E_IO`「Cannot create a string longer than…」——
 *  **用户看到的是一句 V8 的内部错误，而不是「这个文件太大」**。
 *  > **一个上限如果来自运行时的硬限制，就该从运行时读出来** ——
 *  > 写死 384 的话，哪天 V8 改了这个数，我们这边要么白白拒绝、要么又开始抛。
 */
import { constants } from "node:buffer";

export const BASE64_SAFE_MAX = Math.floor(constants.MAX_STRING_LENGTH / 4) * 3;
