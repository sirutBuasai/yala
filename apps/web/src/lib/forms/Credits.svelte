<script module lang="ts">
	export type { AmountRow as Credit } from '$lib/forms/LineColumn.svelte';
</script>

<script lang="ts">
	import { formatAccount } from '$lib/utils/format';
	import LineColumn, { type AmountRow } from '$lib/forms/LineColumn.svelte';

	interface Props {
		credits: AmountRow[];
		creditAccounts: string[];
	}
	let { credits = $bindable(), creditAccounts }: Props = $props();
</script>

<div class="legs">
	<LineColumn
		bind:rows={credits}
		header="Credits — refunds or reimbursement."
		addLabel="+ credit"
		options={creditAccounts}
		selectAriaLabel="credit account"
		optionLabel={formatAccount}
	/>
</div>

<style>
	.legs {
		margin-top: var(--space-5);
	}
</style>
