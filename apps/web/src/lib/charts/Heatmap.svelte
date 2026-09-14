<script lang="ts">
	// Heatmap over a Matrix: rounded tiles carrying their own figure, with a total per row and per
	// column. A real table, not a picture of one — the axes are headers a screen reader can announce, and
	// `border-spacing` is what sets the tiles apart, so the gaps are the table's own and never drift from
	// the cells.
	//
	// It SCALES rather than scrolls, like every other figure: the columns divide the pane's width and the
	// type is sized off the row height the pane leaves, so the whole grid is always in view.
	//
	// A band scales to its own max by default, since categories span orders of magnitude and one
	// grid-wide scale leaves the median cell near-blank; intensity is therefore NOT comparable between
	// bands. `normalize` names which axis the band runs along, so the scale follows the categories
	// whichever way the grid is turned.
	//
	// A band may carry its own hue (`colors`), which only reads because the scale is per band: the palette
	// isn't luminance-matched, so two hues at equal depth do NOT look equally deep, and only a comparison
	// DOWN one band is being invited. One ink over every hue, and a tint strength pitched so the palest
	// and the deepest hue both clear it — a per-hue flip would need a per-hue threshold.
	import { moneyExact, numCompact, esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';

	/** For a band with no colour of its own — the same neutral accent the whole grid used to carry. */
	const FALLBACK = 'var(--lav)';

	interface Props {
		/** Row-axis labels. */
		rows: string[];
		/** Column-axis labels. */
		cols: string[];
		/** Cell values indexed as values[rowIndex][colIndex]. */
		values: number[][];
		/** Which axis a band runs along: 'row' (default) or 'col'; 'global' uses one scale for the grid. */
		normalize?: 'row' | 'col' | 'global';
		/** One colour per band, along `normalize`'s axis — a band's members are what have identity. Short
		    or absent, the rest of the grid falls back to the neutral accent. */
		colors?: string[];
	}
	let { rows, cols, values, normalize = 'row', colors }: Props = $props();

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

	/** A cell against the heaviest of its band, 0..1. At or below zero it carries no heat: a credit is
	    not a small amount of spending, and shading it as one would rank it among them. */
	function share(v: number, i: number, j: number): number {
		return v <= 0 ? 0 : Math.min(1, v / scaleOf(i, j));
	}

	/** The hue a cell's band carries. `global` has no bands, so nothing there has identity to colour. */
	function tile(i: number, j: number): string {
		if (normalize === 'global') return FALLBACK;
		return colors?.[normalize === 'row' ? i : j] ?? FALLBACK;
	}

	const label = $derived(`Heatmap: ${rows.join(', ')} by ${cols.join(', ')}`);
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
							onmousemove={(e) => showTip(`<b>${esc(r)} · ${esc(c)}</b><br>${moneyExact(v)}`, e)}
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
	/* The grid's own proportions, named here rather than spelled into a dozen rules. */
	table {
		/* One row's share of the pane, which every size below is pitched against: the pane decides how
		   big this figure is, exactly as it does for a chart with a viewBox. */
		--row: calc(100cqh / var(--tracks));
		--tile-radius: var(--radius-md);
		/* The month gutter and the totals column, in figures rather than a fixed width, so both hold their
		   content at whatever size the type has scaled to. */
		--gutter: 4ch;
		/* Wide enough for the word TOTAL over its own column: letterspaced uppercase runs wider than any
		   figure under it, and `ch` here is measured at the HEADER's smaller size. */
		--totals: 9ch;

		width: 100%;
		height: 100%;
		table-layout: fixed;
		border-collapse: separate;
		/* The gaps BETWEEN tiles, which is what sets them apart as tiles. */
		border-spacing: var(--space-1);
		font-variant-numeric: tabular-nums;
		/* Scaled off the row, floored so it never becomes unreadable and capped so a tall pane doesn't
		   inflate a table into a headline. */
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
		/* Ellipsis rather than a shrink-to-fit: past a dozen categories no type size makes every name fit,
		   and the tooltip carries the whole of it. */
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
		/* Mixed INTO the card rather than laid over it, so a tile reads as the surface tinted and one ramp
		   works over either theme's card. */
		background: color-mix(in srgb, var(--tile) calc(var(--a, 0) * var(--mark-tile)), transparent);
		/* One ink at every depth over every hue. `--mark-tile` is what keeps that true: see app.css. */
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
	/* The one rule in the table: a total is a different KIND of row, and space alone left it reading as
	   one more month. */
	tfoot th,
	tfoot .sum {
		border-block-start: 1px solid var(--border);
	}
	tfoot th[scope='row'] {
		color: var(--ink-2);
		font-weight: var(--fw-semibold);
	}
	/* Only the month label answers the hover. A wash behind the row's total read as a value of its own,
	   in a grid where every other shaded box means an amount. */
	tbody tr:hover th[scope='row'] {
		color: var(--ink);
	}
</style>
