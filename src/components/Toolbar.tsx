import { useRef } from 'react';
import { useView } from '../engine/useView';
import { resetToEmpty, resetToSample, useStore } from '../model/store';
import type { CollapseBy } from '../engine/view';

export function Toolbar() {
  const { model, ui, vm, layout, chainLayout, sosLayout } = useView();
  const setUi = useStore((s) => s.setUi);
  const setModel = useStore((s) => s.setModel);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = (model.centre.name || 'topico').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const suffix = chainLayout
    ? `-chain-${chainLayout.chainName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    : sosLayout
      ? '-sos'
      : vm.filtered
        ? '-view'
        : '';
  // Exporters (and react-dom/server, which they use) are loaded on first use to keep the initial bundle small.
  type Exporters = typeof import('../export/exporters');
  const withExporters = (fn: (ex: Exporters) => void) => () => void import('../export/exporters').then(fn);
  // Exports follow what the canvas shows: the broker-tube chain view when it is on.
  const exportSvg = withExporters((ex) =>
    ex.download(
      `${base}${suffix}.svg`,
      chainLayout ? ex.toChainSvg(chainLayout) : sosLayout ? ex.toSosSvg(sosLayout) : ex.toSvg(layout, vm, model.groups, ui.showStubs),
      'image/svg+xml',
    ),
  );
  const exportDrawio = withExporters((ex) =>
    ex.download(
      `${base}${suffix}.drawio`,
      chainLayout
        ? ex.toChainDrawio(chainLayout, { sketch: ui.sketchExport })
        : sosLayout
          ? ex.toSosDrawio(sosLayout, { sketch: ui.sketchExport })
          : ex.toDrawio(layout, vm, model.groups, { sketch: ui.sketchExport, showStubs: ui.showStubs, title: model.centre.name }),
      'application/xml',
    ),
  );
  const saveJson = withExporters((ex) => ex.download(`${base}.topico.json`, ex.toJson(model), 'application/json'));

  const importJson = async (file: File) => {
    try {
      setModel(JSON.parse(await file.text()));
    } catch (e) {
      alert(`Could not read ${file.name}: ${(e as Error).message}`);
    }
  };

  return (
    <header className="toolbar">
      <strong className="brand">Topico</strong>
      <div className="tb-group">
        <button onClick={() => confirm('Start a new empty diagram? Unsaved changes will be lost.') && resetToEmpty()}>New</button>
        <button onClick={() => confirm('Replace the current diagram with the sample?') && resetToSample()}>Sample</button>
        <button onClick={() => fileRef.current?.click()}>Open…</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = '';
          }}
        />
        <button onClick={saveJson}>Save JSON</button>
      </div>
      <div className="tb-group">
        <span className="seg" role="group" aria-label="View">
          <button className={ui.view === 'diagram' && !ui.chainView ? 'on' : ''} onClick={() => setUi({ view: 'diagram', chainView: null })}>
            Diagram
          </button>
          <button className={ui.view === 'sos' && !ui.chainView ? 'on' : ''} onClick={() => setUi({ view: 'sos', chainView: null })}>
            System of System
          </button>
        </span>
      </div>
      <div className={`tb-group${sosLayout || chainLayout ? ' tb-disabled' : ''}`} title={sosLayout || chainLayout ? 'These options apply to the diagram view' : undefined}>
        <label>
          Group topics
          <select value={ui.collapseBy} onChange={(e) => setUi({ collapseBy: e.target.value as CollapseBy })}>
            <option value="none">individually</option>
            <option value="bundle">by bundle</option>
            <option value="chain">by chain</option>
          </select>
        </label>
        <label title="When several systems are focused, only show topics exchanged between them">
          <input type="checkbox" checked={ui.sharedOnly} onChange={(e) => setUi({ sharedOnly: e.target.checked })} /> Shared topics only
        </label>
        <label title="Dashed arrows show flows to/from systems outside the current focus">
          <input type="checkbox" checked={ui.showStubs} onChange={(e) => setUi({ showStubs: e.target.checked })} /> Off-view flows
        </label>
      </div>
      <div className="tb-group tb-right">
        <span className="muted">Export view:</span>
        <button onClick={exportSvg}>SVG</button>
        <button onClick={exportDrawio}>draw.io</button>
        <label title="Use draw.io's hand-drawn sketch style">
          <input type="checkbox" checked={ui.sketchExport} onChange={(e) => setUi({ sketchExport: e.target.checked })} /> sketch style
        </label>
      </div>
    </header>
  );
}
