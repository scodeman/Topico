import type { Interaction, Model } from './types';

/**
 * A link of a chain: one hop of a topic between two endpoints of the chain, from the endpoint that hands
 * the topic on to the endpoint that receives it. This mirrors how arrows are drawn:
 * - `broker`: two systems on the broker, producer -> consumer;
 * - `sibling`: two upstream systems of the same parent, relayed by that parent;
 * - `up`: an upstream system publishing into its parent, which publishes the topic further;
 * - `down`: a parent reading a topic and relaying it to its upstream system.
 */
export interface ChainLink {
  id: string;
  topicId: string;
  from: Interaction;
  to: Interaction;
  kind: 'broker' | 'sibling' | 'up' | 'down';
}

export const linkId = (from: Interaction, to: Interaction) => `${from.id}>${to.id}`;

export function chainLinks(model: Model, chainId: string): ChainLink[] {
  const parent = new Map(model.systems.map((s) => [s.id, s.parentId && model.systems.some((p) => p.id === s.parentId) ? s.parentId : null]));
  const eps = model.interactions.filter((i) => i.chainIds.includes(chainId) && parent.has(i.systemId));
  const topicIndex = new Map(model.topics.map((t, i) => [t.id, i]));
  const systemIndex = new Map(model.systems.map((s, i) => [s.id, i]));
  const links: ChainLink[] = [];
  for (const a of eps) {
    for (const b of eps) {
      if (a === b || a.topicId !== b.topicId || a.systemId === b.systemId) continue;
      const pa = parent.get(a.systemId)!;
      const pb = parent.get(b.systemId)!;
      let kind: ChainLink['kind'] | null = null;
      if (pa === pb && a.direction === 'produce' && b.direction === 'consume') kind = pa ? 'sibling' : 'broker';
      else if (pa === b.systemId && a.direction === 'produce' && b.direction === 'produce') kind = 'up';
      else if (pb === a.systemId && a.direction === 'consume' && b.direction === 'consume') kind = 'down';
      if (kind) links.push({ id: linkId(a, b), topicId: a.topicId, from: a, to: b, kind });
    }
  }
  return links.sort(
    (x, y) =>
      topicIndex.get(x.topicId)! - topicIndex.get(y.topicId)! ||
      systemIndex.get(x.from.systemId)! - systemIndex.get(y.from.systemId)! ||
      systemIndex.get(x.to.systemId)! - systemIndex.get(y.to.systemId)!,
  );
}

/** "NORTH SYS 1 → ETL W1 · TOPIC 5" */
export function linkLabel(model: Model, l: ChainLink): string {
  const name = (id: string) => model.systems.find((s) => s.id === id)?.name ?? id;
  return `${name(l.from.systemId)} → ${name(l.to.systemId)} · ${model.topics.find((t) => t.id === l.topicId)?.name ?? l.topicId}`;
}

/** The chain's sequence without links that no longer exist, and without empty steps. */
export function chainSequence(model: Model, chainId: string): string[][] {
  const g = model.groups.find((x) => x.id === chainId);
  if (!g) return [];
  const valid = new Set(chainLinks(model, chainId).map((l) => l.id));
  return g.sequence.map((step) => step.filter((id) => valid.has(id))).filter((step) => step.length > 0);
}

/**
 * Proposed sequence following the flow: a link comes one step after the links that bring data to the system
 * it starts from. Links with no such predecessor start at step 1.
 */
export function autoSequence(model: Model, chainId: string): string[][] {
  const links = chainLinks(model, chainId);
  const level = new Map<string, number>();
  const visiting = new Set<string>();
  const levelOf = (l: ChainLink): number => {
    if (level.has(l.id)) return level.get(l.id)!;
    if (visiting.has(l.id)) return 1; // cycle: break it
    visiting.add(l.id);
    const before = links.filter((p) => p.to.systemId === l.from.systemId && p.id !== l.id);
    const v = before.length ? 1 + Math.max(...before.map(levelOf)) : 1;
    visiting.delete(l.id);
    level.set(l.id, v);
    return v;
  };
  const steps: string[][] = [];
  for (const l of links) {
    const v = levelOf(l);
    (steps[v - 1] ??= []).push(l.id);
  }
  return steps.filter(Boolean);
}

/** Step numbers (1-based) of each link in a sequence. */
export function stepsByLink(sequence: string[][]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  sequence.forEach((step, i) => step.forEach((id) => m.set(id, [...(m.get(id) ?? []), i + 1])));
  return m;
}
