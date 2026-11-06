import {
  CENTRE_ID,
  descendants,
  effectiveSide,
  type Direction,
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
  /**
   * Topic ids and/or group ids (`grp:<groupId>`) used as filter.
   * A bundle matches every endpoint of its topics; a chain matches only its own endpoints.
   */
  filterTopics: string[];
  collapseBy: CollapseBy;
  /** With several systems selected, keep only topics exchanged between them. */
  sharedOnly: boolean;
}

export type Role = 'produce' | 'consume' | 'both';

/** What a tab stands for: a single topic, or a collapsed bundle/chain. */
export interface ViewTopic {
  id: string;
  name: string;
  /** Model topic ids represented by this tab. */
  sourceIds: string[];
  isGroup: boolean;
  /** Bundle of the topic (or the bundle itself when collapsed). */
  bundleId: string | null;
}

export interface ViewTab {
  /** View-topic id: a topic id, or `grp:<groupId>` when collapsed. */
  topicId: string;
  role: Role;
  interactionIds: string[];
  /** Functional chains of the endpoints shown by this tab. */
  chainIds: string[];
}

/** Where an endpoint is drawn. Collapsed by chain, an endpoint in several chains appears in each chain's tab. */
interface FlowTab {
  tabId: string;
  /** The chain this tab stands for (collapsed chain tabs only). */
  chainId: string | null;
}

/** One endpoint of a node: a (topic, direction) pair, its chains and the tab(s) that display it. */
interface Flow {
  topicId: string;
  direction: Direction;
  chainIds: string[];
  tabs: FlowTab[];
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
  flows: Flow[];
}

export interface Endpoint {
  nodeId: string;
  /** 'inner' = the node's tab seen from its parent container; 'outer' = the same tab seen from inside the node. */
  end: 'inner' | 'outer';
  /** View-topic id of the tab the arrow attaches to. */
  tabId: string;
}

export interface ViewEdge {
  id: string;
  container: string;
  /** Model topics carried by this arrow. */
  topicIds: string[];
  from: Endpoint;
  to: Endpoint;
  /** Functional chains shared by both ends of the carried flow(s). */
  chainIds: string[];
}

export interface ViewStub {
  id: string;
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

const mergeRole = (a: Role, b: Role): Role => (a === b ? a : 'both');

/** Build view nodes (with tabs and flows) for the given systems and interactions. */
function buildNodes(model: Model, systemIds: Set<string>, interactions: Interaction[], tabsOf: (i: Interaction) => FlowTab[]) {
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
      flows: [],
    };
  }
  for (const s of model.systems) {
    const n = nodes[s.id];
    if (n && n.parentId !== CENTRE_ID) nodes[n.parentId].children.push(n.id);
  }
  for (const i of interactions) {
    const n = nodes[i.systemId];
    if (!n) continue;
    const tabs = tabsOf(i);
    n.flows.push({ topicId: i.topicId, direction: i.direction, chainIds: i.chainIds, tabs });
    for (const ft of tabs) {
      let tab = n.tabs.find((t) => t.topicId === ft.tabId);
      if (!tab) {
        tab = { topicId: ft.tabId, role: i.direction, interactionIds: [], chainIds: [] };
        n.tabs.push(tab);
      } else {
        tab.role = mergeRole(tab.role, i.direction);
      }
      if (!tab.interactionIds.includes(i.id)) tab.interactionIds.push(i.id);
      // A collapsed chain tab only stands for its own chain; a plain tab shows all chains of its endpoints.
      for (const c of ft.chainId ? [ft.chainId] : i.chainIds) if (!tab.chainIds.includes(c)) tab.chainIds.push(c);
    }
  }
  return nodes;
}

interface FlowEdge {
  /** Identity of the underlying flow, independent of how tabs are grouped. */
  key: string;
  container: string;
  topicId: string;
  from: Endpoint;
  to: Endpoint;
  chainIds: string[];
}

