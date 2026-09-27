// Picks how fully a group of figures reads (see `Reading`): the fullest level every one of them has room
// for, so figures read side by side never mix precisions.

import { drawnScale, firstFitting, watchWidth } from './fit';

/** The fullest level every reading has room for, given each one's widths (fullest first) and room. */
export function fittest(items: { widths: number[]; room: number }[]): number {
	return items.reduce((level, { widths, room }) => Math.max(level, firstFitting(widths, room)), 0);
}

/** `onlevel` gets the level each named group shares ('' for none), remeasured on resize. */
export function fitReadings(node: HTMLElement, onlevel: (levels: Record<string, number>) => void) {
	const measure = () => {
		const scale = drawnScale(node);
		const groups: Record<string, { widths: number[]; room: number }[]> = {};
		for (const r of node.querySelectorAll<HTMLElement>('[data-reading]')) {
			(groups[r.dataset.reading ?? ''] ??= []).push({
				widths: [...r.querySelectorAll('.probe > span')].map(
					(s) => s.getBoundingClientRect().width / scale
				),
				room: r.clientWidth
			});
		}
		onlevel(Object.fromEntries(Object.entries(groups).map(([g, items]) => [g, fittest(items)])));
	};
	return { destroy: watchWidth(node, measure).stop };
}
