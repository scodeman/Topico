import { describe, expect, it } from 'vitest';
import { toJson } from '../export/exporters';
import { compressComments, createThread, decide, openThreads, pruneThreads, readComments, removeEntry, reply, setClosed, targetKey, type CommentThread } from './comments';
import { sampleModel } from './sample';
import { normalizeModel } from './types';

const ann = { by: 'Ann', at: '2026-11-11T08:00:00.000Z' };
const bob = { by: 'Bob', at: '2026-11-11T09:00:00.000Z' };

describe('comment threads', () => {
  it('creates a thread with its author and date, and replies to the thread or to one comment', () => {
    const threads: CommentThread[] = [];
    const t = createThread(threads, { kind: 'system', id: 'n1' }, 'Is this still used?', ann);
    const r1 = reply(t, 'Yes, by billing.', bob);
    const r2 = reply(t, 'Since when?', ann, r1.id);
    expect(t.entries.map((e) => [e.author, e.at, e.replyTo ?? null])).toEqual([
      ['Ann', ann.at, null],
      ['Bob', bob.at, null],
      ['Ann', ann.at, r1.id],
    ]);
    expect(r2.replyTo).toBe(r1.id);
    expect(t.log.map((l) => `${l.action}:${l.by}`)).toEqual(['created:Ann', 'replied:Bob', 'replied:Ann']);
  });

  it('accepts, rejects and clears decisions on any comment, keeping who and when', () => {
    const threads: CommentThread[] = [];
    const t = createThread(threads, { kind: 'topic', id: 't1' }, 'Rename it', ann);
    const r = reply(t, 'Use v2 naming', ann);
    decide(t, t.entries[0].id, 'rejected', bob);
    decide(t, r.id, 'accepted', bob);
    expect(t.entries.map((e) => e.decision)).toEqual([
      { kind: 'rejected', by: 'Bob', at: bob.at },
      { kind: 'accepted', by: 'Bob', at: bob.at },
    ]);
    decide(t, r.id, null, ann);
    expect(t.entries[1].decision).toBeUndefined();
    expect(t.log.map((l) => l.action)).toEqual(['created', 'replied', 'rejected', 'accepted', 'decision-cleared']);
  });

  it('closes and reopens a thread; only open threads count', () => {
    const threads: CommentThread[] = [];
    const target = { kind: 'flow' as const, topicId: 't5', fromId: 'n1', toId: 'xw1' };
    const t = createThread(threads, target, 'Latency?', ann);
    createThread(threads, target, 'Schema?', bob);
    expect(openThreads(threads, target)).toHaveLength(2);
    setClosed(t, true, bob);
    expect(t.closed).toEqual({ by: 'Bob', at: bob.at });
    expect(openThreads(threads, target)).toHaveLength(1);
    setClosed(t, false, ann);
    expect(openThreads(threads, { ...target })).toHaveLength(2);
    expect(targetKey(target)).toBe('flow:n1>xw1:t5');
  });

  it('removes a comment, re-threads its replies, and drops a thread left empty', () => {
    let threads: CommentThread[] = [];
    const t = createThread(threads, { kind: 'centre' }, 'First', ann);
    const r = reply(t, 'Second', bob, t.entries[0].id);
    threads = removeEntry(threads, t.id, t.entries[0].id, ann);
    expect(threads[0].entries.map((e) => e.id)).toEqual([r.id]);
    expect(threads[0].entries[0].replyTo).toBeUndefined();
    threads = removeEntry(threads, t.id, r.id, ann);
    expect(threads).toEqual([]);
  });

  it('drops threads whose entity was deleted', () => {
    const threads: CommentThread[] = [];
    createThread(threads, { kind: 'system', id: 'gone' }, 'x', ann);
    createThread(threads, { kind: 'flow', topicId: 't1', fromId: 'n1', toId: 'gone' }, 'x', ann);
    createThread(threads, { kind: 'topic', id: 't1' }, 'x', ann);
    const kept = pruneThreads(threads, { system: (id) => id !== 'gone', topic: () => true, group: () => true });
    expect(kept.map((t) => t.target.kind)).toEqual(['topic']);
  });
});

describe('comments in exported files', () => {
  it('stores the threads compressed in the JSON and reads them back', () => {
    const m = sampleModel();
    const t = createThread(m.comments, { kind: 'system', id: 'n1' }, 'A long remark '.repeat(40), ann);
    reply(t, 'é ü 中文 ✓', bob);
    const json = JSON.parse(toJson(m));
    expect(json.comments.encoding).toBe('gzip+base64');
    expect(typeof json.comments.data).toBe('string');
    expect(JSON.stringify(json.comments).length).toBeLessThan(JSON.stringify(m.comments).length);
    const back = normalizeModel(json);
    expect(back.comments).toEqual(m.comments);
  });

  it('still reads plain comment arrays, and ignores broken data', () => {
    expect(readComments([{ id: 'x' }])).toHaveLength(1);
    expect(readComments({ encoding: 'gzip+base64', data: 'not-base64!' })).toEqual([]);
    expect(readComments(undefined)).toEqual([]);
    expect(readComments(compressComments([]))).toEqual([]);
  });
});

describe('comments are not exported to SVG or draw.io', () => {
  it('leaves out markers and comment text', async () => {
    const { toSvg, toDrawio } = await import('../export/exporters');
    const { computeView } = await import('../engine/view');
    const { layoutView } = await import('../engine/layout');
    const m = sampleModel();
    createThread(m.comments, { kind: 'system', id: 'n1' }, 'SECRET-REMARK', ann);
    const vm = computeView(m, { filterSystems: [], filterTopics: [], collapseBy: 'none', sharedOnly: true });
    const l = layoutView(vm);
    for (const out of [toSvg(l, vm, m.groups, false), toDrawio(l, vm, m.groups, { showStubs: false, title: 'x' })]) {
      expect(out).not.toContain('SECRET-REMARK');
      expect(out).not.toContain('data-badge');
      expect(out).not.toContain('#ea580c');
      expect(out).not.toContain('data-edge');
    }
  });
});
