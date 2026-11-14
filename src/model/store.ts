import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { TopicTextMode } from '../engine/layout';
import type { CollapseBy } from '../engine/view';
import { duplicateGroup, duplicateSystem, duplicateTopic, moveGroup, moveSystem, moveTopic, sortGroups, sortTopics, type MoveTarget, type SortDir } from './ops';
import { createThread, decide, pruneThreads, removeEntry, reply, setClosed, type CommentTarget, type Decision } from './comments';
import { sampleModel } from './sample';
import {
  CENTRE_ID,
  descendants,
  emptyModel,
  newId,
  normalizeModel,
  type Centre,
  type Direction,
  type Group,
  type GroupType,
  type Interaction,
  defaultSosRole,
  type Model,
  type NodeKind,
  type SosCalloutOptions,
  type SosSettings,
  type Side,
  type SystemNode,
  type Topic,
} from './types';

export type Focus =
  | { kind: 'centre' }
  | { kind: 'system'; id: string }
  | { kind: 'topic'; id: string }
  | { kind: 'group'; id: string }
  /** One topic's line from one system to another (commented from the canvas). */
  | { kind: 'flow'; topicId: string; fromId: string; toId: string }
  | null;

export interface UiState {
  focus: Focus;
  filterSystems: string[];
  filterTopics: string[];
  collapseBy: CollapseBy;
  sharedOnly: boolean;
  showStubs: boolean;
  hoverTopic: string | null;
  /** Chain shown in the broker-tube view, or null. Takes precedence over `view`. */
  chainView: string | null;
  /** Main canvas: the broker diagram or the System of System view. */
  view: 'diagram' | 'sos';
  /** Chain sequence being animated (step is 1-based), or null. */
  animation: { chainId: string; step: number; playing: boolean } | null;
  /** How topic names longer than their box are shown. */
  topicText: TopicTextMode;
  /** Left panel: folded system rows (system ids) and folded borders (`side:W`…). */
  folded: string[];
  /** The canvas legend is hidden. */
  legendHidden: boolean;
  /** Bottom dock of the canvas folded down to Fit / + / −. */
  dockCollapsed: boolean;
  /** Left panel sections (Systems, Topics, Bundles, Chains) the user has opened; all are folded by default. */
  openSections: string[];
  /** Name shown as the author of comments; commenting needs one. Kept in this browser only. */
  userName: string;
  /** The user menu (top right) is open. */
  userMenuOpen: boolean;
  /** Comment thread to scroll to and highlight in the right panel; `nonce` re-triggers it. */
  commentFocus: { threadId: string; nonce: number } | null;
  /** Side panels: width in pixels, and whether they are collapsed. */
  explorerWidth: number;
  explorerCollapsed: boolean;
  detailsWidth: number;
  detailsCollapsed: boolean;
}

const GROUP_COLORS = ['#0ea5e9', '#f97316', '#a855f7', '#22c55e', '#ef4444', '#eab308', '#14b8a6', '#ec4899'];

