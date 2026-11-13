import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { groupTopicId } from '../engine/view';
import { canMoveSystem, nameOrderState, type MoveTarget, type SortDir } from '../model/ops';
import { canEdit, useStore } from '../model/store';
import { SIDES, SIDE_LABEL, SOS_ROLE_LABEL, effectiveSide, type Side, type SosRole, type SystemNode } from '../model/types';

type ItemRef = { kind: 'centre' } | { kind: 'system' | 'topic' | 'group'; id: string };

interface MenuState {
  x: number;
  y: number;
  item: ItemRef;
}

type DropHint = { side: Side } | { id: string; zone: 'before' | 'after' | 'inside' } | null;
type Dragged = { kind: 'system' | 'topic' | 'group'; id: string } | null;

/** Left panel: browse, filter (checkbox), hide (eye), add, rename, duplicate, delete and drag systems around. */
export function Explorer({ hidden }: { hidden?: boolean }) {
  const model = useStore((s) => s.model);
  const ui = useStore((s) => s.ui);
  const st = useStore.getState;
  // Without a user name the diagram is read-only: nothing can be added, moved, renamed or deleted.
  const edit = canEdit(ui);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<Dragged>(null);
  const dragId = drag?.kind === 'system' ? drag.id : null;
  const [hint, setHint] = useState<DropHint>(null);
  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const focusId = ui.focus && 'id' in ui.focus ? ui.focus.id : ui.focus?.kind;
  // In the System of System view, each system row shows its SoS role and lets the user change it.
  const sosMode = ui.view === 'sos' && !ui.chainView;

  /* ---------- folding of system rows ---------- */
  // Keys: a system id (its upstream rows are folded) or `side:<W|N|E|S>` (the whole border is folded).
  // While searching, folds are ignored so every match shows.
  const folded = new Set(ui.folded);
  const isFolded = (key: string) => !q && folded.has(key);
  const setFolded = (next: Set<string>) => st().setUi({ folded: [...next] });
  const toggleFold = (key: string) => {
    const next = new Set(folded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setFolded(next);
  };
  const childrenOf = (id: string) => model.systems.filter((c) => c.parentId === id);
  const parentsOnSide = (side: Side) => model.systems.filter((s) => effectiveSide(model, s.id) === side && childrenOf(s.id).length).map((s) => s.id);
  const foldAll = (side: Side) => setFolded(new Set([...folded, ...parentsOnSide(side)]));
  const unfoldAll = (side: Side) => setFolded(new Set([...folded].filter((k) => k !== `side:${side}` && !parentsOnSide(side).includes(k))));
  const unfold = (...keys: string[]) => setFolded(new Set([...folded].filter((k) => !keys.includes(k))));
  const countUnder = (id: string): number => childrenOf(id).reduce((n, c) => n + 1 + countUnder(c.id), 0);

  const openMenu = (item: ItemRef) => (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, item });
  };
  const itemKey = (item: ItemRef) => ('id' in item ? `${item.kind}:${item.id}` : 'centre');
  const rename = (item: ItemRef, name: string) => {
    const v = name.trim();
    setRenaming(null);
    if (!v) return;
    if (item.kind === 'centre') st().updateCentre({ name: v });
    else if (item.kind === 'system') st().updateSystem(item.id, { name: v });
    else if (item.kind === 'topic') st().updateTopic(item.id, { name: v });
    else st().updateGroup(item.id, { name: v });
  };
  const renameProps = (item: ItemRef) => ({
    editing: edit && renaming === itemKey(item),
    onStartRename: () => edit && setRenaming(itemKey(item)),
    onRename: (name: string) => rename(item, name),
    onCancelRename: () => setRenaming(null),
    onContextMenu: openMenu(item),
  });

  /* ---------- drag & drop of systems ---------- */
  const endDrag = () => {
    setDrag(null);
    setHint(null);
  };
  const tryHint = (e: DragEvent, h: Exclude<DropHint, null>, target: MoveTarget) => {
    if (!dragId || !canMoveSystem(model, dragId, target)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (JSON.stringify(h) !== JSON.stringify(hint)) setHint(h);
  };
  const drop = (e: DragEvent, target: MoveTarget) => {
    e.preventDefault();
    if (dragId) st().moveSystem(dragId, target);
    endDrag();
  };
  const zoneOf = (e: DragEvent): 'before' | 'after' | 'inside' => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const f = (e.clientY - r.top) / r.height;
    return f < 0.3 ? 'before' : f > 0.7 ? 'after' : 'inside';
  };
  const systemDnd = (s: SystemNode) => ({
    draggable: edit,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData('text/plain', s.name);
      e.dataTransfer.effectAllowed = 'move';
      setDrag({ kind: 'system', id: s.id });
    },
    onDragEnd: endDrag,
    onDragOver: (e: DragEvent) => {
      const zone = zoneOf(e);
      tryHint(e, { id: s.id, zone }, { kind: zone, refId: s.id });
    },
    onDrop: (e: DragEvent) => drop(e, { kind: zoneOf(e), refId: s.id }),
    dropZone: hint && 'id' in hint && hint.id === s.id ? hint.zone : undefined,
    dragging: dragId === s.id,
  });

  const systemRow = (s: SystemNode, depth: number): ReactNode => {
    const children = childrenOf(s.id);
    const childRows = children.map((c) => systemRow(c, depth + 1)).filter(Boolean);
    if (!match(s.name) && childRows.length === 0) return null;
    const closed = isFolded(s.id);
    return (
      <div key={s.id}>
        <Row
          depth={depth}
          label={s.name}
          badge={s.kind === 'etl' ? 'ETL' : undefined}
          checked={ui.filterSystems.includes(s.id)}
          onCheck={() => st().filterOn('system', s.id, true)}
          active={focusId === s.id}
          onClick={() => st().setFocus({ kind: 'system', id: s.id })}
          hidden={s.hidden}
          onToggleHidden={() => st().updateSystem(s.id, { hidden: !s.hidden })}
          {...renameProps({ kind: 'system', id: s.id })}
          {...systemDnd(s)}
          extra={sosMode && <SosRoleButton disabled={!edit} role={s.sos} onChange={(sos) => st().updateSystem(s.id, { sos })} />}
          fold={children.length ? { open: !closed, onToggle: () => toggleFold(s.id), hiddenCount: countUnder(s.id) } : null}
        />
        {!closed && childRows}
      </div>
    );
  };

  // Topics: before/after only (no nesting).
  const topicDnd = (id: string) => {
    const half = (e: DragEvent): 'before' | 'after' => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      return e.clientY - r.top < r.height / 2 ? 'before' : 'after';
    };
    return {
      draggable: edit,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        setDrag({ kind: 'topic', id });
      },
      onDragEnd: endDrag,
      onDragOver: (e: DragEvent) => {
        if (drag?.kind !== 'topic' || drag.id === id) return;
        e.preventDefault();
        const h = { id, zone: half(e) };
        if (JSON.stringify(h) !== JSON.stringify(hint)) setHint(h);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (drag?.kind === 'topic') st().moveTopic(drag.id, { kind: half(e), refId: id });
        endDrag();
      },
      dropZone: hint && 'id' in hint && hint.id === id && drag?.kind === 'topic' ? hint.zone : undefined,
      dragging: drag?.kind === 'topic' && drag.id === id,
    };
  };

  const groupsOf = (type: 'bundle' | 'chain') => model.groups.filter((g) => g.type === type);

  // Bundles and chains: before/after another group of the same kind.
  const groupDnd = (id: string, type: 'bundle' | 'chain') => {
    const half = (e: DragEvent): 'before' | 'after' => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      return e.clientY - r.top < r.height / 2 ? 'before' : 'after';
    };
    const sameKind = () => drag?.kind === 'group' && drag.id !== id && model.groups.find((g) => g.id === drag.id)?.type === type;
    return {
      draggable: edit,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        setDrag({ kind: 'group', id });
      },
      onDragEnd: endDrag,
      onDragOver: (e: DragEvent) => {
        if (!sameKind()) return;
        e.preventDefault();
        const h = { id, zone: half(e) };
        if (JSON.stringify(h) !== JSON.stringify(hint)) setHint(h);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (sameKind()) st().moveGroup(drag!.id, { kind: half(e), refId: id });
        endDrag();
      },
      dropZone: hint && 'id' in hint && hint.id === id && drag?.kind === 'group' ? hint.zone : undefined,
      dragging: drag?.kind === 'group' && drag.id === id,
    };
  };

  return (
    <aside className="explorer" hidden={hidden}>
      <input className="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!edit && <ReadOnlyNote />}

      <Section
        searching={!!q}
        title="Systems"
        actions={
          edit && (
            <>
              <button onClick={() => st().addSystem({ kind: 'system' })}>+ System</button>
              <button onClick={() => st().addSystem({ kind: 'etl' })}>+ ETL</button>
            </>
          )
        }
      >
        <Row
          depth={0}
          label={model.centre.name}
          badge="broker"
          active={focusId === 'centre'}
          onClick={() => {
            st().setFocus({ kind: 'centre' });
            st().clearFilter();
          }}
          {...renameProps({ kind: 'centre' })}
          extra={
            sosMode && (
              <SosRoleButton disabled={!edit} role={model.centre.sos} allowOuter={false} onChange={(sos) => st().updateCentre({ sos: sos as 'inner' | 'none' })} />
            )
          }
        />
        {SIDES.map((side) => {
          const roots = model.systems.filter(
            (s) => effectiveSide(model, s.id) === side && (!s.parentId || !model.systems.some((p) => p.id === s.parentId)),
          );
          const rows = roots.map((s) => systemRow(s, 1)).filter(Boolean);
          const isHint = !!hint && 'side' in hint && hint.side === side;
          const sideKey = `side:${side}`;
          const closed = isFolded(sideKey);
          const parents = parentsOnSide(side);
          const count = model.systems.filter((s) => effectiveSide(model, s.id) === side).length;
          return (
            <div key={side}>
              <div
                className={`side-label${isHint ? ' drop-inside' : ''}${dragId ? ' droppable' : ''}`}
                onDragOver={(e) => tryHint(e, { side }, { kind: 'side', side })}
                onDrop={(e) => drop(e, { kind: 'side', side })}
                title="Drop a system here to move it to this border"
              >
                <button className="side-toggle" onClick={() => toggleFold(sideKey)} aria-expanded={!closed} title={closed ? `Show the ${SIDE_LABEL[side]} systems` : `Fold the ${SIDE_LABEL[side]} border`}>
                  <span className="chevron">{closed ? '▸' : '▾'}</span>
                  {SIDE_LABEL[side]}
                  {closed && count > 0 && <span className="fold-count">{count}</span>}
                </button>
                <span className="side-actions">
                  {edit && (
                    <button
                      onClick={() => {
                        unfold(sideKey);
                        st().addSystem({ kind: 'system', side });
                      }}
                      title={`Add a system on the ${SIDE_LABEL[side]} border`}
                    >
                      +
                    </button>
                  )}
                  <button onClick={() => foldAll(side)} disabled={!parents.length || parents.every((id) => folded.has(id))} title="Fold all: show only the systems on the broker">
                    ⊟
                  </button>
                  <button onClick={() => unfoldAll(side)} disabled={!closed && parents.every((id) => !folded.has(id))} title="Unfold all: show every upstream system">
                    ⊞
                  </button>
                </span>
              </div>
              {!closed && (rows.length ? rows : <div className="side-empty">{dragId ? 'Drop here' : 'No systems'}</div>)}
            </div>
          );
        })}
      </Section>

      <Section
        searching={!!q}
        title="Topics"
        actions={
          edit && (
            <>
              <button onClick={() => st().setFocus({ kind: 'topic', id: st().addTopic() })}>+ Topic</button>
              <SortButton items={model.topics} what="topics" onSort={(dir) => st().sortTopics(dir)} />
            </>
          )
        }
      >
        {model.topics
          .filter((t) => match(t.name))
          .map((t) => (
            <Row
              key={t.id}
              depth={0}
              label={t.name}
              color={model.groups.find((g) => g.id === t.bundleId)?.color}
              checked={ui.filterTopics.includes(t.id)}
              onCheck={() => st().filterOn('topic', t.id, true)}
              active={focusId === t.id}
              onClick={() => st().setFocus({ kind: 'topic', id: t.id })}
              hidden={t.hidden}
              onToggleHidden={() => st().updateTopic(t.id, { hidden: !t.hidden })}
              {...renameProps({ kind: 'topic', id: t.id })}
              {...topicDnd(t.id)}
            />
          ))}
      </Section>

      {(['bundle', 'chain'] as const).map((type) => (
        <Section
        searching={!!q}
          key={type}
          title={type === 'bundle' ? 'Bundles' : 'Chains'}
          actions={
            edit && (
              <>
                <button onClick={() => st().addGroup(type)}>+ {type === 'bundle' ? 'Bundle' : 'Chain'}</button>
                <SortButton items={groupsOf(type)} what={type === 'bundle' ? 'bundles' : 'chains'} onSort={(dir) => st().sortGroups(type, dir)} />
              </>
            )
          }
        >
          {groupsOf(type)
            .filter((g) => match(g.name))
            .map((g) => {
              // Bundles group whole topics; chains group individual endpoints (system × topic × direction).
              const count =
                type === 'bundle'
                  ? `${model.topics.filter((t) => t.bundleId === g.id).length} topics`
                  : `${model.interactions.filter((i) => i.chainIds.includes(g.id)).length} endpoints`;
              const filterId = groupTopicId(g.id);
              const viewing = ui.chainView === g.id;
              return (
                <Row
                  key={g.id}
                  extra={
                    type === 'chain' && (
                      <>
                      <button
                        className={`view-btn${ui.animation?.chainId === g.id ? ' on' : ''}`}
                        disabled={!g.sequence.length}
                        onClick={() =>
                          st().setUi(
                            ui.animation?.chainId === g.id
                              ? { animation: null }
                              : { animation: { chainId: g.id, step: 1, playing: true }, view: 'diagram' },
                          )
                        }
                        title={g.sequence.length ? (ui.animation?.chainId === g.id ? 'Stop the animation' : 'Animate the sequence') : 'Define a sequence in the chain pane first'}
                      >
                        {ui.animation?.chainId === g.id ? '■' : '▶'}
                      </button>
                      <button
                        className={`view-btn${viewing ? ' on' : ''}`}
                        onClick={() => st().setUi({ chainView: viewing ? null : g.id, view: 'diagram' })}
                        title={viewing ? 'Back to the Topics view' : 'Show this chain as a broker tube'}
                        aria-pressed={viewing}
                      >
                        {viewing ? 'Viewing' : 'View'}
                      </button>
                      </>
                    )
                  }
                  depth={0}
                  label={g.name}
                  badge={count}
                  color={g.color}
                  active={focusId === g.id}
                  onClick={() => st().setFocus({ kind: 'group', id: g.id })}
                  checked={ui.filterTopics.includes(filterId)}
                  onCheck={() => st().filterOn('topic', filterId, true)}
                  hidden={g.hidden}
                  onToggleHidden={() => st().updateGroup(g.id, { hidden: !g.hidden })}
                  {...renameProps({ kind: 'group', id: g.id })}
                  {...groupDnd(g.id, type)}
                />
              );
            })}
        </Section>
      ))}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} onRename={() => setRenaming(itemKey(menu.item))} onAddUnder={(id) => unfold(id)} />}
    </aside>
  );
}

