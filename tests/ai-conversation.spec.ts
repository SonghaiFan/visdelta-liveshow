import { test, expect } from '@playwright/test';
const reply = { explanation: 'Showing profit in blue.', message: { requestId: 'ai-test', baseRevision: 0, edits: [{ method: 'y', args: ['profit', { type: 'quantitative', label: 'Profit ($k)' }] }, { method: 'color', args: ['#4269d0'] }] } };
for (const width of [1280, 390]) {
 test(`natural language changes the actual chart at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/liveshow/status/', route => route.fulfill({ json: { configured: true, model: 'test/model' } }));
  await page.route('**/api/liveshow/edit/', route => { const body = route.request().postDataJSON(); expect(body.prompt).toBe('Show profit in blue'); expect(body.revision).toBe(0); return route.fulfill({ json: reply }); });
  await page.goto('');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.getByLabel('Describe a chart change').fill('Show profit in blue');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Showing profit in blue.');
  await expect(page.getByRole('status')).toContainText('revision 1');
  await expect(page.locator('.liveshow-chart')).toContainText('Profit ($k)');
  expect(await page.locator('.liveshow-chart svg rect').evaluateAll(nodes => nodes.some(node => getComputedStyle(node).fill === 'rgb(66, 105, 208)'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `/tmp/visdelta-liveshow-ai-${width}.png`, fullPage: true });
 });
}
test('a late AI response never overwrites a manual change', async ({ page }) => {
 let release!: () => void;
 const wait = new Promise<void>(resolve => { release = resolve; });
 await page.route('**/api/liveshow/status/', route => route.fulfill({ json: { configured: true } }));
 await page.route('**/api/liveshow/edit/', async route => { await wait; await route.fulfill({ json: reply }); });
 await page.goto(''); await expect(page.getByRole('status')).toContainText('Ready');
 await page.getByLabel('Describe a chart change').fill('Show profit in blue');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('Thinking…');
 await page.getByText('Explore presets, data & generated edits', { exact: true }).click();
 await page.getByRole('button', { name: 'Send preset', exact: true }).click();
 await expect(page.getByRole('status')).toContainText('revision 1');
 release();
 await expect(page.getByRole('log')).toContainText('chart changed while I was thinking');
 await expect(page.getByRole('status')).toContainText('revision 1');
});
test('cancel and errors keep the last valid chart', async ({ page }) => {
 await page.route('**/api/liveshow/status/', route => route.fulfill({ json: { configured: true } }));
 await page.route('**/api/liveshow/edit/', route => route.fulfill({ status: 502, json: { error: 'OpenRouter is unavailable.' } }));
 await page.goto(''); await expect(page.getByRole('status')).toContainText('Ready');
 await page.getByLabel('Describe a chart change').fill('Show profit');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('OpenRouter is unavailable.');
 await expect(page.getByRole('status')).toContainText('revision 0');
 await page.unroute('**/api/liveshow/edit/');
 await page.route('**/api/liveshow/edit/', () => new Promise(() => {}));
 await page.getByLabel('Describe a chart change').fill('Show profit');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 await page.getByRole('button', { name: 'Cancel', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('Cancelled.');
 await expect(page.getByRole('status')).toContainText('revision 0');
});
test('static hosting explains that AI requires a local service', async ({ page }) => {
 await page.route('**/api/liveshow/status/', route => route.fulfill({ status: 404, body: 'Not found' }));
 await page.goto('');
 await expect(page.getByText('AI is available in the local app', { exact: true })).toBeVisible();
 await page.getByLabel('Describe a chart change').fill('Show profit');
 await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
});

test('filter to an empty chart, reset in chat, undo, redo, and restore again', async ({ page }) => {
 await page.route('**/api/liveshow/status/', route => route.fulfill({ json: { configured: true } }));
 await page.route('**/api/liveshow/edit/', route => {
  const body = route.request().postDataJSON();
  return route.fulfill({ json: body.prompt === '复原' ? { action: 'reset', explanation: '已恢复原始图表。', message: null } : { explanation: 'Only revenue at most 40.', message: { requestId: 'filter-empty', baseRevision: body.revision, edits: [{ method: 'where', args: [{ revenue: { lte: 40 } }] }] } } });
 });
 await page.goto(''); await expect(page.getByRole('status')).toContainText('Ready');
 const bars = page.locator('.liveshow-chart svg rect');
 const original = await bars.evaluateAll(nodes => nodes.map(node => node.getAttribute('height')));
 await page.getByLabel('Describe a chart change').fill('去掉高于40的');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('Only revenue at most 40.');
 await expect(page.getByText('No rows after transforms.', { exact: true })).toBeVisible();
 await page.getByLabel('Describe a chart change').fill('复原');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('已恢复原始图表。');
 await expect.poll(() => bars.evaluateAll(nodes => nodes.map(node => node.getAttribute('height')))).toEqual(original);
 await expect(page.getByText('No rows after transforms.', { exact: true })).not.toBeVisible();
 await page.getByRole('button', { name: 'Undo', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
 await expect(page.getByText('No rows after transforms.', { exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Redo', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
 await expect.poll(() => bars.evaluateAll(nodes => nodes.map(node => node.getAttribute('height')))).toEqual(original);
 await expect(page.getByText('No rows after transforms.', { exact: true })).not.toBeVisible();
});
