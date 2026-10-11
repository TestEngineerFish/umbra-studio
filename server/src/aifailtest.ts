/** 服务端 AI 失败判据的回归（2026-10-11）：`ai_fail.ts` 把 Umbra 的 402 分成三档，按钮文案与 PC / iOS 同一张表。
 *  跑：npm --prefix server run aifailtest。一条都不调网络。 */
import { failAction, failErrorText, failHint, parseAiFailure } from "./ai_fail.js";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${what}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? " — " + detail : ""}`); }
};

console.log("服务端 AI 失败分档（ai_fail）");

/* ── ① 三档各自的按钮；其余类别没有按钮 ── */
ok(failAction("insufficient_balance") === "去充值", "厂商欠费 → 去充值");
ok(failAction("vision_topup") === "去充值", "PC 那张表的旧名 vision_topup 也认");
ok(failAction("need_membership") === "开会员", "没会员 → 开会员");
ok(failAction("quota_exhausted") === "重置卡 / 加量包", "额度用完 → 重置卡 / 加量包");
for (const k of ["rate_limited", "upstream_error", "auth_failed", "bad_request", "unavailable", "unknown", ""]) {
  ok(failAction(k) === null, `${k || "(空)"} 没有按钮`);
}

/* ── ② 解析 Umbra 的错误体 ── */
const body402 = JSON.stringify({ error: { message: "没有有效会员，开通后即可使用服务端 AI。", type: "need_membership", code: "need_membership", detail: "NoMembership", topup_url: "https://umbra.tingyusha.xyz/shop" } });
const f = parseAiFailure(402, body402);
ok(!!f && f.kind === "need_membership", "code → kind");
ok(!!f && f.message.startsWith("没有有效会员"), "message 是服务端那句中文");
ok(!!f && f.topupUrl === "https://umbra.tingyusha.xyz/shop", "topup_url 原样");
ok(!!f && f.action === "开会员", "action 跟着 kind");
ok(!!f && f.detail === "NoMembership", "detail 保留");

const q = parseAiFailure(402, JSON.stringify({ error: { code: "quota_exhausted", message: "额度用完", detail: "5h 窗口 14:00 重置" } }));
ok(!!q && q.topupUrl === "" && q.action === "重置卡 / 加量包", "没 topup_url 时 url 空串但按钮还在");
const bad = parseAiFailure(402, JSON.stringify({ error: { code: "quota_exhausted", message: "x", topup_url: "javascript:alert(1)" } }));
ok(!!bad && bad.topupUrl === "", "topup_url 只认 http(s)");
ok(parseAiFailure(402, "Insufficient Balance") === null, "厂商的裸文本 402 不是这个形状 → null");
ok(parseAiFailure(402, JSON.stringify({ message: "x" })) === null, "没有 error.code → null");
ok(parseAiFailure(200, body402) === null, "2xx 不算失败");
ok(parseAiFailure(429, JSON.stringify({ error: { code: "rate_limited", message: "太快了" } }))?.action === null, "429 限流解析得出但没按钮");
ok(parseAiFailure(402, JSON.stringify({ error: { type: "insufficient_balance", message: "欠费" } }))?.kind === "insufficient_balance", "没 code 时退回 type");

/* ── ③ 写进 error 串的那一句：保留状态码（looksLikeQuotaProblem 靠它） ── */
ok(failErrorText(402, "raw", null) === "HTTP 402: raw", "认不出 → 原样 HTTP n: 原文");
ok(failErrorText(402, body402, f) === "HTTP 402: 没有有效会员，开通后即可使用服务端 AI。（NoMembership）", "认得出 → 中文 + 原话");
ok(failErrorText(402, "", q).includes("402") && failErrorText(402, "", q).includes("额度用完"), "状态码与中文都在");

/* ── ④ 没有 topup_url 时的提示 ── */
ok(failHint("need_membership").includes("账号") && failHint("need_membership").includes("开会员"), "没会员的提示指到 Umbra 账号页");
ok(failHint("quota_exhausted").includes("重置卡"), "额度用完的提示提到重置卡");
ok(failHint("insufficient_balance").includes("服务商"), "欠费的提示指到厂商");
ok(failHint("rate_limited") === "", "没按钮的类别没有提示");

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
