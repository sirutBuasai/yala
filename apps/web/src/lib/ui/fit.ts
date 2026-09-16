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
