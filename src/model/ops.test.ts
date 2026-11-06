import { describe, expect, it } from 'vitest';
import { computeView } from '../engine/view';
import { canMoveSystem, duplicateGroup, duplicateSystem, duplicateTopic, moveSystem } from './ops';
import { sampleModel } from './sample';

const roots = (m: ReturnType<typeof sampleModel>) =>
  computeView(m, { filterSystems: [], filterTopics: [], collapseBy: 'none', sharedOnly: true }).roots;

describe('moveSystem', () => {
  it('reorders systems along a border, and the canvas follows', () => {
    const m = sampleModel();
    expect(roots(m).N).toEqual(['n1', 'n2', 'n3']);
    moveSystem(m, 'n3', { kind: 'before', refId: 'n1' });
    expect(roots(m).N).toEqual(['n3', 'n1', 'n2']);
    moveSystem(m, 'n3', { kind: 'after', refId: 'n2' });
    expect(roots(m).N).toEqual(['n1', 'n2', 'n3']);
  });

  it('moves a system with its upstream subtree to another border', () => {
    const m = sampleModel();
    moveSystem(m, 'e1', { kind: 'side', side: 'S' });
    expect(roots(m).S).toEqual(['s1', 'e1']);
    expect(roots(m).E).toEqual(['e12']);
    for (const id of ['e1', 'e11', 'e12x', 'e13']) expect(m.systems.find((s) => s.id === id)!.side).toBe('S');
  });

  it('moves next to a system on another border, taking its parent and border', () => {
    const m = sampleModel();
    moveSystem(m, 'w11', { kind: 'after', refId: 'e11' });
    const w11 = m.systems.find((s) => s.id === 'w11')!;
    expect(w11.parentId).toBe('e1');
    expect(w11.side).toBe('E');
    expect(m.systems.filter((s) => s.parentId === 'e1').map((s) => s.id)).toEqual(['e11', 'w11', 'e12x', 'e13']);
  });

  it('makes a system upstream of another when dropped inside it', () => {
    const m = sampleModel();
    moveSystem(m, 'n3', { kind: 'inside', refId: 'w11' });
    expect(m.systems.find((s) => s.id === 'n3')).toMatchObject({ parentId: 'w11', side: 'W' });
  });

  it('refuses to move a system into itself or its own subtree', () => {
    const m = sampleModel();
    expect(canMoveSystem(m, 'e1', { kind: 'inside', refId: 'e11' })).toBe(false);
    expect(canMoveSystem(m, 'e1', { kind: 'before', refId: 'e1' })).toBe(false);
    expect(moveSystem(m, 'e1', { kind: 'inside', refId: 'e11' })).toBe(false);
    expect(m.systems.find((s) => s.id === 'e1')!.parentId).toBeNull();
  });
});

describe('duplicate', () => {
  it('duplicates a system next to the original with its interactions', () => {
    const m = sampleModel();
    const id = duplicateSystem(m, 'w11')!;
    expect(roots(m).W).toEqual(['w11', id, 'w2', 'xw1']);
    expect(m.interactions.filter((i) => i.systemId === id)).toHaveLength(m.interactions.filter((i) => i.systemId === 'w11').length);
    expect(m.systems.find((s) => s.id === id)!.name).toBe('WEST SYS 11 (copy)');
  });

  it('duplicates a topic with its producers and consumers, outside any chain', () => {
    const m = sampleModel();
    const id = duplicateTopic(m, 't5')!;
    const copies = m.interactions.filter((i) => i.topicId === id);
    expect(copies.length).toBe(m.interactions.filter((i) => i.topicId === 't5').length);
    expect(copies.every((i) => i.chainIds.length === 0)).toBe(true);
  });

  it('duplicates a chain with its endpoints, and a bundle without members', () => {
    const m = sampleModel();
    const id = duplicateGroup(m, 'c-order')!;
    expect(m.groups.find((g) => g.id === id)).toMatchObject({ type: 'chain', name: 'Order flow (copy)' });
    const members = (c: string) => m.interactions.filter((i) => i.chainIds.includes(c)).map((i) => i.id);
    expect(members(id)).toEqual(members('c-order'));
    const b = duplicateGroup(m, 'b-ref')!;
    expect(m.topics.some((t) => t.bundleId === b)).toBe(false);
  });
});

describe('inside an Immer producer (as the store runs them)', () => {
  it('moves and duplicates on drafts', async () => {
    const { produce } = await import('immer');
    const base = sampleModel();
    const next = produce(base, (d) => {
      moveSystem(d, 'n3', { kind: 'before', refId: 'n1' });
      moveSystem(d, 'e1', { kind: 'side', side: 'S' });
      duplicateSystem(d, 'w11');
      duplicateTopic(d, 't5');
      duplicateGroup(d, 'b-ref');
    });
    expect(roots(next).N).toEqual(['n3', 'n1', 'n2']);
    expect(roots(next).S).toEqual(['s1', 'e1']);
    expect(next.systems).toHaveLength(base.systems.length + 1);
    expect(next.topics).toHaveLength(base.topics.length + 1);
    expect(next.groups).toHaveLength(base.groups.length + 1);
    expect(roots(base).N).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('topic order', () => {
  it('sorts A–Z and Z–A with natural numbers, and reports the current order', async () => {
    const { sortTopics, topicOrderState } = await import('./ops');
    const m = sampleModel();
    m.topics.find((t) => t.id === 't7')!.name = 'alpha feed';
    expect(topicOrderState(m.topics)).toBeNull();
    sortTopics(m, 'asc');
    expect(m.topics.map((t) => t.name)).toEqual([
      'alpha feed', 'TOPIC 1', 'TOPIC 2', 'TOPIC 3', 'TOPIC 4', 'TOPIC 5', 'TOPIC 6', 'TOPIC 8', 'TOPIC 9', 'TOPIC 10',
    ]);
    expect(topicOrderState(m.topics)).toBe('asc');
    sortTopics(m, 'desc');
    expect(m.topics[0].name).toBe('TOPIC 10');
    expect(topicOrderState(m.topics)).toBe('desc');
  });

  it('reorders topics by drag and drop, which leaves the sorted state', async () => {
    const { moveTopic, topicOrderState } = await import('./ops');
    const m = sampleModel();
    expect(topicOrderState(m.topics)).toBe('asc');
    moveTopic(m, 't10', { kind: 'before', refId: 't1' });
    moveTopic(m, 't1', { kind: 'after', refId: 't3' });
    expect(m.topics.map((t) => t.id).slice(0, 5)).toEqual(['t10', 't2', 't3', 't1', 't4']);
    expect(topicOrderState(m.topics)).toBeNull();
    expect(moveTopic(m, 't2', { kind: 'before', refId: 't2' })).toBe(false);
  });
});
