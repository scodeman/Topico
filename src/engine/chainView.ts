import { descendants, effectiveSide, type Interaction, type Model, type NodeKind, type Side } from '../model/types';
import type { Rect, Vec } from './layout';

/**
 * "Broker tube" view of one chain (see docs/spec/images/CHAIN.png):
 * the broker is drawn as a horizontal tube, each topic of the chain is a bar inside it,
 * and the systems taking part in the chain sit around the tube on their border
 * (North above, South below, West left, East right), with upstream systems stacked outside their parent.
 * Only endpoints that belong to the chain are drawn.
 */

export const CK = {
  PORT_NS: 40, // spacing of arrows along a North/South box
  PORT_WE: 24, // spacing of arrows along a West/East box
  PAD: 20,
  MIN_NS: 150, // min width of a North/South box
  MIN_WE: 80, // min height of a West/East box
  DEPTH_NS: 80, // height of a North/South box
  DEPTH_WE: 150, // width of a West/East box
  ETL_DEPTH: 56,
  GAP: 64, // between the tube and the first row of systems, and between a system and its upstream nodes
  SIB: 28,
  TUBE_PAD_X: 60,
  TUBE_PAD_Y: 26,
  LANE: 30,
  BAR_H: 16,
  BAR_INSET: 24,
  BAR_MIN: 130,
  TUBE_MIN_W: 420,
  TUBE_MIN_H: 110,
  MARGIN: 40,
  TITLE_H: 30,
};

export interface ChainNode {
  id: string;
  name: string;
  kind: NodeKind;
  side: Side;
  rect: Rect;
}

export interface ChainBar {
  topicId: string;
  name: string;
  rect: Rect;
}

export type ChainEnd = { kind: 'node' | 'bar'; id: string; at: Vec };

export interface ChainArrow {
  id: string;
  interactionId: string;
  topicId: string;
  /** SVG path. */
  d: string;
  /** Polyline / bezier control points, first and last are the ends. */
  points: Vec[];
  curved: boolean;
  from: ChainEnd;
  to: ChainEnd;
  /** Topic label drawn on relays between a system and its upstream node. */
  label?: { text: string; at: Vec; horizontal: boolean };
}

export interface ChainLayout {
  chainId: string;
  chainName: string;
  color: string;
  title: string;
  tube: Rect;
  nodes: ChainNode[];
  bars: ChainBar[];
  arrows: ChainArrow[];
  bounds: Rect;
  empty: boolean;
}

const OUT: Record<Side, { axis: 'x' | 'y'; sign: 1 | -1 }> = {
  W: { axis: 'x', sign: -1 },
  E: { axis: 'x', sign: 1 },
  N: { axis: 'y', sign: -1 },
  S: { axis: 'y', sign: 1 },
};
const r = (v: number) => Math.round(v * 10) / 10;