function ContextMenu({ menu, onClose, onRename, onAddUnder }: { menu: MenuState; onClose(): void; onRename(): void; onAddUnder(id: string): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useStore.getState;
  const model = useStore((s) => s.model);
  const edit = useStore((s) => canEdit(s.ui));
  const setUi = useStore((s) => s.setUi);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);

  const { item } = menu;
  const name =
    item.kind === 'centre'
      ? model.centre.name
      : item.kind === 'system'
        ? model.systems.find((s) => s.id === item.id)?.name
        : item.kind === 'topic'
          ? model.topics.find((t) => t.id === item.id)?.name
          : model.groups.find((g) => g.id === item.id)?.name;

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const duplicate = () => {
    if (item.kind === 'system') st().duplicateSystem(item.id);
    else if (item.kind === 'topic') st().duplicateTopic(item.id);
    else if (item.kind === 'group') st().duplicateGroup(item.id);
  };
  const remove = () => {
    if (item.kind === 'centre') return;
    const extra =
      item.kind === 'system'
        ? '\nIts produced/consumed topics are removed from it, and its upstream systems are re-attached to its parent.'
        : item.kind === 'topic'
          ? '\nAll its producers and consumers are removed.'
          : '\nIts members are kept but no longer grouped.';
    if (!confirm(`Delete "${name}"?${extra}`)) return;
    if (item.kind === 'system') st().deleteSystem(item.id);
    else if (item.kind === 'topic') st().deleteTopic(item.id);
    else st().deleteGroup(item.id);
  };
  const isCentre = item.kind === 'centre';
  // New systems and ETLs go upstream of the clicked system, or on the broker for the broker row.
  const addUnder = (kind: 'system' | 'etl') => {
    if (item.kind === 'system') {
      onAddUnder(item.id);
      st().addSystem({ kind, parentId: item.id });
    } else st().addSystem({ kind });
  };
  const canAdd = item.kind === 'system' || isCentre;
  const sosRole: SosRole | null =
    item.kind === 'centre' ? model.centre.sos : item.kind === 'system' ? (model.systems.find((s) => s.id === item.id)?.sos ?? null) : null;
  const setRole = (sos: SosRole) => {
    if (item.kind === 'centre') st().updateCentre({ sos: sos as 'inner' | 'none' });
    else if (item.kind === 'system') st().updateSystem(item.id, { sos });
  };

  // Keep the menu inside the window.
  const x = Math.min(menu.x, window.innerWidth - 190);
  const y = Math.max(8, Math.min(menu.y, window.innerHeight - (canAdd ? 330 : 150)));
  return (
    <div className="context-menu" ref={ref} style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      <div className="cm-title">{name}</div>
      {!edit && (
        <button className="cm-note" onClick={run(() => setUi({ userMenuOpen: true }))}>
          Read-only: set your name to edit
        </button>
      )}
      <fieldset className="lock" disabled={!edit}>
      <button onClick={run(onRename)}>Rename<span className="cm-hint">double-click</span></button>
      <button onClick={run(duplicate)} disabled={isCentre} title={isCentre ? 'There is only one broker' : undefined}>Duplicate</button>
      <button className="danger" onClick={run(remove)} disabled={isCentre} title={isCentre ? 'The broker cannot be deleted' : undefined}>Delete</button>
      {canAdd && (
        <>
          <div className="cm-title">{isCentre ? 'Add on the broker' : 'Add upstream'}</div>
          <button onClick={run(() => addUnder('system'))}>+ System</button>
          <button onClick={run(() => addUnder('etl'))}>+ ETL</button>
        </>
      )}
      {sosRole && (
        <>
          <div className="cm-title">System of System</div>
          {(['inner', 'outer', 'none'] as SosRole[])
            .filter((r) => !(isCentre && r === 'outer'))
            .map((r) => (
              <button key={r} onClick={run(() => setRole(r))}>
                {SOS_ROLE_LABEL[r]}
                <span className="cm-hint">{sosRole === r ? '✓' : ''}</span>
              </button>
            ))}
        </>
      )}
      </fieldset>
    </div>
  );
}

