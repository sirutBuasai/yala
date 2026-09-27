<script lang="ts">
	// A bullet set drawn as rings, one per row: each filled toward its target, the share printed inside and
	// the figures under it. A share past the target prints as it is while the ring stays full.
	import { amountText, fillTo, fillText } from '$lib/charts/progress';
	import { formatUnit, type BulletRow } from '$lib/data/primitives';
	import { labelText } from '$lib/ui/label';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import { esc } from '$lib/utils/format';

	interface Props {
		rows: BulletRow[];
	}
	let { rows }: Props = $props();

	const R = 34;
	const C = 2 * Math.PI * R;

	/** The amounts behind a share where a row carries them, else the reading against its target. */
	const figures = (row: BulletRow) =>
		row.amount
			? amountText(row.amount)
			: `${row.value == null ? '' : formatUnit(row.value, row.unit)} / ${formatUnit(row.target, row.unit)}`;
</script>

<div class="rings">
	{#each rows as row (row.label)}
		{@const f = fillTo(row.value, row.target)}
		<div
			class="ring"
			role="meter"
			aria-label={row.label}
			aria-valuenow={row.value ?? undefined}
			aria-valuemin="0"
			aria-valuemax={row.target}
			aria-valuetext={fillText(row.value, row.target, row.unit)}
			onmousemove={(e) => row.note && showTip(esc(labelText(row.note)), e)}
			onmouseleave={hideTip}
		>
			<svg viewBox="0 0 84 84" aria-hidden="true">
				<circle class="track" cx="42" cy="42" r={R} />
				{#if f}
					<circle
						class="arc"
						class:reached={f.reached}
						cx="42"
						cy="42"
						r={R}
						stroke-dasharray="{(C * f.pct) / 100} {C}"
					/>
				{/if}
				<text x="42" y="47" text-anchor="middle">{f ? `${Math.round(f.share)}%` : '—'}</text>
			</svg>
			<span class="label">{row.label}</span>
			<span class="figures">{figures(row)}</span>
		</div>
	{/each}
</div>

<style>
	.rings {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
		gap: var(--gap-row);
		align-content: center;
		flex: 1 1 auto;
	}
	.ring {
		display: grid;
		justify-items: center;
		gap: var(--space-1);
		text-align: center;
		min-width: 0;
	}
	svg {
		width: 100%;
		max-width: 6rem;
		height: auto;
	}
	circle {
		fill: none;
		stroke-width: 9;
	}
	.track {
		stroke: var(--inset);
	}
	/* Started at twelve o'clock and drawn clockwise. */
	.arc {
		stroke: var(--role-balance);
		stroke-linecap: round;
		transform: rotate(-90deg);
		transform-origin: 42px 42px;
	}
	.arc.reached {
		stroke: var(--role-saving);
	}
	text {
		fill: var(--ink);
		font-size: 16px;
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
	}
	.label {
		font-size: var(--text-control);
		color: var(--ink-2);
	}
	.figures {
		font-size: var(--text-caption);
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
