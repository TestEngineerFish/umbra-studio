---
title: "[bug] 十几万行的 CSV 一打开就抛 RangeError（不是卡，是直接打不开）"
labels: ["type:bug", "p1", "from:review"]
---
<!-- fp: review/umbra-studio/plugins/com.umbra.code#csv-math-max-spread -->
来源：开发侧（做 #52 之前核现状时顺手量到） ｜ 证据：plugins/com.umbra.code/1.0.0/app.mjs:362、:1010
发现方式：核 #52「CSV 换虚拟滚动」的现状时，先量了一下行数上限

### 位置
`plugins/com.umbra.code/1.0.0/app.mjs` 两处都用**展开**求列数：

```js
362:  const width = Math.max(...rows.map((r) => r.cells.length));
1010:      ? ` · ${cparsed.rows.length} 行 · ${Math.max(...cparsed.rows.map((r) => r.cells.length))} 列`
```

`csvpos.mjs` 的 `parseCsv` **没有行数上限**，所以 `rows` 的长度就是文件的行数。

### 为什么是问题【确证：实测】
`Math.max(...arr)` 是把每个元素当一个实参传进去，受**调用栈的实参上限**约束。本机实测（Node 24.11，和 Electron 44 自带的同一支）：

```
50000  ok
100000 ok
123437 ok      ← 二分夹出来的边界
125000 ✗ RangeError: Maximum call stack size exceeded
200000 ✗ RangeError
```

也就是说**12 万行左右以上的 CSV，打开时直接抛**，而不是「慢」或「卡」。
`:1010` 那一处在状态行上，所以**即使不切到表档也会走到**。

⚠️ 这一条和 #52（虚拟滚动）在同一处代码，但**严重度不是一回事**：
#52 说的是「几万行一打开就卡死」—— 那是性能；这一条是「十几万行**打不开**」—— 那是功能不可用。
混在一条 idea 里容易被当成性能优化排到后面，所以单独登记。

12 万行的 CSV 一点不罕见：日志导出、数据库 dump、埋点流水。

### 影响面
`.csv` / `.tsv` 这些由代码插件认领的类型（`doc/00` §一一四 那一批）。
后果是**插件画不出来**（抛在渲染路径上），用户看到的是空白或「插件没能接上」。
不丢数据。

### 怎么修
1. 两处都换成一次线性扫描：
   ```js
   let width = 0; for (const r of rows) if (r.cells.length > width) width = r.cells.length;
   ```
   （`reduce` 也行，关键是**不用展开**。）
2. 顺手扫一遍全仓还有没有别的 `Math.max(...` / `Math.min(...` 落在用户数据长度上的地方
   —— 同一个形状，哪儿都可能有。
3. 回归：`csvpostest` 加一条 —— 造一份 13 万行的 CSV（程序生成，不进仓库），
   断言 `parseCsv` + 求列数这条路**不抛**且列数正确。
   ⚠️ 判据要**先确认样本真的超过了阈值**（在这台机器上现量一次，别写死 12 万）
   —— 阈值跟栈大小有关，换机器会变。
