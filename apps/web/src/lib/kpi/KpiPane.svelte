<script lang="ts">
	// One KPI card on the board: a pane holding this group's sections, and the arrange-mode controls
	// that change the grouping. The card takes no title of its own — each section carries its own — so
	// a card of one and a merged card are the same markup with a different number of sections.
	import type { DashboardData } from '$lib/data/types';
	import type { PlacedPane, Rect } from '$lib/layout/grid/types';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { drag } from '$lib/layout/grid/drag';
	import { getArrangement, getGridEnv } from '$lib/layout/grid/context';
	import { mergeAxis, unionRect, type MergeAxis } from './merge';
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

	// Two coordinates, deliberately. Whether two cards LOOK adjacent is a question about where they are
	// ON SCREEN, so it is asked of the placed rectangle. What a merge or a split then STORES is an
	// AUTHORED one — a placed top carries the rows the push rule displaced the pane by, and storing that
	// would record the push as if the user had asked for it, so the next resolve applies it twice.
	const placed = $derived(arrangement.placed(id));

	/** Just the rectangle: a placed or authored pane also carries its id, and its offset or mode. */
	function rectOf({ x, y, w, h }: Rect): Rect {
		return { x, y, w, h };
	}

	function authored(pane: string): Rect {
		return rectOf(arrangement.authored(pane));
	}

	/**
	 * Grid tracks, not flex weights: `fr` shares are EXACT, so a divider sits at the same fraction of
	 * the axis that the split control is drawn at. Flex bases plus padding would not line up.
	 */
	const tracks = $derived(group.weights.map((w) => `minmax(0, ${w}fr)`).join(' '));
	const stacked = $derived(group.axis === 'column' || env.folded);

	/** A group already merged the other way cannot gain a section without becoming a grid. */
	function flat(leader: string, axis: MergeAxis): boolean {
		const g = kpis.group(leader);
		return g.ids.length === 1 || g.axis === axis;
	}

	/**
	 * The card this one may merge with on an axis: the KPI card immediately to its right, or immediately
	 * below, that MATCHES it on the shared edge. When nothing matches there is no control, and that
	 * absence is the only signal needed.
	 */
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
		const [mine, theirs] = [authored(id), authored(other.id)];
		const span = (r: Rect) => (axis === 'row' ? r.w : r.h);

		// The rectangle first, then the grouping: the board is rebuilt around the new pane set as soon as
		// the grouping changes, and the merged card must already own the space both cards held.
		arrangement.seed({ [id]: unionRect(mine, theirs) });
		kpis.merge(id, other.id, axis, (member) => span(member === other.id ? theirs : mine));
	}

	function cut(index: number): void {
		const { ids, rects } = kpis.split(id, index, authored(id));
		arrangement.seed({ [ids[0]]: rects[0], [ids[1]]: rects[1] });
	}

	const AXIS_LABEL: Record<MergeAxis, string> = {
		row: 'the card to its right',
		column: 'the card below it'
	};
</script>

<Pane {id}>
	<!-- Folded, the board is one or two columns wide and the coordinates are gone, so a row card's
	     sections have no room to sit side by side: they stack, whatever the merge said. -->
	<!-- `data-measure-x`: each section declares the width it needs (see `Kpi.svelte`), and a section
	     that has stopped shrinking overhangs its track without ever reaching the card's own scroll
	     width. This is the box that shows it, so it is the box the resize probe reads (see
	     `grid/spill.ts`). -->
	<div class="sections" class:stacked style:--tracks={tracks} data-measure-x>
		{#each group.ids as member (member)}
			<div class="section"><Kpi {data} spec={kpis.spec(member)} /></div>
		{/each}
	</div>

	{#snippet affordances()}
		{#if dividers.length}
			<!-- Over the card's CONTENT box, so a fraction here is the same fraction the grid tracks put
			     the divider at. -->
			<div class="cuts" class:stacked>
				{#each dividers as fraction, i (i)}
					<!-- The divider IS the split control: a merged card has one per join, and clicking it
					     splits the card there. -->
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
				<!-- Straddling the cell's outer edge, so it sits in the gap lane between the pair it would join,
				     but a QUARTER along that edge rather than halfway. The resize strip runs the whole edge and
				     the middle is where a hand goes for it, so a control there is a control in the way: pressing
				     to resize hit this instead and the pane would not move. -->
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
	/* Padding INSIDE the track, never a gap or a margin: either would move the boundary away from the
	   fraction the split control is drawn at. */
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
	   Both live in the pane's affordance layer, which covers the CELL (see grid/Pane), because the card
	   is `inert` while arranging and a button inside it could not be clicked. */

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

	/* Straddles the cell's edge, so half of it lies over the NEIGHBOUR — whose own drag layer would
	   otherwise swallow the click, being later in the DOM. A positive z-index outranks that layer, which
	   sits at `auto` and is ordered only by document position. `data-no-drag` keeps it a button: the
	   resize strip underneath must not read a press on it as the start of a drag. */
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
	/* One `transform`, in this order. A percentage translate resolves along the element's OWN axes and the
	   `rotate` property applies before `transform`, so rotating first sent the offset diagonally and the
	   control drifted off the edge. */
	.join.row {
		right: 0;
		top: 25%;
		/* The glyph joins along its own axis; turned, it reads as joining left-to-right. */
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
