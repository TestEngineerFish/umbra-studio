/* Umbra Studio · 预览点选桥。doc/00 §十九
 *
 * 跑在**被预览的那份稿**里，由预览壳（S2）在 iframe 载入之后注入 ——
 * 不进稿本身。稿是设计事实，点选是工具行为，两者不能混在一个文件里。
 * 壳和稿由同一个本地静态服务发出，同源，所以壳能往 iframe 里塞这段脚本。
 *
 * 地址怎么来（doc/00 §17.3 实测）：
 *   file = 最近的 [data-sc-name] 的值   —— 运行时自己打的组件边界
 *   node = [data-ud-node] 的值          —— 我们落盘时打的节点地址
 * 两个属性都已经在 DOM 里，所以这一步不问服务端。
 *
 * ⚠️ 点选模式必须能关。预览既要「点一下选中它」，也要「点一下真的用这个界面」——
 * 只给前者的话，带交互的稿在预览里就试不动了。开关是 <html data-ud-select-on>，
 * 对应运行时自己那套 <body data-dc-editor-on>（§17.1）的思路。
 */
(function () {
  if (window.__udSelectBridge) return;              // 壳可能重复注入
  window.__udSelectBridge = true;

  var ROOT = document.documentElement;
  var HL = null, CUR = null;
  /** 选中的那个 **DOM 元素**（`CUR` 只是它的地址）。测间距要两个矩形，所以得留着它。 */
  var CUREL = null;

  function on() { return ROOT.hasAttribute("data-ud-select-on"); }

  function overlay() {
    if (HL) return HL;
    HL = document.createElement("div");
    HL.setAttribute("data-ud-overlay", "");
    HL.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;" +
      "border:1.5px solid #3a49cf;background:rgba(58,73,207,.10);border-radius:2px;" +
      "transition:all .06s ease;display:none";
    document.body.appendChild(HL);
    return HL;
  }

  function show(el) {
    var o = overlay(), r = el.getBoundingClientRect();
    o.style.display = "block";
    o.style.left = r.left + "px"; o.style.top = r.top + "px";
    o.style.width = r.width + "px"; o.style.height = r.height + "px";
  }
  function hide() { if (HL) HL.style.display = "none"; }

  /** 从任意 DOM 节点找到最近的可寻址节点，并算出它的地址 */
  function addressOf(el) {
    var node = el && el.closest ? el.closest("[data-ud-node]") : null;
    if (!node) return null;
    var host = node.closest("[data-sc-name]");
    var file = host ? host.getAttribute("data-sc-name") : null;
    if (!file && typeof window.__dcRootName === "function") {
      try { file = window.__dcRootName(); } catch (e) { /* 没有就算了 */ }
    }
    var r = node.getBoundingClientRect();
    return {
      file: file, node: node.getAttribute("data-ud-node"),
      tag: node.tagName.toLowerCase(),
      // 同一个地址在 sc-for 里对应多个 DOM 节点 —— 告诉壳这是第几个，
      // 让它能说清「改这一处会影响这 N 行」
      instances: document.querySelectorAll(
        '[data-ud-node="' + node.getAttribute("data-ud-node") + '"]').length,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      text: (node.textContent || "").trim().slice(0, 60)
    };
  }

  /* ── 样式覆盖通道（doc/00 §二十五）──
   *
   * 拖滑块的中间态不落盘：往稿里注一张 <style>，按节点地址写
   * `[data-ud-node="…"] { prop: value !important }`，松手才真写文件。
   *
   * ⚠️ 只做 **style**，不做属性和文本。原因是所有权：
   * 样式表是 React 不管的东西，写进去不会被下一次渲染冲掉；
   * 而属性与文本由 React 托管，直接改会在重渲染时被还原 —— 那种"预览"会闪回，
   * 比没有预览更糟。
   *
   * ⚠️ 用 !important：稿里的值是写在 style 属性上的（doc/06 §2.1），
   * 内联样式优先级更高，不加 !important 盖不住。
   *
   * sc-for 里一个地址对应多个 DOM 节点，选择器天然全命中 ——
   * 这与"改一处影响每一行"的落盘语义一致，不用特殊处理。
   */
  var SHEET_ID = "ud-preview-override";
  var overrides = {};        // "nodeId" -> { prop: value }

  function sheet() {
    var el = document.getElementById(SHEET_ID);
    if (el) return el;
    el = document.createElement("style");
    el.id = SHEET_ID;
    (document.head || document.documentElement).appendChild(el);
    return el;
  }

  function cssEscape(v) { return String(v).replace(/["\\]/g, "\\$&"); }

  function flush() {
    var out = [], ids = Object.keys(overrides);
    for (var i = 0; i < ids.length; i++) {
      var props = overrides[ids[i]], keys = Object.keys(props), decls = [];
      for (var j = 0; j < keys.length; j++) {
        if (props[keys[j]] === "") continue;
        decls.push(keys[j] + ":" + props[keys[j]] + " !important");
      }
      if (decls.length) out.push('[data-ud-node="' + cssEscape(ids[i]) + '"]{' + decls.join(";") + "}");
    }
    sheet().textContent = out.join("\n");
    return out.length;
  }

  function previewStyle(nodeId, prop, value) {
    if (!nodeId || !prop) return;
    if (!overrides[nodeId]) overrides[nodeId] = {};
    overrides[nodeId][prop] = value == null ? "" : String(value);
    var n = flush();
    send("preview", { node: nodeId, prop: prop, value: value, rules: n });
  }

  function clearPreview(nodeId) {
    if (nodeId) delete overrides[nodeId]; else overrides = {};
    send("preview", { node: nodeId || null, cleared: true, rules: flush() });
  }

  /* ════ 按住 Option/Alt 悬停测间距（issue #17，2026-10-06）════
   *
   *  看稿、对稿时问得最多的就是间距（「这两块之间是 16 还是 24？」），
   *  而在它之前只能点进属性面板逐个看 margin / padding / gap **再心算**。
   *
   *  ⚠️ **没有 vendor spacingjs**，直接写在这儿。它的源码是 4 个 TS 文件（约 17 KB），
   *  要为它引一条构建链；而这件事的核心就是「两个矩形算四个方向的差值再画线」。
   *  issue 自己也写了这条退路（「只借它的判定分支自己重写」）。
   *  **借过来的是它的边界情况清单**，那才是省下的部分：
   *    · 包含关系画四条内距（不是画两条间距，那时「间距」是 0，没意义）
   *    * 只在一个轴上分开时**只画那一轴**（另一轴画出来是一条穿过元素的线）
   *    · 标签贴线中点，**顶到视口外就翻到线的另一侧**（§PREVIEW_BRIDGE 那条同理）
   *    · 鼠标离开窗口要清掉（spacingjs 的 v1.0.9 修的正是这一条）
   *
   *  ⚠️ 和点选**同一个闸**（`data-ud-select-on`）：关掉之后稿的交互一切照旧，
   *  不然在「真的用这个界面」时按一下 Option 就会蹦出一堆线。
   *
   *  ⚠️ **数字画在页面里，不往外发消息。** issue 原本写的是「测出来的值走现有
   *  shell-state 消息回传给工作台，工具栏或状态行显示即可」—— 第一版我真发了一条
   *  `send("spacing", …)`，然后去核了一下：**S2 壳只认** `ready` / `select` /
   *  `clear` / `edit-request` / `edit-commit`，这一条**没有任何消费方**。
   *  那正是 §一〇三 记过的那件事（「我 dispatch 了一个没人听的 `ud-focus-chat`」——
   *  自制版的「点了没反应」）。所以删掉了。
   *  要让工作台也显示，得先有 S2 壳的转发 + 一个状态位，而那是形制决定（设计侧的事），
   *  不是顺手加一句 postMessage 就算接上了。
   *  **而且用户看的就是画布** —— Figma 也是把数字画在线上。 */
  var SP = null;      // 容器
  function spacingBox() {
    if (SP) return SP;
    SP = document.createElement("div");
    /* ⚠️ 打 `data-ud-overlay` —— 和高亮框同一个规矩：
       不打的话它会被当成稿里的东西（`addressOf` 虽然只认 `[data-ud-node]`，
       但别的地方按 overlay 标记做排除，少打一个标记就得排查一圈）。 */
    SP.setAttribute("data-ud-overlay", "");
    /* 再打一个自己的标记：高亮框也带 `data-ud-overlay`，两个分不开。
       ⚠️ 判据**按这个标记找**，不按 `style` 里的 z-index ——
       `cssText` 会把它规整成 `z-index: …`（带空格），按样式串匹配一定落空
       （2026-10-06 手验第一版就是这么空的，而症状是「一条线都没画」）。 */
    SP.setAttribute("data-ud-spacing", "");
    SP.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483646";
    document.body.appendChild(SP);
    return SP;
  }
  function clearSpacing() { if (SP) SP.textContent = ""; }

  /** 画一条线 + 一个数字。`horiz` = 这是一条水平线（量的是左右间距）。 */
  function drawGap(x1, y1, x2, y2, val, horiz) {
    var box = spacingBox();
    var line = document.createElement("div");
    var L = Math.min(x1, x2), T = Math.min(y1, y2);
    line.style.cssText = "position:fixed;background:#e5484d;" +
      (horiz ? "height:1px;left:" + L + "px;top:" + T + "px;width:" + Math.abs(x2 - x1) + "px"
             : "width:1px;left:" + L + "px;top:" + T + "px;height:" + Math.abs(y2 - y1) + "px");
    box.appendChild(line);
    var tag = document.createElement("div");
    tag.textContent = String(Math.round(val));
    tag.style.cssText = "position:fixed;font:10px/14px ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "background:#e5484d;color:#fff;padding:0 3px;border-radius:2px;white-space:nowrap";
    box.appendChild(tag);
    /* 标签贴线中点；贴不住就翻到另一侧 —— 不翻的话贴着视口边的那条线上的数字看不见 */
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    var w = tag.offsetWidth || 16, h = tag.offsetHeight || 14;
    var tx = horiz ? mx - w / 2 : mx + 3;
    var ty = horiz ? my - h - 2 : my - h / 2;
    if (ty < 0) ty = my + 2;
    if (tx < 0) tx = mx + 3;
    if (tx + w > innerWidth) tx = mx - w - 3;
    tag.style.left = tx + "px"; tag.style.top = ty + "px";
  }

  /** 量 a（选中的）和 b（鼠标下的）之间的距离并画出来。回画了几条。 */
  function measure(a, b) {
    clearSpacing();
    if (!a || !b || a === b) return 0;
    var A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    var n = 0;
    var inside = function (o, i) { return i.left >= o.left && i.right <= o.right && i.top >= o.top && i.bottom <= o.bottom; };
    /* ① 包含关系 → 画**四条内距**（那时「间距」是 0，画它没意义） */
    if (inside(A, B) || inside(B, A)) {
      var O = inside(A, B) ? A : B, I = inside(A, B) ? B : A;
      var cx = (I.left + I.right) / 2, cy = (I.top + I.bottom) / 2;
      drawGap(cx, O.top, cx, I.top, I.top - O.top, false); n++;
      drawGap(cx, I.bottom, cx, O.bottom, O.bottom - I.bottom, false); n++;
      drawGap(O.left, cy, I.left, cy, I.left - O.left, true); n++;
      drawGap(I.right, cy, O.right, cy, O.right - I.right, true); n++;
      return n;
    }
    /* ② 左右分开 → 画一条水平线，y 取两者竖直重叠段的中点；
       不重叠时取较近的那条边 —— 取中点会把线画到两个元素之外。 */
    if (A.right <= B.left || B.right <= A.left) {
      var l = A.right <= B.left ? A.right : B.right, r = A.right <= B.left ? B.left : A.left;
      var ov = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      var y = ov > 0 ? (Math.max(A.top, B.top) + Math.min(A.bottom, B.bottom)) / 2
                     : (A.bottom < B.top ? (A.bottom + B.top) / 2 : (B.bottom + A.top) / 2);
      drawGap(l, y, r, y, r - l, true); n++;
    }
    /* ③ 上下分开 → 同理 */
    if (A.bottom <= B.top || B.bottom <= A.top) {
      var t = A.bottom <= B.top ? A.bottom : B.bottom, bo = A.bottom <= B.top ? B.top : A.top;
      var ovx = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      var x = ovx > 0 ? (Math.max(A.left, B.left) + Math.min(A.right, B.right)) / 2
                      : (A.right < B.left ? (A.right + B.left) / 2 : (B.right + A.left) / 2);
      drawGap(x, t, x, bo, bo - t, false); n++;
    }
    return n;
  }

  function send(type, payload) {
    try { window.parent.postMessage({ source: "umbradesign", type: type, payload: payload }, "*"); }
    catch (e) { /* 没有父窗口就当没这回事 */ }
  }

  document.addEventListener("mousemove", function (e) {
    if (!on()) { hide(); clearSpacing(); return; }
    var node = e.target && e.target.closest ? e.target.closest("[data-ud-node]") : null;
    if (node) show(node); else hide();
    /* 按住 Option/Alt 且**已经选中过一个**节点时测间距（issue #17）。
       ⚠️ 没选中时什么都不画 —— 「和谁比」是这件事的前提，
       而一个「按了 Option 但只画出鼠标下那个框」的行为会让人以为功能坏了。 */
    if (e.altKey && CUREL && node && node !== CUREL) measure(CUREL, node);
    else clearSpacing();
  }, true);

  /* ⚠️ 这里**不能**用捕获阶段。mouseleave 不冒泡，但捕获阶段是 document → target，
     所以挂在 document 上的捕获监听会收到**任意**子元素的 mouseleave ——
     鼠标在稿里一动，高亮框就被藏掉。实测踩到：点完一个节点高亮框是 display:none。
     不加 true，document 上的 mouseleave 只在真的离开文档时才触发。 */
  document.addEventListener("mouseleave", function () { hide(); clearSpacing(); });
  /* ⚠️ **松开 Option 要清掉**：不清的话线会一直留着，而用户会以为它测的是现在鼠标下那个。
     `keyup` 里 `e.key` 在 mac 上是 "Alt"，但**按住 Option 打字时 key 会变**，
     所以判 `!e.altKey` 而不是判键名。 */
  document.addEventListener("keyup", function (e) { if (!e.altKey) clearSpacing(); }, true);
  addEventListener("blur", clearSpacing);

  // 捕获阶段拦下来，**只在点选模式下**阻止稿自己的处理器 ——
  // 关掉开关之后稿的交互一切照旧
  document.addEventListener("click", function (e) {
    if (!on()) return;
    var a = addressOf(e.target);
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    CUR = a;
    CUREL = e.target && e.target.closest ? e.target.closest("[data-ud-node]") : null;
    send("select", a);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (EDIT) return;                                   // 编辑中的 Esc 由编辑器自己处理
    if (e.key === "Escape") { CUR = null; CUREL = null; hide(); clearSpacing(); send("clear", null); }
  }, true);

  /* ── 文字就地编辑（doc/12 M6-5）──
   * 点选模式下双击一个节点 → 先问壳「这段文字能不能改」（壳去 locate，只有字面量文案才行）；
   * 壳回 edit-start 才把元素设成 contentEditable。Enter / 失焦提交，Esc 放弃并还原。
   * React 托管文本，提交后壳会走 set_prop 落盘、iframe 重载 —— 所以这里不做「预览」，只做输入。 */
  var EDIT = null;   // { el, node, original }
  document.addEventListener("dblclick", function (e) {
    if (!on() || EDIT) return;
    var a = addressOf(e.target);
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    send("edit-request", a);
  }, true);

  function editStart(nodeId) {
    var el = document.querySelector('[data-ud-node="' + cssEscape(nodeId) + '"]');
    if (!el || EDIT) return;
    EDIT = { el: el, node: nodeId, original: el.textContent };
    el.setAttribute("contenteditable", "true");
    el.setAttribute("data-ud-editing", "");
    el.style.outline = "2px solid #3a49cf"; el.style.outlineOffset = "2px";
    el.focus();
    try { var range = document.createRange(); range.selectNodeContents(el); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } catch (err) { /* ignore */ }
    el.addEventListener("keydown", onEditKey, true);
    el.addEventListener("blur", onEditBlur, true);
    hide();
  }
  function editEnd(commit) {
    if (!EDIT) return;
    var ed = EDIT; EDIT = null;
    ed.el.removeEventListener("keydown", onEditKey, true);
    ed.el.removeEventListener("blur", onEditBlur, true);
    ed.el.removeAttribute("contenteditable"); ed.el.removeAttribute("data-ud-editing");
    ed.el.style.outline = ""; ed.el.style.outlineOffset = "";
    var text = ed.el.textContent;
    if (!commit || text === ed.original) { ed.el.textContent = ed.original; send("edit-cancel", { node: ed.node }); return; }
    send("edit-commit", { node: ed.node, text: text, original: ed.original });
  }
  function onEditKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); editEnd(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); editEnd(false); }
    else e.stopPropagation();   // 稿自己的快捷键别抢
  }
  function onEditBlur() { editEnd(true); }

  // 壳可以问「现在选的是谁」，也可以让 iframe 高亮某个地址
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.source !== "umbradesign-shell") return;
    if (m.type === "set-mode") {
      if (m.payload) ROOT.setAttribute("data-ud-select-on", ""); else { ROOT.removeAttribute("data-ud-select-on"); hide(); }
      send("mode", on());
      return;
    }
    if (m.type === "highlight") {
      var el = m.payload && document.querySelector('[data-ud-node="' + m.payload + '"]');
      if (el) { show(el); el.scrollIntoView({ block: "center", behavior: "smooth" }); } else hide();
      return;
    }
    if (m.type === "preview-style") {
      var q = m.payload || {};
      previewStyle(q.node, q.prop, q.value);
      return;
    }
    if (m.type === "clear-style") { clearPreview((m.payload || {}).node); return; }
    if (m.type === "edit-start") { editStart((m.payload || {}).node); return; }
    if (m.type === "set-pins") { PINS = (m.payload && m.payload.nodes) || []; renderPins(); return; }
    if (m.type === "edit-abort") { editEnd(false); return; }
    if (m.type === "ping") send("ready", {
      nodes: document.querySelectorAll("[data-ud-node]").length,
      mode: on(),
      previewRules: Object.keys(overrides).length
    });
  });

  /* ── 评论钉子（M6-2）：壳给一份 { node, n } 列表，每个节点右上角画一颗小圆点，数字是该节点未处理的评论数。
   * 不进稿、不改稿；节点地址找不到（内容改过）就不画，由壳在列表里标「节点已变」。 */
  var PINS = [], PIN_LAYER = null;
  function pinLayer() {
    if (PIN_LAYER) return PIN_LAYER;
    PIN_LAYER = document.createElement("div");
    PIN_LAYER.setAttribute("data-ud-pins", "");
    PIN_LAYER.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646";
    document.body.appendChild(PIN_LAYER);
    return PIN_LAYER;
  }
  function renderPins() {
    var layer = pinLayer();
    layer.textContent = "";
    for (var i = 0; i < PINS.length; i++) {
      var el = document.querySelector('[data-ud-node="' + cssEscape(PINS[i].node) + '"]');
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var d = document.createElement("div");
      d.textContent = String(PINS[i].n || "");
      d.style.cssText = "position:absolute;left:" + Math.round(r.right - 9) + "px;top:" + Math.round(r.top - 9) + "px;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:#8c5a00;color:#fff;font:600 11px/18px system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.25)";
      layer.appendChild(d);
    }
  }
  window.addEventListener("scroll", renderPins, true);
  window.addEventListener("resize", renderPins);

  send("ready", { nodes: document.querySelectorAll("[data-ud-node]").length, mode: on() });
})();
