import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useView } from '../engine/useView';
import { CENTRE_ID } from '../model/types';
import { useStore } from '../model/store';
import { AnimationBar } from './AnimationBar';
import { ChainSvg, type ChainHandlers } from './ChainSvg';
import { DiagramSvg, type DiagramHandlers } from './DiagramSvg';
import { SosBar } from './SosBar';
import { SosSvg, type SosHandlers } from './SosSvg';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Canvas() {
  const { model, ui, vm, layout, chainLayout, sosLayout, anim } = useView();
  const setFocus = useStore((s) => s.setFocus);
  const filterOn = useStore((s) => s.filterOn);
  const setUi = useStore((s) => s.setUi);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bounds = chainLayout?.bounds ?? sosLayout?.bounds ?? layout.bounds;
  const [box, setBox] = useState<Box>(bounds);
  const drag = useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null);

  const fit = useCallback(() => setBox(bounds), [bounds]);
  // Re-fit whenever the arrangement changes size (selection, hiding, grouping, chain view…).
  const b = bounds;
  useEffect(fit, [b.x, b.y, b.w, b.h, fit]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setBox((bx) => {
        const scale = Math.max(bx.w / rect.width, bx.h / rect.height);
        // Account for preserveAspectRatio="xMidYMid meet" letterboxing.
        const offX = (rect.width * scale - bx.w) / 2;
        const offY = (rect.height * scale - bx.h) / 2;
        const px = bx.x - offX + (e.clientX - rect.left) * scale;
        const py = bx.y - offY + (e.clientY - rect.top) * scale;
        const f = Math.exp(e.deltaY * 0.0015);
        return { x: px - (px - bx.x) * f, y: py - (py - bx.y) * f, w: bx.w * f, h: bx.h * f };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, box, moved: false };
  };
  const onMouseMove = (e: MouseEvent) => {
    const d = drag.current;
    const el = wrapRef.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    const scale = Math.max(d.box.w / rect.width, d.box.h / rect.height);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setBox({ ...d.box, x: d.box.x - dx * scale, y: d.box.y - dy * scale });
  };
  const endDrag = () => {
    setTimeout(() => (drag.current = null), 0);
  };
  const wasDrag = () => !!drag.current?.moved;

  const handlers: DiagramHandlers = useMemo(
    () => ({
      onNodeClick: (id, e) => {
        e.stopPropagation();
        if (wasDrag()) return;
        setFocus(id === CENTRE_ID ? { kind: 'centre' } : { kind: 'system', id });
      },
      onNodeDoubleClick: (id, e) => {
        e.stopPropagation();
        filterOn('system', id, e.shiftKey || e.metaKey || e.ctrlKey);
      },
      onTabClick: (topicId, e) => {
        e.stopPropagation();
        if (wasDrag()) return;
        setFocus(topicId.startsWith('grp:') ? { kind: 'group', id: topicId.slice(4) } : { kind: 'topic', id: topicId });
      },
      onTabDoubleClick: (topicId, e) => {
        e.stopPropagation();
        filterOn('topic', topicId, e.shiftKey || e.metaKey || e.ctrlKey);
      },
      onHoverTopic: (topicId) => setUi({ hoverTopic: topicId }),
    }),
    [setFocus, filterOn, setUi],
  );
  const chainHandlers: ChainHandlers = useMemo(
    () => ({
      onNodeClick: (id, e) => {
        e.stopPropagation();
        if (!wasDrag()) setFocus({ kind: 'system', id });
      },
      onBarClick: (topicId, e) => {
        e.stopPropagation();
        if (!wasDrag()) setFocus({ kind: 'topic', id: topicId });
      },
      onHoverTopic: (topicId) => setUi({ hoverTopic: topicId }),
    }),
    [setFocus, setUi],
  );
  const sosHandlers: SosHandlers = useMemo(
    () => ({
      onNodeClick: (id, e) => {
        e.stopPropagation();
        if (!wasDrag()) setFocus(id === CENTRE_ID ? { kind: 'centre' } : { kind: 'system', id });
      },
    }),
    [setFocus],
  );

  const focus = ui.focus;
  const selectedNodes = new Set(ui.filterSystems);
  if (focus?.kind === 'system') selectedNodes.add(focus.id);
  if (focus?.kind === 'centre') selectedNodes.add(CENTRE_ID);
  const selectedTopics = new Set(ui.filterTopics);
  if (focus?.kind === 'topic') selectedTopics.add(focus.id);
  if (focus?.kind === 'group') selectedTopics.add(`grp:${focus.id}`);

  return (
    <div className="canvas" ref={wrapRef} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
      {sosLayout ? <SosBar /> : <FilterBar />}
      {sosLayout ? (
        <SosSvg
          layout={sosLayout}
          selectedNodes={selectedNodes}
          handlers={sosHandlers}
          svgProps={{
            viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
            preserveAspectRatio: 'xMidYMid meet',
            className: 'diagram',
            onMouseDown,
          }}
        />
      ) : chainLayout ? (
        <ChainSvg
          layout={chainLayout}
          anim={anim ? { arrowSteps: anim.arrowSteps, current: anim.current } : null}
          selectedNodes={selectedNodes}
          selectedTopics={selectedTopics}
          hoverTopic={ui.hoverTopic}
          handlers={chainHandlers}
          svgProps={{
            viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
            preserveAspectRatio: 'xMidYMid meet',
            className: 'diagram',
            onMouseDown,
          }}
        />
      ) : (
        <DiagramSvg
          layout={layout}
          vm={vm}
          groups={model.groups}
          showStubs={ui.showStubs}
          selectedNodes={selectedNodes}
          selectedTopics={selectedTopics}
          hoverTopic={ui.hoverTopic}
          handlers={handlers}
          anim={anim ? { edgeSteps: anim.edgeSteps, current: anim.current, color: anim.color } : null}
          animate
          svgProps={{
            viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
            preserveAspectRatio: 'xMidYMid meet',
            className: 'diagram',
            onMouseDown,
          }}
        />
      )}
      <div className="canvas-tools">
        <button onClick={fit} title="Fit to screen">Fit</button>
        <button onClick={() => setBox((bx) => zoom(bx, 0.8))} title="Zoom in">+</button>
        <button onClick={() => setBox((bx) => zoom(bx, 1.25))} title="Zoom out">−</button>
      </div>
      {!sosLayout && !anim && <Legend />}
      {anim && <AnimationBar anim={anim} />}
      {!chainLayout && !sosLayout && Object.keys(vm.nodes).length === 0 && (
        <div className="empty-hint">Add systems and topics from the left panel to start drawing.</div>
      )}
    </div>
  );
}

