import { describe, expect, it } from 'vitest';
import { toChainDrawio, toDrawio, toSvg } from '../export/exporters';
import { sampleModel } from '../model/sample';
import { computeAnimation, stepState } from './animation';
import { computeChainLayout } from './chainView';
import { layoutView } from './layout';
import { computeView } from './view';

const setup = (step = 1) => {
  const m = sampleModel();
  const vm = computeView(m, { filterSystems: [], filterTopics: [], collapseBy: 'none', sharedOnly: true });
  return { m, vm, anim: computeAnimation(m, vm, 'c-billing', step)! };
};

describe('chain animation', () => {
  it('maps each step onto the diagram arrows', () => {
    const { vm, anim } = setup();
    const stepOf = (from: string, to: string) => anim.edgeSteps.get(vm.edges.find((e) => e.from.nodeId === from && e.to.nodeId === to && e.topicIds.length)!.id);
    expect(anim.count).toBe(3);
    expect(stepOf('n21', 'n2')).toEqual([1]); // ETL N2.1 -> NORTH SYS 2 (relay)
    expect(stepOf('s1', 'e12')).toEqual([1]);
    expect(stepOf('n2', 'e1')).toEqual([2]);
    expect(stepOf('e1', 'e11')).toEqual([3]);
    expect(anim.stepLabels[1]).toEqual(['NORTH SYS 2 → EAST SYS 1 · TOPIC 8']);
  });

  it('maps each step onto the tube view arrows (one per endpoint)', () => {
    const { anim } = setup();
    expect(anim.arrowSteps.get('i-n21-p-8')).toEqual([1]); // relay: the upstream system's arrow
    expect(anim.arrowSteps.get('i-n2-p-8')).toEqual([2]); // through the broker: both endpoints' arrows
    expect(anim.arrowSteps.get('i-e1-c-8')).toEqual([2]);
    expect(anim.arrowSteps.get('i-e11-c-8')).toEqual([3]);
  });

  it('lights earlier steps, highlights the current one and fades the rest', () => {
    expect(stepState([2], 2)).toBe('active');
    expect(stepState([1], 2)).toBe('done');
    expect(stepState([3], 2)).toBe('pending');
    expect(stepState(undefined, 2)).toBe('off');
    expect(stepState([1, 3], 3)).toBe('active');
  });

  it('keeps the step within the sequence', () => {
    expect(setup(9).anim.current).toBe(3);
    expect(setup(0).anim.current).toBe(1);
  });

  it('exports one draw.io page per step plus an overview, with flow animation on the current step', () => {
    const { m, vm, anim } = setup();
    const xml = toDrawio(layoutView(vm), vm, m.groups, {
      showStubs: false,
      title: 'x',
      anim: { chainName: anim.chainName, color: anim.color, count: anim.count, stepLabels: anim.stepLabels, steps: anim.edgeSteps },
    });
    expect(xml.match(/<diagram /g)).toHaveLength(4);
    expect(xml).toContain('name="Billing — sequence"');
    expect(xml).toContain('name="Billing — step 3"');
    expect(xml.match(/flowAnimation=1/g)!.length).toBeGreaterThanOrEqual(4); // 2 + 1 + 1 current arrows over the 3 steps
    const tube = toChainDrawio(computeChainLayout(m, 'c-billing')!, {
      anim: { chainName: anim.chainName, color: anim.color, count: anim.count, stepLabels: anim.stepLabels, steps: anim.arrowSteps },
    });
    expect(tube.match(/<diagram /g)).toHaveLength(4);
    expect(tube).toContain('flowAnimation=1');
  });

  it('exports a single page without animation, and an animated SVG of the current step', () => {
    const { m, vm, anim } = setup(2);
    const l = layoutView(vm);
    expect(toDrawio(l, vm, m.groups, { showStubs: false, title: 'x' }).match(/<diagram /g)).toHaveLength(1);
    const svg = toSvg(l, vm, m.groups, false, { edgeSteps: anim.edgeSteps, current: anim.current, color: anim.color });
    expect(svg).toContain('stroke-dashoffset');
  });
});
