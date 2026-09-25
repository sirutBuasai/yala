import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://127.0.0.1:8800/transactions');
await page.waitForTimeout(4000);
await page.locator('.viewhead').getByRole('button', { name: 'Edit' }).click();
await page.waitForTimeout(1000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const h = page.locator('.cell:has-text("Transaction history") > .handle.e').first();
const box = await h.boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
const a = await m();
await cdp.send('Profiler.start');
const frames = await h.evaluate(async (node) => {
	const b = node.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
	const send = (type, px, py) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 7, isPrimary: true }));
	const out = [];
	send('pointerdown', x, y);
	for (let i = 1; i <= 30; i++) { const t = performance.now(); send('pointermove', x - i * 10, y + i * 4); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.push(Math.round(performance.now() - t)); }
	send('pointerup', x - 300, y + 120);
	return out;
});
await page.waitForTimeout(800);
console.log('frame ms per step', JSON.stringify(frames));
const { profile } = await cdp.send('Profiler.stop');
const b = await m();
const d = (k) => +(b[k] - a[k]).toFixed(3);
console.log(JSON.stringify({ taskSec: d('TaskDuration'), scriptSec: d('ScriptDuration'), layoutSec: d('LayoutDuration'), styleSec: d('RecalcStyleDuration'), layouts: d('LayoutCount'), styles: d('RecalcStyleCount') }));
// self time per function
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas; 
profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`; self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0)); });
[...self.entries()].sort((p, q) => q[1] - p[1]).slice(0, 30).forEach(([k, v]) => console.log((v / 1000).toFixed(1).padStart(7) + 'ms  ' + k));
await browser.close();
