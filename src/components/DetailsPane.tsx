import { useState } from 'react';
import { useStore } from '../model/store';
import {
  SIDES,
  SIDE_LABEL,
  descendants,
  type Direction,
  type Interaction,
  type Property,
  type Side,
} from '../model/types';

/** Right panel: view and edit details of the focused element. */
export function DetailsPane() {
  const focus = useStore((s) => s.ui.focus);
  const setFocus = useStore((s) => s.setFocus);
  if (!focus) {
    return (
      <aside className="details">
        <p className="muted">Click a system, topic or the broker to see and edit its details.</p>
        <Help />
      </aside>
    );
  }
  return (
    <aside className="details">
      <button className="close" onClick={() => setFocus(null)} title="Close">×</button>
      {focus.kind === 'centre' && <CentrePane />}
      {focus.kind === 'system' && <SystemPane id={focus.id} />}
      {focus.kind === 'topic' && <TopicPane id={focus.id} />}
      {focus.kind === 'group' && <GroupPane id={focus.id} />}
    </aside>
  );
}

function Help() {
  return (
    <div className="help">
      <h4>Quick guide</h4>
      <ul>
        <li><b>Click</b> an element to edit it here.</li>
        <li><b>Double-click</b> a system or topic to focus the view on it; <b>Shift</b>+double-click adds to the focus.</li>
        <li>Double-click the broker (or "Show all") to see everything.</li>
        <li>Use the checkboxes on the left to filter, and ● / ◌ to hide or show.</li>
        <li>Hover a topic to highlight its flows. Scroll to zoom, drag to pan.</li>
      </ul>
    </div>
  );
}

function CentrePane() {
  const centre = useStore((s) => s.model.centre);
  const model = useStore((s) => s.model);
  const update = useStore((s) => s.updateCentre);
  return (
    <div>
      <h3 className="pane-kind">Central broker</h3>
      <Text label="Name" value={centre.name} onChange={(name) => update({ name })} />
      <Text label="Description" value={centre.description} onChange={(description) => update({ description })} multiline />
      <Properties value={centre.properties} onChange={(properties) => update({ properties })} />
      <p className="muted small">
        {model.systems.length} systems · {model.topics.length} topics · {model.interactions.length} interactions
      </p>
    </div>
  );
}

function SystemPane({ id }: { id: string }) {
  const model = useStore((s) => s.model);
  const st = useStore.getState;
  const sys = model.systems.find((s) => s.id === id);
  if (!sys) return <p className="muted">This system no longer exists.</p>;
  const forbidden = new Set([id, ...descendants(model, id)]);
  const parents = model.systems.filter((s) => !forbidden.has(s.id));
  const parentName = sys.parentId ? model.systems.find((s) => s.id === sys.parentId)?.name : model.centre.name;
  const mine = model.interactions.filter((i) => i.systemId === id);

  return (
    <div>
      <h3 className="pane-kind">{sys.kind === 'exe' ? 'Executable' : 'System'}</h3>
      <Text label="Name" value={sys.name} onChange={(name) => st().updateSystem(id, { name })} />
      <div className="row2">
        <Select label="Kind" value={sys.kind} options={[['system', 'System'], ['exe', 'Executable']]} onChange={(kind) => st().updateSystem(id, { kind: kind as 'system' | 'exe' })} />
        <Select
          label="Border"
          value={sys.side}
          disabled={!!sys.parentId}
          options={SIDES.map((s) => [s, SIDE_LABEL[s]])}
          onChange={(side) => st().updateSystem(id, { side: side as Side })}
        />
      </div>
      <Select
        label="Attached to"
        value={sys.parentId ?? ''}
        options={[['', `${model.centre.name} (broker)`], ...parents.map((p) => [p.id, `${p.name} (upstream of)`] as [string, string])]}
        onChange={(v) => st().updateSystem(id, { parentId: v || null })}
      />
      <Text label="Owner" value={sys.owner} onChange={(owner) => st().updateSystem(id, { owner })} />
      <Text label="Description" value={sys.description} onChange={(description) => st().updateSystem(id, { description })} multiline />
      <Properties value={sys.properties} onChange={(properties) => st().updateSystem(id, { properties })} />
      <label className="check">
        <input type="checkbox" checked={sys.hidden} onChange={(e) => st().updateSystem(id, { hidden: e.target.checked })} /> Hidden (with its upstream systems)
      </label>
      <div className="btn-row">
        <button onClick={() => st().filterOn('system', id, false)}>Focus view</button>
        <button onClick={() => st().addSystem({ kind: 'system', parentId: id })}>+ Upstream system</button>
        <button onClick={() => st().addSystem({ kind: 'exe', parentId: id })}>+ Upstream exe</button>
      </div>

      {(['produce', 'consume'] as Direction[]).map((dir) => (
        <section key={dir} className="subsection">
          <h4>
            {dir === 'produce' ? 'Produced' : 'Consumed'} topics <span className="muted">({mine.filter((i) => i.direction === dir).length})</span>
          </h4>
          <p className="muted small">{dir === 'produce' ? 'Published to' : 'Read from'} {parentName}.</p>
          {mine
            .filter((i) => i.direction === dir)
            .map((i) => (
              <InteractionTopic key={i.id} interaction={i} />
            ))}
          <AddInteraction systemId={id} direction={dir} />
        </section>
      ))}

      <button className="danger" onClick={() => confirm(`Delete ${sys.name}?`) && st().deleteSystem(id)}>Delete system</button>
    </div>
  );
}

