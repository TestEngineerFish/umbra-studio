/** 积分（形制 `ui/S17` 演示态 11）。
 *
 *  ⚠️ **整屏都还没接** —— 账号、支付、余额、流水一个都没有。
 *  所以这里**不画假余额和假流水**：画出来的话，第一眼看不出它是假的，
 *  而「看起来能用但其实是假的」比「明说还没做」糟得多。
 *
 *  真做的时候要带上用户 2026-09-26 定的三条（`doc/20` §4.5）：
 *  积分不过期 · 买插件出问题只退积分（充值订单本身的问题可以原路退钱）· 300/1,000/3,000，¥0.1 一积分。
 */
export function Credits() {
  return (
    <div className="max-w-[560px] mx-auto px-8 py-10 text-xs leading-relaxed">
      <h1 className="text-lg font-semibold">积分</h1>
      <p className="text-text2 mt-3">
        积分用来买插件。<b className="text-text">还没接通</b> —— 账号（微信 / Apple / Umbra）和支付还在做，
        所以这里暂时没有余额和流水。
      </p>
      <div className="mt-4 rounded px-3 py-2.5" style={{ background: "var(--tool-warn-soft)", color: "var(--tool-warn)" }}>
        <b>积分不能退成现金。</b>
        <div className="mt-1 opacity-90">充进来的积分只能用来买插件，不能提现。没用完的会一直留着，<b>不会过期</b>。</div>
      </div>
      <p className="text-muted mt-4">
        这一段会写在充值页的付钱按钮正上方 —— 它不是错误提示，是一条要先知道的规矩。
      </p>
    </div>
  );
}
