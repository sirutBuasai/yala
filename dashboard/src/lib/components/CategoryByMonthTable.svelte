<script lang="ts">
	import { compact } from '$lib/format';
	import { theme } from '$lib/theme';

	interface Props {
		rows: string[];
		cols: string[];
		values: number[][];
	}
	let { rows, cols, values }: Props = $props();

	const max = $derived(Math.max(1, ...values.flat()));
	const dark = $derived($theme !== 'light');

	/** Ramp index 0..5 by magnitude; anything <= 0 sits below the ramp (inset). */
	function step(v: number): number {
		return v <= 0 ? -1 : Math.min(5, Math.floor((v / max) * 6));
	}
	function bg(v: number): string {
		const s = step(v);
		return s < 0 ? 'var(--inset)' : `var(--s${s + 1})`;
	}
	// Ported contrast logic from the mock's heatmap: light text on the deep end.
	function fg(v: number): string {
		const s = step(v);
		const lightText = s < 0 ? dark : dark ? s <= 3 : s >= 3;
		return lightText ? '#f4efe4' : '#2b2621';
	}
</script>

<div class="wrap">
	<table>
		<thead>
			<tr>
				<th class="rowhdr"></th>
				{#each cols as c (c)}<th>{c}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, ri (row)}
				<tr>
					<th class="rowhdr">{row}</th>
					{#each values[ri] as v, ci (ci)}
						<td style:background={bg(v)} style:color={fg(v)}>{compact(v)}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 3px;
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
	}
	th {
		color: var(--ink-3);
		font-weight: 600;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		padding: 4px 6px;
		text-align: center;
	}
	th.rowhdr {
		text-align: right;
		text-transform: none;
		font-size: 11.5px;
		color: var(--ink-2);
		white-space: nowrap;
	}
	td {
		text-align: center;
		padding: 6px 8px;
		border-radius: 6px;
		min-width: 34px;
	}
</style>
