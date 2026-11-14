import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { sampleModel } from '../model/sample';
import type { Model } from '../model/types';
import { applyDiff, toY } from './ydiff';

const load = (m: Model) => {
  const doc = new Y.Doc();
  const root = doc.getMap<unknown>('model');
  doc.transact(() => applyDiff(root, {}, m as unknown as Record<string, unknown>));
  return { doc, root, json: () => root.toJSON() as Model };
};
const edit = (root: Y.Map<unknown>, prev: Model, next: Model) => root.doc!.transact(() => applyDiff(root, prev as never, next as never));
/** Two documents that start from the same state, as after a sync. */
const pair = (m: Model) => {
  const a = load(m);
  const b = { doc: new Y.Doc() } as { doc: Y.Doc; root: Y.Map<unknown>; json(): Model };
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  b.root = b.doc.getMap('model');
  b.json = () => b.root.toJSON() as Model;
  return [a, b] as const;
};
const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
};

describe('diagram mirror in Yjs', () => {
  it('round-trips the diagram', () => {
    const m = sampleModel();
    expect(load(m).json()).toEqual(JSON.parse(JSON.stringify(m)));
  });

  it('applies edits, additions, removals and moves', () => {
    const m = sampleModel();
    const { root, json } = load(m);
    const [s0, s1, ...rest] = m.systems;
    const next: Model = {
      ...m,
      centre: { ...m.centre, name: 'Renamed broker' },
      systems: [{ ...s1, owner: 'Bob' }, s0, ...rest.slice(1)],
      topics: [...m.topics, { ...m.topics[0], id: 't-new', name: 'NEW' }],
    };
    edit(root, m, next);
    expect(json()).toEqual(JSON.parse(JSON.stringify(next)));
  });

  it('merges edits made at the same time on different fields and entities', () => {
    const m = sampleModel();
    const [a, b] = pair(m);
    const [s0, s1] = m.systems;
    const ma: Model = { ...m, systems: m.systems.map((s) => (s.id === s0.id ? { ...s, name: 'A renamed' } : s)) };
    const mb: Model = {
      ...m,
      systems: m.systems.map((s) => (s.id === s0.id ? { ...s, owner: 'B owner' } : s.id === s1.id ? { ...s, notes: 'B notes' } : s)),
      topics: [...m.topics, { ...m.topics[0], id: 't-b', name: 'FROM B' }],
    };
    edit(a.root, m, ma);
    edit(b.root, m, mb);
    sync(a.doc, b.doc);
    for (const side of [a, b]) {
      const out = side.json();
      expect(out.systems.find((s) => s.id === s0.id)).toMatchObject({ name: 'A renamed', owner: 'B owner' });
      expect(out.systems.find((s) => s.id === s1.id)?.notes).toBe('B notes');
      expect(out.topics.some((t) => t.id === 't-b')).toBe(true);
    }
    expect(a.json()).toEqual(b.json());
  });

  it('turns nested arrays and objects into Yjs types', () => {
    const doc = new Y.Doc();
    doc.getMap<unknown>('root').set('x', toY({ seq: [['a', 'b']], p: { k: 1 } }));
    const y = doc.getMap<unknown>('root').get('x') as Y.Map<unknown>;
    expect((y.get('seq') as Y.Array<unknown>).get(0)).toBeInstanceOf(Y.Array);
    expect(y.get('seq')).toBeInstanceOf(Y.Array);
    expect(y.get('p')).toBeInstanceOf(Y.Map);
  });
});
