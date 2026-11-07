import type { MouseEvent, SVGProps } from 'react';
import type { SosLayout, SosNode } from '../engine/sosView';
import { COLORS } from './DiagramSvg';

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
export const NOTE = { fill: '#fff2cc', stroke: '#d6b656' };
const ARROW = '#475569';

export interface SosHandlers {
  onNodeClick(id: string, e: MouseEvent): void;
}

export interface SosSvgProps {
  layout: SosLayout;
  selectedNodes?: Set<string>;
  handlers?: SosHandlers;
  standalone?: boolean;
  svgProps?: SVGProps<SVGSVGElement>;
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

/** System of System view (see docs/spec/images/SOS.png). */
export function SosSvg(p: SosSvgProps) {
  const { layout: l, handlers } = p;
  const b = l.bounds;
  const box = l.box;

  const node = (n: SosNode) => {
    const { x, y, w, h } = n.rect;
    const sel = p.selectedNodes?.has(n.id);
    const stroke = sel ? COLORS.accent : COLORS.ink;
    const sw = sel ? 3 : 1.2;
    const click = handlers ? (e: MouseEvent) => handlers.onNodeClick(n.id, e) : undefined;
    const cursor = handlers ? 'pointer' : undefined;
    if (n.container) {
      // A parent framing its shown descendants, with a title bar.
      return (
        <g key={n.id} data-id={n.id} transform={`translate(${x},${y})`} style={{ cursor }} onClick={click}>
          <rect width={w} height={h} fill="#fff" fillOpacity={0.6} stroke={stroke} strokeWidth={sw} />
          <rect width={w} height={24} fill={n.kind === 'etl' ? '#cbd5e1' : '#f1f5f9'} stroke={stroke} strokeWidth={sw} />
          <text x={w / 2} y={12} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill={COLORS.ink}>
            {truncate(n.name, Math.floor(w / 7.5))}
          </text>
        </g>
      );
    }
    const d = 8;
    return (
      <g key={n.id} data-id={n.id} transform={`translate(${x},${y})`} style={{ cursor }} onClick={click}>
        {n.kind === 'etl' ? (
          <rect width={w} height={h} rx={6} fill={COLORS.etlFill} stroke={sel ? COLORS.accent : COLORS.etlFill} strokeWidth={sw} />
        ) : (
          <>
            <path d={`M0,0 L${d},${-d} L${w + d},${-d} L${w + d},${h - d} L${w},${h} L${w},0 Z`} fill={COLORS.nodeSide} stroke={COLORS.ink} />
            <rect width={w} height={h} fill={COLORS.nodeFill} stroke={stroke} strokeWidth={sw} />
          </>
        )}
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fontWeight={600}
          fill={n.kind === 'etl' ? '#fff' : COLORS.ink}
        >
          {truncate(n.name, Math.floor(w / 7.4))}
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
        <marker id="sos-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={ARROW} />
        </marker>
      </defs>
      {p.standalone && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={COLORS.bg} />}

      {/* The System of System box with its title bar. */}
      <g data-id="sos">
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#fff" stroke={COLORS.ink} strokeWidth={1.6} />
        <rect x={box.x} y={box.y} width={box.w} height={30} fill="#f8fafc" stroke={COLORS.ink} strokeWidth={1.6} />
        <text x={box.x + box.w / 2} y={box.y + 15} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill={COLORS.ink}>
          {l.title}
        </text>
      </g>

      {l.nodes.map(node)}

      {l.callouts.map((c) => (
        <g key={c.id} data-note={c.nodeId}>
          <rect x={c.rect.x} y={c.rect.y} width={c.rect.w} height={c.rect.h} fill={NOTE.fill} stroke={NOTE.stroke} />
          <polygon points={c.tail.map((v) => `${v.x},${v.y}`).join(' ')} fill={NOTE.fill} stroke={NOTE.stroke} />
          {/* Hide the callout border under the tail's base. */}
          <line x1={c.tail[0].x} y1={c.tail[0].y} x2={c.tail[1].x} y2={c.tail[1].y} stroke={NOTE.fill} strokeWidth={2} />
          <text fontSize={10} fill={COLORS.ink}>
            {c.lines.map((line, i) => (
              <tspan key={i} x={c.rect.x + 8} y={c.rect.y + 8 + 13 * i + 10} fontWeight={line.heading ? 700 : 400}>
                {line.text}
              </tspan>
            ))}
          </text>
        </g>
      ))}

      <g fill="none">
        {l.arrows.map((a) => (
          <g key={a.id} data-arrow={a.id}>
            <title>{a.label.full}</title>
            <path d={a.d} stroke={ARROW} strokeWidth={1.3} markerEnd="url(#sos-arrow)" />
            <text
              x={a.label.at.x}
              y={a.label.at.y}
              textAnchor={a.label.anchor}
              dominantBaseline="middle"
              fontSize={9.5}
              fill={COLORS.ink}
              stroke="#fff"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {a.label.text}
            </text>
          </g>
        ))}
      </g>

      {l.empty && (
        <text x={box.x + box.w / 2} y={box.y + box.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill={COLORS.muted}>
          No system is part of the SoS view yet. Set systems as Inner or Outer.
        </text>
      )}
    </svg>
  );
}
