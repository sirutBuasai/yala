<script lang="ts">
	import TransactionList, { type TxnRow } from '$lib/lists/TransactionList.svelte';

	interface PendingTxn {
		locator: string;
		date: string;
		payee: string;
		amount: number;
		category: string;
		funding_account: string;
	}

	interface Props {
		/** Bumped by the parent after a save to force a refetch. */
		refreshKey: number;
		onedit: (locator: string) => void;
	}
	let { refreshKey, onedit }: Props = $props();

	let items = $state<PendingTxn[]>([]);
	let loaded = $state(false);

	// Adapt the pending payload to the shared transaction-row shape.
	const transactions = $derived<TxnRow[]>(
		items.map((t) => ({
			date: t.date,
			payee: t.payee,
			amount: t.amount,
			category: t.category,
			source: t.funding_account,
			pending: true,
			locator: t.locator
		}))
	);

	$effect(() => {
		void refreshKey;
		(async () => {
			try {
				const res = await fetch('/api/pending', { cache: 'no-store' });
				const data = await res.json();
				items = res.ok ? (data.pending ?? []) : [];
			} catch {
				items = [];
			}
			loaded = true;
		})();
	});
</script>

{#if !loaded}
	<p class="cap">Loading pending…</p>
{:else if items.length}
	<p class="cap">{items.length} flagged as pending (not yet posted). Tap one to reconcile.</p>
	<TransactionList {transactions} edit {onedit} />
{:else}
	<p class="cap muted">No pending transactions.</p>
{/if}

<style>
	.muted {
		color: var(--ink-3);
		margin: 0;
	}
</style>
