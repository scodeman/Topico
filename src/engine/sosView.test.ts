import { describe, expect, it } from 'vitest';
import { sampleModel } from '../model/sample';
import { normalizeModel, type Model, type SosRole } from '../model/types';
import type { Rect } from './layout';
import { computeSosLayout } from './sosView';

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

const ids = (m: Model) => {
  const l = computeSosLayout(m);
  const byRole = (role: string) => l.nodes.filter((n) => n.role === role).map((n) => n.id).sort();
  return {
    l,
    inner: byRole('inner'),
    outer: byRole('outer'),
    node: (id: string) => l.nodes.find((n) => n.id === id),
    rect: (id: string) => l.nodes.find((n) => n.id === id)!.rect,
    arrow: (id: string) => l.arrows.find((a) => a.id === id),
  };
};
/**
 * Test scenario on top of the sample: North, South and East systems inside, West systems and the East leaves outside.
 * (The sample itself uses the defaults: only the broker inside.)
 */
const SCENARIO: Record<string, SosRole> = {
  n1: 'inner', n2: 'inner', n3: 'inner', n21: 'inner', s1: 'inner', e1: 'inner', e12: 'inner',
  w11: 'outer', w2: 'outer', w21: 'outer', w22: 'outer', xw1: 'outer', e11: 'outer', e12x: 'outer', e13: 'outer',
};
const withRoles = (roles: Record<string, SosRole>) => {
  const m = sampleModel();
  for (const s of m.systems) s.sos = roles[s.id] ?? SCENARIO[s.id];
  return m;
};
const scenario = () => withRoles({});

