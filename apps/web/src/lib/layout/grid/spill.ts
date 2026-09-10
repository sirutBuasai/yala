// Has this pane's content outgrown the box it was given? A real minimum is a frontier `h ≥ f(w)`, not
// a pair of numbers — a chart may reflow its legend and need MORE height when narrow — so it is
// measured rather than predicted: the pane is already laid out at the candidate size, so ask the DOM
// and hold the preview at the last size that fitted.
//
// Only an axis whose overflow is `visible` counts. Anything else is the author having already decided
// what happens past the edge, and resizing the pane is not the remedy.
//
// SIDEWAYS overflow is measured on the card, plus any box opting in with `data-measure-x`. Not
// everywhere inside: a list row deliberately bleeds past the card's padding so its hover runs edge to
// edge, which reads as overflow on every wrapper above it and made list panes unshrinkable. Not the
// card alone either: content overflowing a box the card doesn't scroll never reaches the card's own
// scroll width, so a KPI card narrowed while its content quietly overhung its section.

/**
 * Tolerance, so a layout artefact never reads as a spill: heights compose from fractional boxes whose
 * scroll and client sizes round independently. A real spill is an order of magnitude larger, and
 * content whose ink can exceed its own box must not lean on this (see `Kpi.svelte`).
 */
const SLACK = 2;

/** Would overflow on this axis actually be VISIBLE, and so worth calling a spill? */
function shows(el: Element, axis: 'x' | 'y'): boolean {
	return getComputedStyle(el)[axis === 'x' ? 'overflowX' : 'overflowY'] === 'visible';
}

function tooTall(el: Element): boolean {
	const box = el as HTMLElement;
	return shows(el, 'y') && box.scrollHeight > box.clientHeight + SLACK;
}

function tooWide(el: Element): boolean {
	const box = el as HTMLElement;
	return shows(el, 'x') && box.scrollWidth > box.clientWidth + SLACK;
}

const MEASURED_X = '[data-measure-x]';

/**
 * True when the content no longer fits the card. A size-container wrapper computes its own box without
 * regard to its contents, so what spills out of one never reaches the card's scroll height — hence
 * probing the card's children and the body's too.
 *
 * `body` is a parameter rather than found by class: it is the card component's own markup, and
 * renaming it there would silently stop half the measurement happening.
 */
export function spills(card: HTMLElement, body?: HTMLElement): boolean {
	if (tooWide(card) || tooTall(card)) return true;
	for (const child of card.children) if (tooTall(child)) return true;
	if (body) {
		for (const inner of body.children) if (tooTall(inner)) return true;
	}
	for (const wide of card.querySelectorAll(MEASURED_X)) if (tooWide(wide)) return true;
	return false;
}
