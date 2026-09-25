// The modal and the anchored popup: what the platform now owes us, and what a popup must never do.

import { expect, test } from '@playwright/test';
import { openApp, settle, showTab } from './app';

test.beforeEach(async ({ page }) => openApp(page));

test('the nav drawer opens as a real modal and hands focus back on Escape', async ({ page }) => {
	const burger = page.getByRole('button', { name: 'Open menu' });
	await burger.click();
	await settle(page);

	const sheet = page.locator('dialog.sheet');
	await expect(sheet).toHaveAttribute('open', '');
	// Not the dismiss button: opening a panel should not announce "close".
	await expect(page.getByRole('link', { name: 'Home' })).toBeFocused();

	// The page behind is inert — asserted through its effect, since inertness has no attribute to read.
	for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
	expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);

	await page.keyboard.press('Escape');
	await settle(page, 24);
	await expect(page.locator('dialog.sheet')).toHaveCount(0);
	await expect(burger).toBeFocused();
});

test('a dropdown inside a modal escapes the panel rather than being clipped by it', async ({
	page
}) => {
	await showTab(page, 'Activity');
	await page.getByRole('button', { name: '+ Add entry' }).click();
	await settle(page);

	const trigger = page.locator('dialog [role=combobox][aria-label="Category"]');
	await trigger.click();
	await settle(page);

	// How far the list reaches past the panel depends on the data, so the invariant is the mechanism: out
	// of the flow the modal clips, and whatever it does reach stays on screen.
	const escapes = await page.evaluate(() => {
		const popup = document.querySelector<HTMLElement>('.popup')!;
		const b = popup.getBoundingClientRect();
		const clipped = popup.scrollHeight - popup.clientHeight;
		return {
			strategy: getComputedStyle(popup).position,
			clipped,
			pastBottom: Math.round(b.bottom - window.innerHeight),
			height: Math.round(b.height)
		};
	});
	expect(escapes.strategy).toBe('fixed');
	expect(escapes.clipped).toBe(0);
	expect(escapes.pastBottom).toBeLessThanOrEqual(0);
	expect(escapes.height).toBeGreaterThan(0);
});

test('a popup never runs off the viewport, whichever side it opens on', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 380 });
	await settle(page);

	for (const name of ['Month', 'Year']) {
		const trigger = page.locator(`[role=combobox][aria-label="${name}"]`);
		await trigger.click();
		await settle(page);

		const fits = await page.evaluate(() => {
			const b = document.querySelector('.popup')!.getBoundingClientRect();
			return {
				pastBottom: b.bottom - window.innerHeight,
				pastTop: -b.top,
				pastRight: b.right - window.innerWidth
			};
		});
		expect(fits.pastBottom, `${name} past the bottom`).toBeLessThanOrEqual(0);
		expect(fits.pastTop, `${name} past the top`).toBeLessThanOrEqual(0);
		expect(fits.pastRight, `${name} past the right`).toBeLessThanOrEqual(0);

		await trigger.click();
		await settle(page);
	}
});

test('a date picker with no room below flips above its trigger', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 380 });
	await showTab(page, 'Activity');
	await page.getByRole('button', { name: '+ Add entry' }).click();
	await settle(page);

	const trigger = page.locator('dialog [role=combobox][aria-label="Date"]');
	await trigger.click();
	await settle(page);

	const placed = await page.evaluate(() => {
		const popup = document.querySelector('.popup')!.getBoundingClientRect();
		const anchor = document
			.querySelector('dialog [role=combobox][aria-label="Date"]')!
			.getBoundingClientRect();
		return { flipped: popup.top < anchor.top, pastTop: -popup.top };
	});
	expect(placed.flipped).toBe(true);
	expect(placed.pastTop).toBeLessThanOrEqual(0);
});

test('typing in a dropdown highlights the match and scrolls it into view', async ({ page }) => {
	// The fixture's lists are short, so the panel is capped to leave the last option out of view.
	await page.addStyleTag({ content: '.listbox { --panel-max: 48px !important; }' });

	const trigger = page.locator('[role=combobox][aria-label="Year"]');
	await trigger.click();
	await settle(page);
	const last = (await page.getByRole('option').last().textContent())!.trim();
	await page.keyboard.press('Escape');
	await settle(page);

	await page.keyboard.type(last.toUpperCase());
	await settle(page);

	const highlighted = page.locator('[role=option].hl');
	await expect(highlighted).toHaveText(last);
	await expect(trigger).toHaveAttribute(
		'aria-activedescendant',
		(await highlighted.getAttribute('id'))!
	);
	const view = await page.evaluate(() => {
		const list = document.querySelector('[role=listbox].listbox')!;
		const l = list.getBoundingClientRect();
		const o = document.querySelector('[role=option].hl')!.getBoundingClientRect();
		return { scrolled: list.scrollTop > 0, inside: o.top >= l.top && o.bottom <= l.bottom };
	});
	expect(view).toEqual({ scrolled: true, inside: true });
});
