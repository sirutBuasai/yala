<script module lang="ts">
	export type { AmountRow as Credit } from './LineColumn.svelte';
</script>

<script lang="ts">
	import { formatAccount } from '$lib/format';
	import LineColumn, { type AmountRow } from './LineColumn.svelte';

	interface Props {
		credits: AmountRow[];
		creditAccounts: string[];
	}
	let { credits = $bindable(), creditAccounts }: Props = $props();
</script>

<div class="legs">
	<LineColumn
		bind:rows={credits}
		header="Credits — amounts reimbursed to you (netted off the bill)"
		addLabel="+ credit"
		options={creditAccounts}
		selectAriaLabel="credit account"
		optionLabel={formatAccount}
	/>
</div>

<style>
	.legs {
		margin-top: 10px;
	}
</style>
