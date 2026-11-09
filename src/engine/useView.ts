import { useMemo } from 'react';
import { useStore } from '../model/store';
import { computeAnimation } from './animation';
import { computeChainLayout } from './chainView';
import { layoutView } from './layout';
import { computeSosLayout } from './sosView';
import { computeView } from './view';

/** Current filtered view model and its layout, recomputed on every model/filter change. */
export function useView() {
  const model = useStore((s) => s.model);
  const ui = useStore((s) => s.ui);
  const vm = useMemo(
    () =>
      computeView(model, {
        filterSystems: ui.filterSystems,
        filterTopics: ui.filterTopics,
        collapseBy: ui.collapseBy,
        sharedOnly: ui.sharedOnly,
      }),
    [model, ui.filterSystems, ui.filterTopics, ui.collapseBy, ui.sharedOnly],
  );
  const layout = useMemo(() => layoutView(vm, ui.topicText), [vm, ui.topicText]);
  // Broker-tube view of one chain, when toggled from the explorer.
  const chainLayout = useMemo(() => (ui.chainView ? computeChainLayout(model, ui.chainView, ui.topicText) : null), [model, ui.chainView, ui.topicText]);
  // System of System view, when selected in the toolbar (the chain view takes precedence).
  const sosLayout = useMemo(() => (!ui.chainView && ui.view === 'sos' ? computeSosLayout(model) : null), [model, ui.chainView, ui.view]);
  // Chain sequence being animated, mapped onto the diagram's and the tube view's arrows.
  const anim = useMemo(
    () => (ui.animation && !sosLayout ? computeAnimation(model, vm, ui.animation.chainId, ui.animation.step) : null),
    [model, vm, ui.animation, sosLayout],
  );
  return { model, ui, vm, layout, chainLayout, sosLayout, anim };
}
