// Measured at the candidate size, not predicted: a minimum is a frontier where a chart may need more height
// when narrow. Only a `visible` overflow axis counts.

/** Scroll and client sizes round independently. Content whose ink exceeds its box must not lean on this. */
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

/** Children are probed for height, since a size container's spill never reaches the card. Width only on the
    card and `MEASURED` boxes, since a list row bleeds at every width. */
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

/** Labels past their line budget and figures (`data-clip`) their box cuts off: their own `overflow: hidden`
    hides them from `overrun`. */
function clipped(card: HTMLElement): Element[] {
	return [...card.querySelectorAll('[data-label-line], [data-clip]')].filter(
		(l) => l.scrollHeight > l.clientHeight + 1 || l.scrollWidth > l.clientWidth + 1
	);
}

/** Everything the card holds fits the room it is given. */
export function fits(card: HTMLElement, body?: HTMLElement): boolean {
	const over = overrun(card, body);
	return !over.x && !over.y && !clipped(card).length;
}

/** Which boxes are overrunning or clipped, and by how much, for a dev-mode log when a resize is refused,
    since the refusal is otherwise indistinguishable from a gesture that never ran. */
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

	return [
		...boxes
			.map(([el, axis]) => ({ el, axis, px: overflowPx(el, axis) }))
			.filter(({ px }) => px > 0)
			.map(({ el, axis, px }) => `${el.tagName.toLowerCase()}.${el.className} ${axis}+${px}`),
		...clipped(card).map((l) => `clipped "${l.textContent?.trim().slice(0, 20)}"`)
	];
}
