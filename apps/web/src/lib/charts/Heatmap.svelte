<script lang="ts">
	// Heatmap over a grid of tiles (see `heat.ts`): a real table, so the axes are headers a screen reader can
	// announce. It scales rather than scrolls: columns divide the pane's width and type is sized off the row
	// height.
	import { esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import { chartLabel } from '$lib/charts/aria';
	import type { HeatGrid } from '$lib/charts/heat';
	import { fitReadings } from '$lib/ui/readings';
	import Reading from '$lib/ui/Reading.svelte';

	interface Props {
		grid: HeatGrid;
		/** Rows in focus, by position. */
		marked?: number[];
		/** Makes row labels and cells buttons: a row label picks its row, a cell its row and column. */
		onpick?: (row: string, col: string | null) => void;
		/** Column currently chosen, which its header marks. */
		picked?: string | null;
	}
	let { grid, marked = [], onpick, picked }: Props = $props();

	const totals = $derived(grid.totals);

	/** Header row, body rows and any totals row: what the pane's height is divided between. */
	const tracks = $derived(grid.rows.length + (totals ? 2 : 1));

	const label = $derived(chartLabel('Heatmap', grid.rows, ` by ${grid.cols.join(', ')}`));

	/** The row labels' column, in `ch` so it holds its longest label at whatever size type scaled to. */
	const gutter = $derived(Math.max(3, ...grid.rows.map((r) => r.length)) + 1);

	/** How fully the figures read: one level for the tiles so they read alike, one for the totals, whose
	    column is narrower (see `Reading`). */
	let levels = $state<Record<string, number>>({});
	const level = $derived(levels[''] ?? 0);
	const sumLevel = $derived(levels.sum ?? 0);
</script>

<div class="sizebox">
	<table
		style:--tracks={tracks}
		style:--gutter={`${gutter}ch`}
		aria-label={label}
		use:fitReadings={(l) => (levels = l)}
	>
		<thead>
			<tr>
				<td class="corner"></td>
				<!-- Keyed by position: a heading may repeat beside each level it belongs to. -->
				{#each grid.cols as c, j (j)}
					<th scope="col" title={c} class:picked={c === picked}>{c}</th>
				{/each}
				{#if totals}
					<td class="gap"></td>
					<th scope="col" class="sum">Total</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each grid.rows as r, i (i)}
				{@const on = marked.includes(i)}
				<tr class:marked={on} aria-current={on ? 'true' : undefined}>
					<th scope="row">
						{r}
						{#if onpick}
							<button type="button" class="pick" aria-label={r} onclick={() => onpick(r, null)}
							></button>
						{/if}
					</th>
					{#each grid.cols as c, j (j)}
						{@const cell = grid.cells[i]![j]!}
						<td
							class="cell"
							style:--a={cell.a.toFixed(3)}
							style:--tile={cell.tile}
							onmousemove={(e) => showTip(`<b>${esc(r)} · ${esc(c)}</b><br>${esc(cell.tip)}`, e)}
							onmouseleave={hideTip}
						>
							<Reading readings={cell.readings} {level} />
							{#if onpick}
								<button
									type="button"
									class="pick"
									aria-label={`${r} · ${c}`}
									onclick={() => onpick(r, c)}
								></button>
							{/if}
						</td>
					{/each}
					{#if totals}
						<td class="gap"></td>
						<td class="sum"><Reading readings={totals.rows[i]!} level={sumLevel} group="sum" /></td>
					{/if}
				</tr>
			{/each}
		</tbody>
		{#if totals}
			<tfoot>
				<tr>
					<th scope="row">Total</th>
					{#each grid.cols as _c, j (j)}
						<td class="sum"><Reading readings={totals.cols[j]!} level={sumLevel} group="sum" /></td>
					{/each}
					<td class="gap"></td>
					<td class="sum"><Reading readings={totals.grand} level={sumLevel} group="sum" /></td>
				</tr>
			</tfoot>
		{/if}
	</table>
</div>

<style>
	table {
		/* One row's share of the pane, which every size below is pitched against. */
		--row: calc(100cqh / var(--tracks));
		--tile-radius: var(--radius-md);
		/* In `ch` rather than a fixed width, so it holds its content at whatever size type scaled to. Wide
		   enough for the letterspaced uppercase header, which outruns any figure. */
		--totals: 9ch;

		width: 100%;
		height: 100%;
		table-layout: fixed;
		border-collapse: separate;
		/* What sets the tiles apart, so the gaps are the table's own and can't drift from the cells. */
		border-spacing: var(--space-1);
		font-variant-numeric: tabular-nums;
		/* Floored so it stays readable, capped so a tall pane doesn't inflate a table into a headline. */
		font-size: clamp(var(--fs-100), calc(var(--row) * 0.4), var(--text-secondary));
	}
	th[scope='row'],
	.corner {
		width: var(--gutter);
	}
	.sum {
		width: var(--totals);
	}
	.gap {
		width: var(--space-4);
		padding: 0;
	}
	th[scope='col'] {
		color: var(--ink-3);
		font-weight: var(--fw-regular);
		font-size: clamp(var(--fs-100), calc(var(--row) * 0.32), var(--text-micro));
		letter-spacing: var(--ls-wide);
		text-transform: uppercase;
		text-align: right;
		padding: 0 var(--space-2) var(--space-1);
		/* Ellipsis rather than shrink-to-fit: past a dozen categories no type size fits, and the tooltip
		   carries the whole name. */
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Centred, so the month sits in the middle of the ring its cell draws on hover and when marked. */
	th[scope='row'] {
		color: var(--ink-3);
		font-weight: var(--fw-regular);
		text-align: center;
		white-space: nowrap;
	}
	/* A figure is clipped rather than laid over its neighbour, and its compact reading's clip is what the
	   pane reads as its floor (see `Reading`): the columns divide the pane, so they would otherwise narrow
	   past their values. */
	.cell,
	td.sum {
		white-space: nowrap;
		overflow: hidden;
	}
	.cell {
		text-align: right;
		padding-inline: var(--space-2);
		border-radius: var(--tile-radius);
		/* Mixed into the card rather than laid over it, so one ramp works over either theme. */
		background: color-mix(in srgb, var(--tile) calc(var(--a, 0) * var(--mark-tile)), transparent);
		/* One ink at every depth over every hue; `--mark-tile` is pitched to keep that true. See app.css. */
		color: var(--ink);
	}
	.sum {
		text-align: right;
		padding-inline: var(--space-2);
		font-weight: var(--fw-semibold);
		color: var(--ink);
	}
	th[scope='col'].sum {
		color: var(--ink-3);
		font-weight: var(--fw-regular);
	}
	/* The only rule in the table: space alone left the totals row reading as one more month. */
	tfoot th,
	tfoot .sum {
		border-block-start: 1px solid var(--border);
	}
	tfoot th[scope='row'] {
		color: var(--ink-2);
		font-weight: var(--fw-semibold);
	}
	/* Label only. A wash behind the row total read as an amount, in a grid where every shaded box is one. */
	tbody tr:hover th[scope='row'] {
		color: var(--ink);
	}
	/* A pickable label or cell keeps the table's look: an empty button laid over the whole cell takes the
	   click and draws the hover ring, while the cell's own text keeps sizing the table. */
	th[scope='row'],
	.cell {
		position: relative;
	}
	.pick {
		all: unset;
		position: absolute;
		inset: 0;
		cursor: pointer;
		border-radius: var(--tile-radius);
	}
	.pick:hover {
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
	}
	.pick:focus-visible {
		outline: var(--ring-width) solid var(--ring-color);
		outline-offset: var(--ring-offset);
	}
	th[scope='col'].picked {
		color: var(--ink);
		font-weight: var(--fw-semibold);
	}
	/* The row in focus: its label stands out and its tiles are ringed, without a wash that would read as
	   an amount. */
	tr.marked th[scope='row'] {
		color: var(--ink);
		font-weight: var(--fw-semibold);
	}
	tr.marked .cell,
	tr.marked .sum {
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
		border-radius: var(--tile-radius);
	}
</style>
