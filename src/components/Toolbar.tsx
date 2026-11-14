import { useRef } from 'react';
import { useView } from '../engine/useView';
import { DiagramIcon, ImageFileIcon, NewIcon, OpenIcon, SampleIcon, SaveAsIcon, SaveIcon } from './Icons';
import { CollabMenu } from './CollabMenu';
import { useCollab } from '../collab/state';
import { UserMenu } from './UserMenu';
import { resetToEmpty, resetToSample, useStore } from '../model/store';
import { setCurrentFile, useCurrentFile, type FileHandle } from '../model/currentFile';

/* File System Access API (Chrome, Edge): not in every browser nor in TypeScript's DOM types. */
type PickerTypes = { types: { description: string; accept: Record<string, string[]> }[] };
/** `startIn`: a folder (or file) handle the dialog opens in. */
type OpenPicker = (o: PickerTypes & { startIn?: unknown }) => Promise<FileHandle[]>;
type SavePicker = (o: PickerTypes & { suggestedName: string; startIn?: unknown }) => Promise<FileHandle>;
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
  // The current file (Chrome, Edge): the one opened or last saved with the browser's file pickers, or picked in a
  // collaboration room's folder. Save writes over it. It is kept across reloads (see currentFile.ts).
  const opened = useCurrentFile((s) => s.handle);
  const setOpened = setCurrentFile;
  const fileName = `${base}.topico.json`;
  const writeTo = async (h: FileHandle, json: string) => {
    if ((await h.requestPermission?.({ mode: 'readwrite' })) === 'denied') throw new Error('permission denied');
    const w = await h.createWritable();
    await w.write(json);
    await w.close();
  };
  // In a collaboration room, the file dialogs (Open, Save as, Save without a current file) start in the room's folder.
  const roomStart = () => {
    const c = useCollab.getState();
    return c.status === 'on' && c.folderHandle ? { startIn: c.folderHandle } : {};
  };
  const save = (as: boolean) => async () => {
    // Ask to write to the current file first, while the click still counts as the user's gesture.
    if (picker && !as && opened) await opened.requestPermission?.({ mode: 'readwrite' }).catch(() => undefined);
    const ex = await import('../export/exporters');
    const json = ex.toJson(model);
    if (!picker) return ex.download(fileName, json, 'application/json');
    try {
      const h = !as && opened ? opened : await picker.save({ ...JSON_TYPES, suggestedName: opened?.name ?? fileName, ...roomStart() });
      await writeTo(h, json);
      setOpened(h);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (confirm(`Could not save: ${(e as Error).message}\nDownload a copy instead?`)) ex.download(fileName, json, 'application/json');
    }
  };

  // In a collaboration room, replacing the diagram replaces it for everyone: the others must agree first.
  const inRoom = useCollab((c) => c.status === 'on');
  const othersAgree = async (what: string) => {
    const c = useCollab.getState();
    if (c.status !== 'on' || !Object.values(c.peers).some((p) => p.state === 'connected')) return true;
    // The outcome shows in the page (see CollabMenu), not in an alert that Chrome may hold back in a window without focus.
    return (await (await import('../collab/session')).askReplace(what)).ok;
  };
  const importJson = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      alert(`Could not read ${file.name}: ${(e as Error).message}`);
      return false;
    }
    if (!(await othersAgree(file.name))) return false;
    setModel(data as Parameters<typeof setModel>[0]);
    return true;
  };
  const newDiagram = async () => {
    if (!confirm('Start a new empty diagram? Unsaved changes will be lost.')) return;
    if (!(await othersAgree('a new empty diagram'))) return;
    resetToEmpty();
    forget();
  };
  const open = async () => {
    if (!picker) return fileRef.current?.click();
    try {
      const [h] = await picker.open({ ...JSON_TYPES, ...roomStart() });
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
        <button onClick={() => void newDiagram()} className="icon-btn" title={inRoom ? 'New: start an empty diagram (everyone in the room must agree)' : 'New: start an empty diagram'} aria-label="New">
          <NewIcon />
        </button>
        <button
          onClick={() => confirm('Replace the current diagram with the sample?') && (resetToSample(), forget())}
          className="icon-btn"
          disabled={inRoom}
          title={inRoom ? 'Sample: not available in a collaboration room (it would replace everyone’s diagram)' : 'Sample: load the example diagram'}
          aria-label="Sample"
        >
          <SampleIcon />
        </button>
        <button onClick={() => void open()} className="icon-btn" title={inRoom ? 'Open: load a Topico JSON file (everyone in the room must agree)' : 'Open: load a Topico JSON file'} aria-label="Open">
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
            {opened && (
              <span className="current-file" title={`Current file: Save writes to ${opened.name}`}>
                {opened.name}
              </span>
            )}
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
      <CollabMenu />
      <UserMenu />
    </header>
  );
}
