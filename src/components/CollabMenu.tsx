import { useEffect, useRef, useState } from 'react';
import type { DirHandle } from '../collab/folderMailbox';
import { startCollab, stopCollab, useCollab, type PeerView } from '../collab/session';
import { loadHandle, storeHandle } from '../model/currentFile';
import { canEdit, useStore } from '../model/store';

/* Experiment: meet other Topico users through a shared folder (see collab/session.ts). Chrome and Edge only. */

type DirPicker = (o: { id?: string; mode: 'readwrite' }) => Promise<DirHandle>;
const pickDir = (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker?.bind(window);
const FOLDER_KEY = 'collab-folder';

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
  const { folder, status, error, peers, log } = useCollab();
  const userName = useStore((s) => s.ui.userName);
  const named = useStore((s) => canEdit(s.ui));
  const setUi = useStore((s) => s.setUi);
  const list = Object.values(peers).sort((a, b) => a.name.localeCompare(b.name));
  const connected = list.filter((p) => p.state === 'connected').length;

  useEffect(() => {
    void loadHandle<DirHandle>(FOLDER_KEY).then((h) => h && setRemembered(h));
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
    setRemembered(dir);
    void storeHandle(FOLDER_KEY, dir);
    void startCollab(dir, () => useStore.getState().ui.userName);
  };
  const choose = async () => {
    try {
      join(await pickDir({ id: 'topico-collab', mode: 'readwrite' }));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') alert(`Could not use this folder: ${(e as Error).message}`);
    }
  };

  return (
    <div className="collab-menu" ref={ref}>
      <button
        className={`icon-btn collab-btn${status === 'on' ? ' on' : ''}`}
        onClick={() => setOpen(!open)}
        title={status === 'on' ? `Collaborating through ${folder}: ${connected} connected` : 'Collaborate (experiment): meet others through a shared folder'}
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
                <button onClick={() => void stopCollab()}>Leave</button>
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
          ) : (
            <>
              <p className="small">Choose a folder your team already shares (OneDrive, SharePoint, a network drive…). Everyone who picks the same folder can connect, with no server involved.</p>
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
              <p className="muted small">Works between computers that can reach each other directly (usually the same network). Nothing of the diagram is shared yet.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