interface Store {
  model: Model;
  ui: UiState;
  setModel(m: Model): void;
  updateCentre(patch: Partial<Centre>): void;
  updateSosSettings(patch: Partial<Omit<SosSettings, 'callouts'>> & { callouts?: Partial<SosCalloutOptions> }): void;
  addSystem(init?: { kind?: NodeKind; side?: Side; parentId?: string | null }): string;
  updateSystem(id: string, patch: Partial<SystemNode>): void;
  deleteSystem(id: string): void;
  /** Drag & drop in the explorer: change border, parent and/or position (the canvas follows). */
  moveSystem(id: string, target: MoveTarget): void;
  duplicateSystem(id: string): void;
  duplicateTopic(id: string): void;
  duplicateGroup(id: string): void;
  /** Drag & drop of topics in the explorer. */
  moveTopic(id: string, target: { kind: 'before' | 'after'; refId: string }): void;
  sortTopics(dir: SortDir): void;
  sortGroups(type: GroupType, dir: SortDir): void;
  /** Drag & drop of bundles or chains in the explorer, within their own section. */
  moveGroup(id: string, target: { kind: 'before' | 'after'; refId: string }): void;
  addTopic(name?: string): string;
  updateTopic(id: string, patch: Partial<Topic>): void;
  deleteTopic(id: string): void;
  addInteraction(systemId: string, topicId: string, direction: Direction): void;
  updateInteraction(id: string, patch: Partial<Interaction>): void;
  deleteInteraction(id: string): void;
  addGroup(type: GroupType): string;
  updateGroup(id: string, patch: Partial<Group>): void;
  deleteGroup(id: string): void;
  /** Bundle: topic ids. Chain: interaction (endpoint) ids. */
  setGroupMembers(groupId: string, memberIds: string[]): void;
  setFocus(f: Focus): void;
  /* Comments: all need a user name, and record who did what and when. */
  addComment(target: CommentTarget, text: string): string | null;
  replyComment(threadId: string, text: string, replyTo?: string): void;
  decideComment(threadId: string, entryId: string, decision: Decision | null): void;
  closeThread(threadId: string, closed: boolean): void;
  removeThread(threadId: string): void;
  removeComment(threadId: string, entryId: string): void;
  /** Open the right panel on an entity and scroll to one of its threads. */
  showThread(threadId: string): void;
  /** Toggle an element in the filter. `additive` keeps the current filter (shift-click). */
  filterOn(kind: 'system' | 'topic', id: string, additive: boolean): void;
  clearFilter(): void;
  setUi(patch: Partial<UiState>): void;
}

const initialUi: UiState = {
  focus: null,
  filterSystems: [],
  filterTopics: [],
  collapseBy: 'none',
  sharedOnly: true,
  showStubs: true,
  hoverTopic: null,
  chainView: null,
  view: 'diagram',
  animation: null,
  topicText: 'scroll',
  folded: [],
  legendHidden: false,
  dockCollapsed: false,
  openSections: [],
  userName: '',
  userMenuOpen: false,
  commentFocus: null,
  explorerWidth: 260,
  explorerCollapsed: false,
  detailsWidth: 340,
  detailsCollapsed: false,
};

const actor = (name: string) => (name.trim() ? { by: name.trim(), at: new Date().toISOString() } : null);
const focusOf = (t: CommentTarget): Focus => (t.kind === 'centre' ? { kind: 'centre' } : t.kind === 'flow' ? { ...t } : { kind: t.kind, id: t.id });
/** Threads go with the entity they are about. */
const dropOrphanThreads = (m: Model) =>
  (m.comments = pruneThreads(m.comments, {
    system: (id) => m.systems.some((s) => s.id === id),
    topic: (id) => m.topics.some((t) => t.id === id),
    group: (id) => m.groups.some((g) => g.id === id),
  }));

/** Actions that change the diagram: they need a user name (see `canEdit`). Opening a file, the sample or a new
    diagram, the view and the SoS display options do not. Showing or hiding an element (the left panel's ● / ◌) is a view
    change and stays open to everyone. */
const EDITS = [
  'updateCentre', 'addSystem', 'updateSystem', 'deleteSystem', 'moveSystem', 'duplicateSystem', 'duplicateTopic', 'duplicateGroup',
  'moveTopic', 'sortTopics', 'sortGroups', 'moveGroup', 'addTopic', 'updateTopic', 'deleteTopic', 'addInteraction',
  'updateInteraction', 'deleteInteraction', 'addGroup', 'updateGroup', 'deleteGroup', 'setGroupMembers', 'removeThread', 'removeComment',
] as const satisfies readonly (keyof Store)[];
const HIDE_ONLY = new Set<string>(['updateSystem', 'updateTopic', 'updateGroup']);
const hideOnly = (patch: unknown) => !!patch && typeof patch === 'object' && Object.keys(patch).every((k) => k === 'hidden');

