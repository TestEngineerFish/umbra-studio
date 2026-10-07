/** 图片的裁剪 / 旋转 / 翻转（issue #108，2026-10-07）。
 *
 *  **为什么是 cropperjs v1.6.3。** 零依赖、MIT、冻结版（所以版本号钉死，不写 `^`）。
 *  v2 是 Web Components 架构、带两个 `@cropper/*` 依赖 —— 三个包换不来我们要的东西。
 *  它给的是「带八个把手的裁剪框 + 旋转 / 翻转 + `getCroppedCanvas()`」，
 *  这几样自己写一遍是几百行带边界条件的鼠标代码。
 *
 *  ⚠️ **导出这条路早就通了**，不是这次新开的：`View.tsx` 的圈选给 AI
 *  已经在用 `canvas.toDataURL()`（图片走 `core.url + path`，和应用同源，画布没被污染）。
 *  所以「裁出来的像素拿不拿得到」这件事**有产品证据**，不是推断。
 *  SVG 是已知例外（那条 catch 的注释写着「svg / 跨源画不出来」）—— 所以 SVG 不给编辑钮。
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
export function ImageEdit({ src, path, onApi, onChange }: {
  src: string; path: string;
  onApi: (api: EditApi | null) => void;
  /** 裁剪框一动就报一次尺寸 —— 编辑栏上要显示「1200×800」 */
  onChange: (size: { w: number; h: number } | null) => void;
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
      checkCrossOrigin: false,
      /* ⚠️ `crop` 每动一下都触发，而我们只把**原图像素**报出去 ——
         报显示尺寸的话用户看到的数字会随缩放变，那是假读数。 */
      crop: () => {
        const d = c.getData(true);
        onChange({ w: Math.max(1, Math.round(d.width)), h: Math.max(1, Math.round(d.height)) });
      },
    });
    cr.current = c;
    const api: EditApi = {
      rotate: (deg) => c.rotate(deg),
      flip: (axis) => { if (axis === "x") c.scaleX(-(c.getData().scaleX ?? 1)); else c.scaleY(-(c.getData().scaleY ?? 1)); },
      reset: () => { c.reset(); },
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
        <img ref={img} src={src} alt={path} className="block max-w-full" />
      </div>
    </div>
  );
}
