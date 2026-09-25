import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const log = [];
page.on('console', (m) => log.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 12).join('\n')}`));
await page.addInitScript(() => {
	const orig = Error;
	window.__loops = [];
	const Wrapped = function (...a) { const e = new orig(...a); if (String(a[0]).includes('effect_update_depth_exceeded')) window.__loops.push(e.stack); return e; };
	Wrapped.prototype = orig.prototype; Object.setPrototypeOf(Wrapped, orig);
	window.Error = Wrapped;
});
await page.goto('http://127.0.0.1:8800/transactions');
await page.waitForTimeout(4000);
console.log('after load loops:', await page.evaluate(() => window.__loops.length));
await page.locator('.viewhead').getByRole('button', { name: 'Edit' }).click();
await page.waitForTimeout(1500);
console.log('after edit loops:', await page.evaluate(() => window.__loops.length));
const h = page.locator('.cell:has-text("Transaction history") > .handle.e').first();
await h.evaluate(async (node) => {
	const b = node.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
	const send = (type, px, py) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 7, isPrimary: true }));
	send('pointerdown', x, y);
	for (let i = 1; i <= 10; i++) { send('pointermove', x - i * 10, y + i * 4); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
	send('pointerup', x - 100, y + 40);
});
await page.waitForTimeout(1000);
const loops = await page.evaluate(() => window.__loops);
console.log('after drag loops:', loops.length);
if (loops[0]) console.log(loops[0].split('\n').slice(0, 25).join('\n'));
console.log(log.slice(0, 10).join('\n'));
await browser.close();
