# `.umbraplugin` 容器格式与 `canonical()` 规则

> 这份是**承重的**：服务端（Python）签名、Studio（Node）验签、本仓库（Node）打包，三方对的都是这一份。
> 正本来源：Umbra Studio `server/src/plugin/pack.ts`（`packDir` / `canonical` / `encodePackage` / `decodePackage` / `verifyPackage`）。
> 改格式先改这里，再改三方代码，最后用 §五 的测试向量证明三方还一致。

## 一、容器

一个 `.umbraplugin` 文件 = **gzip 压过的一段 JSON 文本**（UTF-8）。不是 zip、不是 tar。
理由在 Studio `doc/00` §96.1：打包后的应用不能指望用户机器上有 unzip，`zlib` 是 Node 内置的、两个平台行为一致。

解开之后是这个对象：

```jsonc
{
  "format": 1,                       // 容器版本。只认 1；换流式格式时加 2，可并存
  "manifest": { … },                 // 清单的副本（见 §二.2）。装之前不解全包就能看权限
  "files": { "<相对路径>": "<base64>", … },   // 插件目录里的每一个文件
  "signature": "<base64>"            // 可选。对 canonical 字节的 Ed25519 签名
}
```

| 字段 | 规则 |
| --- | --- |
| `format` | 整数 `1`。Studio `decodePackage` 不是 1 就拒 |
| `files` 的键 | 插件目录内的相对路径，**`/` 分隔**，不以 `/` 开头、不含 `\`、不含 `..` 段（Studio 装的时候逐条按「拼完还在不在目标目录里」查，签名真也拦）。本仓库另加：**只用可见 ASCII、不含空格、路径段不是纯数字**（§四 说为什么） |
| `files` 的值 | 文件原始字节的标准 base64（RFC 4648，带 `=` 填充，不换行）。空文件是 `""` |
| 哪些文件进包 | 插件目录下**所有**文件（含子目录），**跳过名字以 `.` 开头的**文件和目录（`.DS_Store`、`.gitignore`、`.sig` 都不进）。本仓库 `pack.mjs` 再多跳一个 `plugin.css`（它是打包输入，已拼进生成的 `theme.css`，见 README §三）—— 这一条**不是容器格式的规则** |
| `manifest` | `files["manifest.json"]` 解析后的**归一化**结果（§二.2）。⚠️ Studio 装的时候**以 `files` 里那份为准**重新校验，副本只给「装之前看权限」用 —— 两份不一致时伪造副本骗不过安装，但会让签名验不过（副本参与签名） |
| `signature` | 可选。没有 = 未签名包：Studio 只在 `UMBRASTUDIO_PLUGIN_DEV=1` 时放行并标「未签名」 |
| 外层 JSON 的空格 / 键序 / `files` 顺序 | **不参与签名**，随意。Studio 用 `JSON.parse` 读；本仓库 `encodePackage` 写成无空格、键序 `format, manifest, files, signature`、`files` 按键排序，只为同一台机器两次打包字节相同 |
| gzip 参数 | 不参与签名。任何能被 `zlib.gunzip` 解开的 gzip 流都行 |

## 二、`canonical()`：签名签的是什么

```js
canonical = UTF8( JSON.stringify({ format, manifest, files: sortedByKey(files) }) )
```

逐条展开：

### 2.1 序列化规则（= JavaScript `JSON.stringify` 的默认行为）

1. 顶层键序固定：`format` → `manifest` → `files`。**没有 `signature`**。
2. **无任何空白**（没有缩进、没有空格、没有换行）。
3. `files` 的键按 **UTF-16 code unit 顺序**升序排列（JS `Array.prototype.sort()` 的默认比较）。文件名限 ASCII 之后它等于字节序 / code point 序。
4. `manifest` **保持副本里的键序**（不排序）。副本的键序 = `manifest.json` 里的书写顺序 + §二.2 的追加。
5. 字符串转义：只转义 `"`、`\`、U+0000–U+001F。其中 `\b \f \n \r \t` 用短形式，其余控制字符用 `\u00xx`（**小写十六进制**）。**非 ASCII 不转义**（中文原样是 UTF-8 字节）。`/` 不转义。U+007F、U+2028、U+2029 不转义。
6. 数字：整数按十进制原样；**不该出现浮点**（§四）。
7. 布尔 / null 按字面量。

