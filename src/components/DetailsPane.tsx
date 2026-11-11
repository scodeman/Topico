import { useState } from 'react';
import { autoSequence, chainLinks, chainSequence, linkLabel } from '../model/chainLinks';
import { useStore } from '../model/store';
import {
  SIDES,
  SIDE_LABEL,
  descendants,
  type Direction,
  type Interaction,
  type Property,
  type Side,
  type SosRole,
} from '../model/types';

/** Right panel: view and edit details of the focused element. */
export function DetailsPane({ hidden }: { hidden?: boolean }) {
  const focus = useStore((s) => s.ui.focus);
  const setFocus = useStore((s) => s.setFocus);
  if (!focus) {
    return (
      <aside className="details" hidden={hidden}>
        <p className="muted">Click a system, topic or the broker to see and edit its details.</p>
        <Help />
      </aside>
    );
  }
  return (
    <aside className="details" hidden={hidden}>
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
      <Select
        label="System of System view"
        value={centre.sos}
        options={[
          ['inner', 'Inner (inside the SoS box)'],
          ['none', 'Not shown'],
        ]}
        onChange={(v) => update({ sos: v as 'inner' | 'none' })}
      />
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
      <h3 className="pane-kind">{sys.kind === 'etl' ? 'ETL' : 'System'}</h3>
      <Text label="Name" value={sys.name} onChange={(name) => st().updateSystem(id, { name })} />
      <div className="row2">
        <Select label="Kind" value={sys.kind} options={[['system', 'System'], ['etl', 'ETL']]} onChange={(kind) => st().updateSystem(id, { kind: kind as 'system' | 'etl' })} />
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
      <Select
        label="System of System view"
        value={sys.sos}
        options={[
          ['inner', 'Inner (inside the SoS box)'],
          ['outer', 'Outer (around the SoS box)'],
          ['none', 'Not shown'],
        ]}
        onChange={(v) => st().updateSystem(id, { sos: v as SosRole })}
      />
      <Text label="Notes (shown in SoS callouts)" value={sys.notes} onChange={(notes) => st().updateSystem(id, { notes })} multiline />
      <Text label="Description" value={sys.description} onChange={(description) => st().updateSystem(id, { description })} multiline />
      <Properties value={sys.properties} onChange={(properties) => st().updateSystem(id, { properties })} />
      <label className="check">
        <input type="checkbox" checked={sys.hidden} onChange={(e) => st().updateSystem(id, { hidden: e.target.checked })} /> Hidden (with its upstream systems)
      </label>
      <div className="btn-row">
        <button onClick={() => st().filterOn('system', id, false)}>Focus view</button>
        <button onClick={() => st().addSystem({ kind: 'system', parentId: id })}>+ Upstream system</button>
        <button onClick={() => st().addSystem({ kind: 'etl', parentId: id })}>+ Upstream ETL</button>
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
        <span>
          {topic.name}
          <ChainDots chainIds={i.chainIds} />
        </span>
        <span className="summary-actions" onClick={(e) => e.preventDefault()}>
          <label title="Hide this interaction">
            <input type="checkbox" checked={i.hidden} onChange={(e) => st().updateInteraction(i.id, { hidden: e.target.checked })} /> hide
          </label>
          <button className="link" onClick={() => st().setFocus({ kind: 'topic', id: topic.id })}>open</button>
          <button className="link danger" onClick={() => st().deleteInteraction(i.id)} title="Remove interaction">remove</button>
        </span>
      </summary>
      <div className="endpoint-fields">
        <ChainPicker interaction={i} label="Chains (this endpoint)" />
      </div>
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
                <ChainPicker interaction={i} compact />
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
  const bundles: [string, string][] = [['', '— none —'], ...groups.filter((g) => g.type === 'bundle').map((g) => [g.id, g.name] as [string, string])];
  return (
    <div className="topic-fields">
      <Text label="Name" value={topic.name} onChange={(name) => up({ name })} />
      <div className="row2">
        <Text label="Format" value={topic.format} onChange={(format) => up({ format })} placeholder="Avro, JSON…" />
        <Text label="Owner" value={topic.owner} onChange={(owner) => up({ owner })} />
      </div>
      <Select label="Bundle (whole topic)" value={topic.bundleId ?? ''} options={bundles} onChange={(v) => up({ bundleId: v || null })} />
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
  const isBundle = g.type === 'bundle';
  return (
    <div>
      <h3 className="pane-kind">{isBundle ? 'Bundle' : 'Chain'}</h3>
      <p className="muted small">
        {isBundle
          ? 'A bundle groups whole topics, wherever they are produced or consumed.'
          : 'A chain groups individual endpoints: pick which systems producing or consuming a topic take part in it.'}
      </p>
      <div className="row2">
        <Text label="Name" value={g.name} onChange={(name) => st().updateGroup(id, { name })} />
        <label className="field">
          <span>Colour</span>
          <input type="color" value={g.color} onChange={(e) => st().updateGroup(id, { color: e.target.value })} />
        </label>
      </div>
      <Text label="Description" value={g.description} onChange={(description) => st().updateGroup(id, { description })} multiline />
      <label className="check">
        <input type="checkbox" checked={g.hidden} onChange={(e) => st().updateGroup(id, { hidden: e.target.checked })} />
        Hide colouring ({isBundle ? 'no outline around its topics' : 'its endpoints and arrows go back to the default colour'})
      </label>
      <div className="btn-row">
        <button onClick={() => st().filterOn('topic', `grp:${id}`, false)}>Focus view</button>
      </div>
      {isBundle ? <BundleMembers groupId={id} /> : <ChainMembers groupId={id} />}
      {!isBundle && <SequenceEditor chainId={id} />}
      <button className="danger" onClick={() => confirm(`Delete ${g.name}?`) && st().deleteGroup(id)}>Delete group</button>
    </div>
  );
}

function BundleMembers({ groupId }: { groupId: string }) {
  const model = useStore((s) => s.model);
  const st = useStore.getState;
  const members = model.topics.filter((t) => t.bundleId === groupId).map((t) => t.id);
  return (
    <section className="subsection">
      <h4>Topics ({members.length})</h4>
      <div className="member-list">
        {model.topics.map((t) => (
          <label key={t.id} className="check">
            <input
              type="checkbox"
              checked={members.includes(t.id)}
              onChange={(e) => st().setGroupMembers(groupId, e.target.checked ? [...members, t.id] : members.filter((m) => m !== t.id))}
            />
            {t.name}
            {t.bundleId && t.bundleId !== groupId && <span className="muted small"> (in {model.groups.find((x) => x.id === t.bundleId)?.name})</span>}
          </label>
        ))}
      </div>
    </section>
  );
}

function ChainMembers({ groupId }: { groupId: string }) {
  const model = useStore((s) => s.model);
  const st = useStore.getState;
  const [showAll, setShowAll] = useState(false);
  const members = model.interactions.filter((i) => i.chainIds.includes(groupId)).map((i) => i.id);
  const sysName = (sid: string) => model.systems.find((s) => s.id === sid)?.name ?? sid;
  const chainName = (c: string) => model.groups.find((x) => x.id === c)?.name;
  const set = (iid: string, on: boolean) => st().setGroupMembers(groupId, on ? [...members, iid] : members.filter((m) => m !== iid));
  const topics = model.topics.filter((t) => showAll || model.interactions.some((i) => i.topicId === t.id && i.chainIds.includes(groupId)));
  return (
    <section className="subsection">
      <h4>Endpoints ({members.length})</h4>
      <label className="check small">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all topics to pick endpoints
      </label>
      {topics.length === 0 && <p className="muted small">No endpoints yet. Tick the box above, or add this chain to an endpoint from a system or topic pane.</p>}
      {topics.map((t) => {
        const eps = model.interactions.filter((i) => i.topicId === t.id);
        if (!eps.length) return null;
        return (
          <div key={t.id} className="chain-topic">
            <div className="chain-topic-name">{t.name}</div>
            {eps.map((i) => {
              const others = i.chainIds.filter((c) => c !== groupId).map(chainName).filter(Boolean);
              return (
                <label key={i.id} className="check">
                  <input type="checkbox" checked={i.chainIds.includes(groupId)} onChange={(e) => set(i.id, e.target.checked)} />
                  {sysName(i.systemId)} <span className="muted">{i.direction === 'produce' ? 'produces' : 'consumes'}</span>
                  {others.length > 0 && <span className="muted small"> (also in {others.join(', ')})</span>}
                </label>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

/** Numbered sequence of a chain: each step holds one or more of the chain's links. */
function SequenceEditor({ chainId }: { chainId: string }) {
  const model = useStore((s) => s.model);
  const ui = useStore((s) => s.ui);
  const st = useStore.getState;
  const links = chainLinks(model, chainId);
  const labelOf = new Map(links.map((l) => [l.id, linkLabel(model, l)]));
  const seq = chainSequence(model, chainId);
  const save = (sequence: string[][]) => st().updateGroup(chainId, { sequence });
  const animating = ui.animation?.chainId === chainId;
  const move = (i: number, d: number) => {
    const next = [...seq];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    save(next);
  };
  return (
    <section className="subsection">
      <h4>
        Sequence <span className="muted">({seq.length} steps)</span>
      </h4>
      <p className="muted small">Number the chain's links in the order data flows. A step can hold several links, and a link can appear in several steps.</p>
      {links.length === 0 && <p className="muted small">Add endpoints to this chain first: links appear when a producer and a consumer of the same topic are in the chain.</p>}
      {seq.map((step, i) => (
        <div key={i} className="seq-step">
          <div className="seq-head">
            <span className="seq-num">{i + 1}</span>
            <span className="seq-actions">
              <button className="link" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</button>
              <button className="link" disabled={i === seq.length - 1} onClick={() => move(i, 1)} title="Move down">↓</button>
              <button className="link danger" onClick={() => save(seq.filter((_, j) => j !== i))} title="Remove step">×</button>
            </span>
          </div>
          {step.map((lid) => (
            <div key={lid} className="seq-link">
              {labelOf.get(lid)}
              <button className="link danger" onClick={() => save(seq.map((s, j) => (j === i ? s.filter((x) => x !== lid) : s)))} title="Remove from step">×</button>
            </div>
          ))}
          <select
            value=""
            onChange={(e) => e.target.value && save(seq.map((s, j) => (j === i ? [...s, e.target.value] : s)))}
            disabled={links.every((l) => step.includes(l.id))}
          >
            <option value="">+ add a link to step {i + 1}…</option>
            {links.filter((l) => !step.includes(l.id)).map((l) => (
              <option key={l.id} value={l.id}>{labelOf.get(l.id)}</option>
            ))}
          </select>
        </div>
      ))}
      <div className="btn-row">
        <button disabled={!links.length} onClick={() => save([...seq, [links[0].id]])} title="Add a step (starts with the first link; change it in the step)">+ Step</button>
        <button
          disabled={!links.length}
          onClick={() => (!seq.length || confirm('Replace the sequence with one following the flow?')) && save(autoSequence(model, chainId))}
          title="Propose steps following the flow: a link comes after the links that bring data to its system"
        >
          Auto-fill
        </button>
        <button disabled={!seq.length} onClick={() => confirm('Clear the sequence?') && save([])}>Clear</button>
        <button
          className={animating ? 'on' : ''}
          disabled={!seq.length}
          onClick={() => st().setUi(animating ? { animation: null } : { animation: { chainId, step: 1, playing: true }, view: 'diagram' })}
          title="Play the sequence on the Topics view (and in the chain view)"
        >
          {animating ? 'Stop animation' : '▶ Animate'}
        </button>
      </div>
    </section>
  );
}

function ChainDots({ chainIds }: { chainIds: string[] }) {
  const groups = useStore((s) => s.model.groups);
  return (
    <>
      {chainIds.map((c) => {
        const g = groups.find((x) => x.id === c);
        return g ? <span key={c} className="dot inline" style={{ background: g.color }} title={`Chain: ${g.name}`} /> : null;
      })}
    </>
  );
}

/** Pick the chains of one endpoint (interaction); an endpoint can be in several chains. */
function ChainPicker({ interaction: i, label, compact }: { interaction: Interaction; label?: string; compact?: boolean }) {
  const groups = useStore((s) => s.model.groups);
  const chains = groups.filter((g) => g.type === 'chain');
  const st = useStore.getState;
  const set = (chainIds: string[]) => st().updateInteraction(i.id, { chainIds });
  const available = chains.filter((g) => !i.chainIds.includes(g.id));
  const body = (
    <span className={`chain-picker${compact ? ' compact' : ''}`}>
      {i.chainIds.map((c) => {
        const g = chains.find((x) => x.id === c);
        if (!g) return null;
        return (
          <span key={c} className="chain-chip" style={{ borderColor: g.color, background: `${g.color}22` }}>
            {g.name}
            <button onClick={() => set(i.chainIds.filter((x) => x !== c))} title={`Remove from ${g.name}`}>×</button>
          </span>
        );
      })}
      {available.length > 0 && (
        <select value="" title="Add this endpoint to a chain" onChange={(e) => e.target.value && set([...i.chainIds, e.target.value])}>
          <option value="">{i.chainIds.length ? '+' : compact ? '+ chain' : 'Add to chain…'}</option>
          {available.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      )}
      {!chains.length && <span className="muted small">No chains defined</span>}
    </span>
  );
  if (compact) return body;
  return (
    <div className="field">
      <span>{label}</span>
      {body}
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
