import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { CollapseBy } from '../engine/view';
import { duplicateGroup, duplicateSystem, duplicateTopic, moveSystem, moveTopic, sortTopics, type MoveTarget, type SortDir } from './ops';
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
  type Model,
  type NodeKind,
  type Side,
  type SystemNode,
  type Topic,
} from './types';

export type Focus =
  | { kind: 'centre' }
  | { kind: 'system'; id: string }
  | { kind: 'topic'; id: string }
  | { kind: 'group'; id: string }
  | null;

export interface UiState {
  focus: Focus;
  filterSystems: string[];
  filterTopics: string[];
  collapseBy: CollapseBy;
  sharedOnly: boolean;
  showStubs: boolean;
  sketchExport: boolean;
  hoverTopic: string | null;
}

const GROUP_COLORS = ['#0ea5e9', '#f97316', '#a855f7', '#22c55e', '#ef4444', '#eab308', '#14b8a6', '#ec4899'];

interface Store {
  model: Model;
  ui: UiState;
  setModel(m: Model): void;
  updateCentre(patch: Partial<Centre>): void;
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
  sketchExport: false,
  hoverTopic: null,
};

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export const useStore = create<Store>()(
  persist(
    immer((set) => ({
      model: sampleModel(),
      ui: initialUi,

      setModel: (m) =>
        set((s) => {
          s.model = normalizeModel(m);
          s.ui = { ...initialUi, sketchExport: s.ui.sketchExport };
        }),
      updateCentre: (patch) => set((s) => void Object.assign(s.model.centre, patch)),

      addSystem: (init = {}) => {
        const id = newId(init.kind === 'exe' ? 'x' : 's');
        set((s) => {
          const parent = init.parentId ? s.model.systems.find((x) => x.id === init.parentId) : undefined;
          const count = s.model.systems.length + 1;
          s.model.systems.push({
            id,
            name: init.kind === 'exe' ? `EXE ${count}` : `SYSTEM ${count}`,
            kind: init.kind ?? 'system',
            side: parent?.side ?? init.side ?? 'W',
            parentId: parent?.id ?? null,
            description: '',
            owner: '',
            properties: [],
            hidden: false,
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
          s.ui.focus = null;
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
      partialize: (s) => ({ model: s.model, ui: { ...s.ui, hoverTopic: null } }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Store> | undefined;
        const { topicSort: _dropped, ...ui } = (p?.ui ?? {}) as Partial<UiState> & { topicSort?: unknown };
        return { ...current, model: p?.model ? normalizeModel(p.model) : current.model, ui: { ...initialUi, ...ui } };
      },
    },
  ),
);

export const resetToSample = () => useStore.getState().setModel(sampleModel());
export const resetToEmpty = () => useStore.getState().setModel(emptyModel());
