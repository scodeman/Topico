import { chainLinks, chainSequence, linkLabel, stepsByLink } from '../model/chainLinks';
import type { Model } from '../model/types';
import type { ViewModel } from './view';

/** What the canvas and the exports need to play a chain's sequence. */
export interface ChainAnimation {
  chainId: string;
  chainName: string;
  color: string;
  /** Number of steps. */
  count: number;
  /** Current step, 1-based. */
  current: number;
  /** Link labels of each step ("NORTH SYS 1 → ETL W1 · TOPIC 5"). */
  stepLabels: string[][];
  /** Main diagram: steps of each arrow (ViewEdge id). */
  edgeSteps: Map<string, number[]>;
  /** Chain (tube) view: steps of each arrow (interaction id). */
  arrowSteps: Map<string, number[]>;
}

const merge = (m: Map<string, number[]>, id: string, steps: number[]) => {
  const cur = m.get(id) ?? [];
  m.set(id, [...new Set([...cur, ...steps])].sort((a, b) => a - b));
};

export function computeAnimation(model: Model, vm: ViewModel, chainId: string, step: number): ChainAnimation | null {
  const chain = model.groups.find((g) => g.id === chainId && g.type === 'chain');
  if (!chain) return null;
  const sequence = chainSequence(model, chainId);
  const links = new Map(chainLinks(model, chainId).map((l) => [l.id, l]));
  const byLink = stepsByLink(sequence);
  const edgeSteps = new Map<string, number[]>();
  const arrowSteps = new Map<string, number[]>();
  for (const [id, steps] of byLink) {
    const l = links.get(id)!;
    // Main diagram: the arrow between the two systems carrying the link's topic.
    for (const e of vm.edges) {
      if (e.from.nodeId === l.from.systemId && e.to.nodeId === l.to.systemId && e.topicIds.includes(l.topicId)) merge(edgeSteps, e.id, steps);
    }
    // Tube view: one arrow per endpoint. A hop through the broker uses both endpoints' arrows;
    // a relay with a parent is drawn by the upstream system's arrow only.
    const arrows = l.kind === 'up' ? [l.from.id] : l.kind === 'down' ? [l.to.id] : [l.from.id, l.to.id];
    for (const a of arrows) merge(arrowSteps, a, steps);
  }
  return {
    chainId,
    chainName: chain.name,
    color: chain.hidden ? '#64748b' : chain.color,
    count: sequence.length,
    current: Math.min(Math.max(1, step), Math.max(1, sequence.length)),
    stepLabels: sequence.map((s) => s.map((id) => linkLabel(model, links.get(id)!))),
    edgeSteps,
    arrowSteps,
  };
}

export type StepState = 'active' | 'done' | 'pending' | 'off';

/** How an arrow looks at the current step. */
export function stepState(steps: number[] | undefined, current: number): StepState {
  if (!steps?.length) return 'off';
  if (steps.includes(current)) return 'active';
  return steps[0] < current ? 'done' : 'pending';
}
