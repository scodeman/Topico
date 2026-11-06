import {
  CENTRE_ID,
  descendants,
  effectiveSide,
  type GroupType,
  type Interaction,
  type Model,
  type NodeKind,
  type Side,
} from '../model/types';

export type CollapseBy = 'none' | GroupType;

export interface ViewOptions {
  /** System ids used as filter. Empty, or containing the centre, means "show all". */
  filterSystems: string[];
  /** View-topic ids (topic ids, or `grp:<groupId>` when collapsed) used as filter. */
  filterTopics: string[];
  collapseBy: CollapseBy;
  /** With several systems selected, keep only topics exchanged between them. */
  sharedOnly: boolean;
}

export type Role = 'produce' | 'consume' | 'both';

export interface ViewTopic {
  id: string;
  name: string;
  /** Model topic ids represented by this view topic (more than one when collapsed into a group). */
  sourceIds: string[];
  isGroup: boolean;
  bundleId: string | null;
  chainId: string | null;
}

export interface ViewTab {
  topicId: string;
  role: Role;
  interactionIds: string[];
}

export interface ViewNode {
  id: string;
  name: string;
  kind: NodeKind;
  side: Side;
  /** CENTRE_ID for nodes attached to the broker. */
  parentId: string;
  children: string[];
  tabs: ViewTab[];
}

export interface Endpoint {
  nodeId: string;
  /** 'inner' = the node's tab seen from its parent container; 'outer' = the same tab seen from inside the node. */
  end: 'inner' | 'outer';
}

export interface ViewEdge {
  id: string;
  container: string;
  topicId: string;
  from: Endpoint;
  to: Endpoint;
}

export interface ViewStub {
  id: string;
  topicId: string;
  at: Endpoint;
  /** true = flow leaves the visible endpoint towards something filtered out. */
  outgoing: boolean;
}

export interface ViewModel {
  centreName: string;
  nodes: Record<string, ViewNode>;
  roots: Record<Side, string[]>;
  topics: Record<string, ViewTopic>;
  edges: ViewEdge[];
  stubs: ViewStub[];
  filtered: boolean;
}

export const groupTopicId = (groupId: string) => `grp:${groupId}`;

function mergeRole(a: Role | undefined, b: Role): Role {
  if (!a || a === b) return b;
  return 'both';
}

interface Graph {
  nodes: Record<string, ViewNode>;
}

/** Build view nodes (with tabs) for the given systems and interactions. */
function buildNodes(model: Model, systemIds: Set<string>, interactions: Interaction[], topicMap: (id: string) => string): Graph {
  const nodes: Record<string, ViewNode> = {};
  for (const s of model.systems) {
    if (!systemIds.has(s.id)) continue;
    const parentOk = s.parentId && systemIds.has(s.parentId);
    nodes[s.id] = {
      id: s.id,
      name: s.name,
      kind: s.kind,
      side: effectiveSide(model, s.id),
      parentId: parentOk ? s.parentId! : CENTRE_ID,
      children: [],
      tabs: [],
    };
  }
  for (const s of model.systems) {
    const n = nodes[s.id];
    if (n && n.parentId !== CENTRE_ID) nodes[n.parentId].children.push(n.id);
  }
  const tabIndex = new Map<string, ViewTab>();
  for (const i of interactions) {
    const n = nodes[i.systemId];
    if (!n) continue;
    const tid = topicMap(i.topicId);
    const key = `${n.id}|${tid}`;
    let tab = tabIndex.get(key);
    if (!tab) {
      tab = { topicId: tid, role: i.direction, interactionIds: [] };
      tabIndex.set(key, tab);
      n.tabs.push(tab);
    } else {
      tab.role = mergeRole(tab.role, i.direction);
    }
    tab.interactionIds.push(i.id);
  }
  return { nodes };
}

