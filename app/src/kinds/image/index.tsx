import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ReadFileResult } from "../../api/types";
import { fmtSize } from "../../api/types";
import { Glyph } from "../../ui/Glyph";
import type { ViewContext } from "../context";
import type { KindModule } from "../registry";
import { SizeBtn } from "../toolbar";
import { ImageView } from "./View";

/** 图片（`00` §六十一；M8-15b 拆成目录）。没有从属面板 —— 一张图没有「属性」可列。
 *
 *  它唯一要问工作台的是**这个引擎吃不吃图**，而这个答案一律靠 `probe_image_support` 探，
 *  不按模型名猜：实测 `deepseek-chat` 能看图，按名字猜会猜错（`11` Q32）。
 */
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

interface ImgState {
  zoom: number | "fit"; setZoom: (z: number | "fit") => void;
  picking: boolean; setPicking: (v: boolean) => void;
  info: ReadFileResult | null; scale: number; isSvg: boolean;
  setReadout: (i: { info: ReadFileResult | null; scale: number; isSvg: boolean }) => void;
  supportsImage: boolean;
}
const Ctx = createContext<ImgState | null>(null);
const useImg = (): ImgState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("image 的 Provider 没包上");
  return v;
};

function Provider({ ctx, children }: { ctx: ViewContext; children: ReactNode }) {
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [picking, setPicking] = useState(false);
  const [readout, setReadout] = useState<{ info: ReadFileResult | null; scale: number; isSvg: boolean }>({ info: null, scale: 1, isSvg: false });
  /* 换图片时缩放和圈选都归零 —— Provider 按 kind 挂载，换文件不会重建它 */
  useEffect(() => { setZoom("fit"); setPicking(false); }, [ctx.path]);
  return <Ctx.Provider value={{ zoom, setZoom, picking, setPicking, ...readout, setReadout, supportsImage: ctx.ai.supportsImage }}>{children}</Ctx.Provider>;
}

/** 编辑栏：圈一块区域带给 AI —— 这是**改稿用**的（其实是"让 AI 改"用的） */
function Toolbar() {
  const d = useImg();
  return (
    <>
      <button onClick={() => d.setPicking(!d.picking)} disabled={!d.supportsImage} aria-pressed={d.picking}
        title={d.supportsImage ? "圈一块区域带给 AI（R）" : "当前引擎看不了图"}
        className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-sm border shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
          d.picking ? "bg-accentSoft text-accent font-semibold border-accent" : "bg-panel2 text-text2 border-border hover:text-text"}`}>
        <Glyph icon="sel-region" size={12} />圈选{d.picking ? "中" : ""}
      </button>
      {d.isSvg && <span className="lvl shrink-0" style={{ background: "var(--tool-ok-soft)", color: "var(--tool-ok)" }}>矢量 · 可无损缩放</span>}
      <span className="flex-1" />
    </>
  );
}

/** 角落：缩放 —— **看图用**的，一直会用，所以常驻 */
function Corner() {
  const d = useImg();
  const pct = Math.round(d.scale * 100);
  return (
    <SizeBtn label={d.zoom === "fit" ? `适配 · ${pct}%` : `${pct}%`} title="缩放（⌘− ⌘＋ ⌘0）"
      zoomPct={pct}
      onZoom={(dir) => d.setZoom(dir > 0 ? (ZOOMS.find((z) => z > d.scale) ?? 4) : (ZOOMS.filter((z) => z < d.scale).pop() ?? 0.25))}
      onFit={() => d.setZoom("fit")} />
  );
}

function View({ ctx }: { ctx: ViewContext }) {
  const d = useImg();
  return (
    <ImageView core={ctx.core} path={ctx.path} supportsImage={ctx.ai.supportsImage} channelLabel={ctx.ai.engineLabel}
      onProbed={ctx.ai.reloadCaps} onSelection={(s) => ctx.select("region", s)}
      zoom={d.zoom} setZoom={d.setZoom} picking={d.picking} setPicking={d.setPicking} onInfo={d.setReadout} />
  );
}

export const image: KindModule = {
  ids: ["image"],
  Provider, View, Toolbar, Corner,
  /* `⋯` 浮层头的读数（M8-33）。**图片的读数就这三样，只有这一处**
     —— 原来状态行里还有一份同样的串（`Status`），2026-09-28 随那个死接口一起删了
     （issue #36）：两处写不一样只会让人怀疑哪个是真的。
     ⚠️ 数据在 `Provider` 的 state 里，所以这一项必须是**组件**（纯函数取不到 context）。 */
  meta: ({ ctx }) => {
    const d = useImg();
    const ext = (ctx.path.split(".").pop() ?? "").toUpperCase();
    if (!d.info) return null;
    return <>{[ext, `${d.info.width ?? "?"} × ${d.info.height ?? "?"}`, fmtSize(d.info.size)].filter(Boolean).join(" · ")}</>;
  },
};
