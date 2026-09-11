<script lang="ts">
	// One KPI card on the board: a pane of sections, plus the arrange-mode controls that change the
	// grouping. The card takes no title of its own; each section carries one.
	import { tick } from 'svelte';
	import type { DashboardData } from '$lib/data/types';
	import type { PlacedPane, Rect } from '$lib/layout/grid/types';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { drag } from '$lib/layout/grid/drag';
	import { overflows } from '$lib/layout/grid/spill';
	import { COLS } from '$lib/layout/grid/units';
	import { getArrangement, getGridEnv } from '$lib/layout/grid/context';
	import { flowOf, mergeAxis, spanOf, unionRect, withSpan, type MergeAxis } from './merge';
	import { splitFloors } from './measure';
	import { getKpiBoard } from './context';
	import Kpi from './Kpi.svelte';

	interface Props {
		/** The group's leader id, which is also this pane's id on the board. */
		id: string;
		data: DashboardData;
	}
	let { id, data }: Props = $props();

	const env = getGridEnv();
	const arrangement = getArrangement();
	const kpis = getKpiBoard();

	const group = $derived(kpis.group(id));
	const dividers = $derived(kpis.dividers(id));

	/** The sections box, which both a split and the fit measure before they change the card. */
	let sectionsEl = $state<HTMLElement>();

	// Where a card SITS is placed; where a merged card STARTS is authored. A merge is not a drag, so the
	// leader keeps the top the user gave it rather than banking whatever the push rule had added.
	const placed = $derived(arrangement.placed(id));

	function rectOf({ x, y, w, h }: Rect): Rect {
		return { x, y, w, h };
	}

	function authored(pane: string): Rect {
		return rectOf(arrangement.authored(pane));
	}

	/** Grid tracks, not flex: `fr` shares are exact, so a divider lands on the fraction its control is
	    drawn at. */
	const tracks = $derived(group.weights.map((w) => `minmax(0, ${w}fr)`).join(' '));
	const stacked = $derived(group.axis === 'column' || env.folded);

	/** A group merged the other way cannot gain a section without becoming a grid. */
	function flat(leader: string, axis: MergeAxis): boolean {
		const g = kpis.group(leader);
		return g.ids.length === 1 || g.axis === axis;
	}

	/** The KPI card this one may merge with on an axis. Nothing matching means no control. */
	function neighbour(axis: MergeAxis): PlacedPane | null {
		if (!flat(id, axis)) return null;
		return (
			arrangement.all.find(
				(p) => p.id !== id && kpis.leads(p.id) && mergeAxis(placed, p) === axis && flat(p.id, axis)
			) ?? null
		);
	}

	const merges = $derived<[MergeAxis, PlacedPane | null][]>(
		env.arranging
			? [
					['row', neighbour('row')],
					['column', neighbour('column')]
				]
			: []
	);

	function join(axis: MergeAxis, other: PlacedPane): void {
		// Spans as PLACED: a displaced pane is authored above where it renders, so a union of the two
		// authored rectangles can be shorter than the pair on screen and squeeze every section in the card.
		const [mine, theirs] = [rectOf(placed), rectOf(other)];
		const covered = spanOf(unionRect(mine, theirs), axis);

		// The rectangle first, then the grouping: changing the grouping rebuilds the board around the new
		// pane set, and the merged card must already own the space both cards held.
		arrangement.seed({ [id]: withSpan(authored(id), axis, covered) });
		kpis.merge(id, other.id, axis, (member) => spanOf(member === other.id ? theirs : mine, axis));
	}

	function squeezed(axis: MergeAxis): boolean {
		const sections = sectionsEl ? [...sectionsEl.children] : [];
		return sections.some((s) => overflows(s, flowOf(axis)));
	}

	/**
	 * Grow the card until no section is squeezed. A merge shares the space it inherits out by WEIGHT, so a
	 * section can be handed less than the content in it — the merged card carries one card's padding where
	 * the two carried two, and a section's share of that saving need not be the slack it had. Measured
	 * once the card is real rather than predicted, for the reason every minimum here is (see `spill.ts`).
	 */
	async function grow(axis: MergeAxis): Promise<void> {
		for (let room = COLS; room > 0 && squeezed(axis); room--) {
			const rect = authored(id);
			arrangement.resizeTo(id, withSpan(rect, axis, spanOf(rect, axis) + 1));
			await tick();
		}
		arrangement.commit();
	}

	/** The grouping already fitted. Plain, not state: it must not re-run the check that sets it. */
	let fitted = '';

	// An effect rather than the tail of `join`: a merge rebuilds the board around the new pane set, so the
	// element the gesture had bound is gone and the card to measure is the one this render just made. Keyed
	// on the GROUPING alone — a resize is the gesture's business, and it holds its own last fitting size.
	$effect(() => {
		const el = sectionsEl;
		const grouping = `${group.axis}:${group.ids.join('|')}`;
		if (!el || env.folded || grouping === fitted) return;
		fitted = grouping;
		if (group.ids.length > 1) void grow(group.axis);
	});

	function cut(index: number): void {
		const rect = authored(id);
		const floors = splitFloors(sectionsEl!, group, index, spanOf(rect, group.axis));
		const { ids, rects } = kpis.split(id, index, rect, floors);
		arrangement.seed({ [ids[0]]: rects[0], [ids[1]]: rects[1] });
	}

	const AXIS_LABEL: Record<MergeAxis, string> = {
		row: 'the card to its right',
		column: 'the card below it'
	};