/** Pair producers with consumers of each topic inside every container (centre and each system). */
function flowEdges(nodes: Record<string, ViewNode>): FlowEdge[] {
  const out: FlowEdge[] = [];
  const containers: { id: string; children: ViewNode[]; self?: ViewNode }[] = [
    { id: CENTRE_ID, children: Object.values(nodes).filter((n) => n.parentId === CENTRE_ID) },
    ...Object.values(nodes).map((n) => ({ id: n.id, self: n, children: n.children.map((c) => nodes[c]) })),
  ];
  type Ep = { nodeId: string; end: Endpoint['end']; flow: Flow };
  for (const c of containers) {
    const producers = new Map<string, Ep[]>();
    const consumers = new Map<string, Ep[]>();
    const add = (m: Map<string, Ep[]>, t: string, e: Ep) => {
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(e);
    };
    for (const ch of c.children) {
      for (const f of ch.flows) {
        add(f.direction === 'produce' ? producers : consumers, f.topicId, { nodeId: ch.id, end: 'inner', flow: f });
      }
    }
    if (c.self && c.children.length) {
      // Inside a system, its own tab acts in reverse: what it consumes from its parent it relays to its children.
      for (const f of c.self.flows) {
        add(f.direction === 'consume' ? producers : consumers, f.topicId, { nodeId: c.self.id, end: 'outer', flow: f });
      }
    }
    for (const [topicId, ps] of producers) {
      for (const p of ps) {
        for (const q of consumers.get(topicId) ?? []) {
          if (p.nodeId === q.nodeId) continue;
          const key = `${c.id}|${topicId}|${p.nodeId}.${p.end}>${q.nodeId}.${q.end}`;
          const shared = p.flow.chainIds.filter((x) => q.flow.chainIds.includes(x));
          // Link the tabs of each shared chain (they are the same tab unless collapsed by chain);
          // with no chain in common, link the endpoints' first tabs.
          const tabFor = (e: Ep, chain: string | null) => (e.flow.tabs.find((t) => t.chainId === chain) ?? e.flow.tabs[0]).tabId;
          const pairs = shared.length ? shared.map((x) => [x] as const) : [[null] as const];
          for (const [chain] of pairs) {
            out.push({
              key,
              container: c.id,
              topicId,
              from: { nodeId: p.nodeId, end: p.end, tabId: tabFor(p, chain) },
              to: { nodeId: q.nodeId, end: q.end, tabId: tabFor(q, chain) },
              chainIds: chain ? [chain] : [],
            });
          }
        }
      }
    }
  }
  return out;
}

const endpointKey = (e: Endpoint) => `${e.nodeId}.${e.end}.${e.tabId}`;

/** Merge flows that land on the same pair of tabs into one arrow. */
function mergeEdges(flows: FlowEdge[]): ViewEdge[] {
  const byKey = new Map<string, ViewEdge>();
  for (const f of flows) {
    const id = `${f.container}|${endpointKey(f.from)}>${endpointKey(f.to)}`;
    const e = byKey.get(id);
    if (!e) byKey.set(id, { id, container: f.container, topicIds: [f.topicId], from: f.from, to: f.to, chainIds: [...f.chainIds] });
    else {
      if (!e.topicIds.includes(f.topicId)) e.topicIds.push(f.topicId);
      for (const c of f.chainIds) if (!e.chainIds.includes(c)) e.chainIds.push(c);
    }
  }
  return [...byKey.values()];
}

/** Arrows of a set of nodes (exported for tests and tools). */
export function computeEdges(nodes: Record<string, ViewNode>): ViewEdge[] {
  return mergeEdges(flowEdges(nodes));
}

