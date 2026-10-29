import type { ViewSpec } from 'visdelta/core';
import { bar } from 'visdelta/bar';

/** Small illustrative dataset: amounts in thousands, not external business data. */
export const sales = [
  { product: 'Atlas', revenue: 84, profit: 22 },
  { product: 'Beacon', revenue: 62, profit: 31 },
  { product: 'Comet', revenue: 96, profit: 18 },
  { product: 'Drift', revenue: 48, profit: 26 },
];
const base = bar({ name: 'sales' }).x('product').y('revenue', { label: 'Revenue ($k)' });
export const initialSpec = base.toSpec();
export const liveshowPresets = [
  { category: 'data', prompt: 'Keep products with revenue above $60k', spec: base.where({ revenue: { gt: 60 } }).toSpec() },
  { category: 'grain', prompt: 'Sum revenue within each product', spec: base.rollup().toSpec() },
  { category: 'encoding', prompt: 'Show profit instead of revenue', spec: base.y('profit', { label: 'Profit ($k)' }).toSpec() },
  { category: 'coordinate', prompt: 'Flip the chart’s axes', spec: base.flip().toSpec() },
  { category: 'layout', prompt: 'Rank products by revenue', spec: base.sort('revenue', 'descending').toSpec() },
  { category: 'attention', prompt: 'Highlight Beacon', spec: base.highlight({ product: 'Beacon' }).toSpec() },
  { category: 'appearance', prompt: 'Use blue bars', spec: base.color('#4269d0').toSpec() },
] as const;
export const burstSpecs = [
  { label: 'Show profit', spec: liveshowPresets[2].spec },
  { label: 'Use blue', spec: base.color('#4269d0').toSpec() },
  { label: 'Actually, use coral', spec: base.color('#ff725c').toSpec() },
];

// These commands act on the accepted chart, preserving earlier edits.
export function presetEdits(category: string, spec: ViewSpec = initialSpec) {
  switch (category) {
    case 'data': return [{ method: 'where', args: [{ revenue: { gt: 60 } }] }];
    case 'encoding': return [
      { method: spec.encoding?.x?.type === 'quantitative' ? 'x' : 'y', args: ['profit', { type: 'quantitative', label: 'Profit ($k)' }] },
    ];
    case 'coordinate': return [{ method: 'flip', args: [] }];
    case 'layout': return [{ method: 'sort', args: ['revenue', 'descending'] }];
    case 'attention': return [{ method: 'highlight', args: [{ product: 'Beacon' }] }];
    case 'appearance': return [{ method: 'color', args: ['#4269d0'] }];
    default: return [];
  }
}
