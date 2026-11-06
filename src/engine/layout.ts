import { SIDES, type NodeKind, type Side } from '../model/types';
import type { Endpoint, Role, ViewModel, ViewNode } from './view';

export const K = {
  TAB_T: 22, // tab thickness (stacking pitch)
  TAB_L: 104, // tab length (across the border gap)
  GAP: 44, // gap between a node and its parent border
  SYS_DEPTH: 130,
  SYS_DEPTH_WITH_CHILDREN: 180,
  SYS_MIN_SPAN: 180,
  ETL_DEPTH: 90,
  ETL_MIN_SPAN: 76,
  NODE_PAD: 20,
  SIB_GAP: 28,
  CENTRE_PAD: 60,
  CENTRE_MIN_W: 340,
  CENTRE_MIN_H: 260,
  MARGIN: 40,
  STUB_LEN: 56,
};

export interface Vec {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TabGeom {
  key: string;
  nodeId: string;
  /** View-topic id (topic, or collapsed group). */
  topicId: string;
  role: Role;
  chainIds: string[];
  rect: Rect;
  vertical: boolean;
  inner: Vec;
  outer: Vec;
  innerNormal: Vec;
  outerNormal: Vec;
}

export interface NodeGeom {
  id: string;
  name: string;
  kind: NodeKind;
  side: Side;
  rect: Rect;
  tabs: TabGeom[];
  hasChildren: boolean;
}

export interface EdgeGeom {
  id: string;
  /** Model topics carried by the arrow. */
  topicIds: string[];
  /** Chains shared by both ends of the arrow. */
  chainIds: string[];
  container: string;
  d: string;
  points: [Vec, Vec, Vec, Vec];
  fromKey: string;
  toKey: string;
}

export interface StubGeom {
  id: string;
  /** View-topic id of the tab the stub starts from. */
  topicId: string;
  d: string;
  outgoing: boolean;
}

export interface BundleBracket {
  key: string;
  groupId: string;
  rect: Rect;
}

export interface Layout {
  centre: Rect;
  nodes: NodeGeom[];
  edges: EdgeGeom[];
  stubs: StubGeom[];
  brackets: BundleBracket[];
  bounds: Rect;
}

const OUT: Record<Side, { axis: 'x' | 'y'; sign: 1 | -1 }> = {
  W: { axis: 'x', sign: -1 },
  E: { axis: 'x', sign: 1 },
  N: { axis: 'y', sign: -1 },
  S: { axis: 'y', sign: 1 },
};

const tabKey = (nodeId: string, topicId: string) => `${nodeId}|${topicId}`;

interface Measure {
  span: number;
  depth: number;
  childrenSpan: number;
}

function measureAll(vm: ViewModel): Map<string, Measure> {
  const out = new Map<string, Measure>();
  const visit = (n: ViewNode): Measure => {
    const cached = out.get(n.id);
    if (cached) return cached;
    const kids = n.children.map((c) => visit(vm.nodes[c]));
    const childrenSpan = kids.reduce((a, k) => a + k.span, 0) + Math.max(0, kids.length - 1) * K.SIB_GAP;
    const etl = n.kind === 'etl';
    const tabsSpan = n.tabs.length * K.TAB_T + 2 * (etl ? 8 : K.NODE_PAD);
    const span = Math.max(etl ? K.ETL_MIN_SPAN : K.SYS_MIN_SPAN, tabsSpan, childrenSpan);
    const depth = etl ? K.ETL_DEPTH : kids.length ? K.SYS_DEPTH_WITH_CHILDREN : K.SYS_DEPTH;
    const m = { span, depth, childrenSpan };
    out.set(n.id, m);
    return m;
  };
  Object.values(vm.nodes).forEach(visit);
  return out;
}

function sideSpan(vm: ViewModel, ms: Map<string, Measure>, side: Side) {
  const ids = vm.roots[side];
  return ids.reduce((a, id) => a + ms.get(id)!.span, 0) + Math.max(0, ids.length - 1) * K.SIB_GAP;
}

/** Layout a view. `tabOrder` optionally fixes the order of tabs per node. */
function layoutOnce(vm: ViewModel, tabOrder: Map<string, string[]>): Layout {
  const ms = measureAll(vm);
  const spans = Object.fromEntries(SIDES.map((s) => [s, sideSpan(vm, ms, s)])) as Record<Side, number>;
  const cw = Math.max(K.CENTRE_MIN_W, spans.N + 2 * K.CENTRE_PAD, spans.S + 2 * K.CENTRE_PAD);
  const ch = Math.max(K.CENTRE_MIN_H, spans.W + 2 * K.CENTRE_PAD, spans.E + 2 * K.CENTRE_PAD);
  const centre: Rect = { x: 0, y: 0, w: cw, h: ch };
  const nodes: NodeGeom[] = [];

  const place = (n: ViewNode, side: Side, alongStart: number, innerEdge: number) => {
    const m = ms.get(n.id)!;
    const { axis, sign } = OUT[side];
    const outerEdge = innerEdge + sign * m.depth;
    const lo = Math.min(innerEdge, outerEdge);
    const rect: Rect =
      axis === 'x' ? { x: lo, y: alongStart, w: m.depth, h: m.span } : { x: alongStart, y: lo, w: m.span, h: m.depth };

    const order = tabOrder.get(n.id);
    const tabs = [...n.tabs];
    if (order) tabs.sort((a, b) => order.indexOf(a.topicId) - order.indexOf(b.topicId));
    const gapCentre = innerEdge - (sign * K.GAP) / 2;
    const tabStart = alongStart + (m.span - tabs.length * K.TAB_T) / 2;
    const vec = (o: number, a: number): Vec => (axis === 'x' ? { x: o, y: a } : { x: a, y: o });
    const tabGeoms: TabGeom[] = tabs.map((t, i) => {
      const a0 = tabStart + i * K.TAB_T;
      const o0 = gapCentre - K.TAB_L / 2;
      const r: Rect =
        axis === 'x' ? { x: o0, y: a0, w: K.TAB_L, h: K.TAB_T } : { x: a0, y: o0, w: K.TAB_T, h: K.TAB_L };
      const am = a0 + K.TAB_T / 2;
      return {
        key: tabKey(n.id, t.topicId),
        nodeId: n.id,
        topicId: t.topicId,
        role: t.role,
        chainIds: t.chainIds,
        rect: r,
        vertical: axis === 'y',
        inner: vec(gapCentre - (sign * K.TAB_L) / 2, am),
        outer: vec(gapCentre + (sign * K.TAB_L) / 2, am),
        innerNormal: vec(-sign, 0),
        outerNormal: vec(sign, 0),
      };
    });
    nodes.push({ id: n.id, name: n.name, kind: n.kind, side, rect, tabs: tabGeoms, hasChildren: n.children.length > 0 });

    let a = alongStart + (m.span - m.childrenSpan) / 2;
    for (const c of n.children) {
      place(vm.nodes[c], side, a, outerEdge + sign * K.GAP);
      a += ms.get(c)!.span + K.SIB_GAP;
    }
  };

  for (const side of SIDES) {
    const { axis, sign } = OUT[side];
    const length = axis === 'x' ? ch : cw;
    const innerEdge = (sign === -1 ? 0 : axis === 'x' ? cw : ch) + sign * K.GAP;
    let a = (length - spans[side]) / 2;
    for (const id of vm.roots[side]) {
      place(vm.nodes[id], side, a, innerEdge);
      a += ms.get(id)!.span + K.SIB_GAP;
    }
  }

  const tabs = new Map(nodes.flatMap((n) => n.tabs.map((t) => [t.key, t] as const)));
  const anchor = (e: Endpoint) => {
    const t = tabs.get(tabKey(e.nodeId, e.tabId))!;
    return e.end === 'inner' ? { p: t.inner, n: t.innerNormal } : { p: t.outer, n: t.outerNormal };
  };

  const edges: EdgeGeom[] = vm.edges.map((e) => {
    const a = anchor(e.from);
    const b = anchor(e.to);
    const dist = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y);
    const k = Math.min(220, Math.max(36, dist * 0.45));
    const c1 = { x: a.p.x + a.n.x * k, y: a.p.y + a.n.y * k };
    const c2 = { x: b.p.x + b.n.x * k, y: b.p.y + b.n.y * k };
    return {
      id: e.id,
      topicIds: e.topicIds,
      chainIds: e.chainIds,
      container: e.container,
      d: `M${r(a.p.x)},${r(a.p.y)} C${r(c1.x)},${r(c1.y)} ${r(c2.x)},${r(c2.y)} ${r(b.p.x)},${r(b.p.y)}`,
      points: [a.p, c1, c2, b.p],
      fromKey: tabKey(e.from.nodeId, e.from.tabId),
      toKey: tabKey(e.to.nodeId, e.to.tabId),
    };
  });

