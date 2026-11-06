import { useMemo } from 'react';
import { useStore } from '../model/store';
import { computeChainLayout } from './chainView';
import { layoutView } from './layout';
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
  const layout = useMemo(() => layoutView(vm), [vm]);
  // Broker-tube view of one chain, when toggled from the explorer.
  const chainLayout = useMemo(() => (ui.chainView ? computeChainLayout(model, ui.chainView) : null), [model, ui.chainView]);
  return { model, ui, vm, layout, chainLayout };
}
