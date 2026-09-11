// What a split needs from the DOM: the span each half's content will not shrink below. Measured rather
// than predicted, for the same reason a spill is (see `grid/spill.ts`).

import { SLACK } from '$lib/layout/grid/spill';
import { UNIT } from '$lib/layout/grid/units';
import { along, type KpiGroup, type MergeAxis } from './merge';
import { sum } from '$lib/utils/num';

interface Section {
	/** The KPI's own span at its narrowest, without the section's padding. */
	content: number;
	/** The padding and rule the section carries at its leading and trailing edge. */
	edges: [number, number];
}

/**
 * Every section measured along the axis. The tracks are held at `min-content` for one synchronous read: a
 * section stretched by its track reports the span it HAS, not the span it would refuse to go below.
 */
function measure(sections: HTMLElement, axis: MergeAxis): Section[] {
	// The KPI's own root, which is the only child a section is given.
	const boxes = [...sections.children].map((s) => [s, s.firstElementChild!] as const);
	const track = along<'gridTemplateColumns' | 'gridTemplateRows'>(
		axis,
		'gridTemplateColumns',
		'gridTemplateRows'
	);
	const held = sections.style[track];

	sections.style[track] = boxes.map(() => 'min-content').join(' ');
	const measured = boxes.map(([section, kpi]): Section => {
		const box = kpi.getBoundingClientRect();
		const s = getComputedStyle(section);
		const sides = along(
			axis,
			[
				[s.paddingInlineStart, s.borderInlineStartWidth],
				[s.paddingInlineEnd, s.borderInlineEndWidth]
			],
			[
				[s.paddingBlockStart, s.borderBlockStartWidth],
				[s.paddingBlockEnd, s.borderBlockEndWidth]
			]
		);
		return {
			content: along(axis, box.width, box.height),
			edges: sides.map(([pad, rule]) => parseFloat(pad!) + parseFloat(rule!)) as [number, number]
		};
	});
	sections.style[track] = held;

	return measured;
}

/**
 * The span each half of a split at `index` needs, in units. `span` is the merged card's own span along
 * the axis; the board's floor is `splitRects`' to apply.
 *
 * A half's sections will divide its card in proportion to their weights, so its floor is set by whichever
 * section's share runs out first, not by the sections added up — added up, the widest would be relying on
 * its neighbours to give room back.
 */
export function splitFloors(
	sections: HTMLElement,
	group: KpiGroup,
	index: number,
	span: number
): [number, number] {
	const { axis, weights } = group;
	const measured = measure(sections, axis);
	// Everything the card puts around its sections, which each half gets from a card of its own — and the
	// reason a split needs more room than the merge did.
	const chrome = span * UNIT - along(axis, sections.clientWidth, sections.clientHeight);

	function floor(from: number, to: number): number {
		const members = measured.slice(from, to);
		const total = sum(weights.slice(from, to));
		const needed = Math.max(
			...members.map(({ content, edges }, i) => {
				// The rule at the half's own outer edge goes with the section it was cut away from.
				const lead = i === 0 ? 0 : edges[0];
				const trail = i === members.length - 1 ? 0 : edges[1];
				return ((content + lead + trail) * total) / weights[from + i]!;
			})
		);
		// `SLACK` because that is what the resize probe forgives: without it a box a fraction of a pixel
		// over a unit boundary claims a whole unit the probe would never have asked for.
		return Math.ceil((needed + chrome - SLACK) / UNIT);
	}

	return [floor(0, index), floor(index, weights.length)];
}
