import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChainSvg, type ChainSvgProps } from '../components/ChainSvg';
import { DiagramSvg, COLORS, type DiagramProps } from '../components/DiagramSvg';
import { NOTE, SosSvg } from '../components/SosSvg';
import type { SosLayout } from '../engine/sosView';
import type { ChainEnd, ChainLayout } from '../engine/chainView';
import { stepState } from '../engine/animation';
import { labelArea, type Layout, type TabGeom } from '../engine/layout';
import type { ViewModel } from '../engine/view';
import type { Group, Model } from '../model/types';

export function toSvg(layout: Layout, vm: ViewModel, groups: Group[], showStubs: boolean, anim?: DiagramProps['anim']): string {
  const body = renderToStaticMarkup(createElement(DiagramSvg, { layout, vm, groups, showStubs, standalone: true, anim }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

const SKETCH = 'sketch=1;curveFitting=1;jiggle=2;fontFamily=Architects Daughter;fontSource=https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DArchitects%2BDaughter;';

/** Chain sequence to export as an animation: one page per step. */
export interface DrawioAnim {
  chainName: string;
  color: string;
  count: number;
  stepLabels: string[][];
  /** Steps of each arrow, keyed like the exported view's arrows (diagram edge ids or tube arrow ids). */
  steps: Map<string, number[]>;
}

/** Pages of an export: one plain page, or an overview plus one page per step when animating. */
function animPages(anim: DrawioAnim | undefined, title: string): { name: string; step?: number }[] {
  if (!anim || !anim.count) return [{ name: title }];
  return [{ name: `${anim.chainName} — sequence`, step: 0 }, ...anim.stepLabels.map((_, i) => ({ name: `${anim.chainName} — step ${i + 1}`, step: i + 1 }))];
}

/**
 * Style of an arrow on an animation page. Step 0 is the overview (every sequenced arrow lit and numbered).
 * On step k the current arrows use draw.io's flow animation (moving dashes), earlier ones stay lit, later ones fade.
 */
function animEdge(anim: DrawioAnim, id: string, step: number): { style: string; value: string } {
  const steps = anim.steps.get(id);
  const value = steps?.length ? steps.join(',') : '';
  const label = `fontStyle=1;fontSize=11;fontColor=${anim.color};labelBackgroundColor=#ffffff;`;
  if (step === 0) return steps?.length ? { style: `strokeColor=${anim.color};strokeWidth=2.5;${label}`, value } : { style: `strokeColor=${COLORS.muted};opacity=25;`, value: '' };
  const state = stepState(steps, step);
  const style = {
    active: `strokeColor=${anim.color};strokeWidth=4;flowAnimation=1;${label}`,
    done: `strokeColor=${anim.color};strokeWidth=2.5;opacity=85;${label}`,
    pending: `strokeColor=${COLORS.muted};dashed=1;opacity=35;${label}`,
    off: `strokeColor=${COLORS.muted};opacity=10;`,
  }[state];
  return { style, value: state === 'off' ? '' : value };
}

/** Caption of an animation page. */
function animCaption(anim: DrawioAnim, step: number): string {
  if (step === 0) return `<b>${esc(anim.chainName)}</b><br>${anim.stepLabels.map((ls, i) => `${i + 1}. ${ls.map(esc).join(' · ')}`).join('<br>')}`;
  return `<b>${esc(anim.chainName)} — step ${step} / ${anim.count}</b><br>${anim.stepLabels[step - 1].map(esc).join('<br>')}`;
}

function wrapPages(pages: { name: string; cells: string[] }[], idPrefix: string): string {
  return [
    `<mxfile host="Topico">`,
    ...pages.flatMap((pg, i) => [
      `<diagram name="${esc(pg.name)}" id="${idPrefix}-${i}">`,
      `<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" math="0" shadow="0">`,
      `<root><mxCell id="0"/><mxCell id="1" parent="0"/>`,
      ...pg.cells,
      `</root></mxGraphModel></diagram>`,
    ]),
    `</mxfile>`,
  ].join('\n');
}

/** draw.io / diagrams.net (mxGraph) XML for the current view. */
export function toDrawio(
  layout: Layout,
  vm: ViewModel,
  groups: Group[],
  opts: { sketch: boolean; showStubs: boolean; title: string; anim?: DrawioAnim },
): string {
  const pages = animPages(opts.anim, opts.title).map((pg) => ({ name: pg.name, cells: diagramCells(layout, vm, groups, opts, pg.step) }));
  return wrapPages(pages, 'topico');
}

function diagramCells(
  layout: Layout,
  vm: ViewModel,
  groups: Group[],
  opts: { sketch: boolean; showStubs: boolean; anim?: DrawioAnim },
  step: number | undefined,
): string[] {
  const anim = step !== undefined ? opts.anim : undefined;
  const sk = opts.sketch ? SKETCH : '';
  const colorOf = new Map(groups.filter((g) => !g.hidden).map((g) => [g.id, g.color]));
  const chainColor = (chainId: string | null | undefined) => (chainId && colorOf.get(chainId)) || undefined;
  const cells: string[] = [];
  const vertex = (id: string, value: string, style: string, x: number, y: number, w: number, h: number) =>
    cells.push(
      `<mxCell id="${esc(id)}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );

  const c = layout.centre;
  vertex('centre', vm.centreName, `rounded=0;whiteSpace=wrap;html=1;fillColor=${COLORS.centreFill};strokeColor=${COLORS.ink};fontSize=16;fontStyle=1;fontColor=${COLORS.muted};${sk}`, c.x, c.y, c.w, c.h);

  for (const n of layout.nodes) {
    const style =
      n.kind === 'etl'
        ? `rounded=1;whiteSpace=wrap;html=1;fillColor=${COLORS.etlFill};fontColor=#ffffff;strokeColor=${COLORS.etlFill};fontSize=10;fontStyle=1;${sk}`
        : `shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;size=8;fillColor=#ffffff;strokeColor=${COLORS.ink};fontStyle=1;${sk}`;
    const a = labelArea(n);
    const spacing = `spacingLeft=${a.x};spacingTop=${a.y};spacingRight=${n.rect.w - a.x - a.w};spacingBottom=${n.rect.h - a.y - a.h};`;
    vertex(`n:${n.id}`, n.name, style + spacing, n.rect.x, n.rect.y, n.rect.w, n.rect.h);
  }

  const tabId = (t: TabGeom) => `t:${t.key}`;
  const tabsByKey = new Map(layout.nodes.flatMap((n) => n.tabs.map((t) => [t.key, t] as const)));
  const rel = (t: TabGeom, p: { x: number; y: number }) => ({
    x: +((p.x - t.rect.x) / t.rect.w).toFixed(3),
    y: +((p.y - t.rect.y) / t.rect.h).toFixed(3),
  });

  for (const e of layout.edges) {
    const from = tabsByKey.get(e.fromKey)!;
    const to = tabsByKey.get(e.toKey)!;
    const [p0, c1, c2, p3] = e.points;
    const ex = rel(from, p0);
    const en = rel(to, p3);
    // draw.io edges have one colour: use the first chain's.
    const color = chainColor(e.chainIds[0]) ?? COLORS.muted;
    const a = anim ? animEdge(anim, e.id, step!) : null;
    const style = `curved=1;html=1;endArrow=classic;endFill=1;${a ? a.style : `strokeColor=${color};`}exitX=${ex.x};exitY=${ex.y};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${en.x};entryY=${en.y};entryDx=0;entryDy=0;entryPerimeter=0;${sk}`;
    cells.push(
      `<mxCell id="${esc(`e:${e.id}`)}" value="${esc(a?.value ?? '')}" style="${esc(style)}" edge="1" parent="1" source="${esc(tabId(from))}" target="${esc(tabId(to))}"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="${c1.x}" y="${c1.y}"/><mxPoint x="${c2.x}" y="${c2.y}"/></Array></mxGeometry></mxCell>`,
    );
  }

  if (opts.showStubs) {
    for (const s of layout.stubs) {
      const m = /M([-\d.]+),([-\d.]+) L([-\d.]+),([-\d.]+)/.exec(s.d);
      if (!m) continue;
      cells.push(
        `<mxCell id="${esc(s.id)}" style="html=1;endArrow=classic;dashed=1;strokeColor=${COLORS.muted};" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${m[1]}" y="${m[2]}" as="sourcePoint"/><mxPoint x="${m[3]}" y="${m[4]}" as="targetPoint"/></mxGeometry></mxCell>`,
      );
    }
  }

  for (const n of layout.nodes) {
    for (const t of n.tabs) {
      const fill = chainColor(t.chainIds[0]);
      const style = `rounded=0;whiteSpace=wrap;html=1;fontSize=10;fillColor=${fill ? `${fill}38` : '#ffffff'};strokeColor=${COLORS.ink};${t.vertical ? 'horizontal=0;' : ''}${vm.topics[t.topicId]?.isGroup ? 'dashed=1;' : ''}${sk}`;
      vertex(tabId(t), vm.topics[t.topicId]?.name ?? t.topicId, style, t.rect.x, t.rect.y, t.rect.w, t.rect.h);
    }
  }

  for (const b of layout.brackets) {
    if (!colorOf.has(b.groupId)) continue;
    vertex(`b:${b.key}`, '', `rounded=1;fillColor=none;strokeWidth=2;strokeColor=${colorOf.get(b.groupId) ?? COLORS.muted};pointerEvents=0;`, b.rect.x, b.rect.y, b.rect.w, b.rect.h);
  }

  if (anim) {
    const b = layout.bounds;
    const lines = step === 0 ? anim.count + 1 : anim.stepLabels[step! - 1].length + 1;
    vertex('anim:caption', animCaption(anim, step!), `text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=12;fillColor=#ffffff;strokeColor=${anim.color};spacing=6;`, b.x - 20, b.y - 30 - lines * 16, 520, 16 + lines * 16);
  }
  return cells;
}

export function toChainSvg(layout: ChainLayout, anim?: ChainSvgProps['anim']): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(createElement(ChainSvg, { layout, standalone: true, anim }))}`;
}

/** draw.io XML for the broker-tube view of a chain. */
export function toChainDrawio(l: ChainLayout, opts: { sketch: boolean; anim?: DrawioAnim }): string {
  const pages = animPages(opts.anim, l.chainName).map((pg) => ({ name: pg.name, cells: chainCells(l, opts, pg.step) }));
  return wrapPages(pages, 'topico-chain');
}

function chainCells(l: ChainLayout, opts: { sketch: boolean; anim?: DrawioAnim }, step: number | undefined): string[] {
  const anim = step !== undefined ? opts.anim : undefined;
  const sk = opts.sketch ? SKETCH : '';
  const cells: string[] = [];
  const vertex = (id: string, value: string, style: string, x: number, y: number, w: number, h: number) =>
    cells.push(
      `<mxCell id="${esc(id)}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
  const b = l.bounds;
  vertex('title', l.title, `text;html=1;align=left;verticalAlign=middle;fontSize=15;fontStyle=1;${sk}`, l.tube.x, b.y + 10, 600, 24);
  // draw.io's horizontal cylinder ("Direct data") stands for the broker tube.
  const t = l.tube;
  vertex('tube', '', `shape=mxgraph.flowchart.direct_data;whiteSpace=wrap;html=1;fillColor=#94a3b8;gradientColor=#f1f5f9;gradientDirection=east;strokeColor=${COLORS.muted};${sk}`, t.x, t.y, t.w + 18, t.h);
  for (const n of l.nodes) {
    const style =
      n.kind === 'etl'
        ? `rounded=1;whiteSpace=wrap;html=1;fillColor=${COLORS.etlFill};fontColor=#ffffff;strokeColor=${COLORS.etlFill};fontSize=10;fontStyle=1;${sk}`
        : `shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;size=8;fillColor=#ffffff;strokeColor=${COLORS.ink};fontStyle=1;${sk}`;
    vertex(`n:${n.id}`, n.name, style, n.rect.x, n.rect.y, n.rect.w, n.rect.h);
  }
  const rectOf = (e: ChainEnd) => (e.kind === 'bar' ? l.bars.find((x) => x.topicId === e.id)!.rect : l.nodes.find((x) => x.id === e.id)!.rect);
  const cellOf = (e: ChainEnd) => (e.kind === 'bar' ? `b:${e.id}` : `n:${e.id}`);
  const rel = (e: ChainEnd) => {
    const q = rectOf(e);
    return { x: +((e.at.x - q.x) / q.w).toFixed(3), y: +((e.at.y - q.y) / q.h).toFixed(3) };
  };
  for (const a of l.arrows) {
    const ex = rel(a.from);
    const en = rel(a.to);
    const st = anim ? animEdge(anim, a.id, step!) : null;
    const style = `${a.curved ? 'curved=1;' : 'edgeStyle=none;'}html=1;endArrow=classic;endFill=1;${st ? st.style : `strokeColor=${l.color};strokeWidth=1.5;`}fontSize=9;labelBackgroundColor=#ffffff;exitX=${ex.x};exitY=${ex.y};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${en.x};entryY=${en.y};entryDx=0;entryDy=0;entryPerimeter=0;${sk}`;
    const pts = a.curved ? `<Array as="points">${a.points.slice(1, -1).map((p) => `<mxPoint x="${p.x}" y="${p.y}"/>`).join('')}</Array>` : '';
    cells.push(
      `<mxCell id="${esc(`a:${a.id}`)}" value="${esc([a.label?.text, st?.value ? `(${st.value})` : ''].filter(Boolean).join(' '))}" style="${esc(style)}" edge="1" parent="1" source="${esc(cellOf(a.from))}" target="${esc(cellOf(a.to))}"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`,
    );
  }
  for (const bar of l.bars) {
    vertex(`b:${bar.topicId}`, bar.name, `rounded=1;whiteSpace=wrap;html=1;fontSize=10;fillColor=${l.color}26;strokeColor=${COLORS.ink};${sk}`, bar.rect.x, bar.rect.y, bar.rect.w, bar.rect.h);
  }
  if (anim) {
    const lines = step === 0 ? anim.count + 1 : anim.stepLabels[step! - 1].length + 1;
    vertex('anim:caption', animCaption(anim, step!), `text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=12;fillColor=#ffffff;strokeColor=${anim.color};spacing=6;`, l.tube.x + l.tube.w + 60, b.y + 10, 420, 16 + lines * 16);
  }
  return cells;
}

export function toSosSvg(layout: SosLayout): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(createElement(SosSvg, { layout, standalone: true }))}`;
}

/** draw.io XML for the System of System view: the SoS box and parent frames are swimlanes, callouts are notes. */
export function toSosDrawio(l: SosLayout, opts: { sketch: boolean }): string {
  const sk = opts.sketch ? SKETCH : '';
  const cells: string[] = [];
  const vertex = (id: string, value: string, style: string, q: { x: number; y: number; w: number; h: number }) =>
    cells.push(
      `<mxCell id="${esc(id)}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="1"><mxGeometry x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" as="geometry"/></mxCell>`,
    );
  const edge = (id: string, value: string, style: string, source: string, target: string, from: { x: number; y: number }, to: { x: number; y: number }) =>
    cells.push(
      `<mxCell id="${esc(id)}" value="${esc(value)}" style="${esc(style)}" edge="1" parent="1" source="${esc(source)}" target="${esc(target)}"><mxGeometry relative="1" as="geometry"><mxPoint x="${from.x}" y="${from.y}" as="sourcePoint"/><mxPoint x="${to.x}" y="${to.y}" as="targetPoint"/></mxGeometry></mxCell>`,
    );
  vertex('sos', l.title, `swimlane;html=1;startSize=30;fillColor=#f8fafc;swimlaneFillColor=#ffffff;strokeColor=${COLORS.ink};fontStyle=1;fontSize=14;${sk}`, l.box);
  const rectOf = new Map<string, { x: number; y: number; w: number; h: number }>([['sos', l.box]]);
  for (const n of l.nodes) {
    rectOf.set(n.id, n.rect);
    const style = n.container
      ? `swimlane;html=1;startSize=24;fillColor=${n.kind === 'etl' ? '#cbd5e1' : '#f1f5f9'};swimlaneFillColor=#ffffff;strokeColor=${COLORS.ink};fontStyle=1;${sk}`
      : n.kind === 'etl'
        ? `rounded=1;whiteSpace=wrap;html=1;fillColor=${COLORS.etlFill};fontColor=#ffffff;strokeColor=${COLORS.etlFill};fontStyle=1;${sk}`
        : `shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;size=8;fillColor=#ffffff;strokeColor=${COLORS.ink};fontStyle=1;${sk}`;
    vertex(`n:${n.id}`, n.name, style, n.rect);
  }
  const cellId = (id: string) => (id === 'sos' ? 'sos' : `n:${id}`);
  const rel = (id: string, p: { x: number; y: number }) => {
    const q = rectOf.get(id)!;
    return `${+((p.x - q.x) / q.w).toFixed(3)};${+((p.y - q.y) / q.h).toFixed(3)}`;
  };
  for (const a of l.arrows) {
    const [ex, ey] = rel(a.from.id, a.from.at).split(';');
    const [nx, ny] = rel(a.to.id, a.to.at).split(';');
    const style = `edgeStyle=none;html=1;endArrow=classic;endFill=1;strokeColor=#475569;fontSize=10;labelBackgroundColor=#ffffff;exitX=${ex};exitY=${ey};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${nx};entryY=${ny};entryDx=0;entryDy=0;entryPerimeter=0;${sk}`;
    edge(`a:${a.id}`, a.label.text, style, cellId(a.from.id), cellId(a.to.id), a.from.at, a.to.at);
  }
  for (const c of l.callouts) {
    const text = c.lines.map((x) => (x.heading ? `<b>${esc(x.text)}</b>` : esc(x.text))).join('<br>');
    vertex(c.id, text, `rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=6;fontSize=10;fillColor=${NOTE.fill};strokeColor=${NOTE.stroke};${sk}`, c.rect);
    edge(`${c.id}:link`, '', `edgeStyle=none;html=1;endArrow=none;strokeColor=${NOTE.stroke};`, c.id, cellId(c.nodeId), c.tail[0], c.tail[2]);
  }
  return [
    `<mxfile host="Topico">`,
    `<diagram name="${esc(l.title)}" id="topico-sos">`,
    `<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" math="0" shadow="0">`,
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>`,
    ...cells,
    `</root></mxGraphModel></diagram></mxfile>`,
  ].join('\n');
}

export function toJson(model: Model): string {
  return JSON.stringify(model, null, 2);
}

export function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
