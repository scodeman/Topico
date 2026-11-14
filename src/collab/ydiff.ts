import * as Y from 'yjs';

/* Mirror of the diagram (plain JSON) in a Yjs document: objects become Y.Map, arrays Y.Array, the rest stays as is.
   Local edits are written as the smallest Yjs change between the previous and the new diagram, so that edits made at
   the same time by different people merge: two people changing two systems, or two fields of one system, keep both.

   The diagram is updated immutably (immer): unchanged parts keep their identity, so comparing with === skips them. */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function toY(v: unknown): unknown {
  if (Array.isArray(v)) {
    const a = new Y.Array<unknown>();
    a.push(v.map(toY));
    return a;
  }
  if (isObj(v)) {
    const m = new Y.Map<unknown>();
    for (const [k, x] of Object.entries(v)) if (x !== undefined) m.set(k, toY(x));
    return m;
  }
  return v ?? null;
}

/** Writes into `y` (which mirrors `prev`) what changed to get `next`. */
export function applyDiff(y: Y.Map<unknown>, prev: Record<string, unknown>, next: Record<string, unknown>): void {
  for (const k of Object.keys(prev)) if (!(k in next) || next[k] === undefined) y.delete(k);
  for (const [k, n] of Object.entries(next)) {
    if (n === undefined) continue;
    const p = prev[k];
    if (p === n && y.has(k)) continue;
    const cur = y.get(k);
    if (isObj(p) && isObj(n) && cur instanceof Y.Map) applyDiff(cur, p, n);
    else if (Array.isArray(p) && Array.isArray(n) && cur instanceof Y.Array) diffArray(cur, p, n);
    else if (!sameValue(p, n) || !y.has(k)) y.set(k, toY(n));
  }
}

const idOf = (v: unknown) => (isObj(v) && typeof v.id === 'string' ? v.id : undefined);
/** Same item: the same object, the same simple value, or the same entity (same id). */
const sameItem = (a: unknown, b: unknown) => a === b || (idOf(a) !== undefined && idOf(a) === idOf(b)) || sameValue(a, b);
const sameValue = (a: unknown, b: unknown) => a === b || (typeof a !== 'object' && typeof b !== 'object' && Object.is(a, b));

/** Arrays: keep the common start and end, update matching items in place, replace the rest (a move is a delete + insert). */
function diffArray(y: Y.Array<unknown>, prev: unknown[], next: unknown[]): void {
  if (y.length !== prev.length) {
    // The mirror is out of step (should not happen): rewrite the whole array.
    y.delete(0, y.length);
    y.push(next.map(toY));
    return;
  }
  let start = 0;
  while (start < prev.length && start < next.length && sameItem(prev[start], next[start])) start++;
  let endP = prev.length;
  let endN = next.length;
  while (endP > start && endN > start && sameItem(prev[endP - 1], next[endN - 1])) {
    endP--;
    endN--;
  }
  // Items matched at both ends but changed inside (same id, new content): update them in place.
  const update = (i: number, p: unknown, n: unknown) => {
    if (p === n) return;
    const cur = y.get(i);
    if (isObj(p) && isObj(n) && cur instanceof Y.Map) applyDiff(cur, p, n);
    else if (Array.isArray(p) && Array.isArray(n) && cur instanceof Y.Array) diffArray(cur, p, n);
    else if (!sameValue(p, n)) {
      y.delete(i, 1);
      y.insert(i, [toY(n)]);
    }
  };
  for (let i = 0; i < start; i++) update(i, prev[i], next[i]);
  for (let i = 0; i < prev.length - endP; i++) update(endP + i, prev[endP + i], next[endN + i]);
  // The middle: same length and same entities in the same order → update each; otherwise replace the range.
  const midP = prev.slice(start, endP);
  const midN = next.slice(start, endN);
  if (midP.length === midN.length && midP.every((p, i) => idOf(p) !== undefined ? idOf(p) === idOf(midN[i]) : isObj(p) && isObj(midN[i]))) {
    midP.forEach((p, i) => update(start + i, p, midN[i]));
    return;
  }
  if (midP.length) y.delete(start, midP.length);
  if (midN.length) y.insert(start, midN.map(toY));
}