/** Shows whether a list is A–Z (↑), Z–A (↓) or in a custom order (↕); click to sort. */
function SortButton({ items, what, onSort }: { items: { name: string }[]; what: string; onSort(dir: SortDir): void }) {
  const state = nameOrderState(items);
  const next = state === 'asc' ? 'desc' : 'asc';
  const label = state === 'asc' ? '↑' : state === 'desc' ? '↓' : '↕';
  const now = state === 'asc' ? 'Sorted A–Z' : state === 'desc' ? 'Sorted Z–A' : `Custom order`;
  return (
    <button
      className={`sort-btn${state ? ' on' : ''}`}
      onClick={() => onSort(next)}
      title={`${now}. Click to sort the ${what} ${next === 'asc' ? 'A–Z' : 'Z–A'}.`}
      aria-label={`Sort the ${what} ${next === 'asc' ? 'A to Z' : 'Z to A'}`}
    >
      {label}
    </button>
  );
}

const ROLE_SHORT: Record<SosRole, string> = { inner: 'Inner', outer: 'Outer', none: '—' };

/** Cycles a system's SoS role: Inner → Outer → Not shown (the broker: Inner ↔ Not shown). */
function SosRoleButton({ role, onChange, allowOuter = true, disabled }: { role: SosRole; onChange(r: SosRole): void; allowOuter?: boolean; disabled?: boolean }) {
  const order: SosRole[] = allowOuter ? ['inner', 'outer', 'none'] : ['inner', 'none'];
  const next = order[(order.indexOf(role) + 1) % order.length];
  return (
    <button
      className={`sos-role sos-${role}`}
      disabled={disabled}
      onClick={() => onChange(next)}
      title={disabled ? `System of System: ${SOS_ROLE_LABEL[role]}.` : `System of System: ${SOS_ROLE_LABEL[role]}. Click for ${SOS_ROLE_LABEL[next]}.`}
    >
      {ROLE_SHORT[role]}
    </button>
  );
}

