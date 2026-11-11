import { useEffect, useRef, useState } from 'react';
import type { ChainLayout } from '../engine/chainView';
import type { Layout, Rect, Vec } from '../engine/layout';
import type { SosLayout } from '../engine/sosView';
import type { ViewModel } from '../engine/view';
import { openThreads, type CommentTarget } from '../model/comments';
import { useStore } from '../model/store';
import { CENTRE_ID, type Model } from '../model/types';

/* Comments on the canvas: what a right-click points at, numbered markers on items with open threads,
   and the inline box to write a comment. None of this is part of the SVG or draw.io exports. */

export interface Commentable {
  target: CommentTarget;
  label: string;
}

const tabTarget = (topicId: string): CommentTarget => (topicId.startsWith('grp:') ? { kind: 'group', id: topicId.slice(4) } : { kind: 'topic', id: topicId });

export function describeTarget(model: Model, t: CommentTarget): string {
  const sys = (id: string) => model.systems.find((s) => s.id === id)?.name ?? id;
  const topic = (id: string) => model.topics.find((x) => x.id === id)?.name ?? id;
  switch (t.kind) {
    case 'centre':
      return model.centre.name;
    case 'system':
      return sys(t.id);
    case 'topic':
      return topic(t.id);
    case 'group':
      return model.groups.find((g) => g.id === t.id)?.name ?? t.id;
    case 'flow':
      return `${sys(t.fromId)} → ${sys(t.toId)} · ${topic(t.topicId)}`;
  }
}

/** The item under a right-click: a system or ETL, the broker, a topic tab or bar, or a line. */
export function commentableAt(el: Element, vm: ViewModel, model: Model): Commentable | null {
  const hit = el.closest('[data-edge], [data-tab], [data-topic], [data-id]');
  if (!hit) return null;
  let target: CommentTarget | null = null;
  const edgeId = hit.getAttribute('data-edge');
  const tab = hit.getAttribute('data-tab') ?? hit.getAttribute('data-topic');
  const id = hit.getAttribute('data-id');
  if (edgeId) {
    const e = vm.edges.find((x) => x.id === edgeId);
    if (e) target = { kind: 'flow', topicId: e.topicIds[0], fromId: e.from.nodeId, toId: e.to.nodeId };
  } else if (tab) target = tabTarget(tab);
  else if (id === CENTRE_ID || id === 'tube' || id === 'sos') target = id === 'sos' ? null : { kind: 'centre' };
  else if (id && model.systems.some((s) => s.id === id)) target = { kind: 'system', id };
  return target ? { target, label: describeTarget(model, target) } : null;
}

interface Badge {
  key: string;
  at: Vec;
  count: number;
  threadId: string;
}

const corner = (r: Rect): Vec => ({ x: r.x + r.w, y: r.y });

/** Numbered markers for the items of the view on screen that have open comment threads. */
export function CommentBadges(p: { model: Model; vm: ViewModel; layout?: Layout | null; chain?: ChainLayout | null; sos?: SosLayout | null }) {
  const showThread = useStore((s) => s.showThread);
  const threads = p.model.comments;
  if (!threads.some((t) => !t.closed)) return null;
  const badges: Badge[] = [];
  const add = (key: string, target: CommentTarget, at: Vec) => {
    const open = openThreads(threads, target);
    if (open.length) badges.push({ key, at, count: open.length, threadId: open[0].id });
  };
  if (p.sos) {
    for (const n of p.sos.nodes) add(`n:${n.id}`, n.id === CENTRE_ID ? { kind: 'centre' } : { kind: 'system', id: n.id }, corner(n.rect));
  } else if (p.chain) {
    for (const n of p.chain.nodes) add(`n:${n.id}`, { kind: 'system', id: n.id }, corner(n.rect));
    for (const b of p.chain.bars) add(`b:${b.topicId}`, { kind: 'topic', id: b.topicId }, corner(b.rect));
    add('centre', { kind: 'centre' }, corner(p.chain.tube));
  } else if (p.layout) {
    const l = p.layout;
    add('centre', { kind: 'centre' }, corner(l.centre));
    for (const n of l.nodes) {
      add(`n:${n.id}`, { kind: 'system', id: n.id }, { x: n.rect.x + n.rect.w + 4, y: n.rect.y - 4 });
      for (const t of n.tabs) add(`t:${t.key}`, tabTarget(t.topicId), corner(t.rect));
    }
    // Lines: one marker per arrow, at its middle.
    for (const e of p.vm.edges) {
      const g = l.edges.find((x) => x.id === e.id);
      if (!g) continue;
      const open = threads.filter(
        (t) => !t.closed && t.target.kind === 'flow' && t.target.fromId === e.from.nodeId && t.target.toId === e.to.nodeId && e.topicIds.includes(t.target.topicId),
      );
      if (!open.length) continue;
      const [a, b, c, d] = g.points;
      badges.push({ key: `e:${e.id}`, at: { x: (a.x + 3 * b.x + 3 * c.x + d.x) / 8, y: (a.y + 3 * b.y + 3 * c.y + d.y) / 8 }, count: open.length, threadId: open[0].id });
    }
  }
  return (
    <g className="comment-badges">
      {badges.map((b) => (
        <g
          key={b.key}
          data-badge
          transform={`translate(${b.at.x} ${b.at.y})`}
          style={{ cursor: 'pointer' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            showThread(b.threadId);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <title>{`${b.count} open comment thread${b.count > 1 ? 's' : ''}: click to read`}</title>
          <circle r={9} fill="#ea580c" stroke="#fff" strokeWidth={2} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="#fff">
            {b.count > 9 ? '9+' : b.count}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Inline box opened by a right-click on the canvas. */
export function CommentPopover({ at, item, onClose }: { at: { x: number; y: number }; item: Commentable; onClose(): void }) {
  const userName = useStore((s) => s.ui.userName);
  const setUi = useStore((s) => s.setUi);
  const addComment = useStore((s) => s.addComment);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);
  const post = () => {
    if (addComment(item.target, text)) onClose();
  };
  const x = Math.min(at.x, window.innerWidth - 300);
  const y = Math.min(at.y, window.innerHeight - 220);
  return (
    <div className="comment-pop" ref={ref} style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      <div className="cm-title">Comment on {item.label}</div>
      {!userName ? (
        <div className="comment-new">
          <label className="field">
            <span>Your name first (shown on your comments)</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && setUi({ userName: name.trim() })} />
          </label>
          <button className="primary" disabled={!name.trim()} onClick={() => setUi({ userName: name.trim() })}>
            Continue
          </button>
        </div>
      ) : (
        <div className="comment-new">
          <textarea autoFocus rows={3} placeholder={`Comment as ${userName}…`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && post()} />
          <div className="btn-row">
            <button className="primary" disabled={!text.trim()} onClick={post}>
              Comment
            </button>
            <button className="link" onClick={onClose}>
              Cancel
            </button>
            <span className="muted small">⌘/Ctrl+Enter</span>
          </div>
        </div>
      )}
    </div>
  );
}
