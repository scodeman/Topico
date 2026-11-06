import { descendants, newId, type Model, type Side } from './types';

/**
 * Where a system is dropped in the explorer:
 * - `side`: last position on that border of the broker;
 * - `before` / `after`: next to a sibling (same parent and border as `refId`);
 * - `inside`: as the last upstream node of `refId`.
 */
export type MoveTarget = { kind: 'side'; side: Side } | { kind: 'before' | 'after' | 'inside'; refId: string };

/** Can `id` be dropped on `target`? A system cannot move next to or into itself or its own upstream subtree. */
export function canMoveSystem(m: Model, id: string, target: MoveTarget): boolean {
  if (!m.systems.some((s) => s.id === id)) return false;
  if (target.kind === 'side') return true;
  if (target.refId === id) return false;
  if (!m.systems.some((s) => s.id === target.refId)) return false;
  return !descendants(m, id).includes(target.refId);
}

/**
 * Move a system (with its upstream subtree) to a new border/parent/position.
 * Canvas order along a border follows the order of `m.systems`, so the position in the array is the position on the canvas.
 * Mutates `m` (use inside an Immer producer). Returns false when the move is not allowed.
 */
export function moveSystem(m: Model, id: string, target: MoveTarget): boolean {
  if (!canMoveSystem(m, id, target)) return false;
  const sys = m.systems.find((s) => s.id === id)!;
  const ref = target.kind === 'side' ? undefined : m.systems.find((s) => s.id === target.refId)!;

  let parentId: string | null;
  let side: Side;
  if (target.kind === 'side') {
    parentId = null;
    side = target.side;
  } else if (target.kind === 'inside') {
    parentId = ref!.id;
    side = ref!.side;
  } else {
    parentId = ref!.parentId;
    side = ref!.side;
  }

  sys.parentId = parentId;
  for (const sid of [id, ...descendants(m, id)]) m.systems.find((s) => s.id === sid)!.side = side;

  const from = m.systems.indexOf(sys);
  m.systems.splice(from, 1);
  if (target.kind === 'before' || target.kind === 'after') {
    const at = m.systems.indexOf(ref!) + (target.kind === 'after' ? 1 : 0);
    m.systems.splice(at, 0, sys);
  } else {
    m.systems.push(sys);
  }
  return true;
}

const copyName = (name: string) => `${name} (copy)`;
/** Deep copy that also works on Immer drafts (structuredClone rejects their proxies). */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/**
 * Duplicate a system next to the original, with its produced/consumed topics (and their chain membership).
 * Its upstream systems are not duplicated.
 */
export function duplicateSystem(m: Model, id: string): string | null {
  const src = m.systems.find((s) => s.id === id);
  if (!src) return null;
  const copy = { ...clone(src), id: newId(src.kind === 'etl' ? 'x' : 's'), name: copyName(src.name) };
  m.systems.splice(m.systems.indexOf(src) + 1, 0, copy);
  for (const i of m.interactions.filter((x) => x.systemId === id)) {
    m.interactions.push({ ...clone(i), id: newId('i'), systemId: copy.id });
  }
  return copy.id;
}

/** Duplicate a topic with its properties, bundle and producers/consumers. Endpoints of the copy are not put in any chain. */
export function duplicateTopic(m: Model, id: string): string | null {
  const src = m.topics.find((t) => t.id === id);
  if (!src) return null;
  const copy = { ...clone(src), id: newId('t'), name: copyName(src.name) };
  m.topics.splice(m.topics.indexOf(src) + 1, 0, copy);
  for (const i of m.interactions.filter((x) => x.topicId === id)) {
    m.interactions.push({ ...clone(i), id: newId('i'), topicId: copy.id, chainIds: [] });
  }
  return copy.id;
}

/**
 * Duplicate a bundle or chain (name, colour, description).
 * A chain copy has the same endpoints (an endpoint can be in several chains).
 * A bundle copy is empty: a topic is in at most one bundle.
 */
export function duplicateGroup(m: Model, id: string): string | null {
  const src = m.groups.find((g) => g.id === id);
  if (!src) return null;
  const copy = { ...clone(src), id: newId(src.type === 'bundle' ? 'b' : 'c'), name: copyName(src.name) };
  m.groups.splice(m.groups.indexOf(src) + 1, 0, copy);
  if (src.type === 'chain') for (const i of m.interactions) if (i.chainIds.includes(id)) i.chainIds.push(copy.id);
  return copy.id;
}

/** Natural, case-insensitive order: "TOPIC 2" before "TOPIC 10". */
export const compareNames = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export type SortDir = 'asc' | 'desc';

/** Sort the topic list A–Z (`asc`) or Z–A (`desc`). The result becomes the order the user then drags from. Mutates `m`. */
export function sortTopics(m: Model, dir: SortDir): void {
  m.topics.sort((a, b) => (dir === 'asc' ? 1 : -1) * compareNames(a.name, b.name));
}

/** Is the list currently in A–Z or Z–A order? null when it is in a custom (dragged) order. */
export function topicOrderState(topics: { name: string }[]): SortDir | null {
  const inOrder = (sign: number) => topics.every((t, i) => i === 0 || sign * compareNames(topics[i - 1].name, t.name) <= 0);
  return inOrder(1) ? 'asc' : inOrder(-1) ? 'desc' : null;
}

/** Manual reordering: put topic `id` before or after `refId`. Mutates `m`. */
export function moveTopic(m: Model, id: string, target: { kind: 'before' | 'after'; refId: string }): boolean {
  if (id === target.refId) return false;
  const t = m.topics.find((x) => x.id === id);
  const ref = m.topics.find((x) => x.id === target.refId);
  if (!t || !ref) return false;
  m.topics.splice(m.topics.indexOf(t), 1);
  m.topics.splice(m.topics.indexOf(ref) + (target.kind === 'after' ? 1 : 0), 0, t);
  return true;
}
