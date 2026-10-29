import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`Liveshow sends real JSON updates and settles at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('liveshow/');
    await expect(page.getByRole('link', { name: 'Liveshow', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('status')).toContainText('Ready');
    const chart = page.locator('.liveshow-chart');
    await expect(chart.locator('svg').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'State-change categories' }).getByRole('button')).toHaveCount(7);
    const geometry = () => chart.locator('svg rect').evaluateAll(nodes => nodes.map(n => ['x', 'y', 'width', 'height'].map(k => n.getAttribute(k))));
    const before = await geometry();
    await page.getByRole('button', { name: 'Send preset', exact: true }).click();
    const receipts = page.getByRole('list', { name: 'Update results' });
    await expect(receipts).toContainText('applied');
    expect(await geometry()).not.toEqual(before);
    const instruction = JSON.parse(await page.getByRole('textbox', { name: 'Next chart JSON' }).inputValue());
    expect(instruction.edits[0].method).toBe('y');
    expect(instruction.data).toBeUndefined();
    const revision = await page.getByRole('status').textContent();
    await page.getByRole('button', { name: 'Send JSON', exact: true }).click();
    await expect(receipts.getByRole('listitem').first()).toContainText('applied');
    expect(await page.getByRole('status').textContent()).toBe(revision);
    await page.getByRole('textbox', { name: 'Next chart JSON' }).fill(JSON.stringify({ ...instruction, requestId: 'stale-demo', baseRevision: 0 }));
    await page.getByRole('button', { name: 'Send JSON', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Stale edit');
    await page.getByRole('button', { name: 'Send burst', exact: true }).click();
    await expect(receipts).toContainText('superseded');
    await expect(receipts.getByRole('listitem').filter({ hasText: 'Actually, use coral' })).toContainText('applied');
    await expect(receipts).not.toContainText('submitted');
    const finished = await geometry();
    await page.getByRole('textbox', { name: 'Next chart JSON' }).fill('{');
    await page.getByRole('button', { name: 'Send JSON', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    expect(await geometry()).toEqual(finished);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(receipts.getByRole('listitem').first()).toContainText('applied');
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await expect(chart.locator('.vd-transition-root')).toHaveCount(1);
    // Status renders must not remount or redraw the persistent chart while idle.
    const mutations = await chart.evaluate(async host => {
      let count = 0;
      const observer = new MutationObserver(records => { count += records.length; });
      observer.observe(host, { childList: true, subtree: true, attributes: true });
      await new Promise(resolve => setTimeout(resolve, 500));
      observer.disconnect();
      return count;
    });
    expect(mutations).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: `/tmp/visdelta-liveshow-${width}.png`, fullPage: true });
    if (width === 1280) {
      for (const name of ['Data', 'Grain', 'Encoding', 'Coordinate', 'Layout', 'Attention', 'Appearance']) {
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await expect(receipts.getByRole('listitem').first()).toContainText('applied');
        await page.getByRole('navigation', { name: 'State-change categories' }).getByRole('button', { name, exact: true }).click();
        await page.getByRole('button', { name: 'Send preset', exact: true }).click();
        await expect(receipts.getByRole('listitem').first()).toContainText('applied', { timeout: 15_000 });
      }
    }
    await page.setViewportSize({ width: width === 1280 ? 900 : 360, height: 900 });
    await expect.poll(() => chart.evaluate(host => { const svg = host.querySelector('svg'); return Boolean(svg && svg.getBoundingClientRect().width <= host.getBoundingClientRect().width); })).toBe(true);
    await page.getByRole('button', { name: 'Send burst', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('status')).toContainText('Ready');
    await expect(page.locator('.liveshow-chart .vd-transition-root')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
