import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { ReadFileResult } from "../../api/types";
import { fmtSize } from "../../api/types";
import { Glyph } from "../../ui/Glyph";
import type { ViewContext } from "../context";
import type { KindModule } from "../registry";
import { SizeBtn } from "../toolbar";
import { ImageView } from "./View";
import { ImageEdit, type EditApi } from "./Edit";
import { askSave, freeName } from "./Save";
import { toast } from "../../ui/Toast";
import type { Core } from "../../api/client";

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
  /* ── 裁剪态（issue #108）──
     ⚠️ **是编辑栏里的一个开关，不是「进编辑态就接管画布」。**
     圈选（给 AI）也在这条栏上，两个都要鼠标拖 —— 一进编辑态就铺上裁剪框的话，
     用户分不清自己现在拖的是裁剪框还是圈选框。所以裁剪要再点一下，
     点下去**换掉整个画布**（第九轮「看 / 改两分」的同一条）。 */
  cropping: boolean; setCropping: (v: boolean) => void;
  /** 裁剪框现在在原图像素里多大 —— 编辑栏上要显示它 */
  cropSize: { w: number; h: number } | null;
  setCropSize: (s: { w: number; h: number } | null) => void;
  /** 裁剪态下的显示比例（1 = 100%）。右下角那颗钮读它 */
  cropScale: number;
  setCropScale: (s: number) => void;
  /** 画布那一侧注册进来的动作出口（旋转 / 翻转 / 复位 / 导出） */
  api: MutableRefObject<EditApi | null>;
  core: Core;
  path: string;
  /** 存完要让 `<img>` 重读 —— 路径没变，所以得破缓存（`src` 上带这个数）。
   *  ⚠️ 不走 `ctx` —— `ViewContext` 里**没有**「让详情区重读这个文件」这件事
   *  （磁盘监听走的是工作台那一层的 `store.lastEvent`，刷的是目录树）。
   *  自己数一个就够，不为这一件事去改公共契约。 */
  rev: number; bump: () => void;
  /** 另存之后跳到新那份去 */
  open: (p: string) => void;
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
  const [cropping, setCropping] = useState(false);
  const [cropSize, setCropSize] = useState<{ w: number; h: number } | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [rev, setRev] = useState(0);
  const api = useRef<EditApi | null>(null);
  const [readout, setReadout] = useState<{ info: ReadFileResult | null; scale: number; isSvg: boolean }>({ info: null, scale: 1, isSvg: false });
  /* 换图片时缩放、圈选、裁剪都归零 —— Provider 按 kind 挂载，换文件不会重建它。
     ⚠️ **裁剪态也要归零**：不归的话换到下一张图还顶着裁剪框，
     而那张图的裁剪框是上一张的尺寸（和「停在某个旧版上」是同一种静默陷阱）。 */
  useEffect(() => { setZoom("fit"); setPicking(false); setCropping(false); setCropSize(null); setCropScale(1); }, [ctx.path]);
  return <Ctx.Provider value={{
    zoom, setZoom, picking, setPicking, ...readout, setReadout, supportsImage: ctx.ai.supportsImage,
    cropping, setCropping, cropSize, setCropSize, cropScale, setCropScale, api, core: ctx.core, path: ctx.path, rev, bump: () => setRev((n) => n + 1), open: (pp: string) => ctx.open(pp),
  }}>{children}</Ctx.Provider>;
}

/** 编辑栏：圈一块带给 AI（让 AI 改）+ 裁剪 / 旋转 / 翻转（自己改，issue #108）。
 *  两者都是「改这份文件」那一层，所以都在这条栏上（第七轮那条判据）。 */
