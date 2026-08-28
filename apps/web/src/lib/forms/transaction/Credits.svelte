<script module lang="ts">
	export type { AmountRow as Credit } from '$lib/forms/fields/LineColumn.svelte';
</script>

<script lang="ts">
	import { formatAccount } from '$lib/utils/format';
	import LineColumn, { type AmountRow } from '$lib/forms/fields/LineColumn.svelte';

	interface Props {
		credits: AmountRow[];
		creditAccounts: string[];
	}
	let { credits = $bindable(), creditAccounts }: Props = $props();
</script>

<LineColumn
	bind:rows={credits}
	header="Refunds or reimbursement from others."
	addLabel="+ credit"
	options={creditAccounts}
	selectAriaLabel="credit account"
	optionLabel={formatAccount}
/>
