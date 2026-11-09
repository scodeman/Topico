import type { MoveTarget } from '../model/ops';
import type { Side } from '../model/types';
import { K, type Layout, type NodeGeom, type Rect, type Vec } from './layout';

/** Where a system dragged on the diagram would land, and the marker that shows it. */
export interface DiagramDrop {
  target: MoveTarget;
  marker: { kind: 'line'; from: Vec; to: Vec } | { kind: 'box'; rect: Rect };
}

const isHorizontalBorder = (side: Side) => side === 'N' || side === 'S';
const along = (side: Side, p: Vec) => (isHorizontalBorder(side) ? p.x : p.y);
const contains = (r: Rect, p: Vec) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const distance = (r: Rect, p: Vec) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.h));

/** Line in the gap just before or after a system along its border. */
function lineBeside(n: NodeGeom, kind: 'before' | 'after'): DiagramDrop['marker'] {
  const { x, y, w, h } = n.rect;
  const offset = K.SIB_GAP / 2;
  if (isHorizontalBorder(n.side)) {
    const at = kind === 'before' ? x - offset : x + w + offset;
    return { kind: 'line', from: { x: at, y }, to: { x: at, y: y + h } };
  }
  const at = kind === 'before' ? y - offset : y + h + offset;
  return { kind: 'line', from: { x, y: at }, to: { x: x + w, y: at } };
}

/** Where the first leaf of a system would appear: beyond its outer edge, opposite the broker. */
function firstLeafZone(n: NodeGeom): Rect {
  const { x, y, w, h } = n.rect;
  const depth = K.GAP + K.SYS_DEPTH;
  switch (n.side) {
    case 'W':
      return { x: x - depth, y, w: depth, h };
    case 'E':
      return { x: x + w, y, w: depth, h };
    case 'N':
      return { x, y: y - depth, w, h: depth };
    case 'S':
      return { x, y: y + h, w, h: depth };
  }
}

const besides = (n: NodeGeom, kind: 'before' | 'after'): DiagramDrop => ({ target: { kind, refId: n.id }, marker: lineBeside(n, kind) });

/** Border of the broker a point belongs to: the nearest edge inside the broker, the side it is furthest past outside. */
function borderAt(c: Rect, p: Vec): Side {
  const toEdge: [Side, number][] = [
    ['W', p.x - c.x],
    ['E', c.x + c.w - p.x],
    ['N', p.y - c.y],
    ['S', c.y + c.h - p.y],
  ];
  return toEdge.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

function borderLine(c: Rect, side: Side): DiagramDrop['marker'] {
  const x2 = c.x + c.w;
  const y2 = c.y + c.h;
  const ends: Record<Side, [Vec, Vec]> = {
    W: [{ x: c.x, y: c.y }, { x: c.x, y: y2 }],
    E: [{ x: x2, y: c.y }, { x: x2, y: y2 }],
    N: [{ x: c.x, y: c.y }, { x: x2, y: c.y }],
    S: [{ x: c.x, y: y2 }, { x: x2, y: y2 }],
  };
  return { kind: 'line', from: ends[side][0], to: ends[side][1] };
}

/**
 * Where a dragged system would land at point `p`, using the left panel's rules: the two ends of a system mean
 * before/after it, its middle means upstream of it, and so does the empty place beyond the outer edge of a system
 * with no leaf yet. In a gap or over the broker, it goes at that position on the nearest border. Returns null when the system is dropped back on itself or its own upstream systems.
 */
export function dropTargetAt(
  layout: Layout,
  roots: Record<Side, string[]>,
  id: string,
  p: Vec,
  canMove: (id: string, target: MoveTarget) => boolean,
): DiagramDrop | null {
  const eligible = layout.nodes.filter((n) => canMove(id, { kind: 'after', refId: n.id }));

  // Back over itself or its own upstream systems: nothing to do.
  if (layout.nodes.some((n) => !eligible.includes(n) && contains(n.rect, p))) return null;

  const over = eligible.find((n) => contains(n.rect, p));
  if (over) {
    const start = isHorizontalBorder(over.side) ? over.rect.x : over.rect.y;
    const length = isHorizontalBorder(over.side) ? over.rect.w : over.rect.h;
    const f = (along(over.side, p) - start) / length;
    if (f < 0.3) return besides(over, 'before');
    if (f > 0.7) return besides(over, 'after');
    return { target: { kind: 'inside', refId: over.id }, marker: { kind: 'box', rect: over.rect } };
  }

  // A system with no leaf yet offers the place its first leaf will take. Once it has leaves, drop next to them.
  const parent = eligible.find((n) => !n.hasChildren && contains(firstLeafZone(n), p));
  if (parent) return { target: { kind: 'inside', refId: parent.id }, marker: { kind: 'box', rect: firstLeafZone(parent) } };

  const side = borderAt(layout.centre, p);
  const onBorder = roots[side].map((r) => eligible.find((n) => n.id === r)).filter((n): n is NodeGeom => !!n);
  if (!onBorder.length) return { target: { kind: 'side', side }, marker: borderLine(layout.centre, side) };

  // Over the broker: the position along the border under the pointer.
  // Elsewhere: next to the closest system, which may be nested under another parent.
  const ref = contains(layout.centre, p)
    ? onBorder.reduce((a, b) => (Math.abs(mid(b) - along(side, p)) < Math.abs(mid(a) - along(side, p)) ? b : a))
    : eligible.reduce((a, b) => (distance(b.rect, p) < distance(a.rect, p) ? b : a));
  return besides(ref, along(ref.side, p) < mid(ref) ? 'before' : 'after');
}

const mid = (n: NodeGeom) => (isHorizontalBorder(n.side) ? n.rect.x + n.rect.w / 2 : n.rect.y + n.rect.h / 2);