/** Pair producers with consumers inside every container (centre and each system). */
export function computeEdges(nodes: Record<string, ViewNode>): ViewEdge[] {
  const edges: ViewEdge[] = [];
  const containers: { id: string; children: ViewNode[]; self?: ViewNode }[] = [
    { id: CENTRE_ID, children: Object.values(nodes).filter((n) => n.parentId === CENTRE_ID) },
    ...Object.values(nodes).map((n) => ({ id: n.id, self: n, children: n.children.map((c) => nodes[c]) })),
  ];
  for (const c of containers) {
    const producers = new Map<string, Endpoint[]>();
    const consumers = new Map<string, Endpoint[]>();
    const add = (m: Map<string, Endpoint[]>, t: string, e: Endpoint) => {
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(e);
    };
    for (const ch of c.children) {
      for (const tab of ch.tabs) {
        const e: Endpoint = { nodeId: ch.id, end: 'inner' };
        if (tab.role !== 'consume') add(producers, tab.topicId, e);
        if (tab.role !== 'produce') add(consumers, tab.topicId, e);
      }
    }
    if (c.self && c.children.length) {
      // Inside a system, its own tab acts in reverse: what it consumes from its parent it relays to its children.
      for (const tab of c.self.tabs) {
        const e: Endpoint = { nodeId: c.self.id, end: 'outer' };
        if (tab.role !== 'produce') add(producers, tab.topicId, e);
        if (tab.role !== 'consume') add(consumers, tab.topicId, e);
      }
    }
    for (const [topicId, ps] of producers) {
      for (const p of ps) {
        for (const q of consumers.get(topicId) ?? []) {
          if (p.nodeId === q.nodeId) continue;
          edges.push({ id: `${c.id}|${topicId}|${p.nodeId}.${p.end}>${q.nodeId}.${q.end}`, container: c.id, topicId, from: p, to: q });
        }
      }
    }
  }
  return edges;
}

