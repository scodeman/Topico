import type { CSSProperties, MouseEvent, SVGProps } from 'react';
import { labelArea, type Layout, type NodeGeom, type Rect, type TabGeom } from '../engine/layout';
import type { ViewModel } from '../engine/view';
import type { Group } from '../model/types';

export const COLORS = {
  ink: '#1e293b',
  muted: '#64748b',
  centreFill: '#eef2f8',
  nodeFill: '#ffffff',
  nodeSide: '#dbe2ec',
  exeFill: '#1e293b',
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
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

export function DiagramSvg(p: DiagramProps) {
  const { layout, vm, groups, handlers, animate } = p;
  const groupColor = new Map(groups.map((g) => [g.id, g.color]));
  const chainColor = (topicId: string) => {
    const c = vm.topics[topicId]?.chainId;
    return c ? groupColor.get(c) : undefined;
  };
  const active = p.hoverTopic ?? null;
  const dim = (topicId: string) => (active && active !== topicId ? 0.12 : 1);
  const t = animate ? 'transform .35s ease, width .35s ease, height .35s ease, opacity .2s' : undefined;
  const move = (r: Rect): CSSProperties | undefined => (animate ? { transform: `translate(${r.x}px,${r.y}px)`, transition: t } : undefined);
  const at = (r: Rect) => (animate ? undefined : `translate(${r.x},${r.y})`);
  const b = layout.bounds;
  const edgeColors = [...new Set(layout.edges.map((e) => chainColor(e.topicId) ?? COLORS.muted))];

  const node = (n: NodeGeom) => {
    const sel = p.selectedNodes?.has(n.id);
    const { w, h } = n.rect;
    const exe = n.kind === 'exe';
    const d = 8; // fake 3D depth for systems
    return (
      <g
        key={n.id}
        data-id={n.id}
        transform={at(n.rect)}
        style={{ ...move(n.rect), cursor: handlers ? 'pointer' : undefined }}
        onClick={handlers ? (e) => handlers.onNodeClick(n.id, e) : undefined}
        onDoubleClick={handlers ? (e) => handlers.onNodeDoubleClick(n.id, e) : undefined}
      >
        {exe ? (
          <>
            <rect width={w} height={h} rx={6} fill={COLORS.exeFill} stroke={sel ? COLORS.accent : COLORS.exeFill} strokeWidth={sel ? 3 : 1} />
            <ExeLoop n={n} />
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
    const fill = chainColor(tg.topicId);
    const { w, h } = tg.rect;
    const label = truncate(topic?.name ?? tg.topicId, 15);
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
        <title>{`${topic?.name ?? tg.topicId} — ${tg.role}`}</title>
        <rect width={w} height={h} fill={COLORS.nodeFill} stroke={sel ? COLORS.accent : COLORS.ink} strokeWidth={sel ? 2.4 : 1} />
        {fill && <rect width={w} height={h} fill={fill} fillOpacity={0.22} />}
        {topic?.isGroup && <rect x={2} y={2} width={w - 4} height={h - 4} fill="none" stroke={COLORS.ink} strokeDasharray="2 2" strokeWidth={0.8} />}
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={FONT}
          fontSize={10}
          fill={COLORS.ink}
          transform={tg.vertical ? `rotate(-90 ${w / 2} ${h / 2})` : undefined}
        >
          {label}
        </text>
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
          <marker key={c} id={markerId(c)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
        <marker id="arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
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
          const c = chainColor(e.topicId) ?? COLORS.muted;
          return (
            <path
              key={e.id}
              d={e.d}
              stroke={c}
              strokeWidth={active === e.topicId ? 2.2 : 1.3}
              markerEnd={`url(#${markerId(c)})`}
              opacity={dim(e.topicId) * 0.9}
              style={animate ? { d: `path("${e.d}")`, transition: 'd .35s ease, opacity .2s' } as CSSProperties : undefined}
            />
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

      {layout.brackets.map((br) => (
        <rect
          key={br.key}
          x={br.rect.x}
          y={br.rect.y}
          width={br.rect.w}
          height={br.rect.h}
          rx={4}
          fill="none"
          stroke={groupColor.get(br.groupId) ?? COLORS.muted}
          strokeWidth={2}
          pointerEvents="none"
        />
      ))}
    </svg>
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
  const exe = n.kind === 'exe';
  const size = exe ? 10 : 12;
  const a = labelArea(n);
  const lines = wrap(n.name, Math.max(3, Math.floor((a.w - 8) / (size * 0.62))));
  const lh = size * 1.25;
  const y0 = a.y + a.h / 2 - ((lines.length - 1) * lh) / 2;
  return (
    <text textAnchor="middle" dominantBaseline="middle" fontFamily={FONT} fontSize={size} fontWeight={600} fill={exe ? '#fff' : COLORS.ink}>
      {lines.map((l, i) => (
        <tspan key={i} x={a.x + a.w / 2} y={y0 + i * lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function ExeLoop({ n }: { n: NodeGeom }) {
  // Small "processing loop" glyph on the outer side of an executable.
  const { w, h } = n.rect;
  const pos = { W: [-2, h / 2], E: [w + 2, h / 2], N: [w / 2, -2], S: [w / 2, h + 2] }[n.side];
  const [cx, cy] = pos;
  const r = 9;
  return (
    <path
      d={`M${cx - r * 0.7},${cy - r * 0.7} A${r},${r} 0 1 1 ${cx - r * 0.7},${cy + r * 0.7}`}
      fill="none"
      stroke={COLORS.exeFill}
      strokeWidth={1.4}
      markerEnd="url(#arrow-muted)"
      transform={n.side === 'W' ? `rotate(180 ${cx} ${cy})` : n.side === 'N' ? `rotate(-90 ${cx} ${cy})` : n.side === 'S' ? `rotate(90 ${cx} ${cy})` : undefined}
    />
  );
}
