<script lang="ts">
	// Signed horizontal bars around a zero axis — for deltas rather than levels. Over-spend grows
	// right in the spend accent, under-spend grows left in the positive accent, so the direction is
	// legible before any number is read. Magnitude is scaled to the largest absolute deviation, so
	// the chart is about relative surprise, not absolute dollars.
	import { money, esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';

	interface Item {
		label: string;
		value: number;
	}
	interface Props {
		items: Item[];
		/** Cap the rows shown; the rest are dropped (items arrive ranked by |value|). */
		limit?: number;
	}
	let { items, limit = 8 }: Props = $props();

	const rows = $derived(items.slice(0, limit));
	const max = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.value))));
	// Half-width, so the longest bar in either direction just fills its side.
	const pct = (v: number) => (Math.abs(v) / max) * 50;
</script>

<div class="dev">
	{#each rows as r (r.label)}
		<div class="r">
			<span class="nm">{r.label}</span>
			<div
				class="lane"
				role="presentation"
				onmousemove={(e) =>
					showTip(
						`<b>${esc(r.label)}</b><br>${r.value >= 0 ? 'over' : 'under'} by ${money(Math.abs(r.value))}`,
						e
					)}
				onmouseleave={hideTip}
			>
				<span class="zero"></span>
				<span
					class="b"
					class:over={r.value >= 0}
					style:width={`${pct(r.value)}%`}
					style:left={r.value >= 0 ? '50%' : undefined}
					style:right={r.value < 0 ? '50%' : undefined}
				></span>
			</div>
			<span class="amt" class:over={r.value > 0} class:under={r.value < 0}>
				{r.value > 0 ? '+' : ''}{money(r.value)}
			</span>
		</div>
	{/each}
</div>

<style>
	.dev {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
	}
	.r {
		display: grid;
		grid-template-columns: 5.5rem 1fr 4.5rem;
		gap: var(--gap-field);
		align-items: center;
		font-size: var(--text-subtitle);
	}
	.nm {
		color: var(--ink-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lane {
		position: relative;
		height: 16px;
	}
	.zero {
		position: absolute;
		left: 50%;
		top: -2px;
		bottom: -2px;
		width: 1px;
		background: var(--border);
	}
	/* Over-spend is money out, under-spend is money kept: the same two roles the rest of the app
	   plots, so they take the role tokens rather than naming hues here. Only the amount TEXT uses
	   the `-text` variants, which exist for legibility on the light background. */
	.b {
		position: absolute;
		top: 2px;
		height: 12px;
		border-radius: var(--radius-xs);
		background: var(--role-saving);
	}
	.b.over {
		background: var(--role-spending);
	}
	.amt {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}
	.amt.over {
		color: var(--crit-text);
	}
	.amt.under {
		color: var(--good-text);
	}
</style>
