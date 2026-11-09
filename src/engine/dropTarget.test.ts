import { describe, expect, it } from 'vitest';
import { canMoveSystem, moveSystem } from '../model/ops';
import { sampleModel } from '../model/sample';
import { dropTargetAt } from './dropTarget';
import { layoutView } from './layout';
import { computeView } from './view';

const setup = () => {
  const m = sampleModel();
  const vm = computeView(m, { filterSystems: [], filterTopics: [], collapseBy: 'none', sharedOnly: true });
  const l = layoutView(vm);
  const rect = (id: string) => l.nodes.find((n) => n.id === id)!.rect;
  const drop = (id: string, p: { x: number; y: number }) => dropTargetAt(l, vm.roots, id, p, (sid, t) => canMoveSystem(m, sid, t));
  return { m, vm, l, rect, drop };
};

describe('dropping a system on the diagram', () => {
  it('uses the ends of a system for before/after and its middle for upstream, along its border', () => {
    const { rect, drop } = setup();
    const r = rect('n2'); // North border: along x
    const y = r.y + r.h / 2;
    expect(drop('n3', { x: r.x + r.w * 0.1, y })!.target).toEqual({ kind: 'before', refId: 'n2' });
    expect(drop('n3', { x: r.x + r.w * 0.9, y })!.target).toEqual({ kind: 'after', refId: 'n2' });
    expect(drop('n3', { x: r.x + r.w / 2, y })).toMatchObject({ target: { kind: 'inside', refId: 'n2' }, marker: { kind: 'box' } });
    const w = rect('w11'); // West border: along y
    const x = w.x + w.w / 2;
    expect(drop('n3', { x, y: w.y + w.h * 0.1 })!.target).toEqual({ kind: 'before', refId: 'w11' });
    expect(drop('n3', { x, y: w.y + w.h * 0.9 })!.target).toEqual({ kind: 'after', refId: 'w11' });
  });

  it('inserts at the position on the nearest border when dropped over the broker', () => {
    const { l, rect, drop } = setup();
    const n3 = rect('n3');
    const justInside = { x: n3.x + n3.w * 0.8, y: l.centre.y + 5 };
    expect(drop('s1', justInside)!.target).toEqual({ kind: 'after', refId: 'n3' });
    const n1 = rect('n1');
    expect(drop('s1', { x: n1.x + 2, y: l.centre.y + 5 })!.target).toEqual({ kind: 'before', refId: 'n1' });
  });

  it('inserts next to the closest system when dropped in a gap', () => {
    const { rect, drop } = setup();
    const a = rect('n1');
    const b = rect('n2');
    const gap = (a.x + a.w + b.x) / 2;
    const r = drop('s1', { x: gap - 1, y: a.y + a.h / 2 })!;
    expect(r.target).toEqual({ kind: 'after', refId: 'n1' });
    expect(r.marker.kind).toBe('line');
  });

  it('moves into another parent by dropping next to one of its upstream systems', () => {
    const { m, rect, drop } = setup();
    const e = rect('e11');
    const target = drop('n3', { x: e.x + e.w / 2, y: e.y + e.h * 0.9 })!.target;
    expect(target).toEqual({ kind: 'after', refId: 'e11' });
    moveSystem(m, 'n3', target);
    expect(m.systems.find((s) => s.id === 'n3')).toMatchObject({ parentId: 'e1', side: 'E' });
  });

  it('offers an empty border', () => {
    const { m } = setup();
    for (const s of m.systems) if (s.side === 'S') s.side = 'E';
    const vm = computeView(m, { filterSystems: [], filterTopics: [], collapseBy: 'none', sharedOnly: true });
    const l2 = layoutView(vm);
    const r = dropTargetAt(l2, vm.roots, 'n3', { x: l2.centre.x + l2.centre.w / 2, y: l2.centre.y + l2.centre.h + 40 }, (sid, t) => canMoveSystem(m, sid, t));
    expect(r).toMatchObject({ target: { kind: 'side', side: 'S' }, marker: { kind: 'line' } });
  });

  it('makes a system the first leaf of another when dropped where the leaf will appear', () => {
    const { m, rect, drop } = setup();
    // WEST SYS 11 has no leaf yet: its outer side is on the left.
    const w = rect('w11');
    const beyond = { x: w.x - 60, y: w.y + w.h / 2 };
    const d = drop('n3', beyond)!;
    expect(d.target).toEqual({ kind: 'inside', refId: 'w11' });
    expect(d.marker.kind).toBe('box');
    moveSystem(m, 'n3', d.target);
    expect(m.systems.find((s) => s.id === 'n3')).toMatchObject({ parentId: 'w11', side: 'W' });
    // The same on a North system: its outer side is above.
    const n = rect('n1');
    expect(drop('s1', { x: n.x + n.w / 2, y: n.y - 30 })!.target).toEqual({ kind: 'inside', refId: 'n1' });
  });

  it('keeps using the leaves of a system that already has some', () => {
    const { rect, drop } = setup();
    const leaf = rect('e11');
    expect(drop('n3', { x: leaf.x + leaf.w / 2, y: leaf.y + leaf.h * 0.1 })!.target).toEqual({ kind: 'before', refId: 'e11' });
  });

  it('does nothing when a system is dropped back on itself or its own upstream systems', () => {
    const { rect, drop } = setup();
    for (const id of ['e1', 'e11']) {
      const r = rect(id);
      expect(drop('e1', { x: r.x + r.w / 2, y: r.y + r.h / 2 })).toBeNull();
    }
  });
});
