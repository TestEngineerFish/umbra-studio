/** 把 CodeMirror 打成**一份 ESM** 放进 `shared/`，给插件 import（M10-2）。
 *
 *  单独一个配置而不是并进 `vite.config.ts`：这份产物的去处（仓库里的 `shared/`）、
 *  格式（ESM 库而不是应用）、以及**它要进仓库**这件事，和 app 自己的构建完全是两码事。
 *
 *  跑：npm --prefix app run build:shared
 */
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "shared-src/codemirror.ts"),
      formats: ["es"],
      fileName: () => "codemirror.js",
    },
    outDir: resolve(__dirname, "..", "shared"),
    emptyOutDir: false,          // shared/ 下还有别的东西（探针等），别清
    minify: "esbuild",
    target: "es2020",
    rollupOptions: {
      /* 什么都不 external —— 这份产物要能被插件**单独** import，
         插件那边没有 node_modules，也不许从别处拉（CSP `connect-src 'none'`）。 */
      external: [],
    },
  },
});
