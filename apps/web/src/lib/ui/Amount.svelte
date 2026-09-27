<script lang="ts">
	// Money in and out are the same number with opposite meaning, so the caller's `sign` says which reads good.
	import { money } from '$lib/utils/format';

	interface Props {
		value: number;
		/** How the figure's sign should read.
		    · 'none'    — a magnitude; never coloured (a bill, a balance).
		    · 'natural' — positive is good, negative is bad (a change, a delta).
		    · 'credit'  — money coming in; always reads positive, and shows its + sign.
		    · 'refund'  — money out, EXCEPT when negative, which is a refund and reads positive. */
		sign?: 'none' | 'natural' | 'credit' | 'refund';
	}
	let { value, sign = 'none' }: Props = $props();

	const text = $derived((sign === 'credit' ? '+' : '') + money(value));

	const tone = $derived(
		sign === 'credit' || (sign === 'refund' && value < 0) || (sign === 'natural' && value > 0)
			? 'pos'
			: sign === 'natural' && value < 0
				? 'neg'
				: ''
	);
</script>

<span class="amount {tone}">{text}</span>

<style>
	.amount {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-size: var(--text-row);
		font-weight: var(--fw-semibold);
		white-space: nowrap;
	}
	.pos {
		color: var(--good-text);
	}
	.neg {
		color: var(--crit-text);
	}
</style>
