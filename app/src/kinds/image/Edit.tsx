/** 图片的裁剪 / 旋转 / 翻转（issue #108，2026-10-07）。
 *
 *  **为什么是 cropperjs v1.6.3。** 零依赖、MIT、冻结版（所以版本号钉死，不写 `^`）。
 *  v2 是 Web Components 架构、带两个 `@cropper/*` 依赖 —— 三个包换不来我们要的东西。
 *  它给的是「带八个把手的裁剪框 + 旋转 / 翻转 + `getCroppedCanvas()`」，
 *  这几样自己写一遍是几百行带边界条件的鼠标代码。
 *
 *  ⚠️ **「导出这条路早就通了」这句话只对浏览器模式成立 —— 用户报的 bug 证伪了另一半**
 *  （2026-10-07）。`View.tsx` 的圈选给 AI 是在用 `canvas.toDataURL()`，而我验它的时候
 *  浏览器开的是**项目服务那个端口**，所以同源、画布干净。
 *
 *  **桌面壳不是这样**：`shell/main.mjs` 加载的是 `hub.url + "__app/home"`（hub 端口），
 *  而图片 `src` 指向**项目服务**（另一个端口）—— **端口不同就是源不同**。
 *  实测（页面在 59777、图片在 50197）：
 *  ```
 *  不带 crossOrigin → 抛 SecurityError: Tainted canvas
 *  带   crossOrigin → 导得出来
 *  ```
 *  所以 `<img>` 必须带 **`crossOrigin="anonymous"`**，而服务端对
 *  `http://127.0.0.1:*` 的来源本来就回 `access-control-allow-origin`（实测过）。
 *
 *  ⚠️ 这件事同时说明**壳里的「圈选给 AI」一直是静默降级的**（只带坐标、不带图）——
 *  那条 catch 的注释写着「svg / 跨源画不出来就只带坐标」，**它预言对了，而没人去看它有没有发生**。
 *  SVG 仍然是真的例外（矢量图画布取不到像素），所以 SVG 照旧不给编辑钮。
 *
 *  ⚠️ **落盘走第二条写入口**（`write_file` + `encoding: "base64"`，#108 给它加的那一档）。
 *  不自己开一条路：写前 sha 校验 / 快照 / 可回退全在那条路上，绕过去就全没了（纪律① 的泛型版）。
 */
import { useEffect, useRef } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

/** 编辑栏那几颗钮要调的东西。**画布那一侧注册进来，编辑栏调它** ——
 *  两者是兄弟组件（编辑栏由工作台渲染、画布在详情区），只能经 Provider 的 context 握手。 */
export interface EditApi {
  rotate(deg: number): void;
  flip(axis: "x" | "y"): void;
  /** 缩放一档（`dir > 0` 放大）。⚠️ 裁剪态下**右下角那颗缩放钮原来是死的** ——
   *  它调的是看图那套 `setZoom`，而裁剪态下 `ImageView` 根本没渲染（2026-10-07 用户报的）。 */
  zoomBy(dir: number): void;
  /** 回到「整张都看得见」 */
  fit(): void;
  /** 回到刚进编辑态的样子（裁剪框铺满、没有旋转翻转） */
  reset(): void;
  /** 当前裁剪框在**原图像素**里是多大。`null` = 还没就绪 */
  size(): { w: number; h: number } | null;
  /** 把当前结果导出成字节。`null` = 画布导不出来（svg / 跨源） */
  bytes(): Promise<{ base64: string; w: number; h: number } | null>;
}

/** 扩展名 → 导出用的 MIME。**按原扩展名导**，不要一律 PNG ——
 *  一张 2 MB 的 jpg 裁一刀之后变成 12 MB 的 png，用户只会以为我们把图弄坏了。 */
export function mimeOf(path: string): string {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "webp" ? "image/webp"
    : "image/png";
}

/** Blob → base64（不带 data URL 前缀）。
 *  ⚠️ **用 `FileReader`，不用 `btoa(String.fromCharCode(...bytes))`** ——
 *  后者是展开传参，几百 KB 的图就会把调用栈撑爆。
 *  #52 / #106 栽的正是这一条（`Math.max(...)` 在 12 万元素就抛，
 *  于是十几万行的 CSV 原来是**打不开**而不是卡）。 */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => rej(new Error("读不出这块画布"));
    r.readAsDataURL(blob);
  });
}

/** 裁剪面：**换掉整个画布**，不和看图那套缩放 / 圈选共存。
 *  理由就是第九轮那条「看 / 改两分」—— 两套鼠标行为挤在同一张图上，
 *  用户分不清自己现在拖的是裁剪框还是圈选框。 */
