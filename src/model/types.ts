export type Side = 'W' | 'N' | 'E' | 'S';
export const SIDES: Side[] = ['W', 'N', 'E', 'S'];
export const SIDE_LABEL: Record<Side, string> = { W: 'West', N: 'North', E: 'East', S: 'South' };

export type NodeKind = 'system' | 'exe';
/** Direction is always relative to the node's parent (the centre broker, or the upstream system it hangs off). */
export type Direction = 'produce' | 'consume';
export type GroupType = 'bundle' | 'chain';

export interface Property {
  key: string;
  value: string;
}

export interface Centre {
  id: 'centre';
  name: string;
  description: string;
  properties: Property[];
}

export interface SystemNode {
  id: string;
  name: string;
  kind: NodeKind;
  /** Border of the centre the root ancestor sits on. Nested nodes inherit their root's side. */
  side: Side;
  /** null = attached to the centre broker; otherwise the upstream parent system. */
  parentId: string | null;
  description: string;
  owner: string;
  properties: Property[];
  hidden: boolean;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  owner: string;
  format: string;
  properties: Property[];
  /** A bundle groups the whole topic, wherever it is produced or consumed. */
  bundleId: string | null;
  hidden: boolean;
}

export interface Interaction {
  id: string;
  systemId: string;
  topicId: string;
  direction: Direction;
  hidden: boolean;
  /** A functional chain groups individual endpoints (this system producing/consuming this topic), not whole topics. */
  chainId: string | null;
}

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  color: string;
  description: string;
}

export interface Model {
  version: 1;
  centre: Centre;
  systems: SystemNode[];
  topics: Topic[];
  interactions: Interaction[];
  groups: Group[];
}

export const CENTRE_ID = 'centre';

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyModel(): Model {
  return {
    version: 1,
    centre: { id: 'centre', name: 'CENTER SYS', description: '', properties: [] },
    systems: [],
    topics: [],
    interactions: [],
    groups: [],
  };
}

/** Fill in defaults so hand-written or older JSON files load safely. */
export function normalizeModel(raw: unknown): Model {
  const m = (raw ?? {}) as {
    centre?: Partial<Centre>;
    systems?: Partial<SystemNode>[];
    topics?: (Partial<Topic> & { chainId?: string | null })[];
    interactions?: Partial<Interaction>[];
    groups?: Partial<Group>[];
  };
  const base = emptyModel();
  const sysDefaults: Omit<SystemNode, 'id' | 'name'> = { kind: 'system', side: 'W', parentId: null, description: '', owner: '', properties: [], hidden: false };
  const topicDefaults: Omit<Topic, 'id' | 'name'> = { description: '', owner: '', format: '', properties: [], bundleId: null, hidden: false };
  // Older files stored the chain on the topic: move it onto each of the topic's endpoints.
  const legacyChain = new Map((m.topics ?? []).filter((t) => t.id && t.chainId).map((t) => [t.id!, t.chainId!]));
  return {
    version: 1,
    centre: { ...base.centre, ...(m.centre ?? {}), id: 'centre' },
    systems: (m.systems ?? []).map((s) => ({ ...sysDefaults, ...s }) as SystemNode),
    topics: (m.topics ?? []).map(({ chainId: _legacy, ...t }) => ({ ...topicDefaults, ...t }) as Topic),
    interactions: (m.interactions ?? []).map(
      (i) => ({ hidden: false, chainId: (i.topicId && legacyChain.get(i.topicId)) || null, ...i }) as Interaction,
    ),
    groups: (m.groups ?? []).map((g) => ({ description: '', color: '#6366f1', ...g }) as Group),
  };
}

/** Side of a node = side of its root ancestor. */
export function effectiveSide(model: Pick<Model, 'systems'>, id: string): Side {
  const byId = new Map(model.systems.map((s) => [s.id, s]));
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentId);
  }
  return cur?.side ?? 'W';
}

export function descendants(model: Pick<Model, 'systems'>, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const s of model.systems) {
      if (s.parentId === cur && !out.includes(s.id)) {
        out.push(s.id);
        stack.push(s.id);
      }
    }
  }
  return out;
}
