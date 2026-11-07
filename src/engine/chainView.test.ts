import { describe, expect, it } from 'vitest';
import { sampleModel } from '../model/sample';
import { computeChainLayout, type ChainLayout } from './chainView';
import type { Rect } from './layout';

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (p: { x: number; y: number }, q: Rect) => p.x >= q.x - 0.5 && p.x <= q.x + q.w + 0.5 && p.y >= q.y - 0.5 && p.y <= q.y + q.h + 0.5;
const layout = (id: string) => computeChainLayout(sampleModel(), id)!;

function checkGeometry(l: ChainLayout) {
  const boxes = [l.tube, ...l.nodes.map((n) => n.rect)];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
  for (let i = 0; i < l.bars.length; i++) {
    expect(inside({ x: l.bars[i].rect.x, y: l.bars[i].rect.y }, l.tube)).toBe(true);
    for (let j = i + 1; j < l.bars.length; j++) expect(overlaps(l.bars[i].rect, l.bars[j].rect)).toBe(false);
  }
  // Every arrow end touches the box or bar it belongs to.
  const rectOf = (e: { kind: string; id: string }) =>
    e.kind === 'bar' ? l.bars.find((b) => b.topicId === e.id)!.rect : l.nodes.find((n) => n.id === e.id)!.rect;
  for (const a of l.arrows) {
    expect(inside(a.from.at, rectOf(a.from)), `${a.id} from`).toBe(true);
    expect(inside(a.to.at, rectOf(a.to)), `${a.id} to`).toBe(true);
  }
}

describe('computeChainLayout', () => {
  it('draws only the chain endpoints around the tube (Order flow)', () => {
    const l = layout('c-order');
    expect(l.nodes.map((n) => n.id).sort()).toEqual(['n1', 'w2', 'xw1']);
    expect(l.bars.map((b) => b.topicId)).toEqual(['t5', 't10']);
    expect(l.arrows).toHaveLength(4);
    // NORTH SYS 1 produces TOPIC 5: the arrow goes down from the box into the bar.
    const a = l.arrows.find((x) => x.interactionId === 'i-n1-p-5')!;
    expect(a.from).toMatchObject({ kind: 'node', id: 'n1' });
    expect(a.to).toMatchObject({ kind: 'bar', id: 't5' });
    expect(a.to.at.y).toBeGreaterThan(a.from.at.y);
    checkGeometry(l);
  });

  it('places systems on their border and connects West systems to the bar start', () => {
    const l = layout('c-order');
    const n1 = l.nodes.find((n) => n.id === 'n1')!.rect;
    const w2 = l.nodes.find((n) => n.id === 'w2')!.rect;
    expect(n1.y + n1.h).toBeLessThan(l.tube.y);
    expect(w2.x + w2.w).toBeLessThan(l.tube.x);
    const t10 = l.bars.find((b) => b.topicId === 't10')!;
    const toW2 = l.arrows.find((x) => x.interactionId === 'i-w2-c-10')!;
    expect(toW2.from.at.x).toBeCloseTo(t10.rect.x);
  });

  it('stacks upstream systems outside their parent with labelled relays (Billing)', () => {
    const l = layout('c-billing');
    expect(l.nodes.map((n) => n.id).sort()).toEqual(['e1', 'e11', 'e12', 'n2', 'n21', 's1']);
    const relay = l.arrows.find((x) => x.interactionId === 'i-n21-p-8')!;
    expect(relay).toMatchObject({ from: { kind: 'node', id: 'n21' }, to: { kind: 'node', id: 'n2' } });
    expect(relay.label?.text).toBe('TOPIC 8');
    const n21 = l.nodes.find((n) => n.id === 'n21')!.rect;
    const n2 = l.nodes.find((n) => n.id === 'n2')!.rect;
    expect(n21.y + n21.h).toBeLessThan(n2.y);
    checkGeometry(l);
  });

  it('respects hidden elements and reports an empty chain', () => {
    const m = sampleModel();
    m.systems.find((s) => s.id === 'e1')!.hidden = true;
    const l = computeChainLayout(m, 'c-settle')!;
    expect(l.nodes.map((n) => n.id)).toEqual(['s1']);
    m.groups.push({ id: 'c-none', name: 'Empty', type: 'chain', color: '#000', description: '', hidden: false, sequence: [] });
    expect(computeChainLayout(m, 'c-none')!.empty).toBe(true);
    expect(computeChainLayout(m, 'b-ref')).toBeNull();
  });
});
