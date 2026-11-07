import { useStore } from '../model/store';
import type { SosCalloutOptions } from '../model/types';

/** Settings of the System of System view, shown above the canvas while it is displayed. */
export function SosBar() {
  const sos = useStore((s) => s.model.sos);
  const update = useStore((s) => s.updateSosSettings);
  const toggle = (key: keyof Omit<SosCalloutOptions, 'propertyKeys'>) => (
    <label className="sos-opt">
      <input type="checkbox" checked={sos.callouts[key]} onChange={(e) => update({ callouts: { [key]: e.target.checked } })} />
      {{ notes: 'Notes', description: 'Description', properties: 'Properties', topics: 'Topics' }[key]}
    </label>
  );
  return (
    <div className="filter-bar sos-bar">
      <label className="sos-opt">
        Title
        <input className="sos-title" value={sos.title} onChange={(e) => update({ title: e.target.value })} />
      </label>
      <label className="sos-opt" title="Topic lines between the systems inside the box (through the broker when it is shown)">
        <input type="checkbox" checked={sos.innerLines} onChange={(e) => update({ innerLines: e.target.checked })} />
        Inside lines
      </label>
      <span className="muted">Callouts:</span>
      {toggle('notes')}
      {toggle('description')}
      {toggle('properties')}
      {sos.callouts.properties && (
        <input
          className="sos-keys"
          placeholder="keys (all if empty)"
          title="Comma-separated property keys to show"
          value={sos.callouts.propertyKeys}
          onChange={(e) => update({ callouts: { propertyKeys: e.target.value } })}
        />
      )}
      {toggle('topics')}
      <span className="muted small">Set each system Inner, Outer or Not shown from the left panel.</span>
    </div>
  );
}
