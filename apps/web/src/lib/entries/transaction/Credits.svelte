<script module lang="ts">
	export type { AmountRow as Credit } from '$lib/forms/fields/LineColumn.svelte';
</script>

<script lang="ts">
	import { formatAccount } from '$lib/utils/format';
	import LineColumn, { type AmountRow } from '$lib/forms/fields/LineColumn.svelte';

	interface Props {
		credits: AmountRow[];
		creditAccounts: string[];
		/** The transaction's funding account, which the first credit starts on. */
		fundingAccount?: string;
	}
	let { credits = $bindable(), creditAccounts, fundingAccount = '' }: Props = $props();
</script>

<LineColumn
	bind:rows={credits}
	header="Refunds, reimbursements..."
	addLabel="+ Credit"
	options={creditAccounts}
	selectAriaLabel="credit account"
	optionLabel={formatAccount}
	nextValue={() => credits.at(-1)?.value || fundingAccount || creditAccounts[0] || ''}
/>
