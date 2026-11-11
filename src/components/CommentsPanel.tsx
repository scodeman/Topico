import { useEffect, useRef, useState } from 'react';
import { sameTarget, type CommentEntry, type CommentTarget, type CommentThread } from '../model/comments';
import { useStore } from '../model/store';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ACTION_LABEL: Record<CommentThread['log'][number]['action'], string> = {
  created: 'started the thread',
  replied: 'replied',
  accepted: 'accepted a comment',
  rejected: 'rejected a comment',
  'decision-cleared': 'cleared a decision',
  closed: 'closed the thread',
  reopened: 'reopened the thread',
  'entry-removed': 'removed a comment',
};

/** Comment threads about one entity, in its right-panel pane. */
export function CommentsPanel({ target }: { target: CommentTarget }) {
  const threads = useStore((s) => s.model.comments).filter((t) => sameTarget(t.target, target));
  const userName = useStore((s) => s.ui.userName);
  const st = useStore.getState;
  const [draft, setDraft] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const open = threads.filter((t) => !t.closed);
  const closed = threads.filter((t) => t.closed);
  const focus = useStore((s) => s.ui.commentFocus);
  // A focused closed thread must be visible.
  useEffect(() => {
    if (focus && closed.some((t) => t.id === focus.threadId)) setShowClosed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.threadId, focus?.nonce]);

  const post = () => {
    if (st().addComment(target, draft)) setDraft('');
  };

  return (
    <section className="subsection comments">
      <h4>
        Comments <span className="muted">({open.length} open{closed.length ? `, ${closed.length} closed` : ''})</span>
      </h4>
      {open.map((t) => (
        <Thread key={t.id} thread={t} />
      ))}
      {closed.length > 0 && (
        <button className="link small" onClick={() => setShowClosed(!showClosed)}>
          {showClosed ? 'Hide' : 'Show'} {closed.length} closed thread{closed.length > 1 ? 's' : ''}
        </button>
      )}
      {showClosed && closed.map((t) => <Thread key={t.id} thread={t} />)}
      {userName ? (
        <div className="comment-new">
          <textarea
            rows={2}
            placeholder={`Comment as ${userName}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && post()}
          />
          <button className="primary" disabled={!draft.trim()} onClick={post}>
            Comment
          </button>
        </div>
      ) : (
        <NeedName />
      )}
    </section>
  );
}

function NeedName() {
  const setUi = useStore((s) => s.setUi);
  return (
    <p className="muted small">
      <button className="link" onClick={() => setUi({ userMenuOpen: true })}>
        Set your name
      </button>{' '}
      (top right) to comment.
    </p>
  );
}

function Thread({ thread: t }: { thread: CommentThread }) {
  const st = useStore.getState;
  const userName = useStore((s) => s.ui.userName);
  const focus = useStore((s) => s.ui.commentFocus);
  const ref = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<string | null | undefined>(undefined); // undefined: no reply box
  const [draft, setDraft] = useState('');
  const focused = focus?.threadId === t.id;
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focused, focus?.nonce]);
  const authorOf = (id: string) => t.entries.find((e) => e.id === id)?.author;
  const send = () => {
    if (!draft.trim()) return;
    st().replyComment(t.id, draft, replyTo ?? undefined);
    setDraft('');
    setReplyTo(undefined);
  };
  const can = !!userName;

  return (
    <div ref={ref} className={`thread${t.closed ? ' closed' : ''}${focused ? ' focused' : ''}`} data-thread={t.id}>
      {t.closed && (
        <div className="thread-state">
          ✓ Closed by {t.closed.by} · {when(t.closed.at)}
        </div>
      )}
      {t.entries.map((e) => (
        <Entry key={e.id} entry={e} replyingTo={e.replyTo ? authorOf(e.replyTo) : undefined} can={can} thread={t} onReply={() => setReplyTo(e.id)} />
      ))}
      {replyTo !== undefined && can && (
        <div className="comment-new">
          {replyTo && <div className="muted small">↪ Replying to {authorOf(replyTo)}</div>}
          <textarea autoFocus rows={2} value={draft} placeholder="Reply…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()} />
          <div className="btn-row">
            <button className="primary" disabled={!draft.trim()} onClick={send}>
              Reply
            </button>
            <button className="link" onClick={() => setReplyTo(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="thread-actions">
        {can && replyTo === undefined && !t.closed && (
          <button className="link" onClick={() => setReplyTo(null)}>
            Reply to thread
          </button>
        )}
        {can && (
          <button className="link" onClick={() => st().closeThread(t.id, !t.closed)}>
            {t.closed ? 'Reopen' : 'Close thread'}
          </button>
        )}
        {can && (
          <button className="link danger" onClick={() => confirm('Remove this thread and all its comments?') && st().removeThread(t.id)}>
            Remove
          </button>
        )}
      </div>
      <details className="thread-history">
        <summary>History</summary>
        <ul>
          {t.log.map((l, i) => (
            <li key={i}>
              {when(l.at)} — {l.by} {ACTION_LABEL[l.action]}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Entry(p: { entry: CommentEntry; thread: CommentThread; replyingTo?: string; can: boolean; onReply(): void }) {
  const { entry: e, thread: t } = p;
  const st = useStore.getState;
  const toggle = (kind: 'accepted' | 'rejected') => st().decideComment(t.id, e.id, e.decision?.kind === kind ? null : kind);
  return (
    <div className={`comment${e.decision ? ` ${e.decision.kind}` : ''}`}>
      <div className="comment-head">
        <strong>{e.author}</strong>
        <span className="muted small" title={new Date(e.at).toISOString()}>
          {when(e.at)}
        </span>
      </div>
      {p.replyingTo && <div className="muted small">↪ to {p.replyingTo}</div>}
      <div className="comment-text">{e.text}</div>
      {e.decision && (
        <div className={`decision ${e.decision.kind}`}>
          {e.decision.kind === 'accepted' ? '✓ Accepted' : '✕ Rejected'} by {e.decision.by} · {when(e.decision.at)}
        </div>
      )}
      {p.can && (
        <div className="comment-actions">
          {!t.closed && (
            <button className="link" onClick={p.onReply}>
              Reply
            </button>
          )}
          <button className={`link${e.decision?.kind === 'accepted' ? ' on' : ''}`} onClick={() => toggle('accepted')} title={e.decision?.kind === 'accepted' ? 'Clear the decision' : 'Accept'}>
            Accept
          </button>
          <button className={`link${e.decision?.kind === 'rejected' ? ' on' : ''}`} onClick={() => toggle('rejected')} title={e.decision?.kind === 'rejected' ? 'Clear the decision' : 'Reject'}>
            Reject
          </button>
          <button className="link danger" onClick={() => confirm('Remove this comment?') && st().removeComment(t.id, e.id)}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
