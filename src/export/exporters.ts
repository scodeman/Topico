import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiagramSvg, COLORS } from '../components/DiagramSvg';
import { labelArea, type Layout, type TabGeom } from '../engine/layout';
import type { ViewModel } from '../engine/view';
import type { Group, Model } from '../model/types';

export function toSvg(layout: Layout, vm: ViewModel, groups: Group[], showStubs: boolean): string {
  const body = renderToStaticMarkup(createElement(DiagramSvg, { layout, vm, groups, showStubs, standalone: true }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

const SKETCH = 'sketch=1;curveFitting=1;jiggle=2;fontFamily=Architects Daughter;fontSource=https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DArchitects%2BDaughter;';

/** draw.io / diagrams.net (mxGraph) XML for the current view. */
export function toDrawio(layout: Layout, vm: ViewModel, groups: Group[], opts: { sketch: boolean; showStubs: boolean; title: string }): string {
  const sk = opts.sketch ? SKETCH : '';
  const colorOf = new Map(groups.map((g) => [g.id, g.color]));
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
      n.kind === 'exe'
        ? `rounded=1;whiteSpace=wrap;html=1;fillColor=${COLORS.exeFill};fontColor=#ffffff;strokeColor=${COLORS.exeFill};fontSize=10;fontStyle=1;${sk}`
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
    const color = chainColor(e.chainId) ?? COLORS.muted;
    const style = `curved=1;html=1;endArrow=classic;endFill=1;strokeColor=${color};exitX=${ex.x};exitY=${ex.y};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${en.x};entryY=${en.y};entryDx=0;entryDy=0;entryPerimeter=0;${sk}`;
    cells.push(
      `<mxCell id="${esc(`e:${e.id}`)}" style="${esc(style)}" edge="1" parent="1" source="${esc(tabId(from))}" target="${esc(tabId(to))}"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="${c1.x}" y="${c1.y}"/><mxPoint x="${c2.x}" y="${c2.y}"/></Array></mxGeometry></mxCell>`,
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
    vertex(`b:${b.key}`, '', `rounded=1;fillColor=none;strokeWidth=2;strokeColor=${colorOf.get(b.groupId) ?? COLORS.muted};pointerEvents=0;`, b.rect.x, b.rect.y, b.rect.w, b.rect.h);
  }

  return [
    `<mxfile host="Topico">`,
    `<diagram name="${esc(opts.title)}" id="topico">`,
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
