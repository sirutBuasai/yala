import { firefox, chromium } from 'playwright';
const which = process.argv[2] === 'chromium' ? chromium : firefox;
const browser = await which.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => {
	window.__ro = 0; window.__raf = 0; window.__mut = 0;
	const RO = window.ResizeObserver;
	window.ResizeObserver = class extends RO { constructor(cb) { super((e, o) => { window.__ro++; cb(e, o); }); } };
	const raf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (cb) => { window.__raf++; return raf(cb); };
	new MutationObserver((l) => { window.__mut += l.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
});
await page.goto('http://127.0.0.1:8800/transactions');
await page.waitForTimeout(4000);
const snap = () => page.evaluate(() => [window.__ro, window.__raf, window.__mut]);
async function window5(label, action) {
	const a = await snap();
	const t = await page.evaluate(() => performance.now());
	if (action) await action();
	await page.waitForTimeout(5000);
	const b = await snap();
	console.log(label, JSON.stringify({ resizeObserverCbs: b[0] - a[0], rafCalls: b[1] - a[1], domMutations: b[2] - a[2] }));
}
await window5('idle');
await page.locator('.viewhead').getByRole('button', { name: 'Edit' }).click();
await window5('edit-mode idle');
await window5('edit-mode scrolling', async () => { for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(50); } });
await window5('edit-mode hovering', async () => { for (let i = 0; i < 40; i++) { await page.mouse.move(100 + i * 30, 300 + (i % 5) * 80); await page.waitForTimeout(30); } });
await browser.close();
