import { useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** User icon at the top right: the name used as the author of comments. */
export function UserMenu() {
  const userName = useStore((s) => s.ui.userName);
  const open = useStore((s) => s.ui.userMenuOpen);
  const setUi = useStore((s) => s.setUi);
  const [draft, setDraft] = useState(userName);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setDraft(userName);
  }, [open, userName]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      setUi({ userMenuOpen: false });
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open, setUi]);
  const save = () => setUi({ userName: draft.trim(), userMenuOpen: false });

  return (
    <div className="user-menu" ref={ref}>
      <button
        className={`user-btn${userName ? ' named' : ''}`}
        onClick={() => setUi({ userMenuOpen: !open })}
        title={userName ? `Commenting as ${userName}` : 'Set your name to comment'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {userName ? initials(userName) : (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="5.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.5 14c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {open && (
        <div className="user-pop" role="dialog" aria-label="Your name">
          <label className="field">
            <span>Your name (shown on your comments)</span>
            <input autoFocus value={draft} placeholder="e.g. Ann Smith" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </label>
          <div className="btn-row">
            <button className="primary" onClick={save} disabled={!draft.trim() || draft.trim() === userName}>
              Save
            </button>
            {userName && (
              <button className="link" onClick={() => setUi({ userName: '', userMenuOpen: false })}>
                Sign out
              </button>
            )}
          </div>
          <p className="muted small">Kept in this browser only.</p>
        </div>
      )}
    </div>
  );
}
