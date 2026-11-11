import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';

/** What a comment thread is about. A `flow` is one topic's line from one system to another. */
export type CommentTarget =
  | { kind: 'centre' }
  | { kind: 'system' | 'topic' | 'group'; id: string }
  | { kind: 'flow'; topicId: string; fromId: string; toId: string };

export type Decision = 'accepted' | 'rejected';

export interface CommentEntry {
  id: string;
  author: string;
  /** ISO date. */
  at: string;
  text: string;
  /** Answers this entry of the same thread (a reply to the thread has none). */
  replyTo?: string;
  decision?: { kind: Decision; by: string; at: string };
}

export type ThreadAction = 'created' | 'replied' | 'accepted' | 'rejected' | 'decision-cleared' | 'closed' | 'reopened' | 'entry-removed';

export interface CommentThread {
  id: string;
  target: CommentTarget;
  entries: CommentEntry[];
  /** Set when the thread is resolved. Open threads are the ones counted on the canvas. */
  closed?: { by: string; at: string };
  /** Every action on the thread, with who did it and when. */
  log: { action: ThreadAction; by: string; at: string; entryId?: string }[];
}

export const targetKey = (t: CommentTarget): string =>
  t.kind === 'centre' ? 'centre' : t.kind === 'flow' ? `flow:${t.fromId}>${t.toId}:${t.topicId}` : `${t.kind}:${t.id}`;

export const sameTarget = (a: CommentTarget, b: CommentTarget) => targetKey(a) === targetKey(b);

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** Who acts and when; every change to a thread records it. */
export interface Actor {
  by: string;
  at: string;
}

export function createThread(threads: CommentThread[], target: CommentTarget, text: string, a: Actor): CommentThread {
  const entry: CommentEntry = { id: newId('ce'), author: a.by, at: a.at, text };
  const thread: CommentThread = { id: newId('ct'), target, entries: [entry], log: [{ action: 'created', by: a.by, at: a.at, entryId: entry.id }] };
  threads.push(thread);
  return thread;
}

export function reply(thread: CommentThread, text: string, a: Actor, replyTo?: string): CommentEntry {
  const entry: CommentEntry = { id: newId('ce'), author: a.by, at: a.at, text, ...(replyTo ? { replyTo } : {}) };
  thread.entries.push(entry);
  thread.log.push({ action: 'replied', by: a.by, at: a.at, entryId: entry.id });
  return entry;
}

/** Accept or reject one entry; `null` clears the decision. */
export function decide(thread: CommentThread, entryId: string, decision: Decision | null, a: Actor): void {
  const e = thread.entries.find((x) => x.id === entryId);
  if (!e) return;
  if (decision) e.decision = { kind: decision, by: a.by, at: a.at };
  else delete e.decision;
  thread.log.push({ action: decision ?? 'decision-cleared', by: a.by, at: a.at, entryId });
}

export function setClosed(thread: CommentThread, closed: boolean, a: Actor): void {
  if (closed) thread.closed = { by: a.by, at: a.at };
  else delete thread.closed;
  thread.log.push({ action: closed ? 'closed' : 'reopened', by: a.by, at: a.at });
}

/** Remove one entry; a thread left without entries is removed. Returns the remaining threads. */
export function removeEntry(threads: CommentThread[], threadId: string, entryId: string, a: Actor): CommentThread[] {
  const t = threads.find((x) => x.id === threadId);
  if (!t) return threads;
  t.entries = t.entries.filter((e) => e.id !== entryId);
  // Replies to the removed entry now answer the thread.
  for (const e of t.entries) if (e.replyTo === entryId) delete e.replyTo;
  t.log.push({ action: 'entry-removed', by: a.by, at: a.at, entryId });
  return t.entries.length ? threads : threads.filter((x) => x.id !== threadId);
}

/** Open (unresolved) threads about a target. */
export const openThreads = (threads: CommentThread[], target: CommentTarget) => threads.filter((t) => !t.closed && sameTarget(t.target, target));

/** Threads that still point at something that exists. */
export function pruneThreads(
  threads: CommentThread[],
  exists: { system(id: string): boolean; topic(id: string): boolean; group(id: string): boolean },
): CommentThread[] {
  return threads.filter((t) => {
    const g = t.target;
    switch (g.kind) {
      case 'centre':
        return true;
      case 'flow':
        return exists.system(g.fromId) && exists.system(g.toId) && exists.topic(g.topicId);
      case 'system':
        return exists.system(g.id);
      case 'topic':
        return exists.topic(g.id);
      case 'group':
        return exists.group(g.id);
    }
  });
}

/* ---------- compressed form, used in exported JSON files ---------- */

export interface CompressedComments {
  encoding: 'gzip+base64';
  data: string;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function compressComments(threads: CommentThread[]): CompressedComments {
  return { encoding: 'gzip+base64', data: toBase64(gzipSync(strToU8(JSON.stringify(threads)), { level: 9 })) };
}

/** Accepts the compressed form or a plain array (older or hand-written files). */
export function readComments(raw: unknown): CommentThread[] {
  if (Array.isArray(raw)) return raw as CommentThread[];
  if (raw && typeof raw === 'object' && (raw as CompressedComments).encoding === 'gzip+base64') {
    try {
      return JSON.parse(strFromU8(gunzipSync(fromBase64((raw as CompressedComments).data))));
    } catch {
      return [];
    }
  }
  return [];
}