function Toolbar() {
  const d = useImg();
  const [busy, setBusy] = useState(false);

  /** 一颗小方钮（旋转 / 翻转 / 复位共用） */
  const Mini = ({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) => (
    <button onClick={onClick} title={title} data-ud={`img-${icon}`}
      className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-sm border border-border bg-panel2 text-text2 hover:text-text shrink-0 font-mono text-[12px]">
      {icon === "rot-cw" ? "↻" : icon === "rot-ccw" ? "↺" : icon === "flip-x" ? "⇄" : icon === "flip-y" ? "⇅" : "⬚"}
    </button>
  );

  const save = async () => {
    const api = d.api.current;
    /* ⚠️ **这里原来是静默 return**（2026-10-07 用户报的「点了没反应」的一半）。
       `api` 为空就什么都不做、也什么都不说 —— 我自己写了一个 #31。 */
    if (busy) return;
    if (!api) { toast("裁剪还没就绪", "再等一下，或者退出裁剪重进一次", "error"); return; }
    setBusy(true);
    try {
      const out = await api.bytes();
      /* ⚠️ **导不出来要说原因**，不能只是没反应（#31 那条「点了没反应」同族）。
         真会发生：svg 和跨源图片的画布是被污染的，`toBlob` 回 null。 */
      if (!out) { toast("这张图导不出来", "画布取不到像素（矢量图或跨源图片）—— 换成位图再试", "error"); return; }
      /* 另存为的名字要**真去问盘上有什么**：连点两次保存会覆盖掉第一次的结果，
         而那种丢失一句话都不会说。 */
      const dir = d.path.includes("/") ? d.path.slice(0, d.path.lastIndexOf("/")) : "";
      const ls = await d.core.get<{ entries: Array<{ name: string }> }>(`files?dir=${encodeURIComponent(dir)}`);
      const taken = (ls.data?.entries ?? []).map((e) => e.name);
      const choice = await askSave({
        path: d.path, asName: freeName(d.path, taken),
        from: { w: d.info?.width ?? 0, h: d.info?.height ?? 0 }, to: { w: out.w, h: out.h },
      });
      if (!choice) return;
      const target = choice.how === "over" ? d.path : (dir ? `${dir}/${choice.name}` : choice.name);
      /* ⚠️ **走第二条写入口**（`file_write` + `encoding: "base64"`）——
         写前 sha 校验 / 快照 / 可回退全在那条路上。
         覆盖原图时带上 `expectSha256`：这张图在我们编辑的这段时间里可能被别人改过
         （AI 正在跑、或者别的编辑器）。新建那一份传 `"0"`。 */
      const r = await d.core.post<{ snapshot?: string; bytes?: number }>("file_write", {
        path: target, content: out.base64, encoding: "base64",
        expectSha256: choice.how === "over" ? d.info?.sha256 : "0",
        note: choice.how === "over" ? "裁剪 / 旋转（覆盖原图）" : "裁剪 / 旋转（另存）",
      });
      if (!r.ok) { toast("没存成", r.errors?.[0]?.message, "error"); return; }
      if (choice.how === "over") {
        toast("存好了", `${out.w}×${out.h} · 改前那版是 ${r.data?.snapshot ?? "上一版"}，能从「变更」退回`, "ok");
        d.setCropping(false); d.bump();
      } else {
        /* 另存之后**跳到新那份去** —— 不跳的话用户看着原图、以为没生效 */
        toast(`另存为 ${choice.name}`, `${out.w}×${out.h} · 原图没动`, "ok");
        d.setCropping(false);
        d.open(target);
      }
    } catch (e) {
      /* ⚠️ **原来只有 `try/finally`，没有 `catch`** —— 而调用方写的是 `void save()`，
         于是任何异常都变成一条没人接的 rejection：**界面上一个字都不出现**。
         用户报的「点击保存按钮无反应」就是这么来的：桌面壳里画布跨源，
         `toBlob` 抛 `SecurityError`，然后这条路把它整条吞掉。
         **「吞掉异常」比「报错」糟得多** —— 报错至少告诉人发生了什么。 */
      const msg = String((e as Error)?.message ?? e);
      toast("保存没成", /tainted|SecurityError/i.test(msg)
        ? `画布取不到像素（跨源）—— 这是我们的 bug，请把这句话报给我们：${msg.slice(0, 80)}`
        : msg.slice(0, 120), "error");
    } finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => { d.setPicking(!d.picking); if (!d.picking) d.setCropping(false); }}
        disabled={!d.supportsImage || d.cropping} aria-pressed={d.picking}
        title={d.cropping ? "正在裁剪 —— 先退出裁剪" : d.supportsImage ? "圈一块区域带给 AI（R）" : "当前引擎看不了图"}
        className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-sm border shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
          d.picking ? "bg-accentSoft text-accent font-semibold border-accent" : "bg-panel2 text-text2 border-border hover:text-text"}`}>
        <Glyph icon="sel-region" size={12} />圈选{d.picking ? "中" : ""}
      </button>

      {/* ── 裁剪（#108）。⚠️ **SVG 不给**：画布取不到它的像素（`View.tsx` 那条
          catch 的注释早就记着「svg / 跨源画不出来」）。禁用态要**说出原因** ——
          禁用而不解释和「点了没反应」是同一个病（#31）。 */}
      <span className="w-px h-4 bg-border shrink-0" />
      <button onClick={() => { d.setCropping(!d.cropping); if (!d.cropping) d.setPicking(false); }}
        disabled={d.isSvg} aria-pressed={d.cropping} data-ud="img-crop-toggle"
        title={d.isSvg ? "矢量图没法裁剪 —— 画布取不到它的像素" : "裁剪 / 旋转 / 翻转"}
        className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-sm border shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
          d.cropping ? "bg-accentSoft text-accent font-semibold border-accent" : "bg-panel2 text-text2 border-border hover:text-text"}`}>
        ⬚ 裁剪{d.cropping ? "中" : ""}
      </button>
      {d.cropping && (
        <>
          <Mini icon="rot-ccw" title="左转 90°" onClick={() => d.api.current?.rotate(-90)} />
          <Mini icon="rot-cw" title="右转 90°" onClick={() => d.api.current?.rotate(90)} />
          <Mini icon="flip-x" title="水平翻转" onClick={() => d.api.current?.flip("x")} />
          <Mini icon="flip-y" title="垂直翻转" onClick={() => d.api.current?.flip("y")} />
          <Mini icon="reset" title="回到原样" onClick={() => d.api.current?.reset()} />
          {d.cropSize && (
            <span className="font-mono text-[11px] text-muted shrink-0 ml-1">
              {d.info?.width ?? "?"}×{d.info?.height ?? "?"} → <span className="text-text">{d.cropSize.w}×{d.cropSize.h}</span>
            </span>
          )}
          <button onClick={() => void save()} disabled={busy} data-ud="img-save-open"
            className="inline-flex items-center h-[22px] px-2 rounded-sm border border-accent bg-accent text-onAccent font-semibold shrink-0 ml-1 disabled:opacity-40">
            {busy ? "存…" : "保存…"}
          </button>
        </>
      )}
      {d.isSvg && <span className="lvl shrink-0" style={{ background: "var(--tool-ok-soft)", color: "var(--tool-ok)" }}>矢量 · 可无损缩放</span>}
      <span className="flex-1" />
    </>
  );
}

