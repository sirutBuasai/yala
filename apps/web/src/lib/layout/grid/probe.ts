// The spill probe: does this pane's content fit the box it has been given?
//
// This is how a pane gets a minimum size without anyone declaring one. A real minimum is not a pair
// of numbers, it is a frontier `h ≥ f(w)`: a donut keeps its legend beside the ring while it is wide
// and drops it underneath when narrow, at which point it needs MORE height, not less — and where
// that turns over depends on the data, because two categories need less room than eleven.
//
// So don't predict it. During a resize the pane is already laid out at the candidate size, so ask
// the DOM whether the content spilled, and hold the preview at the last size that fitted.
//
// Two things make this less obvious than it sounds:
//
//  · `scrollHeight` on the card is not enough. A `container-type: size` wrapper computes its own box
//    without regard to its contents, so a legend spilling out of it never reaches the card's scroll
//    height. The wrapper's OWN overflow does show it, which is why every direct child is probed too.
//  · Only an axis whose overflow is `visible` counts. Anything else — `auto`, `scroll`, `hidden`,
//    `clip` — is the author having already decided what happens past the edge, and resizing the pane
//    is not the remedy. That covers a capped list, a sideways-scrolling table and the balance sheet
//    without any of them being named here.
//  · SIDEWAYS overflow is only measured on the card. Inside it, boxes are deliberately overflowed
//    sideways all the time: a list row pulls out by the card's own padding (`.bleed-x`) so its hover
//    runs edge to edge, which reads as 20px of overflow on every wrapper between it and the card and
//    made every pane holding a list unshrinkable. That overhang is BY CONSTRUCTION inside the card,
//    so the card is where the question "is this too narrow?" gets a truthful answer. Vertically there
//    is no such convention, so every probed box counts — and that is the axis the interesting case
//    lives on anyway: a donut that has to drop its keys below the ring needs more HEIGHT.

/** A pixel of slack, so sub-pixel layout rounding never reads as a spill. */
const SLACK = 1;

/** Would overflow on this axis actually be VISIBLE, and so worth calling a spill? */
function shows(el: Element, axis: 'x' | 'y'): boolean {
	return getComputedStyle(el)[axis === 'x' ? 'overflowX' : 'overflowY'] === 'visible';
}

/** Does this element's content visibly overrun its own box, vertically? */
function tooTall(el: Element): boolean {
	const box = el as HTMLElement;
	return shows(el, 'y') && box.scrollHeight > box.clientHeight + SLACK;
}

/** Does anything escape the card sideways? */
function tooWide(card: HTMLElement): boolean {
	return shows(card, 'x') && card.scrollWidth > card.clientWidth + SLACK;
}

/**
 * True when the content no longer fits the card. Probes the card, its own children (so a wrapping
 * title counts) and the body's children (so a size-container's contents count).
 */
export function spills(card: HTMLElement): boolean {
	if (tooWide(card) || tooTall(card)) return true;
	for (const child of card.children) {
		if (tooTall(child)) return true;
		if (child.classList.contains('body')) {
			for (const inner of child.children) if (tooTall(inner)) return true;
		}
	}
	return false;
}
