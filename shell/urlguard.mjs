/** 壳的 URL 判据（issue #131）。单独一个文件是为了**不起 Electron 也能验**（`node urlguard.mjs` 自测）。
 *
 *  ⚠️ 稿件是 AI / 外部来稿写的，属于不可信内容，而它的 `window.open` / `target=_blank`
 *  和 `host:openExternal` 原来都原样进 `shell.openExternal` —— `file:///Applications/X.app`
 *  在 macOS 上会直接启动那个程序，自定义 scheme 会拉起对应的处理程序。
 *  所以外开只放 http / https / mailto；本机 `http://127.0.0.1:*` 照常放行（「在浏览器里打开当前页」要用）。 */
export const EXTERNAL_PROTOCOLS = ["http:", "https:", "mailto:"];

export function externalAllowed(url) {
  try { return EXTERNAL_PROTOCOLS.includes(new URL(String(url)).protocol); } catch { return false; }
}

/** `url` 和 `base` 是不是同一个源（scheme + host + port）。解析不了一律当不是。 */
export function sameOrigin(url, base) {
  try { return new URL(String(url)).origin === new URL(String(base)).origin; } catch { return false; }
}

/* 直接 `node urlguard.mjs` 跑判据 */
if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  const ok = (label, c) => { if (!c) bad++; console.log(`  ${c ? "✓" : "✗"} ${label}`); };
  ok("https / http / mailto 放行", externalAllowed("https://umbra.example/x") && externalAllowed("http://127.0.0.1:5173/__app/") && externalAllowed("mailto:a@b.c"));
  ok("file:// 拒（.app 会被直接启动）", !externalAllowed("file:///Applications/Calculator.app"));
  for (const u of ["smb://host/share", "javascript:alert(1)", "vscode://x", "ms-settings:", "data:text/html,x", "", "不是 URL", null, undefined]) {
    ok(`拒 ${JSON.stringify(u)}`, !externalAllowed(u));
  }
  ok("大小写不影响（FILE: 也拒，HTTPS: 也放）", !externalAllowed("FILE:///etc/passwd") && externalAllowed("HTTPS://a.b/"));
  ok("同源：同 host 同端口", sameOrigin("http://127.0.0.1:4100/__app/x", "http://127.0.0.1:4100/"));
  ok("不同源：端口不同 / host 不同 / scheme 不同 / 解析不了",
    !sameOrigin("http://127.0.0.1:4101/", "http://127.0.0.1:4100/") && !sameOrigin("http://attacker/", "http://127.0.0.1:4100/")
    && !sameOrigin("https://127.0.0.1:4100/", "http://127.0.0.1:4100/") && !sameOrigin("about:blank", "http://127.0.0.1:4100/") && !sameOrigin(undefined, "http://127.0.0.1:4100/"));
  console.log(bad ? `\n✗ ${bad} 条没过` : "\n✓ urlguard 全通过");
  process.exit(bad ? 1 : 0);
}
