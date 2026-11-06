import { useState } from 'react';
import { useStore } from '../model/store';
import { SIDES, SIDE_LABEL, effectiveSide, type SystemNode } from '../model/types';
import { groupTopicId } from '../engine/view';

/** Left panel: browse, filter (checkbox), hide (eye) and add elements. */
export function Explorer() {
  const model = useStore((s) => s.model);
  const ui = useStore((s) => s.ui);
  const st = useStore.getState;
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);

  const focusId = ui.focus && 'id' in ui.focus ? ui.focus.id : ui.focus?.kind;

  const systemRow = (s: SystemNode, depth: number): React.ReactNode => {
    const children = model.systems.filter((c) => c.parentId === s.id);
    const childRows = children.map((c) => systemRow(c, depth + 1)).filter(Boolean);
    if (!match(s.name) && childRows.length === 0) return null;
    return (
      <div key={s.id}>
        <Row
          depth={depth}
          label={s.name}
          badge={s.kind === 'exe' ? 'exe' : undefined}
          checked={ui.filterSystems.includes(s.id)}
          onCheck={() => st().filterOn('system', s.id, true)}
          active={focusId === s.id}
          onClick={() => st().setFocus({ kind: 'system', id: s.id })}
          hidden={s.hidden}
          onToggleHidden={() => st().updateSystem(s.id, { hidden: !s.hidden })}
        />
        {childRows}
      </div>
    );
  };

  const groupsOf = (type: 'bundle' | 'chain') => model.groups.filter((g) => g.type === type);

  return (
    <aside className="explorer">
      <input className="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <Section
        title="Systems"
        actions={
          <>
            <button onClick={() => st().addSystem({ kind: 'system' })}>+ System</button>
            <button onClick={() => st().addSystem({ kind: 'exe' })}>+ Exe</button>
          </>
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
        />
        {SIDES.map((side) => {
          const roots = model.systems.filter(
            (s) => effectiveSide(model, s.id) === side && (!s.parentId || !model.systems.some((p) => p.id === s.parentId)),
          );
          const rows = roots.map((s) => systemRow(s, 1)).filter(Boolean);
          if (!rows.length) return null;
          return (
            <div key={side}>
              <div className="side-label">{SIDE_LABEL[side]}</div>
              {rows}
            </div>
          );
        })}
      </Section>

      <Section title="Topics" actions={<button onClick={() => st().setFocus({ kind: 'topic', id: st().addTopic() })}>+ Topic</button>}>
        {model.topics
          .filter((t) => match(t.name))
          .map((t) => (
            <Row
              key={t.id}
              depth={0}
              label={t.name}
              color={model.groups.find((g) => g.id === t.chainId)?.color}
              checked={ui.filterTopics.includes(t.id)}
              onCheck={() => st().filterOn('topic', t.id, true)}
              active={focusId === t.id}
              onClick={() => st().setFocus({ kind: 'topic', id: t.id })}
              hidden={t.hidden}
              onToggleHidden={() => st().updateTopic(t.id, { hidden: !t.hidden })}
            />
          ))}
      </Section>

      {(['bundle', 'chain'] as const).map((type) => (
        <Section
          key={type}
          title={type === 'bundle' ? 'Bundles' : 'Functional chains'}
          actions={<button onClick={() => st().addGroup(type)}>+ {type === 'bundle' ? 'Bundle' : 'Chain'}</button>}
        >
          {groupsOf(type).map((g) => {
            const members = model.topics.filter((t) => (type === 'bundle' ? t.bundleId : t.chainId) === g.id);
            const collapsedId = groupTopicId(g.id);
            return (
              <Row
                key={g.id}
                depth={0}
                label={`${g.name} (${members.length})`}
                color={g.color}
                active={focusId === g.id}
                onClick={() => st().setFocus({ kind: 'group', id: g.id })}
                checked={
                  ui.collapseBy === type
                    ? ui.filterTopics.includes(collapsedId)
                    : members.length > 0 && members.every((m) => ui.filterTopics.includes(m.id))
                }
                onCheck={() => {
                  if (ui.collapseBy === type) return st().filterOn('topic', collapsedId, true);
                  const ids = members.map((m) => m.id);
                  const all = ids.every((id) => ui.filterTopics.includes(id));
                  st().setUi({
                    filterSystems: [],
                    filterTopics: all ? ui.filterTopics.filter((id) => !ids.includes(id)) : [...new Set([...ui.filterTopics, ...ids])],
                  });
                }}
              />
            );
          })}
        </Section>
      ))}
    </aside>
  );
}

function Section(p: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="ex-section">
      <header>
        <button className="ex-title" onClick={() => setOpen(!open)}>
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
}) {
  return (
    <div className={`ex-row${p.active ? ' active' : ''}${p.hidden ? ' is-hidden' : ''}`} style={{ paddingLeft: 6 + p.depth * 14 }}>
      {p.onCheck ? (
        <input type="checkbox" checked={!!p.checked} onChange={p.onCheck} title="Focus the view on this (filter)" />
      ) : (
        <span className="cb-spacer" />
      )}
      {p.color && <span className="dot" style={{ background: p.color }} />}
      <button className="ex-label" onClick={p.onClick} title={p.label}>
        {p.label}
      </button>
      {p.badge && <span className="badge">{p.badge}</span>}
      {p.onToggleHidden && (
        <button className="eye" onClick={p.onToggleHidden} title={p.hidden ? 'Show' : 'Hide'}>
          {p.hidden ? '◌' : '●'}
        </button>
      )}
    </div>
  );
}
