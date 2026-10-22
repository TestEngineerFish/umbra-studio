/** 长活儿的作业登记。doc/00 §二十三
 *
 * 为什么需要它：`render_check` 要开一次 Chromium，实测 1.4~12 秒。
 * 这种活儿不能做成一个同步的 HTTP 请求 ——
 *
 *  1. 界面那边 fetch 挂十几秒，中途超时就不知道到底跑没跑
 *  2. 连点两下按钮会起**两个** Chromium，机器上抢资源，而且两份读数互相覆盖
 *
 * 所以：POST 起一个作业立刻返回 jobId，界面轮询状态。
 * 同一份稿已经在跑就**返回那个作业**，不起第二个（按 file 上锁）。
 *
 * 作业活在 MCP server 进程里，和静态服务同一条命 —— 进程没了作业也没了，
 * 这是对的：读数已经落盘在 `.umbrastudio/checks/`（§十五），作业记录本身不必持久化。
 */
import { randomBytes } from "node:crypto";
import { emit } from "./events.js";

export interface Job<T = unknown> {
  id: string;
  kind: string;
  /** 作业锁的键 —— 同键只允许一个在跑 */
  key: string;
  startedAt: string;
  finishedAt: string | null;
  running: boolean;
  ok: boolean | null;
  result: T | null;
  error: { code: string; message: string; fix?: string } | null;
}

const jobs = new Map<string, Job>();
const byKey = new Map<string, string>();     // 锁键 → 正在跑的 jobId

/** 作业记录留不多久 —— 界面轮到了就不需要了。超过 200 条时清掉最老的已完成作业。 */
function sweep(): void {
  if (jobs.size <= 200) return;
  const done = [...jobs.values()].filter((j) => !j.running)
    .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  for (const j of done.slice(0, jobs.size - 200)) jobs.delete(j.id);
}

export function running(key: string): Job | null {
  const id = byKey.get(key);
  const j = id ? jobs.get(id) : undefined;
  return j && j.running ? j : null;
}

/** 这个前缀下**还在跑**的作业有几个（M15-1 S3，2026-10-22）。
 *
 *  ### 为什么需要它
 *  并存之后「关掉一个项目」变成常见操作，而取舍 B 定的是「有一轮 AI 在跑就拦一句」。
 *  **前端自己答不了这个问题**：`useChat` 的 `running` 只在**它那次 `send` 的生命周期里**
 *  为真 —— `useChat.ts:174` 自己写着「刷新页面、**切项目再切回来**、
 *  或者第二个窗口打开同一会话，它都是 false 而服务端那一轮还在跑」。
 *  > **「我这边没在跑」和「没有在跑」是两句话**，而只有作业表知道后者。
 *
 *  ⚠️ 作业键是 `<项目目录>::<尾巴>`（`api.ts` 的 `projectJobKey`，issue #153），
 *  所以按前缀数就是「这个项目的」。**不枚举尾巴** —— 以后多一种异步作业
 *  （体检、转换…）它自动算进去，而那正是「这个项目还忙着」该包含的。 */
export function runningUnder(prefix: string): { count: number; kinds: string[] } {
  const kinds = new Set<string>();
  let count = 0;
  for (const [key, id] of byKey) {
    if (!key.startsWith(prefix)) continue;
    const j = jobs.get(id);
    if (!j || !j.running) continue;
    count++;
    kinds.add(j.kind);
  }
  return { count, kinds: [...kinds] };
}

export function get(id: string): Job | null {
  return jobs.get(id) ?? null;
}

/** 起一个作业。同键已在跑就直接返回那个 —— 不起第二个。 */
export function start<T>(
  kind: string, key: string, run: () => Promise<T>,
  onError?: (e: unknown) => Job["error"]
): Job {
  const cur = running(key);
  if (cur) return cur;

  const job: Job<T> = {
    id: randomBytes(8).toString("hex"),
    kind, key,
    startedAt: new Date().toISOString(), finishedAt: null,
    running: true, ok: null, result: null, error: null,
  };
  jobs.set(job.id, job as Job);
  byKey.set(key, job.id);
  emit("job", null, view(job as Job));

  void run().then(
    (r) => { job.result = r; job.ok = true; },
    (e) => {
      job.ok = false;
      job.error = onError?.(e) ?? { code: "E_JOB", message: (e as Error)?.message ?? String(e) };
    }
  ).finally(() => {
    job.running = false;
    job.finishedAt = new Date().toISOString();
    if (byKey.get(key) === job.id) byKey.delete(key);
    emit("job", null, view(job as Job));
    sweep();
  });

  return job as Job;
}

/** 给界面看的形状 —— 不把整个 result 塞进轮询响应，除非已经跑完 */
export function view(j: Job): Record<string, unknown> {
  return {
    jobId: j.id, kind: j.kind, running: j.running,
    startedAt: j.startedAt, finishedAt: j.finishedAt,
    elapsedMs: (j.finishedAt ? Date.parse(j.finishedAt) : Date.now()) - Date.parse(j.startedAt),
    ok: j.ok, result: j.running ? null : j.result, error: j.error,
  };
}
