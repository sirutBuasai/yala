import { chromium, firefox } from 'playwright';
const which = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await which.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => {
	window.__ro = 0; window.__raf = 0;
	const RO = window.ResizeObserver;
	window.ResizeObserver = class extends RO { constructor(cb) { super((e, o) => { window.__ro++; cb(e, o); }); } };
	const raf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (cb) => { window.__raf++; return raf(cb); };
});
await page.goto('http://127.0.0.1:8800/transactions');
await page.waitForTimeout(4000);
await page.locator('.viewhead').getByRole('button', { name: 'Edit' }).click();
await page.waitForTimeout(1000);
const handles = page.locator('.cell > .handle');
console.log('handles', await handles.count());
// resize the history pane's east edge: find a handle inside the cell holding "Transaction history"
const h = page.locator('.cell:has-text("Transaction history") > .handle.e').first();
const box = await h.boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
const before = await page.evaluate(() => [window.__ro, window.__raf]);
const t0 = Date.now();
const steps = [];
await page.mouse.move(x, y);
await page.mouse.down();
for (let i = 1; i <= 30; i++) {
	const s = Date.now();
	await page.mouse.move(x + i * 8, y + i * 3);
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
	steps.push(Date.now() - s);
}
await page.mouse.up();
await page.waitForTimeout(1000);
const after = await page.evaluate(() => [window.__ro, window.__raf]);
steps.sort((a, b) => a - b);
console.log(process.argv[2] ?? 'chromium', JSON.stringify({ totalMs: Date.now() - t0, stepMedianMs: steps[15], stepMaxMs: steps[29], resizeObserverCbs: after[0] - before[0], rafCalls: after[1] - before[1] }));
await browser.close();
