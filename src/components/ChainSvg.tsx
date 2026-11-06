import type { MouseEvent, SVGProps } from 'react';
import type { ChainLayout, ChainNode } from '../engine/chainView';
import { COLORS } from './DiagramSvg';

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';

export interface ChainHandlers {
  onNodeClick(id: string, e: MouseEvent): void;
  onBarClick(topicId: string, e: MouseEvent): void;
  onHoverTopic(topicId: string | null): void;
}

export interface ChainSvgProps {
  layout: ChainLayout;
  selectedNodes?: Set<string>;
  selectedTopics?: Set<string>;
  hoverTopic?: string | null;
  handlers?: ChainHandlers;
  standalone?: boolean;
  svgProps?: SVGProps<SVGSVGElement>;
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

/** Broker-tube rendering of one chain (see docs/spec/images/CHAIN.png). */
export function ChainSvg(p: ChainSvgProps) {
  const { layout: l, handlers } = p;
  const b = l.bounds;
  const t = l.tube;
  const cap = Math.min(18, t.h / 4); // horizontal radius of the tube's end caps
  const dim = (topicId: string) => (p.hoverTopic && p.hoverTopic !== topicId ? 0.15 : 1);
  const color = l.color;
  const markerId = `chain-arrow-${l.chainId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const node = (n: ChainNode) => {
    const { x, y, w, h } = n.rect;
    const sel = p.selectedNodes?.has(n.id);
    const etl = n.kind === 'etl';
    const d = 8;
    return (
      <g
        key={n.id}
        data-id={n.id}
        transform={`translate(${x},${y})`}
        style={{ cursor: handlers ? 'pointer' : undefined }}
        onClick={handlers ? (e) => handlers.onNodeClick(n.id, e) : undefined}
      >
        {etl ? (
          <rect width={w} height={h} rx={6} fill={COLORS.etlFill} stroke={sel ? COLORS.accent : COLORS.etlFill} strokeWidth={sel ? 3 : 1} />
        ) : (
          <>
            <path d={`M0,0 L${d},${-d} L${w + d},${-d} L${w + d},${h - d} L${w},${h} L${w},0 Z`} fill={COLORS.nodeSide} stroke={COLORS.ink} />
            <rect width={w} height={h} fill={COLORS.nodeFill} stroke={sel ? COLORS.accent : COLORS.ink} strokeWidth={sel ? 3 : 1.2} />
          </>
        )}
        <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={etl ? 10 : 12} fontWeight={600} fill={etl ? '#fff' : COLORS.ink}>
          {truncate(n.name, Math.floor(w / (etl ? 6.5 : 7.5)))}
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
        <linearGradient id="tube-fill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#f1f5f9" />
        </linearGradient>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={color} />
        </marker>
      </defs>
      {p.standalone && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={COLORS.bg} />}

      <text x={t.x} y={b.y + 26} fontSize={15} fontWeight={700} fill={COLORS.ink}>
        <tspan fill={color}>■ </tspan>
        {l.title}
      </text>

      {/* The broker as a horizontal tube: body with rounded ends and a visible right-hand face. */}
      <g data-id="tube">
        <path
          d={`M${t.x + cap},${t.y} L${t.x + t.w},${t.y} A${cap},${t.h / 2} 0 0 1 ${t.x + t.w},${t.y + t.h} L${t.x + cap},${t.y + t.h} A${cap},${t.h / 2} 0 0 1 ${t.x + cap},${t.y} Z`}
          fill="url(#tube-fill)"
          stroke={COLORS.muted}
          strokeWidth={1.2}
        />
        <ellipse cx={t.x + t.w} cy={t.y + t.h / 2} rx={cap} ry={t.h / 2} fill="#f8fafc" stroke={COLORS.muted} strokeWidth={1.2} />
      </g>

      {l.nodes.map(node)}

      <g fill="none">
        {l.arrows.map((a) => (
          <g key={a.id} opacity={dim(a.topicId)}>
            <path d={a.d} stroke={color} strokeWidth={1.6} markerEnd={`url(#${markerId})`} />
            {a.label && (
              <text
                x={a.label.horizontal ? a.label.at.x : a.label.at.x + 5}
                y={a.label.horizontal ? a.label.at.y - 8 : a.label.at.y}
                textAnchor={a.label.horizontal ? 'middle' : 'start'}
                fontSize={9}
                fill={COLORS.ink}
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
                dominantBaseline="middle"
              >
                {a.label.text}
              </text>
            )}
          </g>
        ))}
      </g>

      {l.bars.map((bar) => {
        const { x, y, w, h } = bar.rect;
        const sel = p.selectedTopics?.has(bar.topicId);
        return (
          <g
            key={bar.topicId}
            data-topic={bar.topicId}
            transform={`translate(${x},${y})`}
            opacity={dim(bar.topicId)}
            style={{ cursor: handlers ? 'pointer' : undefined }}
            onClick={handlers ? (e) => handlers.onBarClick(bar.topicId, e) : undefined}
            onMouseEnter={handlers ? () => handlers.onHoverTopic(bar.topicId) : undefined}
            onMouseLeave={handlers ? () => handlers.onHoverTopic(null) : undefined}
          >
            <rect width={w} height={h} rx={3} fill="#fff" stroke={sel ? COLORS.accent : COLORS.ink} strokeWidth={sel ? 2.4 : 1} />
            <rect width={w} height={h} rx={3} fill={color} fillOpacity={0.15} />
            <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={COLORS.ink}>
              {truncate(bar.name, Math.floor(w / 6.2))}
            </text>
          </g>
        );
      })}

      {l.empty && (
        <text x={t.x + t.w / 2} y={t.y + t.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill={COLORS.ink}>
          No endpoints in this chain yet
        </text>
      )}
    </svg>
  );
}
