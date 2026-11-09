import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useStore, type UiState } from '../model/store';

export type PanelSide = 'left' | 'right';

/** Sizes in pixels. Dragging a handle closer to the window edge than `collapseBelow` collapses its panel. */
export const PANELS: Record<PanelSide, { default: number; min: number; max: number; collapseBelow: number }> = {
  left: { default: 260, min: 180, max: 640, collapseBelow: 110 },
  right: { default: 340, min: 240, max: 720, collapseBelow: 140 },
};
const CANVAS_MIN = 300;
export const SPLITTER_WIDTH = 6;
export const RAIL_WIDTH = 16;

/** Keeps a panel within its limits, leaving room for the canvas next to the other panel (`otherSpace` pixels wide). */
export function clampPanelWidth(side: PanelSide, w: number, otherSpace: number): number {
  const p = PANELS[side];
  const room = window.innerWidth - otherSpace - SPLITTER_WIDTH - CANVAS_MIN;
  return Math.round(Math.max(p.min, Math.min(w, p.max, Math.max(p.min, room))));
}

const patch = (side: PanelSide, width: number | null, collapsed: boolean): Partial<UiState> =>
  side === 'left'
    ? { explorerCollapsed: collapsed, ...(width !== null ? { explorerWidth: width } : {}) }
    : { detailsCollapsed: collapsed, ...(width !== null ? { detailsWidth: width } : {}) };

/**
 * Handle between a side panel and the canvas: drag to resize, double-click to reset, button to collapse.
 * While dragging, the panel size is only reported to the parent; it is saved once on release.
 */
export function PanelSplitter(p: { side: PanelSide; width: number; otherSpace: number; collapsed: boolean; onDrag(size: number | null): void }) {
  const { side, width, otherSpace, collapsed, onDrag } = p;
  const setUi = useStore((s) => s.setUi);
  const drag = useRef<{ grab: number; size: number | null } | null>(null);
  // Distance of the pointer from the window edge the panel is attached to.
  const fromEdge = (clientX: number) => (side === 'left' ? clientX : window.innerWidth - clientX);

  const toggle = () => setUi(patch(side, null, !collapsed));
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { grab: collapsed ? 0 : fromEdge(e.clientX) - width, size: null };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.size = fromEdge(e.clientX) - drag.current.grab;
    onDrag(drag.current.size);
  };
  const finish = (commit: boolean) => {
    const size = drag.current?.size ?? null;
    drag.current = null;
    onDrag(null);
    if (!commit || size === null) return;
    setUi(size < PANELS[side].collapseBelow ? patch(side, null, true) : patch(side, clampPanelWidth(side, size, otherSpace), false));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Arrows move the handle, so the right panel grows with the left arrow.
    const delta = (e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0) * (side === 'left' ? 1 : -1);
    if (delta && !collapsed) {
      e.preventDefault();
      setUi(patch(side, clampPanelWidth(side, width + delta, otherSpace), false));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  };
  const name = side === 'left' ? 'left' : 'right';
  // The chevron points the way the panel will move.
  const chevron = (side === 'left') === collapsed ? '›' : '‹';

  return (
    <div
      className={`panel-splitter ${side}${collapsed ? ' collapsed' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${name} panel`}
      aria-valuenow={collapsed ? 0 : width}
      aria-valuemin={PANELS[side].min}
      aria-valuemax={PANELS[side].max}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      onDoubleClick={() => setUi(patch(side, PANELS[side].default, false))}
      onKeyDown={onKeyDown}
    >
      <button
        className="panel-toggle"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        title={collapsed ? `Show the ${name} panel` : `Collapse the ${name} panel`}
        aria-expanded={!collapsed}
      >
        {chevron}
      </button>
    </div>
  );
}
