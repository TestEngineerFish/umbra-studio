/** 钉在节点上的评论（doc/12 M6-2，决策 doc/11 Q14）。
 *
 * 存 <项目>/.umbrastudio/comments.json —— 和会话一样属于项目，不进稿。
 * 一条评论 = 稿 + 节点地址 + 一句话；可标「已处理」；会话面板能把它一键发给 AI（走方式 ②）。
 * 节点地址会随内容变（doc/09 §二）：改过的节点旧地址找不到时，评论仍保留，只是钉子画不出来 ——
 * 界面上标「节点已变」，不静默丢。
 */
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { writeAtomic } from "./normalize.js";

export interface Comment {
  id: string;
  file: string;
  node: string;
  tag?: string;
  text: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  /** 发给 AI 的时刻。`null` = 还在**暂存**（M8-32）。
   *
   *  ⚠️ 这和 `resolved` 是**两个维度**，不能合：
   *  `resolved` 是人说「这条我处理完了」，`sentAt` 是「这条已经交给 AI 了」。
   *  发过不等于处理完（AI 可能改错），处理完也不必发过（自己动手改的）。
   *  界面上分别对应「暂存区里还剩几条」和「画布上哪些钉是灰的」。
   *
   *  旧数据没有这个字段 → `undefined` → 一律当**未发送**看。 */
  sentAt?: string | null;
  /** 写这条评论时那个节点在源码第几行。**存下来而不是每次查** ——
   *  「全部发给 AI」要把行号一起给 AI，而那时节点可能已经被改过、地址都变了。
   *  只是个线索，不保证还准。 */
  line?: number | null;
}

function file(projectDir: string): string { return join(projectDir, ".umbrastudio", "comments.json"); }

export async function listComments(projectDir: string, draft?: string): Promise<Comment[]> {
  const f = file(projectDir);
  if (!existsSync(f)) return [];
  let all: Comment[] = [];
  try { all = JSON.parse(await readFile(f, "utf8")) as Comment[]; } catch { all = []; }
  if (draft) all = all.filter((c) => c.file === draft);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function save(projectDir: string, all: Comment[]): Promise<void> {
  await mkdir(join(projectDir, ".umbrastudio"), { recursive: true });
  await writeAtomic(file(projectDir), JSON.stringify(all, null, 1) + "\n");
}

export async function addComment(projectDir: string, c: { file: string; node: string; tag?: string; text: string; line?: number | null }): Promise<Comment> {
  const text = c.text.trim();
  if (!text) throw new Error("评论不能为空");
  const all = await listComments(projectDir);
  const item: Comment = { id: randomBytes(6).toString("hex"), file: c.file, node: c.node, tag: c.tag, text, createdAt: new Date().toISOString(), resolved: false, resolvedAt: null, sentAt: null, line: c.line ?? null };
  all.push(item);
  await save(projectDir, all);
  return item;
}

export async function updateComment(projectDir: string, id: string, patch: { text?: string; resolved?: boolean; sent?: boolean }): Promise<Comment> {
  const all = await listComments(projectDir);
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error(`没有这条评论 ${id}`);
  if (typeof patch.text === "string" && patch.text.trim()) c.text = patch.text.trim();
  if (typeof patch.resolved === "boolean") { c.resolved = patch.resolved; c.resolvedAt = patch.resolved ? new Date().toISOString() : null; }
  if (typeof patch.sent === "boolean") c.sentAt = patch.sent ? new Date().toISOString() : null;
  await save(projectDir, all);
  return c;
}

/** 一次把好几条标成「已发给 AI」（M8-32）。
 *  「全部发给 AI」合成的是**一条**消息，所以标记也该一次做完 ——
 *  逐条发请求的话中间失败会留下「一半发了一半没发」，而用户看到的是一条消息发出去了。 */
export async function markCommentsSent(projectDir: string, ids: string[]): Promise<{ marked: number }> {
  const all = await listComments(projectDir);
  const at = new Date().toISOString();
  let marked = 0;
  for (const c of all) if (ids.includes(c.id) && !c.sentAt) { c.sentAt = at; marked++; }
  if (marked) await save(projectDir, all);
  return { marked };
}

export async function deleteComment(projectDir: string, id: string): Promise<{ deleted: boolean }> {
  const all = await listComments(projectDir);
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return { deleted: false };
  await save(projectDir, next);
  return { deleted: true };
}
