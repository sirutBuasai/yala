// Fitting content to the box it was given. A pane never resizes itself around its content (see
// `grid/Pane.svelte`), so content too big for its box gives something up instead — a shorter reading, smaller
// type — and states the size it cannot go under, which is what makes an over-narrow resize refuse.
//
// Every decision here is measured rather than predicted: a breakpoint written in this file would be wrong for
// the next font, theme, or pane width somebody arranges.

import { SLACK } from '$lib/layout/grid/spill';

/**
 * Index of the richest level that fits. `widths` are each level's measured width in order, `chrome` whatever
 * else shares the room (a ring, a meter, the gaps).
 *
 * When none fit the last is the answer: a figure still has to say something, and the overrun it then leaves is
 * a genuine one.
 */
export function levelThatFits(widths: number[], available: number, chrome = 0): number {
	if (!widths.length) return 0;
	const room = available - chrome + SLACK;
	const i = widths.findIndex((w) => w <= room);

	return i === -1 ? widths.length - 1 : i;
}

/** The floor to publish for `px` of content, as a CSS length. `SLACK` because that is the tolerance the spill
    probe forgives, and a floor a fraction under it would be read as an overrun. */
export function contentFloor(px: number): string {
	return `${Math.ceil(px + SLACK)}px`;
}

export interface SizeWatch {
	/** Measure now, whatever the width says — for a change of content rather than of box. */
	force(): void;
	stop(): void;
}

/**
 * Watch `el`'s inline size, calling `measure` with it and once immediately.
 *
 * `settled` skips a notification that carries no change of width: a measurement whose answer changes the
 * content inside the box would otherwise be re-run by the layout it caused, and answer itself for ever.
 */
export function watchWidth(
	el: HTMLElement,
	measure: (width: number) => void,
	{ settled = false } = {}
): SizeWatch {
	let last = -1;

	const run = (force: boolean) => {
		const width = el.clientWidth;
		if (!force && settled && width === last) return;
		last = width;
		measure(width);
	};

	const observer = new ResizeObserver(() => run(false));
	observer.observe(el);
	run(true);

	return { force: () => run(true), stop: () => observer.disconnect() };
}

/**
 * Scale one line of text down into the width it has rather than wrapping it, as a chart scales into its
 * pane: `--fit` on `node` is the multiplier its font size reads. Under `least` the line would be too small to
 * read, so it holds that size, states the width it cannot go under (`--content-floor`), and wraps where even
 * that is not given, as on a phone. `node` must be styled not to wrap.
 */
export function scaleToFit(node: HTMLElement, least: number) {
	const refit = () => {
		node.style.setProperty('--fit', '1');
		node.style.whiteSpace = '';
		// The text's own width, not the box's: a line shorter than its box reports the box's width as its
		// scroll width, which made the floor follow whatever width the pane had last been given.
		const text = document.createRange();
		text.selectNodeContents(node);
		const need = text.getBoundingClientRect().width;
		const room = node.clientWidth;
		let fit = need && room ? Math.min(1, (room - SLACK) / need) : 1;
		node.style.setProperty('--fit', String(Math.max(least, fit)));
		// Whatever does not scale with the type (an icon, a margin) leaves the first guess a little over, so
		// the overrun it left is taken off in the same proportion.
		for (let pass = 0; pass < 3 && fit > least && node.scrollWidth > room; pass++) {
			fit *= (room - SLACK) / node.scrollWidth;
			node.style.setProperty('--fit', String(Math.max(least, fit)));
		}
		node.style.setProperty('--content-floor', contentFloor(need * least));
		if (fit < least) node.style.whiteSpace = 'normal';
	};
	const watch = watchWidth(node, refit, { settled: true });
	// The text changes with every assumption, and a longer sentence in the same box needs a new scale.
	const text = new MutationObserver(() => watch.force());
	text.observe(node, { characterData: true, childList: true, subtree: true });
	return {
		destroy: () => {
			watch.stop();
			text.disconnect();
		}
	};
}