</script>

<Pane {id}>
	<!-- Folded, there are no coordinates and no room to sit side by side: sections stack whatever the merge
	     said. `data-measure` per SECTION, not on the box around them — only the LAST section's overhang
	     reaches that box, so measuring it alone let every earlier section be squeezed until it painted over
	     its neighbour (see `grid/spill.ts`). -->
	<div class="sections" class:stacked style:--tracks={tracks} bind:this={sectionsEl}>
		{#each group.ids as member (member)}
			<div class="section" data-measure>
				<Kpi id={member} {data} spec={kpis.spec(member)} editing={env.arranging} />
			</div>
		{/each}
	</div>

	{#snippet affordances()}
		{#if dividers.length}
			<!-- Over the card's CONTENT box, so a fraction here is the fraction the tracks put the divider
			     at. The divider IS the split control. -->
			<div class="cuts" class:stacked>
				{#each dividers as fraction, i (i)}
					<button
						type="button"
						class="cut"
						style:--at={fraction}
						aria-label={`Split ${group.ids[i]} from ${group.ids[i + 1]}`}
						title="Split here"
						data-no-drag
						onclick={() => cut(i + 1)}
					></button>
				{/each}
			</div>
		{/if}

		{#each merges as [axis, other] (axis)}
			{#if other}
				<!-- In the gap lane between the pair it would join, a quarter along rather than halfway: the
				     middle of an edge is where a hand goes to resize, and a control there swallowed the press. -->
				<button
					type="button"
					class="join {axis}"
					aria-label={`Merge ${id} with ${AXIS_LABEL[axis]}`}
					title="Merge these two"
					data-no-drag
					onclick={() => join(axis, other)}
				>
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M8 3v10M4.5 6.5 8 3l3.5 3.5M4.5 9.5 8 13l3.5-3.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			{/if}
		{/each}
	{/snippet}
</Pane>

<style>
	.sections {
		display: grid;
		grid-template-columns: var(--tracks);
		flex: 1 1 auto;
		min-height: 0;
	}
	.sections.stacked {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: var(--tracks);
	}
	/* Padding INSIDE the track, never a gap or a margin: either moves the boundary away from the fraction
	   the split control is drawn at. */
	.section {
		display: flex;
		min-width: 0;
		min-height: 0;
	}
	.section + .section {
		border-inline-start: 1px solid var(--border);
		padding-inline-start: var(--pad-card-x);
	}
	.section:not(:last-child) {
		padding-inline-end: var(--pad-card-x);
	}
	.sections.stacked .section + .section {
		border-inline-start: 0;
		padding-inline-start: 0;
		border-block-start: 1px solid var(--border);
		padding-block-start: var(--pad-card-y);
	}
	.sections.stacked .section:not(:last-child) {
		padding-inline-end: 0;
		padding-block-end: var(--pad-card-y);
	}

	/* --- arrange-mode controls ------------------------------------------------
	   Both live in the pane's affordance layer over the CELL (see grid/Pane): the card is `inert` while
	   arranging, so a button inside it could not be clicked. */

	.cuts {
		position: absolute;
		inset: calc(var(--pane-inset) + var(--pad-card-y)) calc(var(--pane-inset) + var(--pad-card-x));
		pointer-events: none;
	}
	.cut {
		position: absolute;
		pointer-events: auto;
		left: calc(var(--at) * 100%);
		top: 50%;
		transform: translate(-50%, -50%);
		width: 6px;
		height: 34px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--arrange-line) 45%, var(--surface-2));
		cursor: pointer;
	}
	.cuts.stacked .cut {
		left: 50%;
		top: calc(var(--at) * 100%);
		width: 34px;
		height: 6px;
	}
	.cut:hover {
		background: var(--arrange-line);
	}

	/* Half of it lies over the NEIGHBOUR, whose drag layer sits at `z-index: auto` and would otherwise
	   swallow the click by being later in the DOM. */
	.join {
		position: absolute;
		z-index: 2;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--ink-2);
		box-shadow: var(--shadow);
		cursor: pointer;
	}
	.join:hover {
		color: var(--ink);
		border-color: var(--arrange-line);
	}
	/* One `transform`, translate before rotate: a percentage translate resolves along the element's OWN
	   axes, so rotating first sent the offset diagonally and the control drifted off the edge. */
	.join.row {
		right: 0;
		top: 25%;
		transform: translate(50%, -50%) rotate(90deg);
	}
	.join.column {
		bottom: 0;
		left: 25%;
		transform: translate(-50%, 50%);
	}
	.join svg {
		width: 14px;
		height: 14px;
	}
</style>
