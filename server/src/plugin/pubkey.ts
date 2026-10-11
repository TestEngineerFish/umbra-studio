/** 发布方公钥在哪（Ed25519，验插件包与许可证两处都用它）。
 *
 *  正式：`TOOL_ROOT/keys/publisher.pub`，随程序发（打包进 `core/keys`），与服务端 ECS 上的私钥配对。
 *  测试：`UMBRASTUDIO_PUBKEY=<临时文件>` —— 回归要用自己临时生成的密钥对签样本，
 *  **不能覆盖仓库里那份真公钥**（2026-10-11 之前 `plugintest` 就是直接往 `keys/publisher.pub` 写的，
 *  那时它还不是真钥匙）。每次调用现读环境变量，测试在任何时候设都生效。
 */
import { join, resolve } from "node:path";
import { TOOL_ROOT } from "../project.js";

export function publisherKeyPath(): string {
  const env = process.env.UMBRASTUDIO_PUBKEY;
  return env ? resolve(env) : join(TOOL_ROOT, "keys", "publisher.pub");
}