/** Whether the user may change the diagram: only once they have given their name. */
export const canEdit = (ui: Pick<UiState, 'userName'>) => !!ui.userName.trim();

function editGuard(get: () => Store, store: Store): Store {
  const guarded = { ...store } as Record<string, unknown>;
  for (const name of EDITS) {
    const fn = store[name] as (...a: unknown[]) => unknown;
    guarded[name] = (...a: unknown[]) => (canEdit(get().ui) || (HIDE_ONLY.has(name) && hideOnly(a[1])) ? fn(...a) : '');
  }
  return guarded as unknown as Store;
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export const useStore = create<Store>()(
  persist(
    immer((set, get) => editGuard(get, {
      // A first visit starts with an empty diagram; the Sample button loads the example.
      model: emptyModel(),
      ui: initialUi,

      setModel: (m) =>
        set((s) => {
          s.model = normalizeModel(m);
          // A new model resets the view, not the user's panel layout or display preferences.
          const { topicText, legendHidden, dockCollapsed, openSections, userName, explorerWidth, explorerCollapsed, detailsWidth, detailsCollapsed } = s.ui;
          s.ui = { ...initialUi, topicText, legendHidden, dockCollapsed, openSections, userName, explorerWidth, explorerCollapsed, detailsWidth, detailsCollapsed };
        }),
      updateCentre: (patch) => set((s) => void Object.assign(s.model.centre, patch)),
      updateSosSettings: ({ callouts, ...rest }) =>
        set((s) => {
          Object.assign(s.model.sos, rest);
          if (callouts) Object.assign(s.model.sos.callouts, callouts);
        }),

      addSystem: (init = {}) => {
        const id = newId(init.kind === 'etl' ? 'x' : 's');
        set((s) => {
          const parent = init.parentId ? s.model.systems.find((x) => x.id === init.parentId) : undefined;
          const count = s.model.systems.length + 1;
          s.model.systems.push({
            id,
            name: init.kind === 'etl' ? `ETL ${count}` : `SYSTEM ${count}`,
            kind: init.kind ?? 'system',
            side: parent?.side ?? init.side ?? 'W',
            parentId: parent?.id ?? null,
            description: '',
            owner: '',
            properties: [],
            hidden: false,
            sos: defaultSosRole(init.kind ?? 'system'),
            notes: '',
          });
          s.ui.focus = { kind: 'system', id };
        });
        return id;
      },
      updateSystem: (id, patch) =>
        set((s) => {
          const sys = s.model.systems.find((x) => x.id === id);
          if (!sys) return;
          if (patch.parentId && (patch.parentId === id || descendants(s.model, id).includes(patch.parentId))) return;
          Object.assign(sys, patch);
          if (patch.side) for (const d of descendants(s.model, id)) s.model.systems.find((x) => x.id === d)!.side = patch.side;
          if (patch.parentId) {
            const side = s.model.systems.find((x) => x.id === patch.parentId)?.side;
            if (side) for (const d of [id, ...descendants(s.model, id)]) s.model.systems.find((x) => x.id === d)!.side = side;
          }
        }),
      deleteSystem: (id) =>
        set((s) => {
          const sys = s.model.systems.find((x) => x.id === id);
          if (!sys) return;
          for (const c of s.model.systems) if (c.parentId === id) c.parentId = sys.parentId;
          s.model.systems = s.model.systems.filter((x) => x.id !== id);
          s.model.interactions = s.model.interactions.filter((i) => i.systemId !== id);
          s.ui.filterSystems = s.ui.filterSystems.filter((x) => x !== id);
          s.ui.focus = null;
          dropOrphanThreads(s.model);
        }),

      moveSystem: (id, target) => set((s) => void moveSystem(s.model, id, target)),
      duplicateSystem: (id) =>
        set((s) => {
          const copy = duplicateSystem(s.model, id);
          if (copy) s.ui.focus = { kind: 'system', id: copy };
        }),
      duplicateTopic: (id) =>
        set((s) => {
          const copy = duplicateTopic(s.model, id);
          if (copy) s.ui.focus = { kind: 'topic', id: copy };
        }),
      moveTopic: (id, target) => set((s) => void moveTopic(s.model, id, target)),
      sortTopics: (dir) => set((s) => void sortTopics(s.model, dir)),
      sortGroups: (type, dir) => set((s) => void sortGroups(s.model, type, dir)),
      moveGroup: (id, target) => set((s) => void moveGroup(s.model, id, target)),
      duplicateGroup: (id) =>
        set((s) => {
          const copy = duplicateGroup(s.model, id);
          if (copy) s.ui.focus = { kind: 'group', id: copy };
        }),

      addTopic: (name) => {
        const id = newId('t');
        set((s) => {
          s.model.topics.push({
            id,
            name: name ?? `TOPIC ${s.model.topics.length + 1}`,
            description: '',
            owner: '',
            format: '',
            properties: [],
            bundleId: null,
            hidden: false,
          });
        });
        return id;
      },
      updateTopic: (id, patch) => set((s) => void Object.assign(s.model.topics.find((x) => x.id === id) ?? {}, patch)),
      deleteTopic: (id) =>
        set((s) => {
          s.model.topics = s.model.topics.filter((x) => x.id !== id);
          s.model.interactions = s.model.interactions.filter((i) => i.topicId !== id);
          s.ui.filterTopics = s.ui.filterTopics.filter((x) => x !== id);
          s.ui.focus = null;
          dropOrphanThreads(s.model);
        }),

      addInteraction: (systemId, topicId, direction) =>
        set((s) => {
          const exists = s.model.interactions.some((i) => i.systemId === systemId && i.topicId === topicId && i.direction === direction);
          if (!exists) s.model.interactions.push({ id: newId('i'), systemId, topicId, direction, hidden: false, chainIds: [] });
        }),
      updateInteraction: (id, patch) => set((s) => void Object.assign(s.model.interactions.find((x) => x.id === id) ?? {}, patch)),
      deleteInteraction: (id) => set((s) => void (s.model.interactions = s.model.interactions.filter((x) => x.id !== id))),

      addGroup: (type) => {
        const id = newId(type === 'bundle' ? 'b' : 'c');
        set((s) => {
          const n = s.model.groups.length;
          s.model.groups.push({
            id,
            name: `${type === 'bundle' ? 'Bundle' : 'Chain'} ${n + 1}`,
            type,
            color: GROUP_COLORS[n % GROUP_COLORS.length],
            description: '',
            hidden: false,
            sequence: [],
          });
          s.ui.focus = { kind: 'group', id };
        });
        return id;
      },
      updateGroup: (id, patch) =>
        set((s) => {
          const g = s.model.groups.find((x) => x.id === id);
          if (!g) return;
          // The type is fixed: bundle members are topics, chain members are endpoints.
          Object.assign(g, { ...patch, type: g.type });
        }),
      deleteGroup: (id) =>
        set((s) => {
          s.model.groups = s.model.groups.filter((g) => g.id !== id);
          for (const t of s.model.topics) if (t.bundleId === id) t.bundleId = null;
          for (const i of s.model.interactions) i.chainIds = i.chainIds.filter((c) => c !== id);
          s.ui.filterTopics = s.ui.filterTopics.filter((x) => x !== `grp:${id}`);
          if (s.ui.chainView === id) s.ui.chainView = null;
          if (s.ui.animation?.chainId === id) s.ui.animation = null;
          s.ui.focus = null;
          dropOrphanThreads(s.model);
        }),
      setGroupMembers: (groupId, memberIds) =>
        set((s) => {
          const g = s.model.groups.find((x) => x.id === groupId);
          if (!g) return;
          if (g.type === 'bundle') {
            for (const t of s.model.topics) {
              if (memberIds.includes(t.id)) t.bundleId = groupId;
              else if (t.bundleId === groupId) t.bundleId = null;
            }
          } else {
            for (const i of s.model.interactions) {
              const member = i.chainIds.includes(groupId);
              if (memberIds.includes(i.id) && !member) i.chainIds.push(groupId);
              else if (!memberIds.includes(i.id) && member) i.chainIds = i.chainIds.filter((c) => c !== groupId);
            }
          }
        }),

      setFocus: (f) => set((s) => void (s.ui.focus = f)),

      addComment: (target, text) => {
        let id: string | null = null;
        set((s) => {
          const a = actor(s.ui.userName);
          if (!a || !text.trim()) return;
          id = createThread(s.model.comments, target, text.trim(), a).id;
        });
        return id;
      },
      replyComment: (threadId, text, replyTo) =>
        set((s) => {
          const a = actor(s.ui.userName);
          const t = s.model.comments.find((x) => x.id === threadId);
          if (a && t && text.trim()) reply(t, text.trim(), a, replyTo);
        }),
      decideComment: (threadId, entryId, decision) =>
        set((s) => {
          const a = actor(s.ui.userName);
          const t = s.model.comments.find((x) => x.id === threadId);
          if (a && t) decide(t, entryId, decision, a);
        }),
      closeThread: (threadId, closed) =>
        set((s) => {
          const a = actor(s.ui.userName);
          const t = s.model.comments.find((x) => x.id === threadId);
          if (a && t) setClosed(t, closed, a);
        }),
      removeThread: (threadId) => set((s) => void (s.model.comments = s.model.comments.filter((t) => t.id !== threadId))),
      removeComment: (threadId, entryId) =>
        set((s) => {
          const a = actor(s.ui.userName);
          if (a) s.model.comments = removeEntry(s.model.comments, threadId, entryId, a);
        }),
      showThread: (threadId) =>
        set((s) => {
          const t = s.model.comments.find((x) => x.id === threadId);
          if (!t) return;
          s.ui.focus = focusOf(t.target);
          s.ui.detailsCollapsed = false;
          s.ui.commentFocus = { threadId, nonce: (s.ui.commentFocus?.nonce ?? 0) + 1 };
        }),
      filterOn: (kind, id, additive) =>
        set((s) => {
          if (kind === 'system' && id === CENTRE_ID) {
            s.ui.filterSystems = [];
            s.ui.filterTopics = [];
            return;
          }
          if (kind === 'system') {
            s.ui.filterTopics = [];
            s.ui.filterSystems = additive ? toggle(s.ui.filterSystems, id) : s.ui.filterSystems.length === 1 && s.ui.filterSystems[0] === id ? [] : [id];
          } else {
            s.ui.filterSystems = [];
            s.ui.filterTopics = additive ? toggle(s.ui.filterTopics, id) : s.ui.filterTopics.length === 1 && s.ui.filterTopics[0] === id ? [] : [id];
          }
        }),
      clearFilter: () =>
        set((s) => {
          s.ui.filterSystems = [];
          s.ui.filterTopics = [];
        }),
      setUi: (patch) => set((s) => void Object.assign(s.ui, patch)),
    })),
    {
      name: 'topico',
      version: 1,
      partialize: (s) => ({ model: s.model, ui: { ...s.ui, hoverTopic: null, animation: null, userMenuOpen: false, commentFocus: null } }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Store> | undefined;
        // Settings that no longer exist are dropped.
        const { topicSort: _dropped, sketchExport: _sketch, ...ui } = (p?.ui ?? {}) as Partial<UiState> & { topicSort?: unknown; sketchExport?: unknown };
        return { ...current, model: p?.model ? normalizeModel(p.model) : current.model, ui: { ...initialUi, ...ui } };
      },
    },
  ),
);

export const resetToSample = () => useStore.getState().setModel(sampleModel());
export const resetToEmpty = () => useStore.getState().setModel(emptyModel());
