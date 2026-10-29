/**
 * Metadata for every live example. Each `id` names a module in this folder
 * that exports `from` and `to` (a pair) or `states` (a sequence). The module
 * source is what the docs display, so the code a reader copies is exactly the
 * code that rendered the chart.
 *
 * `category` is the example's primary teaching category. It must appear in the
 * state changes that `delta()` reports; `scripts/verify-examples.mjs` checks it.
 */

export type StateChangeCategory =
  | 'data'
  | 'grain'
  | 'encoding'
  | 'coordinate'
  | 'layout'
  | 'attention'
  | 'appearance';

export type ChartType = 'bar' | 'line' | 'area' | 'point' | 'unit' | 'pie';

export interface ExampleMeta {
  id: string;
  title: string;
  description: string;
  chart: ChartType;
  category: StateChangeCategory;
  /** Canvas height in pixels. */
  height?: number;
}

export const categories: { id: StateChangeCategory; label: string; summary: string }[] = [
  { id: 'data', label: 'Data', summary: 'Source records enter, leave or change value.' },
  { id: 'grain', label: 'Grain', summary: 'Grouping or measure semantics change: split, merge, reaggregate.' },
  { id: 'encoding', label: 'Encoding', summary: 'A data field is bound, unbound or remapped to a channel.' },
  { id: 'coordinate', label: 'Coordinate', summary: 'A positional scale, domain or orientation changes.' },
  { id: 'layout', label: 'Layout', summary: 'The same objects are reordered, rearranged or reconnected.' },
  { id: 'attention', label: 'Attention', summary: 'Focus moves the camera or highlight changes emphasis.' },
  { id: 'appearance', label: 'Appearance', summary: 'Fixed styling or form changes without binding a field.' },
];
