<script lang="ts">
	import type { PaycheckOut } from '$lib/data/types';
	import RowList from '$lib/lists/RowList.svelte';
	import Amount from '$lib/ui/Amount.svelte';
	import PaycheckFigs, { type PaycheckField } from '$lib/lists/parts/PaycheckFigs.svelte';

	interface Props {
		paychecks: PaycheckOut[];
		/** Supply to make rows clickable — they open the paycheck editor. */
		onedit?: (locator: string) => void;
		/** Hide the per-row date, for a pane that already names the day. */
		showDate?: boolean;
		/** Which figures to break out into columns, in order. Trailing amount is always net. */
		fields?: PaycheckField[];
	}
	let { paychecks, onedit, showDate = true, fields = ['gross', 'takehome'] }: Props = $props();
</script>

<div class="pc">
	<RowList
		items={paychecks}
		{onedit}
		columnTracks="auto"
		density="comfortable"
		dotColor={() => 'var(--role-income)'}
		dateOf={showDate ? (p) => p.date : undefined}
		main={(p) => ({ title: p.payee })}
	>
		{#snippet columns(p)}
			<PaycheckFigs {p} {fields} />
		{/snippet}
		{#snippet amount(p)}
			<Amount value={p.net} sign="credit" />
		{/snippet}
	</RowList>
</div>

<style>
	.pc {
		/* size-container so the figure cell can hide when its pane is too narrow */
		container-type: inline-size;
		min-width: 0;
	}
</style>
