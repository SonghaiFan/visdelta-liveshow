import { test, expect } from '@playwright/test';
const reply = { explanation: 'Showing profit in blue.', message: { requestId: 'ai-test', baseRevision: 0, edits: [{ method: 'y', args: ['profit', { type: 'quantitative', label: 'Profit ($k)' }] }, { method: 'color', args: ['#4269d0'] }] } };
for (const width of [1280, 390]) {
 test(`natural language changes the actual chart at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/liveshow/status/', route => route.fulfill({ json: { configured: true, model: 'test/model' } }));
  await page.route('**/api/liveshow/agent/', route => { const body = route.request().postDataJSON(); expect(body.prompt).toBe('Show profit in blue'); expect(body.revision).toBe(0); return route.fulfill({ json: reply }); });
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
 await page.route('**/api/liveshow/agent/', async route => { await wait; await route.fulfill({ json: reply }); });
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
 await page.route('**/api/liveshow/agent/', route => route.fulfill({ status: 502, json: { error: 'OpenRouter is unavailable.' } }));
 await page.goto(''); await expect(page.getByRole('status')).toContainText('Ready');
 await page.getByLabel('Describe a chart change').fill('Show profit');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('OpenRouter is unavailable.');
 await expect(page.getByRole('status')).toContainText('revision 0');
 await page.unroute('**/api/liveshow/agent/');
 await page.route('**/api/liveshow/agent/', () => new Promise(() => {}));
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
 await page.route('**/api/liveshow/agent/', route => {
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

test('visual agent gets PNG and actual sorted marks, applies a tool command and returns a receipt', async ({ page }) => {
 await page.route('**/api/liveshow/status/', route => route.fulfill({ json: { configured: true } }));
 let expected = '';
 await page.route('**/api/liveshow/agent/', route => {
  const body = route.request().postDataJSON();
  if (!body.sessionId) {
   expect(body.capture).toBeUndefined();
   return route.fulfill({ json: { sessionId: 'capture-test', toolCallId: 'capture', command: { action: 'capture' } } });
  }
  if (body.sessionId === 'capture-test') {
   expect(body.capture.dataUrl).toMatch(/^data:image\/png;base64,iVBOR/);
   expect(body.capture.revision).toBe(body.revision);
   const third = body.observation.orders.leftToRight[2];
   expected = body.observation.marks.find((mark: { id: string }) => mark.id === third).data.product;
   expect(expected).toBe('Atlas');
   return route.fulfill({ json: { sessionId: 'agent-test', toolCallId: 'highlight', trace: [{ tool: 'capture_chart' }, { tool: 'inspect_marks' }, { tool: 'edit_chart' }], command: { action: 'edit', message: { requestId: 'third', baseRevision: body.revision, edits: [{ method: 'highlight', args: [{ product: expected }] }] } } } });
  }
  expect(body.capture).toBeUndefined();
  expect(body.receipt.status).toBe('applied');
  expect(body.revision).toBe(2);
  return route.fulfill({ json: { explanation: '已高亮第三根 Atlas。', trace: [{ tool: 'capture_chart' }] } });
 });
 await page.goto(''); await expect(page.getByRole('status')).toContainText('Ready');
 await page.getByText('Explore presets, data & generated edits', { exact: true }).click();
 await page.getByLabel('Next chart JSON').fill(JSON.stringify({ requestId: 'sort-profit', baseRevision: 0, edits: [{ method: 'y', args: ['profit', { type: 'quantitative' }] }, { method: 'sort', args: ['profit', 'descending'] }] }));
 await page.getByRole('button', { name: 'Send JSON', exact: true }).click();
 await expect(page.getByRole('list', { name: 'Update results' })).toContainText('applied');
 await page.getByLabel('Describe a chart change').fill('高亮第三根柱子');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('已高亮第三根 Atlas。');
 await expect(page.getByLabel('Agent tools')).toContainText('inspect_marks');
 await page.getByText('Explore presets, data & generated edits', { exact: true }).click();
 await page.screenshot({ path: '/tmp/liveshow-agent-third-test.png', fullPage: true });
});
test('clarification keeps the chart unchanged and carries the question into the next turn', async ({ page }) => {
 await page.route('**/api/liveshow/status/', route => route.fulfill({ json: { configured: true } }));
 await page.route('**/api/liveshow/agent/', route => {
  const body = route.request().postDataJSON();
  if (body.prompt === '把那个改一下') return route.fulfill({ json: { explanation: '你想改哪根柱子，怎么修改？', question: true, trace: [{ tool: 'ask_user' }] } });
  expect(body.history.at(-1).reply).toContain('哪根');
  return route.fulfill({ json: { explanation: '请确认是否高亮第三根？', question: true } });
 });
 await page.goto(''); await expect(page.getByRole('status')).toContainText('Ready');
 await page.getByLabel('Describe a chart change').fill('把那个改一下'); await page.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('你想改哪根柱子');
 await expect(page.getByRole('status')).toContainText('revision 0');
 await page.getByLabel('Describe a chart change').fill('第三根'); await page.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(page.getByRole('log')).toContainText('请确认是否高亮第三根');
});
