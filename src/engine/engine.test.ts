import { describe, expect, it } from 'vitest';
import { sampleModel } from '../model/sample';
import { computeView, groupTopicId, type ViewOptions } from './view';
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
    expect(vm.edges.some((e) => e.from.nodeId === 'n1' && e.to.nodeId === 'xw1' && e.topicId === 't5')).toBe(true);
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

describe('layoutView', () => {
  const scenarios: Partial<ViewOptions>[] = [
    {},
    { filterSystems: ['n1'] },
    { filterSystems: ['w11', 'n1'] },
    { filterTopics: ['t3'] },
    { collapseBy: 'chain' },
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
