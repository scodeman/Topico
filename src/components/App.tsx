import { useState } from 'react';
import { useStore } from '../model/store';
import { Canvas } from './Canvas';
import { DetailsPane } from './DetailsPane';
import { Explorer } from './Explorer';
import { PANELS, PanelSplitter, RAIL_WIDTH, SPLITTER_WIDTH, clampPanelWidth, type PanelSide } from './PanelSplitter';
import { Toolbar } from './Toolbar';

export function App() {
  const ui = useStore((s) => s.ui);
  // Panel being dragged and its size; the store is only updated on release.
  const [drag, setDrag] = useState<{ side: PanelSide; size: number } | null>(null);
  const report = (side: PanelSide) => (size: number | null) => setDrag(size === null ? null : { side, size });
  const state = (side: PanelSide, saved: number, savedCollapsed: boolean) => {
    const size = drag?.side === side ? drag.size : null;
    return { raw: size ?? saved, collapsed: size !== null ? size < PANELS[side].collapseBelow : savedCollapsed };
  };
  const space = (w: number, collapsed: boolean) => (collapsed ? RAIL_WIDTH : w + SPLITTER_WIDTH);

  const l = state('left', ui.explorerWidth, ui.explorerCollapsed);
  const r = state('right', ui.detailsWidth, ui.detailsCollapsed);
  const leftWidth = clampPanelWidth('left', l.raw, space(r.raw, r.collapsed));
  const rightWidth = clampPanelWidth('right', r.raw, space(leftWidth, l.collapsed));
  const leftColumns = l.collapsed ? `${RAIL_WIDTH}px` : `${leftWidth}px ${SPLITTER_WIDTH}px`;
  const rightColumns = r.collapsed ? `${RAIL_WIDTH}px` : `${SPLITTER_WIDTH}px ${rightWidth}px`;

  return (
    <div className="app">
      <Toolbar />
      <main className="workspace" style={{ gridTemplateColumns: `${leftColumns} minmax(0, 1fr) ${rightColumns}` }}>
        <Explorer hidden={l.collapsed} />
        <PanelSplitter side="left" width={leftWidth} otherSpace={space(rightWidth, r.collapsed)} collapsed={l.collapsed} onDrag={report('left')} />
        <Canvas />
        <PanelSplitter side="right" width={rightWidth} otherSpace={space(leftWidth, l.collapsed)} collapsed={r.collapsed} onDrag={report('right')} />
        <DetailsPane hidden={r.collapsed} />
      </main>
    </div>
  );
}
