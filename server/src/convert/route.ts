// 来源：UmbraPC electron/core/convert/route.ts（2026-10-18 a72ac3a），改动：相对 import 补 .js（Studio 是 NodeNext ESM）
// 格式转换：路线规划 —— 在「格式 = 节点、转换器的边 = 带权的弧」这张图上找最便宜的路（照 Filee 的 RoutePlanner）。
//
// 为什么是图搜索：工具只认识直接一步。docx → pdf 在没装 LibreOffice 的 Mac 上要走
// textutil（docx → html）再走 Electron 打印（html → pdf）；装了 LibreOffice 就一步到位、代价更低，
// 规划器自己会挑它。新加一个工具，所有能经过它的组合自动成立，不碰别处的代码。

import type { Converter, Edge } from "./types.js";

/** 最多几步。再长的链几乎都又慢又走样，不如明说转不了。 */
export const MAX_STEPS = 3;

export interface RouteStep {
  converter: Converter;
  from: string;
  to: string;
  note?: string;
}

export interface Route {
  steps: RouteStep[];
  cost: number;
}

const DEFAULT_COST = 10;

/** 从 `from` 到 `to` 最便宜的路线；到不了回 null。`from === to` 也回 null（不做「转成自己」）。
 *  同代价时先登记的转换器优先（`converters` 的顺序就是优先级）。一条路线里不重复经过同一个格式。 */
export function planRoute(converters: readonly Converter[], from: string, to: string, maxSteps = MAX_STEPS): Route | null {
  if (!from || !to || from === to) return null;
  const out = new Map<string, { c: Converter; e: Edge; cost: number; order: number }[]>();
  converters.forEach((c, ci) => {
    c.edges.forEach((e, ei) => {
      const list = out.get(e.from) ?? [];
      list.push({ c, e, cost: e.cost ?? DEFAULT_COST, order: ci * 1000 + ei });
      out.set(e.from, list);
    });
  });

  // 图很小（几十个格式），朴素的「每轮取最便宜的」就够了，不必上堆。
  interface Node { fmt: string; cost: number; order: number; steps: RouteStep[] }
  const open: Node[] = [{ fmt: from, cost: 0, order: 0, steps: [] }];
  const settled = new Set<string>();
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost || a.steps.length - b.steps.length || a.order - b.order);
    const cur = open.shift()!;
    if (cur.fmt === to) return { steps: cur.steps, cost: cur.cost };
    const key = `${cur.fmt}#${cur.steps.length}`;
    if (settled.has(key)) continue;
    settled.add(key);
    if (cur.steps.length >= maxSteps) continue;
    const seen = new Set([from, ...cur.steps.map((s) => s.to)]);
    for (const { c, e, cost, order } of out.get(cur.fmt) ?? []) {
      if (seen.has(e.to)) continue;
      open.push({
        fmt: e.to,
        cost: cur.cost + cost,
        order: cur.steps.length ? cur.order : order,
        steps: [...cur.steps, { converter: c, from: e.from, to: e.to, note: e.note }],
      });
    }
  }
  return null;
}

/** 从 `from` 出发、`maxSteps` 步内够得着的所有格式（不含自己）。 */
export function reachable(converters: readonly Converter[], from: string, maxSteps = MAX_STEPS): Set<string> {
  const got = new Set<string>();
  let frontier = new Set([from]);
  for (let i = 0; i < maxSteps && frontier.size; i++) {
    const next = new Set<string>();
    for (const c of converters) {
      for (const e of c.edges) {
        if (frontier.has(e.from) && e.to !== from && !got.has(e.to)) {
          got.add(e.to);
          next.add(e.to);
        }
      }
    }
    frontier = next;
  }
  return got;
}