function InteractionTopic({ interaction: i }: { interaction: Interaction }) {
  const topic = useStore((s) => s.model.topics.find((t) => t.id === i.topicId));
  const st = useStore.getState;
  if (!topic) return null;
  return (
    <details className={`topic-card${i.hidden ? ' is-hidden' : ''}`}>
      <summary>
        <span>{topic.name}</span>
        <span className="summary-actions" onClick={(e) => e.preventDefault()}>
          <label title="Hide this interaction">
            <input type="checkbox" checked={i.hidden} onChange={(e) => st().updateInteraction(i.id, { hidden: e.target.checked })} /> hide
          </label>
          <button className="link" onClick={() => st().setFocus({ kind: 'topic', id: topic.id })}>open</button>
          <button className="link danger" onClick={() => st().deleteInteraction(i.id)} title="Remove interaction">remove</button>
        </span>
      </summary>
      <TopicFields id={topic.id} />
    </details>
  );
}

function AddInteraction({ systemId, direction }: { systemId: string; direction: Direction }) {
  const topics = useStore((s) => s.model.topics);
  const st = useStore.getState;
  const [value, setValue] = useState('');
  const [newName, setNewName] = useState('');
  const add = () => {
    let topicId = value;
    if (value === '__new') {
      if (!newName.trim()) return;
      topicId = st().addTopic(newName.trim());
    }
    if (!topicId) return;
    st().addInteraction(systemId, topicId, direction);
    setValue('');
    setNewName('');
  };
  return (
    <div className="add-row">
      <select value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">{direction === 'produce' ? 'Add produced topic…' : 'Add consumed topic…'}</option>
        <option value="__new">+ New topic…</option>
        {topics.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {value === '__new' && <input placeholder="Topic name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />}
      <button onClick={add} disabled={!value}>Add</button>
    </div>
  );
}

function TopicPane({ id }: { id: string }) {
  const model = useStore((s) => s.model);
  const st = useStore.getState;
  const topic = model.topics.find((t) => t.id === id);
  const [sysId, setSysId] = useState('');
  const [dir, setDir] = useState<Direction>('consume');
  if (!topic) return <p className="muted">This topic no longer exists.</p>;
  const links = model.interactions.filter((i) => i.topicId === id);
  const sysName = (sid: string) => model.systems.find((s) => s.id === sid)?.name ?? sid;
  return (
    <div>
      <h3 className="pane-kind">Topic</h3>
      <TopicFields id={id} />
      <div className="btn-row">
        <button onClick={() => st().filterOn('topic', id, false)}>Focus view</button>
      </div>
      {(['produce', 'consume'] as Direction[]).map((d) => (
        <section key={d} className="subsection">
          <h4>{d === 'produce' ? 'Producers' : 'Consumers'}</h4>
          {links.filter((i) => i.direction === d).length === 0 && <p className="muted small">None</p>}
          {links
            .filter((i) => i.direction === d)
            .map((i) => (
              <div key={i.id} className={`link-row${i.hidden ? ' is-hidden' : ''}`}>
                <button className="link" onClick={() => st().setFocus({ kind: 'system', id: i.systemId })}>{sysName(i.systemId)}</button>
                <label title="Hide this interaction">
                  <input type="checkbox" checked={i.hidden} onChange={(e) => st().updateInteraction(i.id, { hidden: e.target.checked })} /> hide
                </label>
                <button className="link danger" onClick={() => st().deleteInteraction(i.id)}>remove</button>
              </div>
            ))}
        </section>
      ))}
      <div className="add-row">
        <select value={sysId} onChange={(e) => setSysId(e.target.value)}>
          <option value="">Add system…</option>
          {model.systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={dir} onChange={(e) => setDir(e.target.value as Direction)}>
          <option value="produce">produces</option>
          <option value="consume">consumes</option>
        </select>
        <button disabled={!sysId} onClick={() => { st().addInteraction(sysId, id, dir); setSysId(''); }}>Add</button>
      </div>
      <button className="danger" onClick={() => confirm(`Delete ${topic.name}?`) && st().deleteTopic(id)}>Delete topic</button>
    </div>
  );
}

function TopicFields({ id }: { id: string }) {
  const topic = useStore((s) => s.model.topics.find((t) => t.id === id));
  const groups = useStore((s) => s.model.groups);
  const st = useStore.getState;
  if (!topic) return null;
  const up = (patch: Parameters<ReturnType<typeof st>['updateTopic']>[1]) => st().updateTopic(id, patch);
  const opts = (type: 'bundle' | 'chain') => [['', '— none —'], ...groups.filter((g) => g.type === type).map((g) => [g.id, g.name] as [string, string])] as [string, string][];
  return (
    <div className="topic-fields">
      <Text label="Name" value={topic.name} onChange={(name) => up({ name })} />
      <div className="row2">
        <Text label="Format" value={topic.format} onChange={(format) => up({ format })} placeholder="Avro, JSON…" />
        <Text label="Owner" value={topic.owner} onChange={(owner) => up({ owner })} />
      </div>
      <div className="row2">
        <Select label="Bundle" value={topic.bundleId ?? ''} options={opts('bundle')} onChange={(v) => up({ bundleId: v || null })} />
        <Select label="Functional chain" value={topic.chainId ?? ''} options={opts('chain')} onChange={(v) => up({ chainId: v || null })} />
      </div>
      <Text label="Description" value={topic.description} onChange={(description) => up({ description })} multiline />
      <Properties value={topic.properties} onChange={(properties) => up({ properties })} />
      <label className="check">
        <input type="checkbox" checked={topic.hidden} onChange={(e) => up({ hidden: e.target.checked })} /> Hidden
      </label>
    </div>
  );
}

function GroupPane({ id }: { id: string }) {
  const model = useStore((s) => s.model);
  const st = useStore.getState;
  const g = model.groups.find((x) => x.id === id);
  if (!g) return <p className="muted">This group no longer exists.</p>;
  const key = g.type === 'bundle' ? 'bundleId' : 'chainId';
  const members = model.topics.filter((t) => t[key] === id).map((t) => t.id);
  return (
    <div>
      <h3 className="pane-kind">{g.type === 'bundle' ? 'Bundle' : 'Functional chain'}</h3>
      <Text label="Name" value={g.name} onChange={(name) => st().updateGroup(id, { name })} />
      <div className="row2">
        <Select label="Type" value={g.type} options={[['bundle', 'Bundle'], ['chain', 'Functional chain']]} onChange={(type) => st().updateGroup(id, { type: type as 'bundle' | 'chain' })} />
        <label className="field">
          <span>Colour</span>
          <input type="color" value={g.color} onChange={(e) => st().updateGroup(id, { color: e.target.value })} />
        </label>
      </div>
      <Text label="Description" value={g.description} onChange={(description) => st().updateGroup(id, { description })} multiline />
      <section className="subsection">
        <h4>Topics ({members.length})</h4>
        <div className="member-list">
          {model.topics.map((t) => (
            <label key={t.id} className="check">
              <input
                type="checkbox"
                checked={members.includes(t.id)}
                onChange={(e) => st().setGroupMembers(id, e.target.checked ? [...members, t.id] : members.filter((m) => m !== t.id))}
              />
              {t.name}
              {t[key] && t[key] !== id && <span className="muted small"> (in {model.groups.find((x) => x.id === t[key])?.name})</span>}
            </label>
          ))}
        </div>
      </section>
      <button className="danger" onClick={() => confirm(`Delete ${g.name}?`) && st().deleteGroup(id)}>Delete group</button>
    </div>
  );
}

/* ---------- small form helpers ---------- */

function Text(p: { label: string; value: string; onChange(v: string): void; multiline?: boolean; placeholder?: string }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      {p.multiline ? (
        <textarea value={p.value} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} rows={3} />
      ) : (
        <input value={p.value} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} />
      )}
    </label>
  );
}

function Select(p: { label: string; value: string; options: [string, string][]; onChange(v: string): void; disabled?: boolean }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      <select value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)}>
        {p.options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function Properties({ value, onChange }: { value: Property[]; onChange(v: Property[]): void }) {
  const set = (i: number, patch: Partial<Property>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="field">
      <span>Custom properties</span>
      {value.map((p, i) => (
        <div key={i} className="prop-row">
          <input placeholder="key" value={p.key} onChange={(e) => set(i, { key: e.target.value })} />
          <input placeholder="value" value={p.value} onChange={(e) => set(i, { value: e.target.value })} />
          <button className="link danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="link" onClick={() => onChange([...value, { key: '', value: '' }])}>+ property</button>
    </div>
  );
}