  const stubs: StubGeom[] = vm.stubs.map((s) => {
    const { p, n } = anchor(s.at);
    const q = { x: p.x + n.x * K.STUB_LEN, y: p.y + n.y * K.STUB_LEN };
    const [from, to] = s.outgoing ? [p, q] : [q, p];
    return { id: s.id, topicId: s.at.tabId, d: `M${r(from.x)},${r(from.y)} L${r(to.x)},${r(to.y)}`, outgoing: s.outgoing };
  });

  const brackets: BundleBracket[] = [];
  for (const n of nodes) {
    let run: TabGeom[] = [];
    let runGroup: string | null = null;
    const flush = () => {
      if (runGroup && run.length > 1) {
        const xs = run.flatMap((t) => [t.rect.x, t.rect.x + t.rect.w]);
        const ys = run.flatMap((t) => [t.rect.y, t.rect.y + t.rect.h]);
        const x = Math.min(...xs) - 3;
        const y = Math.min(...ys) - 3;
        brackets.push({ key: `${n.id}|${runGroup}|${run[0].topicId}`, groupId: runGroup, rect: { x, y, w: Math.max(...xs) + 3 - x, h: Math.max(...ys) + 3 - y } });
      }
      run = [];
    };
    for (const t of n.tabs) {
      const g = vm.topics[t.topicId]?.bundleId ?? null;
      if (vm.topics[t.topicId]?.isGroup || g !== runGroup) {
        flush();
        runGroup = vm.topics[t.topicId]?.isGroup ? null : g;
      }
      run.push(t);
    }
    flush();
  }