function zoom(b: Box, f: number): Box {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return { x: cx - (b.w * f) / 2, y: cy - (b.h * f) / 2, w: b.w * f, h: b.h * f };
}

function FilterBar() {
  const ui = useStore((s) => s.ui);
  const model = useStore((s) => s.model);
  const filterOn = useStore((s) => s.filterOn);
  const clear = useStore((s) => s.clearFilter);
  const setUi = useStore((s) => s.setUi);
  const sysName = (id: string) => model.systems.find((s) => s.id === id)?.name ?? id;
  const topicName = (id: string) =>
    id.startsWith('grp:') ? model.groups.find((g) => g.id === id.slice(4))?.name ?? id : model.topics.find((t) => t.id === id)?.name ?? id;
  const chips = [
    ...ui.filterSystems.map((id) => ({ id, kind: 'system' as const, label: sysName(id) })),
    ...ui.filterTopics.map((id) => ({ id, kind: 'topic' as const, label: topicName(id) })),
  ];
  const chain = ui.chainView ? model.groups.find((g) => g.id === ui.chainView) : undefined;
  if (chain) {
    return (
      <div className="filter-bar">
        <span className="chip chip-chain" style={{ borderColor: chain.color }}>
          Chain view: {chain.name}
          <button onClick={() => setUi({ chainView: null })} title="Back to the diagram">×</button>
        </span>
        <button className="link" onClick={() => setUi({ chainView: null })}>Back to diagram</button>
      </div>
    );
  }
  return (
    <div className="filter-bar">
      {chips.length === 0 ? (
        <span className="muted">Showing everything. Double-click a system or topic to focus on it (Shift to add more).</span>
      ) : (
        <>
          <span className="muted">Focused on:</span>
          {chips.map((c) => (
            <span key={c.id} className={`chip chip-${c.kind}`}>
              {c.label}
              <button onClick={() => filterOn(c.kind, c.id, true)} title="Remove">×</button>
            </span>
          ))}
          <button className="link" onClick={clear}>Show all</button>
        </>
      )}
    </div>
  );
}

/** Group legend; clicking a group turns its colouring off or on (bundle outline, chain colours). */
function Legend() {
  const groups = useStore((s) => s.model.groups);
  const updateGroup = useStore((s) => s.updateGroup);
  if (!groups.length) return null;
  return (
    <div className="legend">
      {groups.map((g) => (
        <button
          key={g.id}
          className={`legend-row${g.hidden ? ' is-hidden' : ''}`}
          onClick={() => updateGroup(g.id, { hidden: !g.hidden })}
          title={g.hidden ? `Show the ${g.type} colouring of ${g.name}` : `Hide the ${g.type} colouring of ${g.name}`}
          aria-pressed={!g.hidden}
        >
          {g.type === 'bundle' ? (
            <span className="swatch swatch-bundle" style={{ borderColor: g.color }} />
          ) : (
            <span className="swatch" style={{ background: g.color }} />
          )}
          {g.name}
          <span className="muted"> · {g.type}</span>
        </button>
      ))}
    </div>
  );
}
