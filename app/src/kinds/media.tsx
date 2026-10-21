import { useState } from "react";
import type { KindModule } from "./registry";
import type { ViewContext } from "./context";

/** 视频 / 音频的**通用查看**（M14-11 / `doc/11` Q76，用户 2026-10-21）。
 *
 *  用户定的边界：**Studio 管通用查看，专业查看和编辑走插件。**
 *  所以这里只有一件事 —— **浏览器原生 `<video>` / `<audio>` 能播就播**。
 *  逐帧、波形、频谱、剪辑全归插件；这个模块不该长大。
 *
 *  ⚠️ **为什么不做成插件**：插件要装、要联网取目录、要许可证，
 *  而「打开一个 mp4 能看到画面」是**打开任意目录**这个定位的底线 ——
 *  底线不该依赖装没装东西。
 *
 *  ⚠️⚠️ **id 是 `media-video` / `media-audio`，不是 `video` / `audio`，而这是要害。**
 *  后两个名字**属于插件**：内置类型只有 bundled 插件能认领
 *  （`store.ts` 的 `if (p.bundled)` / `loader.ts` 的 `isBuiltinKind` 分支），
 *  占住它们等于**永久关上**第三方媒体插件那扇门。
 *  配套的是 **priority 5**（低于 `PLUGIN_DEFAULT_PRIORITY` 50）——
 *  **兜底的意思是「没有别人的时候才轮到我」**：装了媒体插件它的 `video`(50) 自然赢，
 *  这个模块就不再被用到，**不需要任何人记得把它让出去**。
 *
 *  > 原来的方案是「等插件来了再像当年的 `code` / `html` 一样让出模块」。
 *  > 那是**一个需要未来的人记得做的事**，而换个 id 不需要任何人记得。
 *  > `umbra-plugins` 会话 2026-10-21 在提交前拦下了第一版（`doc/00` §172.6）。
 *
 *  ⚠️ **扩展名只列浏览器真能播的那些**（`VIDEO_EXT` / `AUDIO_EXT`）。
 *  列一个播不了的（`.mkv` / `.avi`）等于把「打不开」包装成「打开了但黑屏」，
 *  而后者更难判断是文件坏了还是我们不支持 —— 那些留给 `other` 的纯文本兜底去说实话。
 */
function srcOf(ctx: ViewContext): string {
  return `${ctx.core.url}${ctx.path.split("/").map(encodeURIComponent).join("/")}`;
}

function MediaView({ ctx }: { ctx: ViewContext }): React.ReactElement {
  const isVideo = ctx.kind === "media-video";
  /** 播不动时说一句**能照着做的话**。
   *  ⚠️ 浏览器对「编码不支持」给的是 `error` 事件，**不是异常** ——
   *  不听这个事件的话画面就是一片黑，而用户无从判断是文件坏了还是我们不支持。 */
  const [err, setErr] = useState<string | null>(null);
  const common = {
    controls: true,
    preload: "metadata" as const,
    src: srcOf(ctx),
    onError: () => setErr(isVideo
      ? "这段视频浏览器放不动 —— 多半是编码（H.265 / AV1 之类）不在它支持的范围里。文件本身没有问题，用系统播放器能打开。"
      : "这段音频浏览器放不动 —— 多半是编码不在它支持的范围里。文件本身没有问题，用系统播放器能打开。"),
    className: isVideo ? "max-w-full max-h-full rounded" : "w-[min(560px,90%)]",
    "data-ud": isVideo ? "video" : "audio",
  };
  return (
    <div className="w-full h-full grid place-items-center p-6 overflow-auto">
      <div className="flex flex-col items-center gap-3 min-w-0">
        {isVideo ? <video {...common} /> : <audio {...common} />}
        {err && <p className="text-xs leading-relaxed max-w-[520px] text-center" style={{ color: "var(--tool-warn)" }}>{err}</p>}
        {/* 一句话说清边界 —— 不说的话用户会找「怎么剪」而我们没有 */}
        <p className="text-[11px] text-muted">只能看 · 剪辑、逐帧、波形这些要装插件</p>
      </div>
    </div>
  );
}

export const media: KindModule = {
  ids: ["media-video", "media-audio"],
  View: MediaView,
  /* `⋯` 浮层头的读数：**只有扩展名**。
     ⚠️ 不给时长 —— 它要等 `loadedmetadata`，而这个组件在那之前就返回了；
     给一个会变的数不如不给。
     ⚠️ 也不给大小 —— `ViewContext` 里没有，为它单开一个 Provider + 一次请求
     换一行读数不划算，而文件卡那边本来就有。
     **「能拿到的才写」比「写了但有时候是错的」好。** */
  meta: ({ ctx }) => <>{(ctx.path.split(".").pop() ?? "").toUpperCase()}</>,
};
