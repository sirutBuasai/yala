<script module lang="ts">
	interface TransferRow {
		locator: string;
		date: string;
		payee: string;
		amount: number;
		from_account: string;
		to_account: string;
		pending: boolean;
	}
</script>

<script lang="ts">
	import { accountVar } from '$lib/utils/theme';
	import RowList from '$lib/lists/RowList.svelte';
	import Amount from '$lib/ui/Amount.svelte';
	import TransferMain from '$lib/lists/parts/TransferMain.svelte';

	interface Props {
		transfers: TransferRow[];
		/** Supply to make rows clickable — they open the bill-pay editor. */
		onedit?: (locator: string) => void;
		showDate?: boolean;
	}
	let { transfers, onedit, showDate = true }: Props = $props();
</script>

<!-- No metadata columns: the route is the row's detail, and it lives in `main`. -->
<RowList
	items={transfers}
	{onedit}
	dotColor={(t) => accountVar(t.from_account)}
	dateOf={showDate ? (t) => t.date : undefined}
>
	{#snippet main(t)}
		<TransferMain {t} />
	{/snippet}
	{#snippet amount(t)}
		<Amount value={t.amount} />
	{/snippet}
</RowList>
