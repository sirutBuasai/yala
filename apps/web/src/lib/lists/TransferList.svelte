<script module lang="ts">
	import { formatAccount } from '$lib/utils/format';

	interface TransferRow {
		locator: string;
		date: string;
		payee: string;
		amount: number;
		from_account: string;
		to_account: string;
		pending: boolean;
		auto_managed?: boolean;
	}

	/** A bill pay row's head: the route between accounts, with the payee under it. */
	export const transferHead = (t: TransferRow) => ({
		title: `${formatAccount(t.from_account)} → ${formatAccount(t.to_account)}`,
		pending: t.pending,
		sub: t.payee,
		fixed: t.auto_managed
	});
</script>

<script lang="ts">
	import { accountVar } from '$lib/utils/theme';
	import RowList from '$lib/lists/RowList.svelte';
	import Amount from '$lib/ui/Amount.svelte';

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
	main={transferHead}
>
	{#snippet amount(t)}
		<Amount value={t.amount} />
	{/snippet}
</RowList>