export function computeView(model: Model, opts: ViewOptions): ViewModel {
  // 1. Remove everything hidden.
  const hiddenSystems = new Set<string>();
  for (const s of model.systems) if (s.hidden) [s.id, ...descendants(model, s.id)].forEach((id) => hiddenSystems.add(id));
  const hiddenTopics = new Set(model.topics.filter((t) => t.hidden).map((t) => t.id));
  const topicById = new Map(model.topics.map((t) => [t.id, t]));
  const groupById = new Map(model.groups.map((g) => [g.id, g]));
  const chainsOf = (i: Interaction) => i.chainIds.filter((c) => groupById.get(c)?.type === 'chain');
  // Endpoints keep only chains that still exist.
  const clean = (i: Interaction): Interaction => (i.chainIds.every((c) => groupById.get(c)?.type === 'chain') ? i : { ...i, chainIds: chainsOf(i) });
  const active = model.interactions
    .filter((i) => !i.hidden && !hiddenSystems.has(i.systemId) && !hiddenTopics.has(i.topicId) && topicById.has(i.topicId))
    .map((i) => clean(i));
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
  const bundleOf = (i: Interaction) => {
    const b = topicById.get(i.topicId)?.bundleId;
    return b && groupById.has(b) ? b : null;
  };

  // 2. Grouping: which tab(s) display each endpoint.
  const tabsOf = (i: Interaction): FlowTab[] => {
    if (opts.collapseBy === 'bundle') {
      const b = bundleOf(i);
      return [{ tabId: b ? groupTopicId(b) : i.topicId, chainId: null }];
    }
    if (opts.collapseBy === 'chain' && chainsOf(i).length) return chainsOf(i).map((c) => ({ tabId: groupTopicId(c), chainId: c }));
    return [{ tabId: i.topicId, chainId: null }];
  };

  // 3. Selection filter.
  const filterSystems = opts.filterSystems.filter((id) => id !== CENTRE_ID && activeSystems.has(id));
  const centreSelected = opts.filterSystems.includes(CENTRE_ID);
  const filterTopics = opts.filterTopics.filter((id) => (id.startsWith('grp:') ? groupById.has(id.slice(4)) : topicById.has(id)));
  let visible: Interaction[] = active;
  let visibleSystems = activeSystems;
  let filtered = false;

  if (!centreSelected && filterTopics.length) {
    filtered = true;
    const wanted = new Set(filterTopics);
    const matches = (i: Interaction) => {
      const b = bundleOf(i);
      return wanted.has(i.topicId) || (!!b && wanted.has(groupTopicId(b))) || chainsOf(i).some((c) => wanted.has(groupTopicId(c)));
    };
    visible = active.filter(matches);
    visibleSystems = withAncestors(visible.map((i) => i.systemId));
  } else if (!centreSelected && filterSystems.length) {
    filtered = true;
    const topicsOf = (sid: string) => new Set(active.filter((i) => i.systemId === sid).map((i) => i.topicId));
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
    visible = active.filter((i) => related.has(i.systemId) && wanted.has(i.topicId));
    visibleSystems = withAncestors([...filterSystems, ...visible.map((i) => i.systemId)]);
  }

  const nodes = buildNodes(model, visibleSystems, visible, tabsOf);
  const visibleFlows = flowEdges(nodes);
  const edges = mergeEdges(visibleFlows);

  // 4. Stubs: flows that exist in the full picture but whose other end is filtered out.
  const stubs: ViewStub[] = [];
  if (filtered) {
    const full = buildNodes(model, activeSystems, active, tabsOf);
    const visibleKeys = new Set(visibleFlows.map((f) => f.key));
    // A visible endpoint: the node is shown and still has this flow (producer side or consumer side).
    const visibleEnd = (e: Endpoint, topicId: string, isProducer: boolean) => {
      const dir: Direction = (e.end === 'inner') === isProducer ? 'produce' : 'consume';
      return nodes[e.nodeId]?.flows.find((f) => f.topicId === topicId && f.direction === dir);
    };
    const seen = new Set<string>();
    for (const f of flowEdges(full)) {
      if (visibleKeys.has(f.key)) continue;
      const fromVis = visibleEnd(f.from, f.topicId, true);
      const toVis = visibleEnd(f.to, f.topicId, false);
      if (!!fromVis === !!toVis) continue;
      const at = fromVis ? f.from : f.to;
      const id = `stub|${endpointKey(at)}|${fromVis ? 'out' : 'in'}`;
      if (seen.has(id)) continue;
      seen.add(id);
      stubs.push({ id, at, outgoing: !!fromVis });
    }
  }

  const roots: Record<Side, string[]> = { W: [], N: [], E: [], S: [] };
  for (const s of model.systems) {
    const n = nodes[s.id];
    if (n && n.parentId === CENTRE_ID) roots[n.side].push(n.id);
  }

  // 5. Describe every tab that is drawn.
  const topics: Record<string, ViewTopic> = {};
  for (const n of Object.values(nodes)) {
    for (const f of n.flows) {
      for (const { tabId } of f.tabs) {
        let vt = topics[tabId];
        if (!vt) {
          if (tabId.startsWith('grp:')) {
            const g = groupById.get(tabId.slice(4))!;
            vt = { id: tabId, name: g.name, sourceIds: [], isGroup: true, bundleId: g.type === 'bundle' ? g.id : null };
          } else {
            const t = topicById.get(f.topicId)!;
            vt = { id: t.id, name: t.name, sourceIds: [], isGroup: false, bundleId: t.bundleId && groupById.has(t.bundleId) ? t.bundleId : null };
          }
          topics[tabId] = vt;
        }
        if (!vt.sourceIds.includes(f.topicId)) vt.sourceIds.push(f.topicId);
      }
    }
  }
  // Bundles show how many topics they hold. Chains don't: their tabs hold different endpoints on each system.
  for (const vt of Object.values(topics)) if (vt.isGroup && vt.bundleId) vt.name = `${vt.name} (${vt.sourceIds.length})`;

  return { centreName: model.centre.name, nodes, roots, topics, edges, stubs, filtered };
}
