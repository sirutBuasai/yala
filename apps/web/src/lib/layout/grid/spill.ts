// The spill check: has this pane's content outgrown the box it was given? A real minimum size is a
// frontier `h ≥ f(w)`, not a pair of numbers — a donut keeps its legend beside the ring while it is
// wide and drops it underneath when narrow, needing MORE height there — so don't predict it. During
// a resize the pane is already laid out at the candidate size, so ask the DOM whether the content
// spilled and hold the preview at the last size that fitted.
//
// Only an axis whose overflow is `visible` counts. Anything else is the author having already
// decided what happens past the edge, and resizing the pane is not the remedy.
//
// SIDEWAYS overflow is measured on the card, plus any box that OPTS IN with `data-measure-x`. It
// can't be measured everywhere inside: a list row deliberately pulls out by the card's own padding
// (`.bleed-x`) so its hover runs edge to edge, which reads as overflow on every wrapper between it
// and the card and made every pane holding a list unshrinkable. But it can't be the card alone
// either — content that overflows a box the card doesn't scroll (a grid track, a flex item that has
// stopped shrinking) never reaches the card's own scroll width, so a KPI card went on narrowing
// while its title and figure quietly overhung their section. Boxes with a real width demand and no
// bleed mark themselves.

/**
 * Tolerance, so a layout artefact never reads as a spill. Two pixels rather than one: card heights
 * compose from several fractional boxes (a line box, a token-derived min-height), and `scrollHeight`
 * and `clientHeight` round those independently, so they can disagree without anything overflowing.
 * A real spill is an order of magnitude larger. Content whose own ink can exceed its box — text set
 * tighter than its font's line box — must not rely on this; see `Kpi.svelte`.
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

/** Boxes that have asked for their width to be measured (see the note at the top). */
const MEASURED_X = '[data-measure-x]';

/**
 * True when the content no longer fits the card. A `container-type: size` wrapper computes its own
 * box without regard to its contents, so a legend spilling out of it never reaches the card's
 * scroll height — which is why the card's children and the body's children are probed too.
 *
 * The body arrives as a PARAMETER rather than being found by its class: `.body` is the card
 * component's own markup, and renaming it would silently stop half the measurement happening.
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
