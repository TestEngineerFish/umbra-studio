/** 动词样本插件（`verbtest` 的夹具，`doc/22` §3.3 那个例子）：
 *  `play` 标了 `free: true` —— 没授权也挂出去；`cut` 没标 —— 要授权。
 *  两件都不真动视频，只回一句话；这份夹具测的是「挂出 / 收回」，不是剪辑。 */
export default function register(host) {
  host.defineCap({
    name: "com.umbra.verbs.play",
    title: "播放一段视频",
    summary: "免费动词：没买也能用。",
    input: { path: "string" },
    free: true,
    async run({ path }) { return { played: path }; },
  });
  host.defineCap({
    name: "com.umbra.verbs.cut",
    title: "剪一段视频",
    summary: "要授权的动词：买了 / 在有效期内才挂出来。",
    input: { path: "string", from: "number", to: "number" },
    async run({ path, from, to }) { return { cut: path, from, to }; },
  });
}
