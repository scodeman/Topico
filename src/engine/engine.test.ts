import { describe, expect, it } from 'vitest';
import { sampleModel } from '../model/sample';
import { computeView, groupTopicId, type ViewOptions } from './view';
import { normalizeModel } from '../model/types';
import { layoutView, type Rect } from './layout';

const base: ViewOptions = { filterSystems: [], filterTopics: [], collapseBy: 'none', sharedOnly: true };
const view = (o: Partial<ViewOptions> = {}) => computeView(sampleModel(), { ...base, ...o });
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('computeView', () => {
  it('shows everything when unfiltered (CENTRE.png)', () => {
    const vm = view();
    expect(Object.keys(vm.nodes)).toHaveLength(15);
    expect(vm.filtered).toBe(false);
    expect(vm.stubs).toHaveLength(0);
  });

  it('selecting the centre shows everything', () => {
    expect(Object.keys(view({ filterSystems: ['centre', 'n1'] }).nodes)).toHaveLength(15);
  });

  it('single system shows its topics, its exe partners and stubs (SINGLE_SYS.png)', () => {
    const vm = view({ filterSystems: ['n1'] });
    expect(Object.keys(vm.nodes).sort()).toEqual(['n1', 'xw1']);
    expect(vm.nodes.n1.tabs.map((t) => t.topicId).sort()).toEqual(['t1', 't10', 't2', 't3', 't4', 't5', 't6', 't7']);
    expect(vm.edges.some((e) => e.from.nodeId === 'n1' && e.to.nodeId === 'xw1' && e.topicIds.includes('t5'))).toBe(true);
    expect(vm.stubs.length).toBeGreaterThan(0);
  });

  it('multiple systems keep only the shared topics (MULTI_SYS.png)', () => {
    const vm = view({ filterSystems: ['w11', 'n1'] });
    expect(vm.nodes.n1.tabs.map((t) => t.topicId).sort()).toEqual(['t1', 't2', 't3', 't4']);
    expect(vm.nodes.w11.tabs.map((t) => t.topicId).sort()).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('topic selection shows only the systems relaying it (TOPICS.png)', () => {
    const vm = view({ filterTopics: ['t3'] });
    expect(Object.keys(vm.nodes).sort()).toEqual(['e12', 'n1', 's1', 'w11']);
    expect(vm.edges).toHaveLength(3);
  });

  it('includes upstream leaves and relays through the parent', () => {
    const vm = view({ filterTopics: ['t8'] });
    expect(vm.nodes.e11).toBeDefined();
    expect(vm.edges.some((e) => e.container === 'e1' && e.from.nodeId === 'e1' && e.to.nodeId === 'e11')).toBe(true);
    expect(vm.edges.some((e) => e.container === 'n2' && e.from.nodeId === 'n21' && e.to.nodeId === 'n2')).toBe(true);
  });

  it('hides systems with their subtree, topics and interactions', () => {
    const m = sampleModel();
    m.systems.find((s) => s.id === 'e1')!.hidden = true;
    m.topics.find((t) => t.id === 't9')!.hidden = true;
    m.interactions.find((i) => i.id === 'i-s1-c-1')!.hidden = true;
    const vm = computeView(m, base);
    expect(vm.nodes.e1).toBeUndefined();
    expect(vm.nodes.e11).toBeUndefined();
    expect(vm.topics.t9).toBeUndefined();
    expect(vm.nodes.s1.tabs.some((t) => t.topicId === 't1')).toBe(false);
  });

  it('collapses bundles into a single tab', () => {
    const vm = view({ collapseBy: 'bundle' });
    const id = groupTopicId('b-ref');
    expect(vm.topics[id].sourceIds).toHaveLength(4);
    expect(vm.nodes.w11.tabs.map((t) => t.topicId)).toEqual([id]);
    expect(vm.nodes.w11.tabs[0].role).toBe('both');
  });
});

describe('functional chains (endpoint membership)', () => {
  const order = groupTopicId('c-order');

  it('colours only the arrows whose two endpoints are in the chain', () => {
    const vm = view();
    const t5 = vm.edges.filter((e) => e.topicIds.includes('t5'));
    expect(t5.find((e) => e.to.nodeId === 'xw1')!.chainIds).toEqual(['c-order']);
    expect(t5.find((e) => e.to.nodeId === 's1')!.chainIds).toEqual([]);
  });

  it('lets an endpoint take part in several chains', () => {
    // SOUTH SYS 1 publishing TOPIC 9 is in Billing (towards EAST SYS 12) and Settlement (towards EAST SYS 1).
    const vm = view();
    const t9 = (to: string) => vm.edges.find((e) => e.topicIds.includes('t9') && e.from.nodeId === 's1' && e.to.nodeId === to)!;
    expect(t9('e12').chainIds).toEqual(['c-billing']);
    expect(t9('e1').chainIds).toEqual(['c-settle']);
    expect(vm.nodes.s1.tabs.find((t) => t.topicId === 't9')!.chainIds.sort()).toEqual(['c-billing', 'c-settle']);
  });

  it('colours an arrow with every chain shared by both ends', () => {
    const m = sampleModel();
    m.interactions.find((i) => i.id === 'i-e12-c-9')!.chainIds.push('c-settle');
    const vm = computeView(m, base);
    const e = vm.edges.find((x) => x.topicIds.includes('t9') && x.to.nodeId === 'e12')!;
    expect(e.chainIds.sort()).toEqual(['c-billing', 'c-settle']);
  });

  it('focusing one chain keeps only that chain, even for a shared endpoint', () => {
    const vm = view({ filterTopics: [groupTopicId('c-settle')] });
    expect(Object.keys(vm.nodes).sort()).toEqual(['e1', 's1']);
  });

  it('collapsing by chain shows a shared endpoint in each of its chain tabs', () => {
    const vm = view({ collapseBy: 'chain' });
    const billing = groupTopicId('c-billing');
    const settle = groupTopicId('c-settle');
    expect(vm.nodes.s1.tabs.map((t) => t.topicId)).toEqual(expect.arrayContaining([billing, settle]));
    const fromS1 = vm.edges.filter((e) => e.from.nodeId === 's1' && e.from.tabId.startsWith('grp:c-'));
    expect(fromS1.map((e) => `${e.from.tabId}>${e.to.nodeId}:${e.to.tabId}`).sort()).toEqual(
      [`${billing}>e12:${billing}`, `${settle}>e1:${settle}`].sort(),
    );
  });

  it('focusing a chain shows only its endpoints, not every endpoint of its topics', () => {
    const vm = view({ filterTopics: [order] });
    expect(Object.keys(vm.nodes).sort()).toEqual(['n1', 'w2', 'xw1']);
    expect(vm.nodes.w2.tabs.map((t) => t.topicId)).toEqual(['t10']);
    // TOPIC 5 / TOPIC 10 also flow to systems outside the chain: shown as stubs.
    expect(vm.stubs.length).toBeGreaterThan(0);
  });

  it('collapsing by chain merges only chain endpoints and keeps other flows connected', () => {
    const vm = view({ collapseBy: 'chain' });
    expect(vm.nodes.xw1.tabs.map((t) => t.topicId)).toEqual([order]);
    // NORTH SYS 1 has TOPIC 5 in the chain but TOPIC 6 outside it.
    const n1 = vm.nodes.n1.tabs.map((t) => t.topicId);
    expect(n1).toContain(order);
    expect(n1).toContain('t6');
    // SOUTH SYS 1 consumes TOPIC 5 outside the chain: its plain tab is fed by NORTH SYS 1's chain tab.
    expect(vm.edges.some((e) => e.from.nodeId === 'n1' && e.from.tabId === order && e.to.nodeId === 's1' && e.to.tabId === 't5')).toBe(true);
  });

  it('migrates single-chain endpoints (v0.2–0.5) to a chain list', () => {
    const m = normalizeModel({ interactions: [{ id: 'i1', systemId: 's', topicId: 't', direction: 'produce', chainId: 'c' }, { id: 'i2', systemId: 's', topicId: 't', direction: 'consume', chainId: null }] });
    expect(m.interactions.map((i) => i.chainIds)).toEqual([['c'], []]);
    expect('chainId' in m.interactions[0]).toBe(false);
  });

  it('migrates topic-level chains from older files onto every endpoint of the topic', () => {
    const m = normalizeModel({
      topics: [{ id: 't', name: 'T', chainId: 'c' }],
      interactions: [{ id: 'i1', systemId: 's', topicId: 't', direction: 'produce' }],
      groups: [{ id: 'c', name: 'C', type: 'chain' }],
    });
    expect(m.interactions[0].chainIds).toEqual(['c']);
    expect('chainId' in m.topics[0]).toBe(false);
  });
});

describe('layoutView', () => {
  const scenarios: Partial<ViewOptions>[] = [
    {},
    { filterSystems: ['n1'] },
    { filterSystems: ['w11', 'n1'] },
    { filterTopics: ['t3'] },
    { collapseBy: 'chain' },
    { collapseBy: 'bundle' },
    { filterTopics: [groupTopicId('c-billing')] },
  ];
  it.each(scenarios)('produces no overlapping system boxes for %j', (o) => {
    const l = layoutView(view(o));
    const boxes = [l.centre, ...l.nodes.map((n) => n.rect)];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${i} vs ${j}`).toBe(false);
    const tabs = l.nodes.flatMap((n) => n.tabs.map((t) => t.rect));
    for (let i = 0; i < tabs.length; i++)
      for (let j = i + 1; j < tabs.length; j++) expect(overlaps(tabs[i], tabs[j])).toBe(false);
  });

  it('shrinks when filtered', () => {
    const all = layoutView(view()).bounds;
    const one = layoutView(view({ filterTopics: ['t3'] })).bounds;
    expect(one.w * one.h).toBeLessThan(all.w * all.h);
  });
});
