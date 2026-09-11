// Has this pane's content outgrown the box it was given? A real minimum is a frontier `h ≥ f(w)`, not a
// pair of numbers — a chart may reflow its legend and need MORE height when narrow — so it is measured
// at the candidate size rather than predicted.
//
// Only an axis whose overflow is `visible` counts: anything else is the author having already decided
// what happens past the edge, and resizing the pane is not the remedy.

/**
 * Tolerance, so a layout artefact never reads as a spill: scroll and client sizes round independently
 * from fractional boxes. A real spill is an order of magnitude larger, and content whose ink can exceed
 * its own box must not lean on this (see `Kpi.svelte`).
 */
export const SLACK = 2;

function shows(el: Element, axis: 'x' | 'y'): boolean {
	return getComputedStyle(el)[axis === 'x' ? 'overflowX' : 'overflowY'] === 'visible';
}

/** Has this one box been given less than its content takes, on this axis? */
export function overflows(el: Element, axis: 'x' | 'y'): boolean {
	const box = el as HTMLElement;
	return axis === 'x'
		? shows(el, 'x') && box.scrollWidth > box.clientWidth + SLACK
		: shows(el, 'y') && box.scrollHeight > box.clientHeight + SLACK;
}

const tooTall = (el: Element) => overflows(el, 'y');
const tooWide = (el: Element) => overflows(el, 'x');

/** Boxes that opt into being measured on BOTH axes. */
const MEASURED = '[data-measure]';

/**
 * True when the content no longer fits the card. Probed on the card, its children and the body's too: a
 * size-container wrapper computes its own box without regard to its contents, so what spills out of one
 * never reaches the card's scroll height.
 *
 * Sideways is the card plus `MEASURED` boxes only, not everywhere inside: a list row bleeds past the
 * card's padding by design so its hover runs edge to edge, and reading that as overflow made every list
 * pane unshrinkable.
 *
 * `body` is a parameter rather than found by class: it is the card component's own markup, and renaming
 * it there would silently stop half the measurement happening.
 */
export function spills(card: HTMLElement, body?: HTMLElement): boolean {
	if (tooWide(card) || tooTall(card)) return true;
	for (const child of card.children) if (tooTall(child)) return true;
	if (body) {
		for (const inner of body.children) if (tooTall(inner)) return true;
	}
	for (const box of card.querySelectorAll(MEASURED)) {
		if (tooWide(box) || tooTall(box)) return true;
	}
	return false;
}
