/** 插件侧的桥（M11-5）。**插件把这一份拷进自己的包里**，不是从我们这儿 import ——
 *  插件关在不透明源的 iframe 里，CSP `connect-src 'none'`，它取不到我们的任何文件。
 *
 *  这也正是 Q37 想要的：插件和主程序之间只有**一条 postMessage 通道**和这份约定，
 *  没有模块依赖。主程序更了五版，这份还是这份。
 *
 *  用法：
 *    umbra.onContext(ctx => { /* ctx.path 当前文件 · ctx.theme 主题 *\/ });
 *    const out = await umbra.call("read_file", { path: ctx.path });
 *    const picked = await umbra.menu(x, y, [{ label: "改名" }, { label: "—" }, { label: "删除", danger: true }]);
 *    umbra.toast("存好了");
 */
(function (global) {
  var seq = 0, pending = {}, ctxCbs = [], lastCtx = null;

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.t === "reply") {
      var p = pending[m.id];
      if (!p) return;
      delete pending[m.id];
      p(m.payload);
      return;
    }
    if (m.t === "ctx") {
      lastCtx = m;
      for (var i = 0; i < ctxCbs.length; i++) ctxCbs[i](m);
    }
  });

  function send(msg) {
    var id = ++seq;
    msg.id = id;
    return new Promise(function (res) { pending[id] = res; parent.postMessage(msg, "*"); });
  }

  global.umbra = {
    /** 宿主 API 的大版本。对不上就别接 —— 插件是独立更新的，版本错配是常态 */
    version: 1,
    /** 调一件宿主能力（read_file / write_file …）。
     *  ⚠️ 返回的是**信封** `{ok, data, errors}`，不是直接的数据 ——
     *  权限不够、文件被人改过都走 `ok:false`，别只看 `data`。 */
    call: function (cap, input) { return send({ t: "call", cap: cap, input: input || {} }); },
    /** 弹一个菜单。**由宿主画** —— 插件自己画会被矩形裁掉，形制也和主程序对不上。
     *  返回被点的那一项的下标；点空关掉就一直不返回。`{label:"—"}` 是分隔线。 */
    menu: function (x, y, items) { return send({ t: "menu", x: x, y: y, items: items }); },
    /** 提示条。也由宿主画 */
    toast: function (title, body, level) { parent.postMessage({ t: "toast", title: title, body: body, level: level }, "*"); },
    /** 当前上下文（哪个文件、什么主题）。**插件不能自己去问** —— 它没有网络。
     *  注册时如果已经收到过一次，会立刻用最后那次回调一下，免得错过首帧。 */
    onContext: function (cb) { ctxCbs.push(cb); if (lastCtx) cb(lastCtx); },
  };
  parent.postMessage({ t: "ready" }, "*");
})(window);

/* ── chrome：编辑栏 / 状态 / `⋯` 菜单**由宿主画**（M11-9）──
   插件只有正文那一块矩形，这三样都在它够不着的地方；
   而且就算够得着也不该自己画 —— 每个插件的按钮高度、圆角、hover 底色都不一样的话，
   并排一眼就看出不是一套。给数据，宿主照自己的形制画。 */
(function (u) {
  var hit = null;
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.t === "chrome-hit" && hit) hit(m.kind, m.a, m.b);
    if (m.t === "share" && shareCbs[m.key]) shareCbs[m.key].forEach(function (cb) { cb(m.value); });
  });
  var shareCbs = {};

  /** 设 chrome。**全量覆盖不是增量** —— 增量的话「这次没给 buttons」会被理解成
   *  「保持上次的 buttons」，而插件切了档位之后旧钮还在，是最难查的那种错。
   *  `onHit(kind, a, b)`：`kind` 是 seg / button / menu，a 是下标，seg 的 b 是档位下标。 */
  u.setChrome = function (c, onHit) {
    hit = onHit || null;
    parent.postMessage({ t: "chrome", toolbar: c.toolbar || [], buttons: c.buttons || [], status: c.status || "", menu: c.menu || [] }, "*");
  };
  /** 同一个插件的几个 frame 之间互通（正文 ⇄ 面板）。**宿主只转发，不看内容** */
  u.share = function (key, value) { parent.postMessage({ t: "share", key: key, value: value }, "*"); };
  u.onShare = function (key, cb) { (shareCbs[key] = shareCbs[key] || []).push(cb); };
})(window.umbra);

/* ── 剩下三件（M11-9）── */
(function (u) {
  var changedCbs = [], keyCbs = [], sendSelCbs = [];
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (m && m.t === "changed") changedCbs.forEach(function (cb) { cb(m.path); });
    if (m && m.t === "key") keyCbs.forEach(function (cb) { cb(m); });
    if (m && m.t === "send-selection") sendSelCbs.forEach(function (cb) { cb(); });
  });
  /** 有没有没落盘的改动。**归宿主管** —— 关页签要拦、退出要拦，
   *  这些都发生在插件的矩形之外，插件拦不住。 */
  u.setDirty = function (on) { parent.postMessage({ t: "dirty", on: !!on }, "*"); };
  /** 把一段文字带进会话并**直接发给 AI**。⚠️ 多数时候你要的是下面那个 `pick`。 */
  u.ask = function (text) { parent.postMessage({ t: "ask", text: String(text) }, "*"); };
  /** 把一段选区**挂成药丸**（不发送），并聚焦输入框 —— 用户自己写问题。
   *  和 `ask` 的区别是那一半的全部：`ask` 是「替我问」，`pick` 是「把这个带上」。
   *  按 ⌘L 的那一刻用户**还没想好要问什么**，替他发出去是越权。 */
    u.pick = function (label, detail) { parent.postMessage({ t: "pick", label: String(label), detail: String(detail) }, "*"); };
  /** 文件在盘上变了（AI 改的、别的编辑器改的）。**插件自己发现不了** ——
   *  它没有文件系统也没有事件流。收到就重读一次。 */
  u.onChanged = function (cb) { changedCbs.push(cb); };

  /** 宿主转发过来的快捷键（M10-2）。**键盘事件不跨 iframe 边界** ——
   *  焦点不在插件里时（用户刚点了 `⋯` 或别处），插件收不到任何 keydown。
   *  宿主只转插件会用的那几个（⌘S / ⌘Z / ⌘Y / ⌘F），不转它自己的 ⌘B / ⌘\。
   *  ⚠️ 插件**两边都要接**：焦点在自己身上时走本地 keydown，不在时走这一条。 */
  u.onKey = function (cb) { keyCbs.push(cb); };

  /** 用户按了 ⌘L（「把选中的拿去问 AI」）。**这不是插件自己的键** ——
   *  ⌘L 归工作台（聚焦会话输入框），我们只是有话要说：有选区就带上。
   *  没选区时什么都不做，工作台照样会聚焦输入框。 */
  u.onSendSelection = function (cb) { sendSelCbs.push(cb); };
})(window.umbra);
