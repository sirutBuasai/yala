<script lang="ts">
	import { money, formatAccount } from '$lib/format';
	import { categoryVar } from '$lib/theme';

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
	<div class="plist">
		{#each items as t (t.locator)}
			<button type="button" class="prow" onclick={() => onedit(t.locator)}>
				<span class="date">{t.date}</span>
				<span class="dot" style:background={categoryVar(t.category)}></span>
				<span class="title">{t.payee}</span>
				<span class="src">{formatAccount(t.funding_account)}</span>
				<span class="amt">{money(t.amount)}</span>
			</button>
		{/each}
	</div>
{:else}
	<p class="cap muted">No pending transactions.</p>
{/if}

<style>
	.muted {
		color: var(--ink-3);
		margin: 0;
	}
	.plist {
		display: flex;
		flex-direction: column;
	}
	.prow {
		display: grid;
		grid-template-columns: 84px 10px 1fr auto 84px;
		align-items: center;
		gap: 10px;
		padding: 8px 6px;
		background: none;
		border: 0;
		border-bottom: 1px solid var(--border);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		border-radius: 8px;
		font: inherit;
	}
	.prow:last-child {
		border-bottom: 0;
	}
	.prow:hover {
		background: color-mix(in srgb, var(--gold) 10%, transparent);
	}
	.date {
		color: var(--ink-3);
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.title {
		font-size: 13px;
		font-weight: 500;
	}
	.src {
		color: var(--ink-2);
		font-size: 11.5px;
		white-space: nowrap;
	}
	.amt {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
</style>