  const rects = [centre, ...nodes.map((n) => n.rect), ...nodes.flatMap((n) => n.tabs.map((t) => t.rect))];
  const minX = Math.min(...rects.map((q) => q.x)) - K.MARGIN;
  const minY = Math.min(...rects.map((q) => q.y)) - K.MARGIN - 24;
  const maxX = Math.max(...rects.map((q) => q.x + q.w)) + K.MARGIN;
  const maxY = Math.max(...rects.map((q) => q.y + q.h)) + K.MARGIN;
  return { centre, nodes, edges, stubs, brackets, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** Part of a node's box not covered by tabs intruding from its inner (and, with children, outer) border. */
export function labelArea(n: NodeGeom): Rect {
  const band = (K.TAB_L - K.GAP) / 2;
  const inner = n.tabs.length ? band : 0;
  const outer = n.hasChildren ? band : 0;
  const { w, h } = n.rect;
  switch (n.side) {
    case 'W':
      return { x: outer, y: 0, w: w - inner - outer, h };
    case 'E':
      return { x: inner, y: 0, w: w - inner - outer, h };
    case 'N':
      return { x: 0, y: outer, w, h: h - inner - outer };
    case 'S':
      return { x: 0, y: inner, w, h: h - inner - outer };
  }
}

function r(v: number) {
  return Math.round(v * 10) / 10;
}

/**
 * Two-pass layout: lay out with a default tab order, then reorder each node's tabs by the
 * mean position of the tabs they connect to (barycentre heuristic) to reduce crossings,
 * keeping topics of the same bundle contiguous.
 */
export function layoutView(vm: ViewModel): Layout {
  const defaultOrder = new Map<string, string[]>();
  const name = (id: string) => vm.topics[id]?.name ?? id;
  for (const n of Object.values(vm.nodes)) {
    const ids = n.tabs.map((t) => t.topicId);
    ids.sort((a, b) => (vm.topics[a]?.bundleId ?? '').localeCompare(vm.topics[b]?.bundleId ?? '') || name(a).localeCompare(name(b), undefined, { numeric: true }));
    defaultOrder.set(n.id, ids);
  }
  let layout = layoutOnce(vm, defaultOrder);
  for (let pass = 0; pass < 2; pass++) {
    const nodeSide = new Map(layout.nodes.map((n) => [n.id, n.side]));
    const along = (nodeId: string, v: Vec) => (OUT[nodeSide.get(nodeId)!].axis === 'x' ? v.y : v.x);
    const sums = new Map<string, { s: number; c: number }>();
    const acc = (key: string, nodeId: string, v: Vec) => {
      const cur = sums.get(key) ?? { s: 0, c: 0 };
      cur.s += along(nodeId, v);
      cur.c += 1;
      sums.set(key, cur);
    };
    for (const e of layout.edges) {
      acc(e.fromKey, e.fromKey.split('|')[0], e.points[3]);
      acc(e.toKey, e.toKey.split('|')[0], e.points[0]);
    }
    const order = new Map<string, string[]>();
    for (const n of layout.nodes) {
      const score = new Map<string, number>();
      for (const t of n.tabs) {
        const s = sums.get(t.key);
        score.set(t.topicId, s ? s.s / s.c : along(n.id, t.inner));
      }
      const bundleScore = new Map<string, number>();
      for (const t of n.tabs) {
        const b = vm.topics[t.topicId]?.bundleId;
        if (!b || vm.topics[t.topicId]?.isGroup) continue;
        const members = n.tabs.filter((x) => vm.topics[x.topicId]?.bundleId === b);
        bundleScore.set(b, members.reduce((a, x) => a + score.get(x.topicId)!, 0) / members.length);
      }
      const primary = (id: string) => {
        const b = vm.topics[id]?.bundleId;
        return b && !vm.topics[id]?.isGroup ? bundleScore.get(b)! : score.get(id)!;
      };
      const ids = n.tabs.map((t) => t.topicId);
      const bundle = (id: string) => vm.topics[id]?.bundleId ?? '';
      ids.sort((a, b) => primary(a) - primary(b) || bundle(a).localeCompare(bundle(b)) || score.get(a)! - score.get(b)! || name(a).localeCompare(name(b)));
      order.set(n.id, ids);
    }
    layout = layoutOnce(vm, order);
  }
  return layout;
}
