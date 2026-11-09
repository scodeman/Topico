import type { CSSProperties, MouseEvent, ReactNode, SVGProps } from 'react';
import { stepState } from '../engine/animation';
import { TOPIC_FONT, TOPIC_PAD, fitFontSize, labelArea, textWidth, type TopicTextMode, type EdgeGeom, type Layout, type NodeGeom, type Rect, type TabGeom } from '../engine/layout';
import type { ViewModel } from '../engine/view';
import type { Group } from '../model/types';

export const COLORS = {
  ink: '#1e293b',
  muted: '#64748b',
  centreFill: '#eef2f8',
  nodeFill: '#ffffff',
  nodeSide: '#dbe2ec',
  etlFill: '#1e293b',
  accent: '#2563eb',
  bg: '#ffffff',
};
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';

export interface DiagramHandlers {
  onNodeClick(id: string, e: MouseEvent): void;
  onNodeDoubleClick(id: string, e: MouseEvent): void;
  onTabClick(topicId: string, e: MouseEvent): void;
  onTabDoubleClick(topicId: string, e: MouseEvent): void;
  onHoverTopic(topicId: string | null): void;
  /** Pressing a system may start dragging it. */
  onNodeMouseDown?(id: string, e: MouseEvent): void;
}

export interface DiagramProps {
  layout: Layout;
  vm: ViewModel;
  groups: Group[];
  showStubs: boolean;
  selectedNodes?: Set<string>;
  selectedTopics?: Set<string>;
  hoverTopic?: string | null;
  handlers?: DiagramHandlers;
  /** Animate geometry changes (screen only). */
  animate?: boolean;
  /** Standalone SVG document (export). */
  standalone?: boolean;
  /** Extra attributes for the root <svg> (viewBox, handlers…) when embedded on screen. */
  svgProps?: SVGProps<SVGSVGElement>;
  /** Drawn on top of the diagram (drag and drop feedback). */
  overlay?: ReactNode;
  /** How topic names longer than their box are shown (default: rolling text). */
  topicText?: TopicTextMode;
  /** Chain sequence being animated: arrows are styled by step, with step numbers. */
  anim?: { edgeSteps: Map<string, number[]>; current: number; color: string } | null;
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

export function DiagramSvg(p: DiagramProps) {
  const { layout, vm, groups, handlers, animate } = p;
  // Hidden groups lose their colouring: no chain colour, no bundle outline.
  const groupColor = new Map(groups.filter((g) => !g.hidden).map((g) => [g.id, g.color]));
  const chainColor = (chainId: string | null | undefined) => (chainId ? groupColor.get(chainId) : undefined);
  const active = p.hoverTopic ?? null;
  const dim = (topicId: string) => (active && active !== topicId ? 0.12 : 1);
  // An arrow is highlighted when hovering one of its tabs or one of the topics it carries.
  const edgeHit = (e: EdgeGeom) =>
    !active || e.topicIds.includes(active) || e.fromKey.endsWith(`|${active}`) || e.toKey.endsWith(`|${active}`);
  const t = animate ? 'transform .35s ease, width .35s ease, height .35s ease, opacity .2s' : undefined;
  const move = (r: Rect): CSSProperties | undefined => (animate ? { transform: `translate(${r.x}px,${r.y}px)`, transition: t } : undefined);
  const at = (r: Rect) => (animate ? undefined : `translate(${r.x},${r.y})`);
  const b = layout.bounds;
  const chainColors = (ids: string[]) => ids.map((c) => chainColor(c)).filter((c): c is string => !!c);
  const edgeColors = [...new Set([...layout.edges.map((e) => chainColors(e.chainIds)[0] ?? COLORS.muted), ...(p.anim ? [p.anim.color] : [])])];
  const anim = p.anim;

  const node = (n: NodeGeom) => {
    const sel = p.selectedNodes?.has(n.id);
    const { w, h } = n.rect;
    const etl = n.kind === 'etl';
    const d = 8; // fake 3D depth for systems
    return (
      <g
        key={n.id}
        data-id={n.id}
        transform={at(n.rect)}
        style={{ ...move(n.rect), cursor: handlers ? 'pointer' : undefined }}
        onMouseDown={handlers?.onNodeMouseDown ? (e) => handlers.onNodeMouseDown!(n.id, e) : undefined}
        onClick={handlers ? (e) => handlers.onNodeClick(n.id, e) : undefined}
        onDoubleClick={handlers ? (e) => handlers.onNodeDoubleClick(n.id, e) : undefined}
      >
        {etl ? (
          <>
            <rect width={w} height={h} rx={6} fill={COLORS.etlFill} stroke={sel ? COLORS.accent : COLORS.etlFill} strokeWidth={sel ? 3 : 1} />
            <EtlLoop n={n} />
          </>
        ) : (
          <>
            <path d={`M0,0 L${d},${-d} L${w + d},${-d} L${w + d},${h - d} L${w},${h} L${w},0 Z`} fill={COLORS.nodeSide} stroke={COLORS.ink} strokeWidth={1} />
            <path d={`M${w},0 L${w + d},${-d}`} stroke={COLORS.ink} strokeWidth={1} />
            <rect width={w} height={h} fill={COLORS.nodeFill} stroke={sel ? COLORS.accent : COLORS.ink} strokeWidth={sel ? 3 : 1.2} />
          </>
        )}
        <NodeLabel n={n} />
      </g>
    );
  };

  const tab = (tg: TabGeom) => {
    const topic = vm.topics[tg.topicId];
    const sel = p.selectedTopics?.has(tg.topicId);
    const fills = chainColors(tg.chainIds);
    const { w, h } = tg.rect;
    return (
      <g
        key={tg.key}
        transform={at(tg.rect)}
        style={{ ...move(tg.rect), cursor: handlers ? 'pointer' : undefined, opacity: dim(tg.topicId) }}
        onClick={handlers ? (e) => handlers.onTabClick(tg.topicId, e) : undefined}
        onDoubleClick={handlers ? (e) => handlers.onTabDoubleClick(tg.topicId, e) : undefined}
        onMouseEnter={handlers ? () => handlers.onHoverTopic(tg.topicId) : undefined}
        onMouseLeave={handlers ? () => handlers.onHoverTopic(null) : undefined}
      >
        <title>{`${topic?.name ?? tg.topicId} — ${tg.role}${tg.chainIds.length ? ` — chain: ${tg.chainIds.map((c) => groups.find((g) => g.id === c)?.name).join(', ')}` : ''}`}</title>
        <rect width={w} height={h} fill={COLORS.nodeFill} stroke={sel ? COLORS.accent : COLORS.ink} strokeWidth={sel ? 2.4 : 1} />
        {/* One band per chain, across the tab's thickness. */}
        {fills.map((f, i) =>
          tg.vertical ? (
            <rect key={f} x={(w / fills.length) * i} width={w / fills.length} height={h} fill={f} fillOpacity={0.25} />
          ) : (
            <rect key={f} y={(h / fills.length) * i} width={w} height={h / fills.length} fill={f} fillOpacity={0.25} />
          ),
        )}
        {topic?.isGroup && <rect x={2} y={2} width={w - 4} height={h - 4} fill="none" stroke={COLORS.ink} strokeDasharray="2 2" strokeWidth={0.8} />}
        <TopicLabel id={tg.key} text={topic?.name ?? tg.topicId} width={w} height={h} vertical={tg.vertical} mode={p.topicText ?? 'scroll'} />
      </g>
    );
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={p.standalone ? `${b.x} ${b.y} ${b.w} ${b.h}` : undefined}
      width={p.standalone ? b.w : undefined}
      height={p.standalone ? b.h : undefined}
      fontFamily={FONT}
      {...p.svgProps}
    >
      <defs>
        {edgeColors.map((c) => (
          <marker key={c} id={markerId(c)} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
        <marker id="arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.muted} />
        </marker>
      </defs>
      {p.standalone && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={COLORS.bg} />}

      <g
        data-id="centre"
        style={{ cursor: handlers ? 'pointer' : undefined }}
        onClick={handlers ? (e) => handlers.onNodeClick('centre', e) : undefined}
        onDoubleClick={handlers ? (e) => handlers.onNodeDoubleClick('centre', e) : undefined}
      >
        <rect
          x={0}
          y={0}
          width={layout.centre.w}
          height={layout.centre.h}
          fill={COLORS.centreFill}
          stroke={p.selectedNodes?.has('centre') ? COLORS.accent : COLORS.ink}
          strokeWidth={p.selectedNodes?.has('centre') ? 3 : 1.4}
          style={animate ? { transition: t } : undefined}
        />
        <text x={layout.centre.w / 2} y={layout.centre.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight={700} fill={COLORS.muted} letterSpacing={1}>
          {vm.centreName}
        </text>
      </g>

      {layout.nodes.map(node)}

      <g fill="none">
        {layout.edges.map((e) => {
          const style = animate ? ({ d: `path("${e.d}")`, transition: 'd .35s ease, opacity .2s' } as CSSProperties) : undefined;
          if (anim) {
            // Sequence playback: current step flows, earlier steps stay lit, later steps and other arrows fade.
            const state = stepState(anim.edgeSteps.get(e.id), anim.current);
            const lit = state === 'active' || state === 'done';
            const col = lit ? anim.color : COLORS.muted;
            return (
              <g key={e.id} opacity={{ active: 1, done: 0.85, pending: 0.3, off: 0.08 }[state]}>
                <path
                  d={e.d}
                  stroke={col}
                  strokeWidth={state === 'active' ? 3.4 : lit ? 2.2 : 1.3}
                  strokeDasharray={state === 'active' ? '10 6' : state === 'pending' ? '3 4' : undefined}
                  markerEnd={`url(#${markerId(col)})`}
                  style={style}
                >
                  {state === 'active' && <animate attributeName="stroke-dashoffset" from="32" to="0" dur="0.8s" repeatCount="indefinite" />}
                </path>
              </g>
            );
          }
          const colors = chainColors(e.chainIds);
          const c = colors[0] ?? COLORS.muted;
          const hit = edgeHit(e);
          const width = active && hit ? 2.2 : colors.length ? 1.8 : 1.3;
          const opacity = (hit ? 1 : 0.12) * 0.9;
          const DASH = 8;
          return (
            <g key={e.id} opacity={opacity}>
              <title>{e.chainIds.length ? `Chains: ${e.chainIds.map((x) => groups.find((g) => g.id === x)?.name).join(', ')}` : ''}</title>
              <path d={e.d} stroke={c} strokeWidth={width} markerEnd={`url(#${markerId(c)})`} style={style} />
              {/* Shared by several chains: overlay alternating dashes in each further chain colour. */}
              {colors.slice(1).map((col, i) => (
                <path
                  key={col}
                  d={e.d}
                  stroke={col}
                  strokeWidth={width}
                  strokeDasharray={`${DASH} ${DASH * colors.length - DASH}`}
                  strokeDashoffset={-DASH * (i + 1)}
                  style={style}
                />
              ))}
            </g>
          );
        })}
        {p.showStubs &&
          layout.stubs.map((s) => (
            <path key={s.id} d={s.d} stroke={COLORS.muted} strokeWidth={1.2} strokeDasharray="4 3" markerEnd="url(#arrow-muted)" opacity={dim(s.topicId) * 0.8}>
              <title>{s.outgoing ? 'Also consumed by filtered-out systems' : 'Also produced by filtered-out systems'}</title>
            </path>
          ))}
      </g>

      {layout.nodes.flatMap((n) => n.tabs.map(tab))}

      {anim &&
        layout.edges.map((e) => {
          const steps = anim.edgeSteps.get(e.id);
          if (!steps?.length) return null;
          const state = stepState(steps, anim.current);
          const [p0, p1, p2, p3] = e.points;
          const m = { x: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8, y: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8 };
          return <StepBadge key={`badge:${e.id}`} at={m} steps={steps} state={state} color={anim.color} />;
        })}

      {layout.brackets.filter((br) => groupColor.has(br.groupId)).map((br) => (
        <rect
          key={br.key}
          x={br.rect.x}
          y={br.rect.y}
          width={br.rect.w}
          height={br.rect.h}
          rx={4}
          fill="none"
          stroke={groupColor.get(br.groupId)}
          strokeWidth={2}
          pointerEvents="none"
        />
      ))}
      {p.overlay}
    </svg>
  );
}

/**
 * A topic name inside its box. A name that fits is simply centred. A longer one rolls back and forth
 * inside the box in 'scroll' mode; otherwise it is reduced to fit ('fit' boxes are already wide enough,
 * except a tube bar limited by its tube).
 */
export function TopicLabel(p: { id: string; text: string; width: number; height: number; vertical?: boolean; mode: TopicTextMode }) {
  const length = p.vertical ? p.height : p.width;
  const thickness = p.vertical ? p.width : p.height;
  const room = length - TOPIC_PAD;
  const full = textWidth(p.text);
  const frame = `translate(${p.width / 2} ${p.height / 2})${p.vertical ? ' rotate(-90)' : ''}`;
  if (p.mode === 'scroll' && full > room) {
    const clipId = `topic-clip-${p.id.replace(/[^a-zA-Z0-9]/g, (c) => `_${c.charCodeAt(0)}`)}`;
    const shift = Math.ceil(full - room);
    const seconds = Math.max(4, (shift / 30) * 2 + 3);
    return (
      <g transform={frame}>
        <clipPath id={clipId}>
          <rect x={-length / 2 + 2} y={-thickness / 2} width={length - 4} height={thickness} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          <text x={-room / 2} y={0} dominantBaseline="central" fontSize={TOPIC_FONT} fill={COLORS.ink}>
            <animateTransform
              attributeName="transform"
              type="translate"
              values={`0 0;0 0;${-shift} 0;${-shift} 0;0 0`}
              keyTimes="0;0.15;0.5;0.65;1"
              dur={`${seconds.toFixed(1)}s`}
              repeatCount="indefinite"
            />
            {p.text}
          </text>
        </g>
      </g>
    );
  }
  return (
    <text transform={frame} textAnchor="middle" dominantBaseline="central" fontSize={fitFontSize(p.text, length)} fill={COLORS.ink}>
      {p.text}
    </text>
  );
}

/** Step number(s) of an arrow during sequence playback. */
export function StepBadge({ at, steps, state, color }: { at: { x: number; y: number }; steps: number[]; state: string; color: string }) {
  const text = steps.join(',');
  const r = state === 'active' ? 12 : 9;
  const w = Math.max(2 * r, text.length * 6.5 + 8);
  const lit = state === 'active' || state === 'done';
  return (
    <g pointerEvents="none" opacity={state === 'pending' ? 0.6 : 1}>
      <rect x={at.x - w / 2} y={at.y - r} width={w} height={2 * r} rx={r} fill={lit ? color : '#fff'} stroke={lit ? '#fff' : COLORS.muted} strokeWidth={1.5} />
      <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" fontSize={state === 'active' ? 12 : 10} fontWeight={700} fill={lit ? '#fff' : COLORS.muted}>
        {text}
      </text>
    </g>
  );
}

const markerId = (color: string) => `arrow-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

function wrap(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines).map((l) => truncate(l, maxChars));
  if (lines.length > maxLines) out[maxLines - 1] = truncate(`${out[maxLines - 1]} …`, maxChars);
  return out;
}

function NodeLabel({ n }: { n: NodeGeom }) {
  const etl = n.kind === 'etl';
  const size = etl ? 10 : 12;
  const a = labelArea(n);
  const lines = wrap(n.name, Math.max(3, Math.floor((a.w - 8) / (size * 0.62))));
  const lh = size * 1.25;
  const y0 = a.y + a.h / 2 - ((lines.length - 1) * lh) / 2;
  return (
    <text textAnchor="middle" dominantBaseline="middle" fontFamily={FONT} fontSize={size} fontWeight={600} fill={etl ? '#fff' : COLORS.ink}>
      {lines.map((l, i) => (
        <tspan key={i} x={a.x + a.w / 2} y={y0 + i * lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function EtlLoop({ n }: { n: NodeGeom }) {
  // Small "processing loop" glyph on the outer side of an ETL.
  const { w, h } = n.rect;
  const pos = { W: [-2, h / 2], E: [w + 2, h / 2], N: [w / 2, -2], S: [w / 2, h + 2] }[n.side];
  const [cx, cy] = pos;
  const r = 9;
  return (
    <path
      d={`M${cx - r * 0.7},${cy - r * 0.7} A${r},${r} 0 1 1 ${cx - r * 0.7},${cy + r * 0.7}`}
      fill="none"
      stroke={COLORS.etlFill}
      strokeWidth={1.4}
      markerEnd="url(#arrow-muted)"
      transform={n.side === 'W' ? `rotate(180 ${cx} ${cy})` : n.side === 'N' ? `rotate(-90 ${cx} ${cy})` : n.side === 'S' ? `rotate(90 ${cx} ${cy})` : undefined}
    />
  );
}
