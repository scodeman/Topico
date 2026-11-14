import { useEffect, useRef, useState } from 'react';
import { roomOccupants, type DirHandle } from '../collab/folderMailbox';
import { useCollab, type PeerView, type ReplaceRequest } from '../collab/state';

// The connection code and Yjs are loaded on first use.
const startCollab = async (...a: Parameters<typeof import('../collab/session').startCollab>) => (await import('../collab/session')).startCollab(...a);
const stopCollab = async () => (await import('../collab/session')).stopCollab();
const answerReplace = async (r: ReplaceRequest, ok: boolean) => (await import('../collab/session')).answerReplace(r, ok);
const cancelAsk = async (reqId: string) => (await import('../collab/session')).cancelAsk(reqId);

/** Requests to replace the shared diagram: others' (to allow or refuse) and ours (waiting for their answers). */
function ReplaceDialogs() {
  const incoming = useCollab((c) => c.incoming);
  const asking = useCollab((c) => c.asking);
  const result = useCollab((c) => c.askResult);
  const r = incoming[0];
  return (
    <>
      {r && (
        <div className="replace-dialog" role="alertdialog" aria-labelledby="replace-title">
          <h4 id="replace-title">Replace the shared diagram?</h4>
          <p>
            <b>{r.from}</b> wants to replace the diagram everyone is editing with <b>{r.what}</b>.
          </p>
          <p className="muted small">If everyone allows it, your current diagram is replaced too. Save it first if you want to keep a copy.</p>
          <div className="btn-row">
            <button className="primary" onClick={() => void answerReplace(r, true)}>
              Allow
            </button>
            <button onClick={() => void answerReplace(r, false)}>Refuse</button>
          </div>
        </div>
      )}
      {!asking && result && (
        <div className={`replace-banner${result.ok ? ' ok' : ''}`} role="status">
          <span>
            {result.ok ? (
              <>
                ✓ Everyone agreed: the diagram is now <b>{result.what}</b>.
              </>
            ) : (
              <>
                Not replaced with <b>{result.what}</b>: {result.reason}.
              </>
            )}
          </span>
          <button className="link" onClick={() => useCollab.setState({ askResult: null })} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {asking && (
        <div className="replace-banner" role="status">
          <span>
            Waiting for {asking.waiting.join(', ')} to allow replacing the diagram with <b>{asking.what}</b>…
          </span>
          <button className="link" onClick={() => void cancelAsk(asking.reqId)}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
import { loadHandle, setCurrentFile, storeHandle, useCurrentFile, type FileHandle } from '../model/currentFile';
import { canEdit, useStore } from '../model/store';

/* Experiment: meet other Topico users through a shared folder (see collab/session.ts). Chrome and Edge only. */

type DirPicker = (o: { id?: string; mode: 'readwrite' }) => Promise<DirHandle>;
const pickDir = (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker?.bind(window);
const FOLDER_KEY = 'collab-folder';

interface DiagramFile {
  name: string;
  handle: FileHandle;
  modified: number;
}

/** The diagram files (.json) at the top of a folder, newest first. */
async function diagramFiles(dir: DirHandle): Promise<DiagramFile[]> {
  const out: DiagramFile[] = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind !== 'file' || !name.toLowerCase().endsWith('.json')) continue;
    const handle = h as unknown as FileHandle;
    out.push({ name, handle, modified: (await handle.getFile()).lastModified });
  }
  return out.sort((a, b) => b.modified - a.modified);
}
let autoRejoinDone = false;
/** This tab is in a session (kept in the tab's own storage, so it survives a refresh of that tab only). */
const ACTIVE_KEY = 'topico-collab-active';
const wasActive = () => {
  try {
    return sessionStorage.getItem(ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
};
const setActive = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(ACTIVE_KEY, '1');
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* private mode without storage: no automatic rejoin */
  }
};

const STATE_LABEL: Record<PeerView['state'], string> = {
  seen: 'in the folder',
  calling: 'connecting (offer sent)…',
  answering: 'connecting (answered)…',
  connected: 'connected',
};

export function CollabMenu() {
  const [open, setOpen] = useState(false);
  const [remembered, setRemembered] = useState<DirHandle | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { folder, status, error, peers, log, shared } = useCollab();
  const userName = useStore((s) => s.ui.userName);
  const named = useStore((s) => canEdit(s.ui));
  const setUi = useStore((s) => s.setUi);
  const list = Object.values(peers).sort((a, b) => a.name.localeCompare(b.name));
  const connected = list.filter((p) => p.state === 'connected').length;

  // After a refresh, a tab that was in a session joins it again: at once when the browser still lets it write in the
  // folder, otherwise the Collaborate button asks for one click (Chrome needs a click to grant that permission again).
  const [resume, setResume] = useState(false);
  const [pending, setPending] = useState<{ dir: DirHandle; files: DiagramFile[]; choice: string } | null>(null);
  useEffect(() => {
    void loadHandle<DirHandle>(FOLDER_KEY).then(async (h) => {
      if (!h) return;
      setRemembered(h);
      // Once per page load (React may run this effect twice while developing).
      if (autoRejoinDone || !wasActive() || !canEdit(useStore.getState().ui)) return;
      autoRejoinDone = true;
      if ((await h.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt')) === 'granted') void startCollab(h, () => useStore.getState().ui.userName);
      else setResume(true);
    });
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!pickDir) return null;
  const join = (dir: DirHandle) => {
    setResume(false);
    setActive(true);
    setRemembered(dir);
    void storeHandle(FOLDER_KEY, dir);
    void startCollab(dir, () => useStore.getState().ui.userName);
  };
  // After choosing the folder: pick the diagram file to work on among those in it (or keep the current diagram).
  const choose = async () => {
    try {
      const dir = await pickDir({ id: 'topico-collab', mode: 'readwrite' });
      // Someone is already in the room: join it and get the diagram they are editing (no file to choose).
      if ((await roomOccupants(dir)).length) return join(dir);
      const files = await diagramFiles(dir);
      if (!files.length) return join(dir);
      const current = useCurrentFile.getState().handle?.name;
      const choice = files.some((f) => f.name === current) ? current! : files.length === 1 ? files[0].name : '';
      setPending({ dir, files, choice });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') alert(`Could not use this folder: ${(e as Error).message}`);
    }
  };
  const joinWithChoice = async () => {
    if (!pending) return;
    const f = pending.files.find((x) => x.name === pending.choice);
    if (f) {
      try {
        useStore.getState().setModel(JSON.parse(await (await f.handle.getFile()).text()));
        setCurrentFile(f.handle);
      } catch (e) {
        return alert(`Could not read ${f.name}: ${(e as Error).message}`);
      }
    }
    setPending(null);
    join(pending.dir);
  };

  return (
    <div className="collab-menu" ref={ref}>
      <ReplaceDialogs />
      <button
        className={`icon-btn collab-btn${status === 'on' ? ' on' : resume ? ' resume' : ''}`}
        onClick={() => setOpen(!open)}
        title={
          status === 'on'
            ? `Collaborating through ${folder}: ${connected} connected`
            : resume && remembered
              ? `Click to rejoin ${remembered.name} after the refresh`
              : 'Collaborate (experiment): meet others through a shared folder'
        }
        aria-label="Collaborate"
        aria-expanded={open}
      >
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        {status === 'on' && <span className="collab-count">{connected}</span>}
      </button>
      {open && (
        <div className="user-pop collab-pop" role="dialog" aria-label="Collaborate">
          <h4>Collaborate <span className="muted small">(experiment)</span></h4>
          {!named ? (
            <p className="small">
              <button className="link" onClick={() => setUi({ userMenuOpen: true })}>
                Set your name
              </button>{' '}
              first, so others see who you are.
            </p>
          ) : status === 'on' || status === 'starting' ? (
            <>
              <p className="small">
                Meeting others in <b>{folder}</b> as <b>{userName}</b>.
              </p>
              <p className="small">
                {shared ? (
                  <>✓ <b>Diagram shared</b>: everyone's edits appear for all. Each person saves to their own file.</>
                ) : (
                  <span className="muted">Your diagram is shared with whoever connects next.</span>
                )}
              </p>
              {list.length === 0 ? (
                <p className="muted small">Nobody else yet. Others join by choosing the same shared folder.</p>
              ) : (
                <ul className="collab-peers">
                  {list.map((p) => (
                    <li key={p.id} className={p.state}>
                      <span className="collab-dot" />
                      <b>{p.name}</b>
                      <span className="muted small">
                        {STATE_LABEL[p.state]}
                        {p.state === 'connected' && p.rtt !== undefined ? ` · ${p.rtt} ms` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="btn-row">
                <button
                  onClick={() => {
                    setActive(false);
                    void stopCollab();
                  }}
                >
                  Leave
                </button>
              </div>
              <details className="collab-log">
                <summary>Log</summary>
                <ul>
                  {log.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
            </>
          ) : pending ? (
            <>
              <p className="small">
                Diagram to work on in <b>{pending.dir.name}</b>:
              </p>
              <div className="collab-files" role="radiogroup" aria-label="Diagram to work on">
                {pending.files.map((f) => (
                  <label key={f.name} className="check">
                    <input type="radio" name="collab-file" checked={pending.choice === f.name} onChange={() => setPending({ ...pending, choice: f.name })} />
                    <span className="collab-file-name">{f.name}</span>
                    <span className="muted small">{new Date(f.modified).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </label>
                ))}
                <label className="check">
                  <input type="radio" name="collab-file" checked={pending.choice === ''} onChange={() => setPending({ ...pending, choice: '' })} />
                  <span className="collab-file-name">Keep my current diagram</span>
                </label>
              </div>
              <p className="muted small">
                Nobody is in this room yet: the file you pick is loaded, becomes your current file (<b>Save</b> writes back to it in this folder) and is the diagram others get when they join.
              </p>
              <div className="btn-row">
                <button className="primary" onClick={() => void joinWithChoice()}>
                  Join
                </button>
                <button className="link" onClick={() => setPending(null)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="small">Choose a folder your team already shares (OneDrive, SharePoint, a network drive…). Everyone who picks the same folder edits the same diagram together, with no server involved.</p>
              <p className="small">
                <b>Joining replaces your diagram</b> with the one already shared there, if someone joined before you. Your own file is not touched unless you save.
              </p>
              {resume && remembered && (
                <p className="small">
                  You were in <b>{remembered.name}</b> before the page reloaded.
                </p>
              )}
              {status === 'error' && <p className="small danger-text">{error}</p>}
              <div className="btn-row">
                {remembered && (
                  <button className="primary" onClick={() => join(remembered)} title="Use the folder chosen last time">
                    Rejoin {remembered.name}
                  </button>
                )}
                <button className={remembered ? '' : 'primary'} onClick={() => void choose()}>
                  Choose folder…
                </button>
              </div>
              <p className="muted small">Works between computers that can reach each other directly (usually the same network).</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