/** 角落：缩放 —— **看图用**的，一直会用，所以常驻 */
function Corner() {
  const d = useImg();
  /* ── 裁剪态下这颗钮原来整个是死的（2026-10-07 用户报的）──
     它读 `d.scale`、调 `d.setZoom`，而那两样都只有 `ImageView` 认 ——
     裁剪态下 `ImageView` **根本没渲染**，于是：
     「适配」点了没反应 · `+` / `−` 点了没反应 · 百分比还显示着**进裁剪前**那个旧值。
     **三个症状、一个根**：这颗钮和画布在两个态下接的不是同一套东西。
     现在裁剪态走 cropper 自己的缩放，读数也从它那儿取。 */
  const cropping = d.cropping;
  const pct = Math.round((cropping ? d.cropScale : d.scale) * 100);
  return (
    <SizeBtn label={cropping ? `${pct}%` : d.zoom === "fit" ? `适配 · ${pct}%` : `${pct}%`}
      title={cropping ? "缩放（裁剪态）" : "缩放（⌘− ⌘＋ ⌘0）"}
      zoomPct={pct}
      onZoom={(dir) => {
        if (cropping) { d.api.current?.zoomBy(dir); return; }
        d.setZoom(dir > 0 ? (ZOOMS.find((z) => z > d.scale) ?? 4) : (ZOOMS.filter((z) => z < d.scale).pop() ?? 0.25));
      }}
      onFit={() => { if (cropping) d.api.current?.fit(); else d.setZoom("fit"); }} />
  );
}

function View({ ctx }: { ctx: ViewContext }) {
  const d = useImg();
  /* 存完要让 `<img>` 重读：路径没变，所以挂一个 `?v=` 破缓存（#108） */
  const src = `${ctx.core.url}${ctx.path.split("/").map(encodeURIComponent).join("/")}${d.rev ? `?v=${d.rev}` : ""}`;
  /* ⚠️ **裁剪时换掉整个画布**，不和看图那套缩放 / 圈选共存（「看 / 改两分」）。
     共存的代价不是实现难，是**用户分不清自己在拖哪个框**。 */
  if (d.cropping) return <ImageEdit src={src} path={ctx.path} onApi={(a) => { d.api.current = a; }} onChange={d.setCropSize} onScale={d.setCropScale} />;
  return (
    <ImageView core={ctx.core} path={ctx.path} rev={d.rev} supportsImage={ctx.ai.supportsImage} channelLabel={ctx.ai.engineLabel}
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