export function ImageEdit({ src, path, onApi, onChange, onScale }: {
  src: string; path: string;
  onApi: (api: EditApi | null) => void;
  /** 裁剪框一动就报一次尺寸 —— 编辑栏上要显示「1200×800」 */
  onChange: (size: { w: number; h: number } | null) => void;
  /** 当前显示比例（1 = 100%）—— 右下角那颗钮要显示它。
   *  ⚠️ 不报的话那颗钮只能显示看图那套的旧读数，而那是个**假读数**。 */
  onScale: (scale: number) => void;
}) {
  const img = useRef<HTMLImageElement>(null);
  const cr = useRef<Cropper | null>(null);

  useEffect(() => {
    const el = img.current;
    if (!el) return;
    const c = new Cropper(el, {
      viewMode: 1,            // 裁剪框不许超出图片
      autoCropArea: 1,        // 一进来铺满 —— 「还没裁」的状态要看得出来是整张
      background: false,      // 棋盘底由我们自己画（和看图那边同一张底）
      /* ⚠️ **不能关掉它**（2026-10-07 用户报的「保存无反应」）：关掉之后 cropperjs
         克隆出来的那张图**不带 `crossOrigin`**，于是在桌面壳里（页面在 hub 端口、
         图片在项目服务端口）画布被污染 → `toBlob` 抛 `SecurityError`。
         我原来写 `false` 是因为在浏览器里同源、看不出区别。 */
      checkCrossOrigin: true,
      /* ⚠️ `crop` 每动一下都触发，而我们只把**原图像素**报出去 ——
         报显示尺寸的话用户看到的数字会随缩放变，那是假读数。 */
      crop: () => {
        const d = c.getData(true);
        onChange({ w: Math.max(1, Math.round(d.width)), h: Math.max(1, Math.round(d.height)) });
      },
      /* 缩放比按「显示宽 ÷ 原图宽」算 —— 和看图那边的 `scale` 同一个口径，
         不然同一张图在两个态下显示的百分比对不上 */
      zoom: () => {
        const im = c.getImageData();
        if (im.naturalWidth) onScale(im.width / im.naturalWidth);
      },
      ready: () => {
        const im = c.getImageData();
        if (im.naturalWidth) onScale(im.width / im.naturalWidth);
      },
    });
    cr.current = c;
    /** 把当前显示比例报出去。
     *  ⚠️ **不能只靠 cropperjs 的 `zoom` 事件**（2026-10-07 实测）：
     *  `reset()` 会把缩放改回去，**但不发 `zoom` 事件** ——
     *  于是「适配」点下去画面变了而右下角那个百分比**不动**，
     *  看起来就是「适配点了没反应」（用户报的第三条的后半）。
     *  **画面变了而读数没变，比两个都没变更糟** —— 它让人以为功能坏了。
     *  所以每个动作之后主动量一次。 */
    const report = () => { const im = c.getImageData(); if (im.naturalWidth) onScale(im.width / im.naturalWidth); };
    const api: EditApi = {
      rotate: (deg) => { c.rotate(deg); report(); },
      flip: (axis) => { if (axis === "x") c.scaleX(-(c.getData().scaleX ?? 1)); else c.scaleY(-(c.getData().scaleY ?? 1)); report(); },
      /* ⚠️ `zoom(ratio)` 是**相对**缩放（0.1 = 放大 10%），不是倍率 —— 按错了方向会越缩越小 */
      zoomBy: (dir) => { c.zoom(dir > 0 ? 0.2 : -0.2); report(); },
      /* ⚠️ **「适配」只调显示比例，不碰裁剪框**（2026-10-07 自己的判据抓出来的）。
         第一版写的是 `c.reset()` —— 而 `reset()` 把**裁剪框、旋转、翻转全部**重置。
         于是「框好一块 → 点适配看清楚 → 保存」存下来的是**整张图**，
         而用户以为自己裁过了。**悄悄丢掉用户的选择，比点了没反应糟。**
         是后面那条「存下来的真是裁后那一块」变红才看见的 —— 判据互相之间也在互相检查。 */
      fit: () => {
        const cont = c.getContainerData(), im = c.getImageData();
        if (im.naturalWidth && cont.width) c.zoomTo(Math.min(cont.width / im.naturalWidth, cont.height / im.naturalHeight));
        report();
      },
      /* `⬚ 复位` 是另一回事：它就是「回到原样」，**该**连裁剪框一起重置 */
      reset: () => { c.reset(); report(); },
      size: () => { const d = c.getData(true); return d.width ? { w: Math.round(d.width), h: Math.round(d.height) } : null; },
      bytes: async () => {
        /* ⚠️ `getCroppedCanvas()` 把旋转和翻转一起烘进去 —— 所以不用自己再画一遍 */
        const canvas = c.getCroppedCanvas();
        if (!canvas) return null;
        const type = mimeOf(path);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), type, type === "image/jpeg" ? 0.92 : undefined));
        if (!blob) return null;     // 画布被污染时 toBlob 回 null（svg / 跨源）
        return { base64: await toBase64(blob), w: canvas.width, h: canvas.height };
      },
    };
    onApi(api);
    return () => { onApi(null); c.destroy(); cr.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, path]);

  return (
    <div className="flex-1 min-h-0 overflow-hidden p-6"
      style={{ background: "repeating-conic-gradient(var(--tool-panel-2) 0 25%, transparent 0 50%) 50% / 16px 16px" }}>
      {/* cropperjs 要一个它能接管的容器；高度给满，它自己按图的比例摆 */}
      <div className="w-full h-full" data-ud="img-crop">
        {/* ⚠️ `crossOrigin` 不能省 —— 见文件头那段实测 */}
        <img ref={img} src={src} alt={path} crossOrigin="anonymous" className="block max-w-full" />
      </div>
    </div>
  );
}
