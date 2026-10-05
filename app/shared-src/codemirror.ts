/** 宿主共享的 CodeMirror 6（M10-2）。
 *
 *  **为什么放宿主不放插件里**：插件的 CSP 是 `script-src 'self'`，而 `'self'` 匹配
 *  scheme+host+port **不是路径** —— 所以插件 import 得到 `/__shared/…`（实测过，
 *  `uitest` 有判据）。放这里一份，代码插件、将来的 JSON / Python 插件都共用；
 *  各自打包的话，`markdown-it` 在 md 插件里就占 138 KB 的教训会重演 N 遍。
 *
 *  **为什么产物进仓库**：和 `runtime/` 里 vendor 的 React UMD 同一条理由 ——
 *  整个项目的前提是**断网可用**，让它依赖打包时能不能连上 npm 就本末倒置了。
 *
 *  ⚠️ **这里只放公共依赖，不放任何秘密**：`/__shared/` 对每个插件都可见，
 *  而插件是第三方写的。令牌、用户数据、项目路径一律不进这里。
 *
 *  导出什么：按「插件真正要用的」给，不是把 CM 的全部 API 都摊开 ——
 *  摊得越开，将来升 CM 大版本时插件坏得越多。
 */
export { EditorState, StateEffect, StateField, Compartment, RangeSet, RangeSetBuilder } from "@codemirror/state";
/* ⚠️ `Decoration` / `gutterLineClass` 是**行标记**要的（S18 §一.1：改过的行在行号边上
   一道 warn 竖线 + 行底 warn-soft）。加导出时想一句「插件真的会用吗」——
   摊得越开，将来升 CM 大版本时插件坏得越多。 */
export { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, placeholder, Decoration, gutterLineClass, GutterMarker } from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
export { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
export { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
export { syntaxHighlighting, defaultHighlightStyle, HighlightStyle, indentUnit, foldGutter, foldKeymap, bracketMatching, StreamLanguage, LanguageSupport } from "@codemirror/language";
export { tags } from "@lezer/highlight";

/* 语言包：按「用户真会打开的文件类型」给。
   ⚠️ 每加一种都会让这份产物变大 —— 加之前先问「这种文件真的有人在设计项目里放吗」。 */
export { javascript } from "@codemirror/lang-javascript";
export { json } from "@codemirror/lang-json";
export { python } from "@codemirror/lang-python";
export { html } from "@codemirror/lang-html";
export { css } from "@codemirror/lang-css";
export { markdown } from "@codemirror/lang-markdown";

/* ── CM5 的 legacy 模式（issue #37，2026-10-05）──
 *
 *  **为什么要它**：`CODE_EXT` 里有 37 种扩展名，而 `langFor` 原来只认 16 种 ——
 *  **27 种能打开但一片灰、没有任何高亮**（`.yaml` `.toml` `.sh` `.sql` `.go` `.rs`
 *  `.java` `.c` `.cpp` `.swift` `.rb` …）。配置文件和脚本是设计项目里最常见的那一类。
 *
 *  **为什么用 legacy 而不是各自的 lang-* 包**：一个 legacy 模式只有 2–6 KB
 *  （yaml 2992 · toml 2256 · rust 2526 · go 5102 · shell 4570 字节），
 *  而 `@codemirror/lang-rust` 这类带 lezer 语法的包是它的十几倍。
 *  高亮**只需要 token 级别准**，不需要完整语法树 —— 树是给折叠、缩进、
 *  结构化编辑用的，而那几件对「看一眼配置文件」没有价值。
 *  ⚠️ 需要语法树的格式（`.json` 的树档）仍然走 lang-* 包，两者不冲突。
 *
 *  ⚠️ `clike` 一个文件 38 KB 但**同时给 c / cpp / java / csharp / kotlin / scala**
 *  六种语言 —— 按语言数摊下来比单独引更省。
 *  ⚠️ `php` 在 legacy 里**没有** —— 它要 `@codemirror/lang-php`，而那个包不小。
 *  `.php` 暂时没高亮，照实记在 `langFor` 的注释里，别让下一个人以为漏了。 */
export { yaml } from "@codemirror/legacy-modes/mode/yaml";
export { toml } from "@codemirror/legacy-modes/mode/toml";
export { properties } from "@codemirror/legacy-modes/mode/properties";
export { xml } from "@codemirror/legacy-modes/mode/xml";
export { ruby } from "@codemirror/legacy-modes/mode/ruby";
export { rust } from "@codemirror/legacy-modes/mode/rust";
export { go } from "@codemirror/legacy-modes/mode/go";
export { shell } from "@codemirror/legacy-modes/mode/shell";
export { swift } from "@codemirror/legacy-modes/mode/swift";
export { c, cpp, java, csharp, kotlin } from "@codemirror/legacy-modes/mode/clike";
export { standardSQL } from "@codemirror/legacy-modes/mode/sql";
export { sCSS, less } from "@codemirror/legacy-modes/mode/css";