export function computeChainLayout(model: Model, chainId: string): ChainLayout | null {
  const chain = model.groups.find((g) => g.id === chainId && g.type === 'chain');
  if (!chain) return null;

  // 1. Endpoints of the chain that are not hidden.
  const hiddenSystems = new Set<string>();
  for (const s of model.systems) if (s.hidden) [s.id, ...descendants(model, s.id)].forEach((id) => hiddenSystems.add(id));
  const topicById = new Map(model.topics.map((t) => [t.id, t]));
  const endpoints = model.interactions.filter(
    (i) =>
      i.chainIds.includes(chainId) &&
      !i.hidden &&
      !hiddenSystems.has(i.systemId) &&
      topicById.has(i.topicId) &&
      !topicById.get(i.topicId)!.hidden &&
      model.systems.some((s) => s.id === i.systemId),
  );

  // 2. Systems involved, with their ancestors so upstream nodes stay attached.
  const byId = new Map(model.systems.map((s) => [s.id, s]));
  const shown = new Set<string>();
  for (const i of endpoints) {
    let cur: string | null = i.systemId;
    while (cur && byId.has(cur) && !shown.has(cur)) {
      shown.add(cur);
      cur = byId.get(cur)!.parentId;
    }
  }
  const parentOf = (id: string) => {
    const p = byId.get(id)!.parentId;
    return p && shown.has(p) ? p : null;
  };
  const ordered = model.systems.filter((s) => shown.has(s.id));
  const children = new Map<string, string[]>();
  for (const s of ordered) {
    const p = parentOf(s.id);
    if (p) children.set(p, [...(children.get(p) ?? []), s.id]);
  }
  const sideOf = new Map(ordered.map((s) => [s.id, effectiveSide(model, s.id)]));
  const roots: Record<Side, string[]> = { W: [], N: [], E: [], S: [] };
  for (const s of ordered) if (!parentOf(s.id)) roots[sideOf.get(s.id)!].push(s.id);

  // Ports: one arrow per endpoint, ordered by topic then produce-before-consume.
  const topicIndex = new Map(model.topics.map((t, i) => [t.id, i]));
  const ports = new Map<string, Interaction[]>();
  for (const s of ordered) {
    const own = endpoints.filter((i) => i.systemId === s.id);
    own.sort((a, b) => topicIndex.get(a.topicId)! - topicIndex.get(b.topicId)! || (a.direction === 'produce' ? -1 : 1));
    ports.set(s.id, own);
  }

  // 3. Measure subtrees.
  const isNS = (side: Side) => side === 'N' || side === 'S';
  const span = new Map<string, number>();
  const childSpan = new Map<string, number>();
  const measure = (id: string): number => {
    const side = sideOf.get(id)!;
    const kids = children.get(id) ?? [];
    const cs = kids.reduce((a, k) => a + measure(k), 0) + Math.max(0, kids.length - 1) * CK.SIB;
    const n = ports.get(id)!.length;
    const ps = isNS(side) ? n * CK.PORT_NS + 2 * CK.PAD : n * CK.PORT_WE + 2 * CK.PAD;
    const v = Math.max(isNS(side) ? CK.MIN_NS : CK.MIN_WE, ps, cs);
    span.set(id, v);
    childSpan.set(id, cs);
    return v;
  };
  ordered.forEach((s) => span.has(s.id) || measure(s.id));
  const depthOf = (id: string) => {
    const side = sideOf.get(id)!;
    if (byId.get(id)!.kind === 'etl') return CK.ETL_DEPTH;
    return isNS(side) ? CK.DEPTH_NS : CK.DEPTH_WE;
  };
  const rowSpan = (side: Side) => roots[side].reduce((a, id) => a + span.get(id)!, 0) + Math.max(0, roots[side].length - 1) * CK.SIB;

  // 4. Horizontal positions first: they decide where topic bars start and end.
  const tubeW = Math.max(CK.TUBE_MIN_W, rowSpan('N') + 2 * CK.TUBE_PAD_X, rowSpan('S') + 2 * CK.TUBE_PAD_X);
  const rowStart = (side: Side) => (tubeW - rowSpan(side)) / 2;
  const portAlong = (id: string, alongStart: number, k: number) => {
    const side = sideOf.get(id)!;
    const pitch = isNS(side) ? CK.PORT_NS : CK.PORT_WE;
    const n = ports.get(id)!.length;
    return alongStart + (span.get(id)! - n * pitch) / 2 + k * pitch + pitch / 2;
  };
  const rootPortX = new Map<string, number>(); // interaction id -> x, for North/South roots
  for (const side of ['N', 'S'] as Side[]) {
    let a = rowStart(side);
    for (const id of roots[side]) {
      ports.get(id)!.forEach((i, k) => rootPortX.set(i.id, portAlong(id, a, k)));
      a += span.get(id)! + CK.SIB;
    }
  }

  // 5. Topic bars from the root endpoints, packed into lanes.
  const rootIds = new Set(Object.values(roots).flat());
  const rootEndpoints = endpoints.filter((i) => rootIds.has(i.systemId));
  const barTopics = [...new Set(rootEndpoints.map((i) => i.topicId))].sort((a, b) => topicIndex.get(a)! - topicIndex.get(b)!);
  type Span = { topicId: string; x0: number; x1: number; lane: number };
  const spans: Span[] = barTopics.map((topicId) => {
    const eps = rootEndpoints.filter((i) => i.topicId === topicId);
    const xs = eps.filter((i) => rootPortX.has(i.id)).map((i) => rootPortX.get(i.id)!);
    const west = eps.some((i) => sideOf.get(i.systemId) === 'W');
    const east = eps.some((i) => sideOf.get(i.systemId) === 'E');
    let x0 = west ? CK.BAR_INSET : xs.length ? Math.min(...xs) - 30 : tubeW / 2;
    let x1 = east ? tubeW - CK.BAR_INSET : xs.length ? Math.max(...xs) + 30 : tubeW / 2;
    // Keep bars wide enough for their label; anchored ends (West/East) stay put.
    if (x1 - x0 < CK.BAR_MIN) {
      if (west && !east) x1 = x0 + CK.BAR_MIN;
      else if (east && !west) x0 = x1 - CK.BAR_MIN;
      else {
        const c = (x0 + x1) / 2;
        x0 = c - CK.BAR_MIN / 2;
        x1 = c + CK.BAR_MIN / 2;
      }
      x0 = Math.max(CK.BAR_INSET, x0);
      x1 = Math.min(tubeW - CK.BAR_INSET, x1);
    }
    return { topicId, x0, x1, lane: 0 };
  });
  const laneEnds: number[] = [];
  for (const s of [...spans].sort((a, b) => a.x0 - b.x0)) {
    let lane = laneEnds.findIndex((end) => end + 16 <= s.x0);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = s.x1;
    s.lane = lane;
  }
  const tubeH = Math.max(CK.TUBE_MIN_H, 2 * CK.TUBE_PAD_Y + Math.max(1, laneEnds.length) * CK.LANE - (CK.LANE - CK.BAR_H));
  const lanesH = laneEnds.length * CK.LANE - (CK.LANE - CK.BAR_H);
  const laneTop = (tubeH - lanesH) / 2;
  const bars: ChainBar[] = spans.map((s) => ({
    topicId: s.topicId,
    name: topicById.get(s.topicId)!.name,
    rect: { x: s.x0, y: laneTop + s.lane * CK.LANE, w: s.x1 - s.x0, h: CK.BAR_H },
  }));
  const barOf = new Map(bars.map((b) => [b.topicId, b]));

  // West/East boxes stack vertically: order them, and their arrows, by the lanes of the bars they reach
  // so arrows between the tube and these boxes do not cross.
  const laneOf = new Map(spans.map((sp) => [sp.topicId, sp.lane]));
  const meanLane = (id: string) => {
    const ls = ports.get(id)!.map((i) => laneOf.get(i.topicId)).filter((x): x is number => x !== undefined);
    return ls.length ? ls.reduce((a, x) => a + x, 0) / ls.length : Infinity;
  };
  for (const side of ['W', 'E'] as Side[]) {
    roots[side].sort((a, b) => meanLane(a) - meanLane(b));
    for (const id of roots[side]) ports.get(id)!.sort((a, b) => (laneOf.get(a.topicId) ?? 0) - (laneOf.get(b.topicId) ?? 0));
  }
  const tube: Rect = { x: 0, y: 0, w: tubeW, h: tubeH };

  // 6. Place boxes (recursively outwards) and draw arrows.
  const nodes: ChainNode[] = [];
  const arrows: ChainArrow[] = [];
  const vec = (axis: 'x' | 'y', o: number, a: number): Vec => (axis === 'x' ? { x: o, y: a } : { x: a, y: o });
  const straight = (i: Interaction, from: ChainEnd, to: ChainEnd, label?: ChainArrow['label']): ChainArrow => ({
    id: `${i.id}`,
    interactionId: i.id,
    topicId: i.topicId,
    d: `M${r(from.at.x)},${r(from.at.y)} L${r(to.at.x)},${r(to.at.y)}`,
    points: [from.at, to.at],
    curved: false,
    from,
    to,
    label,
  });
  const curve = (i: Interaction, from: ChainEnd, to: ChainEnd): ChainArrow => {
    // Horizontal tangents at both ends (West/East systems to the end of a bar).
    const k = Math.max(30, Math.abs(to.at.x - from.at.x) * 0.5);
    const dir = to.at.x >= from.at.x ? 1 : -1;
    const c1 = { x: from.at.x + dir * k, y: from.at.y };
    const c2 = { x: to.at.x - dir * k, y: to.at.y };
    return {
      id: `${i.id}`,
      interactionId: i.id,
      topicId: i.topicId,
      d: `M${r(from.at.x)},${r(from.at.y)} C${r(c1.x)},${r(c1.y)} ${r(c2.x)},${r(c2.y)} ${r(to.at.x)},${r(to.at.y)}`,
      points: [from.at, c1, c2, to.at],
      curved: true,
      from,
      to,
    };
  };
  const link = (i: Interaction, a: ChainEnd, b: ChainEnd) => (i.direction === 'produce' ? [a, b] : [b, a]) as [ChainEnd, ChainEnd];

  const place = (id: string, side: Side, alongStart: number, innerEdge: number, parentIsTube: boolean) => {
    const { axis, sign } = OUT[side];
    const depth = depthOf(id);
    const outerEdge = innerEdge + sign * depth;
    const lo = Math.min(innerEdge, outerEdge);
    const sp = span.get(id)!;
    const rect: Rect = axis === 'y' ? { x: alongStart, y: lo, w: sp, h: depth } : { x: lo, y: alongStart, w: depth, h: sp };
    const s = byId.get(id)!;
    nodes.push({ id, name: s.name, kind: s.kind, side, rect });

    ports.get(id)!.forEach((i, k) => {
      const along = portAlong(id, alongStart, k);
      const self: ChainEnd = { kind: 'node', id, at: vec(axis, innerEdge, along) };
      if (parentIsTube) {
        const bar = barOf.get(i.topicId);
        if (!bar) return;
        let target: ChainEnd;
        if (side === 'N') target = { kind: 'bar', id: i.topicId, at: { x: along, y: bar.rect.y } };
        else if (side === 'S') target = { kind: 'bar', id: i.topicId, at: { x: along, y: bar.rect.y + bar.rect.h } };
        else if (side === 'W') target = { kind: 'bar', id: i.topicId, at: { x: bar.rect.x, y: bar.rect.y + bar.rect.h / 2 } };
        else target = { kind: 'bar', id: i.topicId, at: { x: bar.rect.x + bar.rect.w, y: bar.rect.y + bar.rect.h / 2 } };
        const [from, to] = link(i, self, target);
        arrows.push(isNS(side) ? straight(i, from, to) : curve(i, from, to));
      } else {
        // Relay with the parent system: a straight arrow across the gap, labelled with the topic.
        const parent: ChainEnd = { kind: 'node', id: parentOf(id)!, at: vec(axis, innerEdge - sign * CK.GAP, along) };
        const [from, to] = link(i, self, parent);
        const mid = vec(axis, innerEdge - (sign * CK.GAP) / 2, along);
        arrows.push(straight(i, from, to, { text: topicById.get(i.topicId)!.name, at: mid, horizontal: axis === 'x' }));
      }
    });

    const kids = children.get(id) ?? [];
    let a = alongStart + (sp - childSpan.get(id)!) / 2;
    for (const k of kids) {
      place(k, side, a, outerEdge + sign * CK.GAP, false);
      a += span.get(k)! + CK.SIB;
    }
  };

  const sides: { side: Side; along: number; inner: number }[] = [
    { side: 'N', along: rowStart('N'), inner: -CK.GAP },
    { side: 'S', along: rowStart('S'), inner: tubeH + CK.GAP },
    { side: 'W', along: (tubeH - rowSpan('W')) / 2, inner: -CK.GAP },
    { side: 'E', along: (tubeH - rowSpan('E')) / 2, inner: tubeW + CK.GAP },
  ];
  for (const { side, along, inner } of sides) {
    let a = along;
    for (const id of roots[side]) {
      place(id, side, a, inner, true);
      a += span.get(id)! + CK.SIB;
    }
  }

  const rects = [tube, ...nodes.map((n) => n.rect)];
  const minX = Math.min(...rects.map((q) => q.x)) - CK.MARGIN;
  const minY = Math.min(...rects.map((q) => q.y)) - CK.MARGIN - CK.TITLE_H;
  const maxX = Math.max(...rects.map((q) => q.x + q.w)) + CK.MARGIN + 16;
  const maxY = Math.max(...rects.map((q) => q.y + q.h)) + CK.MARGIN;
  return {
    chainId,
    chainName: chain.name,
    color: chain.color,
    title: `${chain.name} — topic chain through ${model.centre.name}`,
    tube,
    nodes,
    bars,
    arrows,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    empty: endpoints.length === 0,
  };
}