### 2.2 `manifest` 副本的归一化

副本 = `JSON.parse(files["manifest.json"])` 之后，经 Studio `checkManifest` 处理的对象。`checkManifest` 对合法清单**只改一处**：

> 每个 `kinds[i]` 没有 `priority` 字段时，**追加** `"priority": 50`（追加在该 kind 对象的末尾）。

其余键原样、原序。所以 Python 侧要：`m = json.loads(raw)`（dict 保序）→ `for k in m.get("kinds", []): k.setdefault("priority", 50)`。
§五 的测试向量特意让 `kinds[0]` 不写 `priority`，钉住这一条。

### 2.3 签名

`signature = base64( Ed25519_sign(privateKey, canonicalBytes) )`。

- **纯 Ed25519**（RFC 8032），不预哈希。Node：`crypto.sign(null, bytes, key)` —— 第一个参数必须是 `null`，传 `"sha256"` 直接抛。Python（cryptography）：`Ed25519PrivateKey.sign(bytes)`。
- 验签：`crypto.verify(null, canonicalBytes, publicKey, sigBytes)`。
- 钥匙格式：私钥 PKCS#8 PEM，公钥 SubjectPublicKeyInfo PEM（Studio `keys/publisher.pub`）。
- 包签名与许可证签名**是同一对钥匙**（Studio `doc/23` D6）。

## 三、Studio 侧怎么验（`verifyPackage` / `installPackage` 的顺序，不能换）

1. gunzip → `JSON.parse`；`format !== 1` 拒；没有 `files` 拒
2. 验签：本机没公钥 → 拒（dev 模式放行并标未签名）；包没 `signature` → 拒（dev 同上）；`verify(null, canonical(pkg), pub, sig)` 不过 → 拒
3. 从 `files["manifest.json"]` 重新 `checkManifest`，不合法拒
4. id 是内置插件（`TOOL_ROOT/plugins/<id>` 存在）→ 拒「不能用装包的方式覆盖内置插件」
5. `id` / `version` 各过一道形状闸再拼目录（两者都兼做目录名）
6. 逐条路径：含 `\` 或以 `/` 开头拒；`join(target, normalize(rel))` 不在 `target` 里面拒。任何一步失败**不落一个字节**
7. 落盘；有 `signature` 就写 `<目录>/.sig`（列插件时按目录内容重算 canonical 再验，**不是看 `.sig` 在不在**）

## 四、跨语言差异点（Python 实现必读）

| 差异 | 影响 | 怎么回避 |
| --- | --- | --- |
| 浮点：JS 把 `1.0` 串成 `1`、`1e3` 串成 `1000`；Python `json.dumps` 保留 `1.0` | 清单里一出现小数签名就对不上 | 清单里**不许有浮点字面量**。`validate.mjs` 扫 JSON 文本拒掉（不是解析后拒 —— 解析后 `50.0` 和 `50` 已经分不开） |
| 键排序：JS `sort()` 按 UTF-16 code unit，Python `sorted()` 按 code point；astral 字符（emoji 等）两者顺序不同 | 文件名含 emoji 时 `files` 排序分叉 | 文件名**限可见 ASCII** |
| **整数样的键**：JS 对象把形如 `"0"`、`"42"` 的键（数组索引样）**排在所有字符串键之前、按数值升序**，不管插入顺序；`JSON.stringify` 照此输出。Python 按 dict 顺序 | 文件名或路径段是纯数字时 `files` 键序分叉；`manifest` 里若有这种键也会 | 路径段**不许是纯数字**（`validate.mjs` V3）；清单键名本来都不是数字 |
| 转义：Python `json.dumps(ensure_ascii=False)` 的转义集和 JS 一致（`"`、`\`、控制字符；短形式 + `\u00xx` 小写）。差异只在 **lone surrogate**：JS 输出 `\udXXX`，Python 无法编成 UTF-8 | 合法 UTF-8 的清单里不会出现 | 不用管，但别手造 |
| `JSON.stringify` 会**丢掉** `undefined` 值的键、把 `NaN`/`Infinity` 写成 `null` | 从 JSON 解析出来的对象没有这些 | Python 侧从 JSON 文本出发就不会碰到 |
| Python `json.dumps` 默认 `separators=(", ", ": ")` 带空格 | 整个 canonical 不一样 | **必须** `separators=(",", ":")` |
| Python `ensure_ascii` 默认 `True` 会把中文转成 `\uXXXX` | `name: "Markdown 编辑"` 这种就分叉 | **必须** `ensure_ascii=False`，再 `.encode("utf-8")` |
| base64：Node `Buffer.toString("base64")` = Python `base64.b64encode`（标准字母表、带填充、不换行） | 一致 | 别用 `urlsafe_b64encode`、别加换行 |
| gzip 头里带时间戳 / OS 字节 | 外层字节不同 | 不参与签名，无需一致 |