describe('computeSosLayout', () => {
  it('by default shows only the broker inside, every system outside with its notes, and no ETL', () => {
    const { inner, outer, l } = ids(sampleModel());
    expect(inner).toEqual(['centre']);
    expect(outer).toEqual(['e1', 'e11', 'e12', 'e12x', 'e13', 'n1', 'n2', 'n3', 's1', 'w11', 'w2', 'w21', 'w22']);
    // Parents frame their leaves outside the box.
    expect(l.nodes.find((n) => n.id === 'e1')!.container).toBe(true);
    // Callouts show the notes only.
    const note = l.callouts.find((c) => c.nodeId === 'w11')!.lines.map((x) => x.text).join(' ');
    expect(note).toContain('Master of the reference data');
    expect(l.callouts.length).toBe(l.nodes.filter((n) => n.role === 'outer' && !l.nodes.some((p) => p.container && p.id !== n.id && contains(p.rect, n.rect))).length);
  });

  it('defaults new and older systems: ETLs not shown, others outside', () => {
    const m = normalizeModel({ systems: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', kind: 'exe' }, { id: 'c', name: 'C', kind: 'system', sos: 'inner' }] });
    expect(m.systems.map((x) => x.sos)).toEqual(['outer', 'none', 'inner']);
    expect(m.sos.callouts).toMatchObject({ notes: true, description: false, properties: false, topics: false });
  });

  it('places the test scenario: North, South and East inside, West and the East leaves outside', () => {
    const { inner, outer } = ids(scenario());
    expect(inner).toEqual(['centre', 'e1', 'e12', 'n1', 'n2', 'n21', 'n3', 's1']);
    expect(outer).toEqual(['e11', 'e12x', 'e13', 'w11', 'w2', 'w21', 'w22', 'xw1']);
  });

  it('draws a parent as a frame around descendants that share its role', () => {
    const { l, node, rect } = ids(scenario());
    expect(node('n2')!.container).toBe(true);
    expect(contains(rect('n2'), rect('n21'))).toBe(true);
    expect(contains(rect('w2'), rect('w21'))).toBe(true);
    expect(contains(rect('w2'), rect('w22'))).toBe(true);
    // EAST SYS 1 is inside, its leaves outside: each is drawn on its own.
    expect(node('e1')!.container).toBe(false);
    expect(contains(l.box, rect('e1'))).toBe(true);
    expect(overlaps(rect('e11'), l.box)).toBe(false);
  });

  it('keeps a parent inside with some leaves while its other leaves are outside', () => {
    const { l, node, rect, arrow } = ids(withRoles({ e1: 'inner', e11: 'inner', e12x: 'outer', e13: 'outer' }));
    expect(node('e1')!.container).toBe(true);
    expect(contains(rect('e1'), rect('e11'))).toBe(true);
    expect(contains(l.box, rect('e1'))).toBe(true);
    for (const id of ['e12x', 'e13']) {
      expect(node(id)!.role).toBe('outer');
      expect(overlaps(rect(id), l.box)).toBe(false);
    }
    // The outside leaves still receive TOPIC 8 relayed by their parent inside the SoS.
    expect(arrow('e12x:out')!.topicIds).toEqual(['t8']);
  });

  it('shows a leaf alone when its parent is not shown', () => {
    const { node, rect, l } = ids(withRoles({ n2: 'none' }));
    expect(node('n2')).toBeUndefined();
    expect(node('n21')!.container).toBe(false);
    expect(contains(l.box, rect('n21'))).toBe(true);
  });

  it('shows only the parent when its leaves are not shown', () => {
    const { node } = ids(withRoles({ w21: 'none', w22: 'none' }));
    expect(node('w2')!.container).toBe(false);
    expect(node('w21')).toBeUndefined();
  });

  it('routes inside lines through the broker when it is shown', () => {
    const { arrow, l, rect } = ids(scenario());
    // NORTH SYS 1 -> NORTH SYS 2 (TOPIC 6) becomes NORTH SYS 1 -> broker -> NORTH SYS 2.
    expect(arrow('n1>n2')).toBeUndefined();
    expect(arrow('n1>centre')!.topicIds).toContain('t6');
    expect(arrow('centre>n2')!.topicIds).toContain('t6');
    // Flows with outer systems also reach the broker inside: WEST SYS 11 -> TOPIC 2 -> NORTH SYS 1.
    expect(arrow('centre>n1')!.topicIds).toContain('t2');
    // Every inside line touches the broker, which sits in the middle of the inner systems.
    const inside = l.arrows.filter((a) => a.from.id !== 'sos' && a.to.id !== 'sos' && !l.nodes.find((n) => n.id === a.from.id && n.role === 'outer') && !l.nodes.find((n) => n.id === a.to.id && n.role === 'outer'));
    for (const a of inside) expect(a.from.id === 'centre' || a.to.id === 'centre').toBe(true);
    const c = rect('centre');
    const inner = l.nodes.filter((n) => n.role === 'inner' && n.id !== 'centre');
    const mean = (f: (q: Rect) => number) => inner.reduce((s, n) => s + f(n.rect), 0) / inner.length;
    expect(Math.abs(mean((q) => q.x + q.w / 2) - (c.x + c.w / 2))).toBeLessThan(c.w);
    expect(Math.abs(mean((q) => q.y + q.h / 2) - (c.y + c.h / 2))).toBeLessThan(c.h * 2);
    // Inner systems do not overlap each other.
    const tops = l.nodes.filter((n) => n.role === 'inner' && !l.nodes.some((p) => p.id !== n.id && p.container && contains(p.rect, n.rect)));
    for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) expect(overlaps(tops[i].rect, tops[j].rect)).toBe(false);
  });

  it('turns the inside lines off, keeping the lines to outer systems', () => {
    const m = scenario();
    m.sos.innerLines = false;
    const { l } = ids(m);
    const touchesInnerOnly = l.arrows.filter((a) => a.from.id !== 'sos' && a.to.id !== 'sos');
    expect(touchesInnerOnly.every((a) => l.nodes.find((n) => n.id === a.from.id || n.id === a.to.id)?.role === 'outer')).toBe(true);
    expect(l.arrows.some((a) => a.from.id === 'centre' || a.to.id === 'centre')).toBe(false);
    expect(l.arrows.some((a) => a.id === 'w11:into')).toBe(true);
  });

  it('draws one arrow per direction between inner systems when the broker is not shown', () => {
    const m = scenario();
    m.centre.sos = 'none';
    const { arrow } = ids(m);
    expect(arrow('n1>n2')!.topicIds).toEqual(['t6']);
    expect(arrow('n2>n1')!.topicIds).toEqual(['t7']);
    expect(arrow('n1>n2')!.label.full).toBe('TOPIC 6');
    // A parent and its own leaf are nested, not linked by an arrow.
    expect(arrow('n21>n2') ?? arrow('n2>n21')).toBeUndefined();
  });

  it('links outer systems to the SoS box, into and out of it', () => {
    const { arrow } = ids(scenario());
    // EAST SYS 1 (inside) relays TOPIC 8 to its leaf EAST SYS 1.1 (outside).
    expect(arrow('e11:out')).toMatchObject({ from: { id: 'sos' }, to: { id: 'e11' } });
    expect(arrow('e11:out')!.topicIds).toEqual(['t8']);
    // WEST SYS 11 sends TOPIC 2 and 3 into the SoS, reads TOPIC 1 from NORTH SYS 1 (inside)
    // and TOPIC 4 from WEST SYS 2 (outside, through the broker).
    expect(arrow('w11:into')!.topicIds).toEqual(['t2', 't3']);
    expect(arrow('w11:out')!.topicIds).toEqual(['t1', 't4']);
  });

  it('follows flows through systems that are not shown', () => {
    // WEST SYS 2.1 -> WEST SYS 2 (not shown) -> NORTH SYS 1 (inside): TOPIC 4 enters the SoS from WEST SYS 2.1.
    const { arrow } = ids(withRoles({ w2: 'none' }));
    expect(arrow('w21:into')!.topicIds).toContain('t4');
  });

  it('draws flows between two outer systems through the box when the broker is inside', () => {
    const { arrow } = ids(sampleModel());
    // Only the broker is inside: WEST SYS 11 publishes TOPIC 2/3 into the SoS, NORTH SYS 1 reads TOPIC 2 out of it.
    expect(arrow('w11:into')!.topicIds).toEqual(['t2', 't3']);
    expect(arrow('n1:out')!.topicIds).toContain('t2');
    // A parent and its framed leaves are one outer group: EAST SYS 1 -> EAST SYS 1.1 is not drawn.
    expect(arrow('e1:out')!.topicIds).toEqual(['t8', 't9']);
    expect(arrow('e1:into')).toBeUndefined();
  });

  it('does not draw flows between two outer systems when the broker is not shown', () => {
    const m = scenario();
    m.centre.sos = 'none';
    const { l } = ids(m);
    const outerIds = new Set(['w11', 'w2', 'w21', 'w22', 'xw1', 'e11', 'e12x', 'e13']);
    for (const a of l.arrows) expect(outerIds.has(a.from.id) && outerIds.has(a.to.id)).toBe(false);
  });

  it('fills callouts from the chosen content', () => {
    const m = scenario();
    m.systems.find((s) => s.id === 'e13')!.notes = '';
    let { l } = ids(m);
    const note = (id: string) => l.callouts.find((c) => c.nodeId === id)?.lines.map((x) => x.text).join(' ');
    expect(note('w11')).toContain('Master of the reference data');
    expect(note('e13')).toBeUndefined(); // nothing to show: no callout
    m.sos.callouts.topics = true;
    m.systems.find((s) => s.id === 'e13')!.properties = [{ key: 'tier', value: 'gold' }, { key: 'team', value: 'ops' }];
    m.sos.callouts.properties = true;
    m.sos.callouts.propertyKeys = 'tier';
    ({ l } = ids(m));
    expect(note('e13')).toContain('Consumes: TOPIC 8');
    expect(note('e13')).toContain('tier: gold');
    expect(note('e13')).not.toContain('team');
  });

  it('arranges outer systems as a flower all around the box, without overlaps', () => {
    const { l } = ids(scenario());
    const tops = l.nodes.filter((n) => n.role === 'outer' && !l.nodes.some((p) => p.id !== n.id && p.container && contains(p.rect, n.rect)));
    // Petals on several sides of the box, not in a single row.
    const cx = l.box.x + l.box.w / 2;
    const cy = l.box.y + l.box.h / 2;
    const quadrants = new Set(tops.map((n) => `${n.rect.x + n.rect.w / 2 > cx}${n.rect.y + n.rect.h / 2 > cy}`));
    expect(quadrants.size).toBeGreaterThanOrEqual(3);
    const rects = [l.box, ...tops.map((n) => n.rect), ...l.callouts.map((c) => c.rect)];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j]), `${i}/${j}`).toBe(false);
  });

  it('can leave the broker out', () => {
    const m = scenario();
    m.centre.sos = 'none';
    expect(ids(m).inner).not.toContain('centre');
  });
});
