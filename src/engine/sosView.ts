import { CENTRE_ID, effectiveSide, type Model, type Side, type SosRole } from '../model/types';
import type { Rect, Vec } from './layout';
import { computeView } from './view';

/**
 * System of System (SoS) view (see docs/spec/images/SOS.png):
 * - inner systems (and the broker, by default) are drawn inside a central "System of System" box;
 * - outer systems are drawn around it like the petals of a flower, each with a note callout further out;
 * - arrows carry the list of topics flowing between systems.
 *
 * Each system chooses its own role, so a parent can be left out while its leaf is shown, or the reverse.
 * When a parent and its descendant share a role, the parent is drawn as a frame around it.
 * Flows go through systems that are not shown: if WEST SYS 2 is left out, WEST SYS 2.1 -> WEST SYS 2 -> WEST SYS 11
 * becomes WEST SYS 2.1 -> WEST SYS 11.
 */

export const SK = {
  LEAF_MIN_W: 140,
  LEAF_H: 64,
  CHAR_W: 7.4,
  CONT_HEADER: 24,
  CONT_PAD: 14,
  CONT_GAP: 36,
  INNER_GAP: 130, // room between inner systems for arrows and their topic labels
  INNER_RING_GAP: 190, // gap between the broker and the inner systems around it
  BOX_PAD: 40,
  BOX_TITLE: 30,
  BOX_MIN_W: 520,
  BOX_MIN_H: 300,
  OUT_GAP: 160, // minimum gap between the box and the petals, room for a topic label
  CALLOUT_W: 180,
  CALLOUT_GAP: 26,
  CALLOUT_LINE: 13,
  CALLOUT_PAD: 8,
  CALLOUT_MAX_LINES: 9,
  CALLOUT_CHARS: 28,
  PARALLEL: 6,
  MARGIN: 40,
};

export type SosKind = 'centre' | 'system' | 'etl';

export interface SosNode {
  id: string;
  name: string;
  kind: SosKind;
  role: Exclude<SosRole, 'none'>;
  rect: Rect;
  /** Drawn as a frame around shown descendants. */
  container: boolean;
}

export interface SosCallout {
  id: string;
  nodeId: string;
  rect: Rect;
  lines: { text: string; heading?: boolean }[];
  /** Triangle pointing from the note to its system. */
  tail: [Vec, Vec, Vec];
}

export type SosEnd = { id: string; at: Vec };

export interface SosArrow {
  id: string;
  /** `sos` stands for the System of System box itself. */
  from: SosEnd;
  to: SosEnd;
  d: string;
  topicIds: string[];
  label: { text: string; full: string; at: Vec; anchor: 'start' | 'middle' | 'end' };
}

export interface SosLayout {
  title: string;
  box: Rect;
  nodes: SosNode[];
  callouts: SosCallout[];
  arrows: SosArrow[];
  bounds: Rect;
  empty: boolean;
}

const r = (v: number) => Math.round(v * 10) / 10;

/**
 * Label position beside an arrow: pushed sideways (along `perp`) far enough that the horizontal text
 * clears the line whatever its angle; `side` picks which side of the line.
 */
function labelBeside(mid: Vec, perp: Vec, side: 1 | -1, text: string): Vec {
  const halfW = (text.length * 5.4) / 2;
  const off = 7 + Math.abs(perp.x) * halfW + Math.abs(perp.y) * 7;
  return { x: mid.x + perp.x * side * off, y: mid.y + perp.y * side * off };
}

/** Wrap text into lines of at most `max` characters. */
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
      else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out.map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l));
}