Python 侧的 canonical 一句话：

```python
obj = {"format": 1, "manifest": normalized_manifest, "files": {k: files[k] for k in sorted(files)}}
canonical = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
```

## 五、测试向量（`sdk/test-vectors/`）

一个最小插件 + 它的每一个中间产物。**任何一方的实现先对这一组，再碰真包。**

| 文件 | 是什么 |
| --- | --- |
| `minimal/manifest.json` · `minimal/index.html` | 插件目录。清单里故意：① `name` 含中文（钉「非 ASCII 不转义」）② `kinds[0]` 不写 `priority`（钉 §二.2 的补 50）③ 键序不是字母序（钉「manifest 不排序」）|
| `canonical.bytes.json` | **canonical 的精确字节**（1032 字节）。Python 算出来的要和它 `==` |
| `canonical.sha256` | 上面那串字节的 SHA-256（十六进制，一行） |
| `com.example.minimal-0.1.0.unsigned.umbraplugin` | 未签名包 |
| `signature.base64` | 用一把**临时**测试私钥对 canonical 签出的 Ed25519 签名（私钥已销毁，不在任何地方） |
| `test-publisher.pub` | 和那把临时私钥配对的公钥（SPKI PEM）。**只用来验测试向量**，不是发布方公钥 |
| `com.example.minimal-0.1.0.signed.umbraplugin` | 带上面那个签名的包 |

对拍步骤（Python 侧）：

1. 读 `minimal/` 两个文件 → 按 §一 / §二 算 canonical → 字节等于 `canonical.bytes.json`，sha256 等于 `canonical.sha256`
2. 用 `test-publisher.pub` 验 `signature.base64` 对 canonical 成立
3. 解 `*.unsigned.umbraplugin`，重算 canonical 仍等于 ①
4. **反向**：用你自己的（临时）钥匙签 ① 的字节、装进包，交给 Studio `verifyPackage`（`UMBRASTUDIO_PUBKEY` 指到你的公钥）要过 —— 本仓库出种子时已经用 Studio 的 `pack.ts` 对这组向量跑过一遍：canonical sha256 相等、已签名包 `verifyPackage` 通过、未签名包被拒、改一个文件验不过

本仓库自己的核对：`node scripts/verify-test-vectors.mjs`（CI 每次跑）。
要刷新向量（改了 `minimal/`）：`node scripts/make-test-vectors.mjs --key <临时私钥>`，签完**删掉私钥**；
不带 `--key` 跑时它只重算、并要求旧签名仍对得上，对不上就报错而不是迁就。

## 六、已知限制

- 二进制走 base64，比原文件大三分之一；下载侧硬限 50 MB（Studio `install_plugin_from_url`）。视频这类大包要等 `format: 2`（流式），不是把 1 撑大。
- 容器里没有「文件的权限位 / 时间戳 / 符号链接」—— 全部当普通文件写出。插件别依赖这些。
- `canonical()` 不覆盖外层的 `signature` 以外的任何附加字段：外层多出来的键 Studio 忽略、不签。别往外层塞元数据，放进 manifest。
