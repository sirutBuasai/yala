// The spill check: has this pane's content outgrown the box it was given? A real minimum size is a
// frontier `h ≥ f(w)`, not a pair of numbers — a donut keeps its legend beside the ring while it is
// wide and drops it underneath when narrow, needing MORE height there — so don't predict it. During
// a resize the pane is already laid out at the candidate size, so ask the DOM whether the content
// spilled and hold the preview at the last size that fitted.
//
// Only an axis whose overflow is `visible` counts. Anything else is the author having already
// decided what happens past the edge, and resizing the pane is not the remedy.
//
// SIDEWAYS overflow is measured on the card only. Inside it, a list row deliberately pulls out by
// the card's own padding (`.bleed-x`) so its hover runs edge to edge, which reads as overflow on
// every wrapper between it and the card and made every pane holding a list unshrinkable.

/** A pixel of slack, so sub-pixel layout rounding never reads as a spill. */
const SLACK = 1;

/** Would overflow on this axis actually be VISIBLE, and so worth calling a spill? */
function shows(el: Element, axis: 'x' | 'y'): boolean {
	return getComputedStyle(el)[axis === 'x' ? 'overflowX' : 'overflowY'] === 'visible';
}

function tooTall(el: Element): boolean {
	const box = el as HTMLElement;
	return shows(el, 'y') && box.scrollHeight > box.clientHeight + SLACK;
}

function tooWide(card: HTMLElement): boolean {
	return shows(card, 'x') && card.scrollWidth > card.clientWidth + SLACK;
}

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
	return false;
}
