// Nothing a card holds may paint outside it, and no label may be cut off, at any width the app folds to.

import { test } from '@playwright/test';
import { audit, expectClean, openApp, PAGE_LABELS, setContentWidth, showPage, WIDTHS } from './app';

test.beforeEach(async ({ page }) => openApp(page));

for (const label of PAGE_LABELS) {
	test(`${label} contains its content at every width`, async ({ page }) => {
		await showPage(page, label);
		for (const width of WIDTHS) {
			await setContentWidth(page, width);
			expectClean(`${label} at ${width}px`, await audit(page));
		}
		await setContentWidth(page, null);
	});
}
