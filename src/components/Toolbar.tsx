import { useRef, useState } from 'react';
import { useView } from '../engine/useView';
import { DiagramIcon, ImageFileIcon, NewIcon, OpenIcon, SampleIcon, SaveAsIcon, SaveIcon } from './Icons';
import { UserMenu } from './UserMenu';
import { resetToEmpty, resetToSample, useStore } from '../model/store';

/* File System Access API (Chrome, Edge): not in every browser nor in TypeScript's DOM types. */
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}
type PickerTypes = { types: { description: string; accept: Record<string, string[]> }[] };
type OpenPicker = (o: PickerTypes) => Promise<FileHandle[]>;
type SavePicker = (o: PickerTypes & { suggestedName: string }) => Promise<FileHandle>;
const fsa = window as unknown as { showOpenFilePicker?: OpenPicker; showSaveFilePicker?: SavePicker };
const picker = fsa.showOpenFilePicker && fsa.showSaveFilePicker ? { open: fsa.showOpenFilePicker.bind(window), save: fsa.showSaveFilePicker.bind(window) } : null;
const JSON_TYPES: PickerTypes = { types: [{ description: 'Topico diagram', accept: { 'application/json': ['.json'] } }] };

export function Toolbar() {
  const { model, ui, vm, layout, chainLayout, sosLayout, anim } = useView();
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
  // While a chain is animated: SVG captures the current step, draw.io gets one page per step.
  const animSuffix = anim ? `-anim-${anim.chainName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  const drawioAnim = (steps: Map<string, number[]>) =>
    anim ? { chainName: anim.chainName, color: anim.color, count: anim.count, stepLabels: anim.stepLabels, steps } : undefined;
  const exportSvg = withExporters((ex) =>
    ex.download(
      `${base}${suffix}${animSuffix}.svg`,
      chainLayout
        ? ex.toChainSvg(chainLayout, anim ? { arrowSteps: anim.arrowSteps, current: anim.current } : null, ui.topicText)
        : sosLayout
          ? ex.toSosSvg(sosLayout)
          : ex.toSvg(layout, vm, model.groups, ui.showStubs, anim ? { edgeSteps: anim.edgeSteps, current: anim.current, color: anim.color } : null, ui.topicText),
      'image/svg+xml',
    ),
  );
  const exportDrawio = withExporters((ex) =>
    ex.download(
      `${base}${suffix}${animSuffix}.drawio`,
      chainLayout
        ? ex.toChainDrawio(chainLayout, { anim: drawioAnim(anim?.arrowSteps ?? new Map()) })
        : sosLayout
          ? ex.toSosDrawio(sosLayout)
          : ex.toDrawio(layout, vm, model.groups, {
              showStubs: ui.showStubs,
              title: model.centre.name,
              anim: drawioAnim(anim?.edgeSteps ?? new Map()),
            }),
      'application/xml',
    ),
  );
  // The current file (Chrome, Edge): the one opened or last saved with the browser's file pickers. Save writes over it.
  const [opened, setOpened] = useState<FileHandle | null>(null);
  const fileName = `${base}.topico.json`;
  const writeTo = async (h: FileHandle, json: string) => {
    if ((await h.requestPermission?.({ mode: 'readwrite' })) === 'denied') throw new Error('permission denied');
    const w = await h.createWritable();
    await w.write(json);
    await w.close();
  };
  const save = (as: boolean) =>
    withExporters(async (ex) => {
      const json = ex.toJson(model);
      if (!picker) return ex.download(fileName, json, 'application/json');
      try {
        const h = !as && opened ? opened : await picker.save({ ...JSON_TYPES, suggestedName: opened?.name ?? fileName });
        await writeTo(h, json);
        setOpened(h);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (confirm(`Could not save: ${(e as Error).message}\nDownload a copy instead?`)) ex.download(fileName, json, 'application/json');
      }
    });

  const importJson = async (file: File) => {
    try {
      setModel(JSON.parse(await file.text()));
      return true;
    } catch (e) {
      alert(`Could not read ${file.name}: ${(e as Error).message}`);
      return false;
    }
  };
  const open = async () => {
    if (!picker) return fileRef.current?.click();
    try {
      const [h] = await picker.open(JSON_TYPES);
      if (await importJson(await h.getFile())) setOpened(h);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') alert(`Could not open the file: ${(e as Error).message}`);
    }
  };
  const forget = () => setOpened(null);

  return (
    <header className="toolbar">
      <strong className="brand">Topico</strong>
      <div className="tb-group">
        <button onClick={() => confirm('Start a new empty diagram? Unsaved changes will be lost.') && (resetToEmpty(), forget())} className="icon-btn" title="New: start an empty diagram" aria-label="New">
          <NewIcon />
        </button>
        <button onClick={() => confirm('Replace the current diagram with the sample?') && (resetToSample(), forget())} className="icon-btn" title="Sample: load the example diagram" aria-label="Sample">
          <SampleIcon />
        </button>
        <button onClick={() => void open()} className="icon-btn" title="Open: load a Topico JSON file" aria-label="Open">
          <OpenIcon />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f).then((ok) => ok && forget());
            e.target.value = '';
          }}
        />
        {picker ? (
          <>
            <button className="icon-btn" onClick={save(false)} title={opened ? `Save: over ${opened.name}` : 'Save: choose where to save the diagram'} aria-label="Save">
              <SaveIcon />
            </button>
            <button className="icon-btn" onClick={save(true)} title="Save as…: save to a new file, which becomes the current one" aria-label="Save as">
              <SaveAsIcon />
            </button>
          </>
        ) : (
          <button className="icon-btn" onClick={save(false)} title="Save JSON: download the diagram as a file" aria-label="Save JSON">
            <SaveIcon />
          </button>
        )}
      </div>
      <div className="tb-group">
        <span className="seg" role="group" aria-label="View">
          <button className={ui.view === 'diagram' && !ui.chainView ? 'on' : ''} onClick={() => setUi({ view: 'diagram', chainView: null })}>
            Topics
          </button>
          <button className={ui.view === 'sos' && !ui.chainView ? 'on' : ''} onClick={() => setUi({ view: 'sos', chainView: null })}>
            System of System
          </button>
        </span>
      </div>
      <div className="tb-group tb-right">
        <span className="muted">Export:</span>
        <button onClick={exportSvg} title="Export the current view as an SVG image">
          <ImageFileIcon /> SVG
        </button>
        <button onClick={exportDrawio} title="Export the current view as a .drawio file, editable in draw.io">
          <DiagramIcon /> draw.io
        </button>
      </div>
      <UserMenu />
    </header>
  );
}
