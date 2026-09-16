<script lang="ts">
	// Heatmap over a Matrix: a real table, so the axes are headers a screen reader can announce. It scales
	// rather than scrolls — columns divide the pane's width and type is sized off the row height.
	//
	// Each band scales to its own max, since categories span orders of magnitude and one grid-wide scale leaves
	// the median cell near-blank; intensity is comparable down a band, not between them. `normalize` names the
	// axis a band runs along, so the scale follows the categories whichever way the grid is turned.
	import { numCompact, esc } from '$lib/utils/format';
	import { formatUnitExact, type Unit } from '$lib/data/primitives';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import { chartLabel } from '$lib/charts/aria';

	/** For a band with no colour of its own. */
	const FALLBACK = 'var(--lav)';

	interface Props {
		/** Row-axis labels. */
		rows: string[];
		/** Column-axis labels. */
		cols: string[];
		/** Cell values indexed as values[rowIndex][colIndex]. */
		values: number[][];
		/** What the cells measure. The tiles abbreviate; the tooltip renders the figure in full. */
		unit: Unit;
		/** Which axis a band runs along: 'row' (default) or 'col'; 'global' uses one scale for the grid. */
		normalize?: 'row' | 'col' | 'global';
		/** One colour per band, along `normalize`'s axis. Short or absent, bands fall back to `FALLBACK`. */
		colors?: string[];
	}
	let { rows, cols, values, unit, normalize = 'row', colors }: Props = $props();

	const globalMax = $derived(Math.max(1, ...values.flat().map(Math.abs)));
	const rowMax = $derived(rows.map((_, i) => Math.max(1, ...(values[i] ?? []).map(Math.abs))));
	const colMax = $derived(
		cols.map((_, j) => Math.max(1, ...values.map((row) => Math.abs(row[j] ?? 0))))
	);
	const scaleOf = (i: number, j: number) =>
		normalize === 'row' ? rowMax[i]! : normalize === 'col' ? colMax[j]! : globalMax;

	const rowTotal = $derived(values.map((row) => row.reduce((a, b) => a + b, 0)));
	const colTotal = $derived(cols.map((_, j) => values.reduce((a, row) => a + (row[j] ?? 0), 0)));
	const grand = $derived(colTotal.reduce((a, b) => a + b, 0));

	/** Header row, body rows and the totals row — what the pane's height is divided between. */
	const tracks = $derived(rows.length + 2);

	/** A cell against the heaviest of its band, 0..1. A credit carries no heat: it is not small spending. */
	function share(v: number, i: number, j: number): number {
		return v <= 0 ? 0 : Math.min(1, v / scaleOf(i, j));
	}

	/** The hue a cell's band carries. `global` has no bands to colour. */
	function tile(i: number, j: number): string {
		if (normalize === 'global') return FALLBACK;
		return colors?.[normalize === 'row' ? i : j] ?? FALLBACK;
	}

	const label = $derived(chartLabel('Heatmap', rows, ` by ${cols.join(', ')}`));
</script>

<div class="sizebox">
	<table style:--tracks={tracks} aria-label={label}>
		<thead>
			<tr>
				<td class="corner"></td>
				{#each cols as c (c)}
					<th scope="col" title={c}>{c}</th>
				{/each}
				<td class="gap"></td>
				<th scope="col" class="sum">Total</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r, i (r)}
				<tr>
					<th scope="row">{r}</th>
					{#each cols as c, j (c)}
						{@const v = values[i]?.[j] ?? 0}
						<td
							class="cell"
							style:--a={share(v, i, j).toFixed(3)}
							style:--tile={tile(i, j)}
							onmousemove={(e) =>
								showTip(`<b>${esc(r)} · ${esc(c)}</b><br>${formatUnitExact(v, unit)}`, e)}
							onmouseleave={hideTip}
						>
							{numCompact(v)}
						</td>
					{/each}
					<td class="gap"></td>
					<td class="sum">{numCompact(rowTotal[i] ?? 0)}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr>
				<th scope="row">Total</th>
				{#each cols as c, j (c)}
					<td class="sum">{numCompact(colTotal[j] ?? 0)}</td>
				{/each}
				<td class="gap"></td>
				<td class="sum">{numCompact(grand)}</td>
			</tr>
		</tfoot>
	</table>
</div>

<style>
	table {
		/* One row's share of the pane, which every size below is pitched against. */
		--row: calc(100cqh / var(--tracks));
		--tile-radius: var(--radius-md);
		/* In `ch` rather than a fixed width, so both hold their content at whatever size type scaled to.
		   `--totals` is wide enough for the letterspaced uppercase header, which outruns any figure. */
		--gutter: 4ch;
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
	th[scope='row'] {
		color: var(--ink-3);
		font-weight: var(--fw-regular);
		text-align: left;
		white-space: nowrap;
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
</style>