/** Shown at the top of a panel while the diagram is read-only (no user name yet). */
export function ReadOnlyNote() {
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="readonly-note">
      Read-only.{' '}
      <button className="link" onClick={() => setUi({ userMenuOpen: true })}>
        Set your name
      </button>{' '}
      to edit.
    </div>
  );
}

/** A left panel section: folded by default; the ones the user opens are remembered. While searching, all are open. */
function Section(p: { title: string; actions?: ReactNode; children: ReactNode; searching?: boolean }) {
  const openSections = useStore((s) => s.ui.openSections);
  const setUi = useStore((s) => s.setUi);
  const open = p.searching || openSections.includes(p.title);
  const setOpen = (v: boolean) => setUi({ openSections: v ? [...openSections, p.title] : openSections.filter((t) => t !== p.title) });
  return (
    <section className="ex-section">
      <header>
        <button className="ex-title" onClick={() => setOpen(!open)} disabled={p.searching} aria-expanded={open}>
          {open ? '▾' : '▸'} {p.title}
        </button>
        <span className="ex-actions">{p.actions}</span>
      </header>
      {open && <div className="ex-body">{p.children}</div>}
    </section>
  );
}

function Row(p: {
  depth: number;
  label: string;
  badge?: string;
  color?: string;
  checked?: boolean;
  onCheck?: () => void;
  active?: boolean;
  onClick: () => void;
  hidden?: boolean;
  onToggleHidden?: () => void;
  /** Extra control shown before the visibility toggle (e.g. chain view). */
  extra?: ReactNode;
  editing: boolean;
  onStartRename(): void;
  onRename(name: string): void;
  onCancelRename(): void;
  onContextMenu(e: MouseEvent): void;
  draggable?: boolean;
  dragging?: boolean;
  dropZone?: 'before' | 'after' | 'inside';
  onDragStart?(e: DragEvent): void;
  onDragEnd?(): void;
  onDragOver?(e: DragEvent): void;
  onDrop?(e: DragEvent): void;
  /** Tree rows: chevron to fold the upstream rows (null = a leaf, which keeps the space for alignment). */
  fold?: { open: boolean; onToggle(): void; hiddenCount: number } | null;
}) {
  const cls = ['ex-row', p.active && 'active', p.hidden && 'is-hidden', p.dragging && 'dragging', p.dropZone && `drop-${p.dropZone}`]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={cls}
      style={{ paddingLeft: 6 + p.depth * 14 }}
      onContextMenu={p.onContextMenu}
      draggable={p.draggable && !p.editing}
      onDragStart={p.onDragStart}
      onDragEnd={p.onDragEnd}
      onDragOver={p.onDragOver}
      onDrop={p.onDrop}
    >
      {p.fold !== undefined &&
        (p.fold ? (
          <button className="fold" onClick={p.fold.onToggle} aria-expanded={p.fold.open} title={p.fold.open ? 'Fold its upstream systems' : 'Show its upstream systems'}>
            {p.fold.open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="fold-spacer" />
        ))}
      {p.draggable && <span className="grip" title="Drag to move">⋮⋮</span>}
      {p.onCheck ? (
        <input type="checkbox" checked={!!p.checked} onChange={p.onCheck} title="Focus the view on this (filter)" />
      ) : (
        <span className="cb-spacer" />
      )}
      {p.color && <span className="dot" style={{ background: p.color }} />}
      {p.editing ? (
        <RenameInput value={p.label} onCommit={p.onRename} onCancel={p.onCancelRename} />
      ) : (
        <button className="ex-label" onClick={p.onClick} onDoubleClick={p.onStartRename} title={`${p.label} — double-click to rename, right-click for more`}>
          {p.label}
        </button>
      )}
      {p.fold && !p.fold.open && <span className="fold-count" title={`${p.fold.hiddenCount} upstream systems folded`}>{p.fold.hiddenCount}</span>}
      {p.badge && <span className="badge">{p.badge}</span>}
      {p.extra}
      {p.onToggleHidden && (
        <button className="eye" onClick={p.onToggleHidden} title={p.hidden ? 'Show' : 'Hide'}>
          {p.hidden ? '◌' : '●'}
        </button>
      )}
    </div>
  );
}

function RenameInput({ value, onCommit, onCancel }: { value: string; onCommit(v: string): void; onCancel(): void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  return (
    <input
      className="rename-input"
      autoFocus
      value={v}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          done.current = true;
          onCommit(v);
        } else if (e.key === 'Escape') {
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!done.current) onCommit(v);
      }}
    />
  );
}