/** Point where the segment from the centre of `q` towards `to` leaves `q`. */
function exitPoint(q: Rect, to: Vec): Vec {
  const c = { x: q.x + q.w / 2, y: q.y + q.h / 2 };
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? q.w / 2 / Math.abs(dx) : Infinity, dy ? q.h / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** "TOPIC 1, TOPIC 2 +3" within `max` characters. */
function topicLabel(names: string[], max: number): string {
  let text = '';
  for (let i = 0; i < names.length; i++) {
    const rest = names.length - i - 1;
    const next = text ? `${text}, ${names[i]}` : names[i];
    const suffix = rest ? ` +${rest}` : '';
    if ((next + suffix).length > max && text) return `${text} +${names.length - i}`;
    text = next;
  }
  return text;
}

export function computeSosLayout(model: Model): SosLayout {
  const byId = new Map(model.systems.map((s) => [s.id, s]));
  const topicName = new Map(model.topics.map((t) => [t.id, t.name]));
  const topicById = new Map(model.topics.map((t) => [t.id, t]));
  const topicIndex = new Map(model.topics.map((t, i) => [t.id, i]));
  const sortTopics = (ids: Iterable<string>) => [...ids].sort((a, b) => (topicIndex.get(a) ?? 0) - (topicIndex.get(b) ?? 0));

  // Hidden systems/topics/interactions are left out everywhere; the full (unfiltered) diagram gives the hops of every flow.
  const vm = computeView(model, { filterSystems: [], filterTopics: [], collapseBy: 'none', sharedOnly: true });
  const roleOf = (id: string): SosRole => (id === CENTRE_ID ? model.centre.sos : vm.nodes[id] ? byId.get(id)!.sos : 'none');
  const shown = (id: string) => roleOf(id) !== 'none';

  // 1. Visual nesting: a shown system sits inside its nearest shown ancestor with the same role.
  const visualParent = new Map<string, string | null>();
  for (const s of model.systems) {
    if (!shown(s.id)) continue;
    let p = s.parentId;
    while (p && !(shown(p) && roleOf(p) === roleOf(s.id))) p = byId.get(p)?.parentId ?? null;
    visualParent.set(s.id, p && byId.has(p) ? p : null);
  }
  const visualChildren = new Map<string, string[]>();
  for (const [id, p] of visualParent) if (p) visualChildren.set(p, [...(visualChildren.get(p) ?? []), id]);
  const topOf = (id: string) => {
    let cur = id;
    while (visualParent.get(cur)) cur = visualParent.get(cur)!;
    return cur;
  };
  const isVisualAncestor = (a: string, b: string) => {
    for (let cur = visualParent.get(b) ?? null; cur; cur = visualParent.get(cur) ?? null) if (cur === a) return true;
    return false;
  };

  // 2. Flows between shown systems, going through the systems that are not shown.
  const hops = new Map<string, Map<string, Set<string>>>(); // topic -> from -> to
  for (const e of vm.edges) {
    for (const t of e.topicIds) {
      if (!hops.has(t)) hops.set(t, new Map());
      const m = hops.get(t)!;
      if (!m.has(e.from.nodeId)) m.set(e.from.nodeId, new Set());
      m.get(e.from.nodeId)!.add(e.to.nodeId);
    }
  }
  const flows = new Map<string, Set<string>>(); // "a>b" -> topics
  for (const [t, m] of hops) {
    for (const start of m.keys()) {
      if (!shown(start)) continue;
      const seen = new Set([start]);
      const stack = [...(m.get(start) ?? [])];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (shown(cur)) {
          const key = `${start}>${cur}`;
          if (!flows.has(key)) flows.set(key, new Set());
          flows.get(key)!.add(t);
        } else stack.push(...(m.get(cur) ?? []));
      }
    }
  }

  // 3. Items: top-level inner and outer systems, each with its nested shown descendants.
  interface Item {
    id: string;
    kind: SosKind;
    name: string;
    children: Item[];
    w: number;
    h: number;
  }
  const makeItem = (id: string): Item => {
    const s = byId.get(id);
    const kids = (visualChildren.get(id) ?? []).map(makeItem);
    const name = s?.name ?? model.centre.name;
    let w: number;
    let h: number;
    if (kids.length) {
      w = Math.max(name.length * SK.CHAR_W + 2 * SK.CONT_PAD, kids.reduce((a, k) => a + k.w, 0) + SK.CONT_GAP * (kids.length - 1) + 2 * SK.CONT_PAD);
      h = SK.CONT_HEADER + 2 * SK.CONT_PAD + Math.max(...kids.map((k) => k.h));
    } else {
      w = Math.max(SK.LEAF_MIN_W, name.length * SK.CHAR_W + 30);
      h = SK.LEAF_H;
    }
    return { id, kind: id === CENTRE_ID ? 'centre' : s!.kind, name, children: kids, w, h };
  };
  const tops = (role: 'inner' | 'outer') =>
    [...(role === 'inner' && model.centre.sos === 'inner' ? [CENTRE_ID] : []), ...model.systems.filter((s) => roleOf(s.id) === role && !visualParent.get(s.id)).map((s) => s.id)].map(
      makeItem,
    );
  const innerItems = tops('inner');
  const outerItems = tops('outer');

  // 4. Callouts for outer items: notes, description, properties and/or topics of the item and its nested systems.
  const opt = model.sos.callouts;
  const keys = opt.propertyKeys.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  const calloutLines = (item: Item) => {
    const lines: SosCallout['lines'] = [];
    const visit = (it: Item, depth: number) => {
      const s = byId.get(it.id)!;
      const body: string[] = [];
      if (opt.notes && s.notes.trim()) body.push(s.notes.trim());
      if (opt.description && s.description.trim()) body.push(s.description.trim());
      if (opt.properties) for (const p of s.properties) if (p.key && (!keys.length || keys.includes(p.key.toLowerCase()))) body.push(`${p.key}: ${p.value}`);
      if (opt.topics) {
        const own = model.interactions.filter((i) => i.systemId === s.id && !i.hidden && topicName.has(i.topicId) && !topicById.get(i.topicId)!.hidden);
        const names = (dir: string) => sortTopics(new Set(own.filter((i) => i.direction === dir).map((i) => i.topicId))).map((t) => topicName.get(t)!);
        if (names('produce').length) body.push(`Produces: ${names('produce').join(', ')}`);
        if (names('consume').length) body.push(`Consumes: ${names('consume').join(', ')}`);
      }
      if (body.length && (depth > 0 || item.children.length)) lines.push({ text: s.name, heading: true });
      for (const b of body) for (const l of wrap(b, SK.CALLOUT_CHARS)) lines.push({ text: l });
      it.children.forEach((c) => visit(c, depth + 1));
    };
    visit(item, 0);
    if (lines.length > SK.CALLOUT_MAX_LINES) lines.splice(SK.CALLOUT_MAX_LINES - 1, lines.length, { text: '…' });
    return lines;
  };
  const calloutOf = new Map(outerItems.map((it) => [it.id, calloutLines(it)]));
  const calloutH = (id: string) => {
    const n = calloutOf.get(id)?.length ?? 0;
    return n ? 2 * SK.CALLOUT_PAD + n * SK.CALLOUT_LINE : 0;
  };

  // Petal angles shared by the inner ring and the outer flower: spread evenly, rotated so each system stays
  // as close as possible to its border (North on top, East on the right...).
  const PREF: Record<Side, number> = { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI };
  const sideRank: Record<Side, number> = { N: 0, E: 1, S: 2, W: 3 };
  const sideOf = (id: string): Side => effectiveSide(model, id);
  const ring = <T extends { id: string }>(items: T[]) => {
    const ordered = items.map((it, i) => ({ it, i, side: sideOf(it.id) })).sort((a, b) => sideRank[a.side] - sideRank[b.side] || a.i - b.i);
    const step = (2 * Math.PI) / Math.max(1, ordered.length);
    const sin = ordered.reduce((a, p, k) => a + Math.sin(PREF[p.side] - k * step), 0);
    const cos = ordered.reduce((a, p, k) => a + Math.cos(PREF[p.side] - k * step), 0);
    const offset = ordered.length ? Math.atan2(sin, cos) : 0;
    return ordered.map((p, k) => ({ it: p.it, d: { x: Math.cos(offset + k * step), y: Math.sin(offset + k * step) } }));
  };
  // Half-extent of a rectangle along a unit direction (support function).
  const reach = (w: number, h: number, d: Vec) => (Math.abs(d.x) * w) / 2 + (Math.abs(d.y) * h) / 2;
  const clashes = (rs: Rect[], pad: number) => {
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        if (a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad) return true;
      }
    return false;
  };

  // 5. Inner layout. With the broker shown, every inside line goes through it: the broker sits in the middle
  // and the other inner systems form a ring around it. Without it, a compact grid.
  type Placed = { it: Item; x: number; y: number };
  const hubItem = innerItems.find((it) => it.id === CENTRE_ID);
  const hub = !!hubItem && innerItems.length > 1;
  let innerPlaced: Placed[] = [];
  if (hub) {
    const others = ring(innerItems.filter((it) => it !== hubItem));
    const hubR = (d: Vec) => Math.min(d.x ? hubItem!.w / 2 / Math.abs(d.x) : Infinity, d.y ? hubItem!.h / 2 / Math.abs(d.y) : Infinity);
    const at = (gap: number): Placed[] => [
      { it: hubItem!, x: -hubItem!.w / 2, y: -hubItem!.h / 2 },
      ...others.map(({ it, d }) => {
        const t = hubR(d) + gap + reach(it.w, it.h, d);
        return { it, x: d.x * t - it.w / 2, y: d.y * t - it.h / 2 };
      }),
    ];
    let gap = SK.INNER_RING_GAP;
    innerPlaced = at(gap);
    for (let tries = 0; tries < 60 && clashes(innerPlaced.map((p) => ({ x: p.x, y: p.y, w: p.it.w, h: p.it.h })), 30); tries++) innerPlaced = at((gap += 20));
  } else {
    const cols = Math.max(1, Math.ceil(Math.sqrt(innerItems.length)));
    const rows: Item[][] = [];
    for (let i = 0; i < innerItems.length; i += cols) rows.push(innerItems.slice(i, i + cols));
    const rowW = (row: Item[]) => row.reduce((a, it) => a + it.w, 0) + SK.INNER_GAP * (row.length - 1);
    const gridW = Math.max(0, ...rows.map(rowW));
    let y = 0;
    for (const row of rows) {
      let x = (gridW - rowW(row)) / 2;
      const rh = Math.max(...row.map((it) => it.h));
      for (const it of row) {
        innerPlaced.push({ it, x, y: y + (rh - it.h) / 2 });
        x += it.w + SK.INNER_GAP;
      }
      y += rh + SK.INNER_GAP;
    }
  }
  const minIX = Math.min(0, ...innerPlaced.map((p) => p.x));
  const minIY = Math.min(0, ...innerPlaced.map((p) => p.y));
  const innerW = innerPlaced.length ? Math.max(...innerPlaced.map((p) => p.x + p.it.w)) - minIX : 0;
  const innerH = innerPlaced.length ? Math.max(...innerPlaced.map((p) => p.y + p.it.h)) - minIY : 0;
  const boxW = Math.max(SK.BOX_MIN_W, innerW + 2 * SK.BOX_PAD);
  const boxH = Math.max(SK.BOX_MIN_H, SK.BOX_TITLE + innerH + 2 * SK.BOX_PAD);
  const box: Rect = { x: 0, y: 0, w: boxW, h: boxH };

  // 6. Place items.
  const nodes: SosNode[] = [];
  const rectOf = new Map<string, Rect>();
  const place = (it: Item, x: number, y: number, role: 'inner' | 'outer') => {
    const rect = { x, y, w: it.w, h: it.h };
    rectOf.set(it.id, rect);
    nodes.push({ id: it.id, name: it.name, kind: it.kind, role, rect, container: it.children.length > 0 });
    let cx = x + (it.w - (it.children.reduce((a, k) => a + k.w, 0) + SK.CONT_GAP * (it.children.length - 1))) / 2;
    for (const k of it.children) {
      place(k, cx, y + SK.CONT_HEADER + SK.CONT_PAD, role);
      cx += k.w + SK.CONT_GAP;
    }
  };
  const dx = (boxW - innerW) / 2 - minIX;
  const dy = SK.BOX_TITLE + (boxH - SK.BOX_TITLE - innerH) / 2 - minIY;
  for (const p of innerPlaced) place(p.it, p.x + dx, p.y + dy, 'inner');
  // Outer systems: a flower around the box. Petals (system, then its callout further out on the same ray)
  // are spread evenly around the box, rotated so each one stays as close as possible to its border
  // (North on top, East on the right...), and pushed outwards until no two petals overlap.
  const callouts: SosCallout[] = [];
  const centre: Vec = { x: boxW / 2, y: boxH / 2 };
  const petals = ring(outerItems);
  const boxReach = (d: Vec) => Math.min(d.x ? boxW / 2 / Math.abs(d.x) : Infinity, d.y ? boxH / 2 / Math.abs(d.y) : Infinity);
  const layoutPetals = (gap: number) =>
    petals.map(({ it, d }) => {
      const p = { it };
      const t = boxReach(d) + gap + reach(p.it.w, p.it.h, d);
      const item: Rect = { x: centre.x + d.x * t - p.it.w / 2, y: centre.y + d.y * t - p.it.h / 2, w: p.it.w, h: p.it.h };
      const ch = calloutH(p.it.id);
      let note: Rect | null = null;
      if (ch) {
        const tc = t + reach(p.it.w, p.it.h, d) + SK.CALLOUT_GAP + reach(SK.CALLOUT_W, ch, d);
        note = { x: centre.x + d.x * tc - SK.CALLOUT_W / 2, y: centre.y + d.y * tc - ch / 2, w: SK.CALLOUT_W, h: ch };
      }
      return { p, d, item, note };
    });
  const clash = (ps: ReturnType<typeof layoutPetals>) => clashes(ps.flatMap((q) => (q.note ? [q.item, q.note] : [q.item])), 14);
  let gap = SK.OUT_GAP;
  let flower = layoutPetals(gap);
  for (let tries = 0; tries < 60 && clash(flower); tries++) flower = layoutPetals((gap += 20));

  const outerRay = new Map<string, Vec>(); // direction from the box centre to each outer item
  for (const { p, d, item, note } of flower) {
    place(p.it, item.x, item.y, 'outer');
    outerRay.set(p.it.id, d);
    if (note) {
      const ic = { x: item.x + item.w / 2, y: item.y + item.h / 2 };
      const nc = { x: note.x + note.w / 2, y: note.y + note.h / 2 };
      const base = exitPoint(note, ic);
      const tip = exitPoint(item, nc);
      const perp = { x: -d.y, y: d.x };
      callouts.push({
        id: `note:${p.it.id}`,
        nodeId: p.it.id,
        rect: note,
        lines: calloutOf.get(p.it.id)!,
        tail: [
          { x: base.x + perp.x * 8, y: base.y + perp.y * 8 },
          { x: base.x - perp.x * 8, y: base.y - perp.y * 8 },
          { x: tip.x - d.x * 4, y: tip.y - d.y * 4 },
        ],
      });
    }
  }
  // 7. Arrows.
  const arrows: SosArrow[] = [];
  const names = (ids: Iterable<string>) => sortTopics(ids).map((t) => topicName.get(t) ?? t);
  const line = (a: Vec, b: Vec) => `M${r(a.x)},${r(a.y)} L${r(b.x)},${r(b.y)}`;

  // Inner <-> inner: one arrow per direction between two shown systems, offset when both directions exist.
  // With the broker shown, inside lines go through it instead: each inner system gets one line to the broker
  // (what it publishes to other shown systems) and one from it (what it reads from them).
  const pairs = new Map<string, { a: string; b: string; ab: Set<string>; ba: Set<string> }>();
  const viaHub = new Map<string, { a: string; b: string; ab: Set<string>; ba: Set<string> }>();
  const toHub = (id: string, t: string, dir: 'out' | 'in') => {
    const p = viaHub.get(id) ?? { a: id, b: CENTRE_ID, ab: new Set<string>(), ba: new Set<string>() };
    (dir === 'out' ? p.ab : p.ba).add(t);
    viaHub.set(id, p);
  };
  // Outer <-> SoS box: aggregated on the outer item, one arrow into and one out of the box.
  const outerFlows = new Map<string, { into: Set<string>; out: Set<string> }>();
  const addOuter = (id: string, dir: 'into' | 'out', topics: Set<string>) => {
    const f = outerFlows.get(id) ?? { into: new Set<string>(), out: new Set<string>() };
    topics.forEach((t) => f[dir].add(t));
    outerFlows.set(id, f);
  };
  for (const [key, topics] of flows) {
    const [from, to] = key.split('>');
    const rf = roleOf(from);
    const rt = roleOf(to);
    if (hub && model.sos.innerLines) {
      // Inside lines through the broker, including the inside half of flows to/from outer systems.
      const linked = !(rf === 'inner' && rt === 'inner' && (isVisualAncestor(from, to) || isVisualAncestor(to, from)));
      if (rf === 'inner' && linked) topics.forEach((t) => toHub(from, t, 'out'));
      if (rt === 'inner' && linked) topics.forEach((t) => toHub(to, t, 'in'));
    }
    if (rf === 'inner' && rt === 'inner') {
      if (hub || !model.sos.innerLines || isVisualAncestor(from, to) || isVisualAncestor(to, from)) continue;
      const [a, b] = [from, to].sort();
      const p = pairs.get(`${a}|${b}`) ?? { a, b, ab: new Set<string>(), ba: new Set<string>() };
      topics.forEach((t) => (from === a ? p.ab : p.ba).add(t));
      pairs.set(`${a}|${b}`, p);
    } else if (rf !== rt && (rf === 'outer' || rt === 'outer')) {
      addOuter(topOf(rf === 'outer' ? from : to), rf === 'outer' ? 'into' : 'out', topics);
    } else if (rf === 'outer' && rt === 'outer' && model.centre.sos === 'inner' && topOf(from) !== topOf(to)) {
      // Between two outer systems the flow goes through the broker, inside the SoS: into the box, then out of it.
      // Without the broker in the box, it does not cross the SoS and is not drawn.
      addOuter(topOf(from), 'into', topics);
      addOuter(topOf(to), 'out', topics);
    }
  }

  for (const p of [...pairs.values(), ...viaHub.values()]) {
    const ra = rectOf.get(p.a)!;
    const rb = rectOf.get(p.b)!;
    const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
    const cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
    const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
    const nx = -(cb.y - ca.y) / len;
    const ny = (cb.x - ca.x) / len;
    const both = p.ab.size > 0 && p.ba.size > 0;
    for (const [from, to, topics, sign] of [
      [p.a, p.b, p.ab, 1],
      [p.b, p.a, p.ba, -1],
    ] as const) {
      if (!topics.size) continue;
      const off = both ? sign * SK.PARALLEL : 0;
      const rf = rectOf.get(from)!;
      const rt = rectOf.get(to)!;
      const cf = { x: rf.x + rf.w / 2 + nx * off, y: rf.y + rf.h / 2 + ny * off };
      const ct = { x: rt.x + rt.w / 2 + nx * off, y: rt.y + rt.h / 2 + ny * off };
      const s = exitPoint({ ...rf, x: rf.x + nx * off, y: rf.y + ny * off }, ct);
      const e = exitPoint({ ...rt, x: rt.x + nx * off, y: rt.y + ny * off }, cf);
      const ls = names(topics);
      const text = topicLabel(ls, 30);
      const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
      arrows.push({
        id: `${from}>${to}`,
        from: { id: from, at: s },
        to: { id: to, at: e },
        d: line(s, e),
        topicIds: sortTopics(topics),
        label: { text, full: ls.join(', '), at: labelBeside(mid, { x: nx, y: ny }, both ? sign : 1, text), anchor: 'middle' },
      });
    }
  }

  // Outer <-> SoS: along the petal's ray, from the system to the box border (or back), offset when both ways.
  for (const [id, f] of outerFlows) {
    const d = outerRay.get(id);
    const ir = rectOf.get(id);
    if (!d || !ir) continue;
    const both = f.into.size > 0 && f.out.size > 0;
    const perp = { x: -d.y, y: d.x };
    for (const [dir, topics, sign] of [
      ['into', f.into, -1],
      ['out', f.out, 1],
    ] as const) {
      if (!topics.size) continue;
      const off = both ? sign * SK.PARALLEL : 0;
      const shifted = (q: Rect): Rect => ({ ...q, x: q.x + perp.x * off, y: q.y + perp.y * off });
      const ic = { x: ir.x + ir.w / 2 + perp.x * off, y: ir.y + ir.h / 2 + perp.y * off };
      const bc = { x: centre.x + perp.x * off, y: centre.y + perp.y * off };
      const p = exitPoint(shifted(ir), bc);
      const q = exitPoint(shifted(box), ic);
      const ls = names(topics);
      const text = topicLabel(ls, 26);
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const [s, e] = dir === 'into' ? [p, q] : [q, p];
      arrows.push({
        id: `${id}:${dir}`,
        from: { id: dir === 'into' ? id : 'sos', at: s },
        to: { id: dir === 'into' ? 'sos' : id, at: e },
        d: line(s, e),
        topicIds: sortTopics(topics),
        label: { text, full: ls.join(', '), at: labelBeside(mid, perp, both ? sign : 1, text), anchor: 'middle' },
      });
    }
  }
  const rects = [box, ...nodes.map((n) => n.rect), ...callouts.map((c) => c.rect)];
  const minX = Math.min(...rects.map((q) => q.x)) - SK.MARGIN;
  const minY = Math.min(...rects.map((q) => q.y)) - SK.MARGIN;
  const maxX = Math.max(...rects.map((q) => q.x + q.w)) + SK.MARGIN;
  const maxY = Math.max(...rects.map((q) => q.y + q.h)) + SK.MARGIN;
  return {
    title: model.sos.title,
    box,
    nodes,
    callouts,
    arrows,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    empty: nodes.length === 0,
  };
}