export function computeView(model: Model, opts: ViewOptions): ViewModel {
  // 1. Remove everything hidden.
  const hiddenSystems = new Set<string>();
  for (const s of model.systems) if (s.hidden) [s.id, ...descendants(model, s.id)].forEach((id) => hiddenSystems.add(id));
  const hiddenTopics = new Set(model.topics.filter((t) => t.hidden).map((t) => t.id));
  const topicById = new Map(model.topics.map((t) => [t.id, t]));
  const active = model.interactions.filter(
    (i) => !i.hidden && !hiddenSystems.has(i.systemId) && !hiddenTopics.has(i.topicId) && topicById.has(i.topicId),
  );
  const activeSystems = new Set(model.systems.filter((s) => !hiddenSystems.has(s.id)).map((s) => s.id));
  const parentOf = new Map(model.systems.map((s) => [s.id, s.parentId]));
  const withAncestors = (ids: Iterable<string>) => {
    const out = new Set<string>();
    for (const id of ids) {
      let cur: string | null | undefined = id;
      while (cur && activeSystems.has(cur) && !out.has(cur)) {
        out.add(cur);
        cur = parentOf.get(cur);
      }
    }
    return out;
  };

  // 2. Grouping: map topics to view topics.
  const groupById = new Map(model.groups.map((g) => [g.id, g]));
  const topicMap = (topicId: string): string => {
    if (opts.collapseBy === 'none') return topicId;
    const t = topicById.get(topicId);
    const gid = opts.collapseBy === 'bundle' ? t?.bundleId : t?.chainId;
    return gid && groupById.has(gid) ? groupTopicId(gid) : topicId;
  };
  const topics: Record<string, ViewTopic> = {};
  for (const t of model.topics) {
    if (hiddenTopics.has(t.id)) continue;
    const vid = topicMap(t.id);
    if (vid === t.id) {
      topics[vid] = { id: vid, name: t.name, sourceIds: [t.id], isGroup: false, bundleId: t.bundleId, chainId: t.chainId };
    } else {
      const g = groupById.get(vid.slice(4))!;
      const vt = (topics[vid] ??= {
        id: vid,
        name: g.name,
        sourceIds: [],
        isGroup: true,
        bundleId: g.type === 'bundle' ? g.id : null,
        chainId: g.type === 'chain' ? g.id : null,
      });
      vt.sourceIds.push(t.id);
    }
  }
  for (const vt of Object.values(topics)) if (vt.isGroup) vt.name = `${vt.name} (${vt.sourceIds.length})`;

  // 3. Selection filter.
  const filterSystems = opts.filterSystems.filter((id) => id !== CENTRE_ID && activeSystems.has(id));
  const centreSelected = opts.filterSystems.includes(CENTRE_ID);
  const filterTopics = opts.filterTopics.filter((id) => topics[id]);
  let visible: Interaction[] = active;
  let visibleSystems = activeSystems;
  let filtered = false;

  if (!centreSelected && filterTopics.length) {
    filtered = true;
    const wanted = new Set(filterTopics);
    visible = active.filter((i) => wanted.has(topicMap(i.topicId)));
    visibleSystems = withAncestors(visible.map((i) => i.systemId));
  } else if (!centreSelected && filterSystems.length) {
    filtered = true;
    const topicsOf = (sid: string) => new Set(active.filter((i) => i.systemId === sid).map((i) => topicMap(i.topicId)));
    const perSystem = filterSystems.map(topicsOf);
    let wanted = new Set(perSystem.flatMap((s) => [...s]));
    if (filterSystems.length > 1 && opts.sharedOnly) {
      const shared = [...wanted].filter((t) => perSystem.filter((s) => s.has(t)).length >= 2);
      if (shared.length) wanted = new Set(shared);
    }
    // Related nodes: the selection, its upstream subtree, its ancestors, and executables on the broker.
    const related = new Set<string>(withAncestors(filterSystems));
    for (const id of filterSystems) descendants(model, id).forEach((d) => related.add(d));
    for (const s of model.systems) if (s.kind === 'exe' && s.parentId === null) related.add(s.id);
    visible = active.filter((i) => related.has(i.systemId) && wanted.has(topicMap(i.topicId)));
    visibleSystems = withAncestors([...filterSystems, ...visible.map((i) => i.systemId)]);
  }

  const { nodes } = buildNodes(model, visibleSystems, visible, topicMap);
  const edges = computeEdges(nodes);

  // 4. Stubs: flows that exist in the full picture but whose other end is filtered out.
  const stubs: ViewStub[] = [];
  if (filtered) {
    const full = buildNodes(model, activeSystems, active, topicMap).nodes;
    const visibleEdgeIds = new Set(edges.map((e) => e.id));
    const hasTab = (e: Endpoint, topicId: string) => !!nodes[e.nodeId]?.tabs.some((t) => t.topicId === topicId);
    const seen = new Set<string>();
    for (const e of computeEdges(full)) {
      if (visibleEdgeIds.has(e.id)) continue;
      const fromVis = hasTab(e.from, e.topicId);
      const toVis = hasTab(e.to, e.topicId);
      if (fromVis === toVis) continue;
      const at = fromVis ? e.from : e.to;
      const id = `stub|${at.nodeId}.${at.end}|${e.topicId}|${fromVis ? 'out' : 'in'}`;
      if (seen.has(id)) continue;
      seen.add(id);
      stubs.push({ id, topicId: e.topicId, at, outgoing: fromVis });
    }
  }

  const roots: Record<Side, string[]> = { W: [], N: [], E: [], S: [] };
  for (const s of model.systems) {
    const n = nodes[s.id];
    if (n && n.parentId === CENTRE_ID) roots[n.side].push(n.id);
  }

  const usedTopics = new Set(Object.values(nodes).flatMap((n) => n.tabs.map((t) => t.topicId)));
  for (const id of Object.keys(topics)) if (!usedTopics.has(id) && filtered) delete topics[id];

  return { centreName: model.centre.name, nodes, roots, topics, edges, stubs, filtered };
}
