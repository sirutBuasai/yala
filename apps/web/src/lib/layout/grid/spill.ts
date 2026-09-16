// Has this pane's content outgrown the box it was given, and by how much? Measured at the candidate size
// rather than predicted, because a minimum is a frontier `h >= f(w)`: a chart may need more height when
// narrow. Only an axis whose overflow is `visible` counts; anything else already decided what happens past
// the edge.

/**
 * Tolerance, so a layout artefact never reads as a spill: scroll and client sizes round independently
 * from fractional boxes. A real spill is an order of magnitude larger, and content whose ink can exceed
 * its own box must not lean on this (see `Kpi.svelte`).
 */
export const SLACK = 2;

/** px the content overruns `el` on one axis; 0 when it fits, or when the box handles the overrun itself. */
function overflowPx(el: Element, axis: 'x' | 'y'): number {
	const box = el as HTMLElement;
	if (getComputedStyle(box)[axis === 'x' ? 'overflowX' : 'overflowY'] !== 'visible') return 0;
	const [scroll, client] =
		axis === 'x' ? [box.scrollWidth, box.clientWidth] : [box.scrollHeight, box.clientHeight];
	return Math.max(0, scroll - client - SLACK);
}

/** Has this one box been given less than its content takes, on this axis? */
export function overflows(el: Element, axis: 'x' | 'y'): boolean {
	return overflowPx(el, axis) > 0;
}

/** Boxes that opt into being measured on both axes. */
const MEASURED = '[data-measure]';

/** How far past the card the content runs, per axis, in px. */
export interface Overrun {
	x: number;
	y: number;
}

/**
 * The worst overrun across every box worth probing. Children and body are probed for height too: a
 * size-container wrapper computes its own box regardless of contents, so a spill inside one never reaches the
 * card's scroll height.
 *
 * Width is limited to the card and `MEASURED` boxes: a list row bleeds at every width, so counting that left
 * the pane impossible to narrow — a row measures its own grid tracks instead.
 */
export function overrun(card: HTMLElement, body?: HTMLElement): Overrun {
	let x = overflowPx(card, 'x');
	let y = overflowPx(card, 'y');

	for (const child of card.children) y = Math.max(y, overflowPx(child, 'y'));
	if (body) {
		for (const inner of body.children) y = Math.max(y, overflowPx(inner, 'y'));
	}
	for (const box of card.querySelectorAll(MEASURED)) {
		x = Math.max(x, overflowPx(box, 'x'));
		y = Math.max(y, overflowPx(box, 'y'));
	}

	return { x, y };
}

/** True when the content no longer fits the card. */
export function spills(card: HTMLElement, body?: HTMLElement): boolean {
	const { x, y } = overrun(card, body);
	return x > 0 || y > 0;
}

/** Which boxes are overrunning, and by how much — for a dev-mode log when a resize is refused, since the
    refusal is otherwise indistinguishable from a gesture that never ran. */
export function spillReport(card: HTMLElement, body?: HTMLElement): string[] {
	const boxes: [Element, 'x' | 'y'][] = [
		[card, 'x'],
		[card, 'y'],
		...[...card.children].map((c): [Element, 'y'] => [c, 'y']),
		...[...(body?.children ?? [])].map((c): [Element, 'y'] => [c, 'y']),
		...[...card.querySelectorAll(MEASURED)].flatMap((b): [Element, 'x' | 'y'][] => [
			[b, 'x'],
			[b, 'y']
		])
	];

	return boxes
		.map(([el, axis]) => ({ el, axis, px: overflowPx(el, axis) }))
		.filter(({ px }) => px > 0)
		.map(({ el, axis, px }) => `${el.tagName.toLowerCase()}.${el.className} ${axis}+${px}`);
}
