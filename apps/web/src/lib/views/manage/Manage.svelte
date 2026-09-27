<script lang="ts">
	// Every panel is driven by the API's kind capabilities, so a kind gains a control server-side.
	import type { AccountsInfo } from '$lib/data/load';
	import type { DashboardData } from '$lib/data/types';
	import { accountInfo } from '$lib/data/directory.svelte';
	import { accountLeaf } from '$lib/utils/format';
	import { PICK_ACCOUNT } from '$lib/copy';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import AccountIndex from '$lib/views/manage/AccountIndex.svelte';
	import AccountPanel from '$lib/views/manage/AccountPanel.svelte';
	import NewAccount from '$lib/views/manage/NewAccount.svelte';
	import { KIND_ORDER } from '$lib/views/manage/kinds';
	import { matching, orNull, Pref } from '$lib/utils/persist.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		/** Called after a change that alters ledger data, to refresh the dashboard. */
		onsaved?: () => void;
	}
	let { data, accounts, onsaved }: Props = $props();

	/** What each kind of account may carry, as the API describes it. */
	const kinds = $derived(Object.fromEntries((accounts?.kinds ?? []).map((k) => [k.name, k])));
	const kindNames = $derived(KIND_ORDER.filter((name) => kinds[name]));

	const categories = $derived(accounts?.spending_categories ?? []);
	const cards = $derived(accounts?.card_accounts ?? []);
	const employers = $derived(accounts?.employers ?? []);
	const deductions = $derived(accounts?.deduction_accounts ?? []);

	/** Two lists arrive leaf-keyed; each kind's `prefix` resolves them without restating the taxonomy. */
	const byKind = $derived<Record<string, string[]>>({
		category: categories.map((c) => `${kinds.category?.prefix ?? ''}${c}`),
		bank: accounts?.cash_accounts ?? [],
		card: cards,
		investment: accounts?.investment_accounts ?? [],
		employer: employers.map((e) => `${kinds.employer?.prefix ?? ''}${e}`),
		deduction: deductions
	});

	// Where a sweep may land, and so where a close may move a balance: taken from the kind table rather
	// than restated, since the API refuses anything else. An investment may also settle a card.
	const destinations = $derived(
		(accounts?.kinds ?? []).filter((k) => k.sweep_target).flatMap((k) => byKind[k.name] ?? [])
	);

	/** Current value per account, for the panel's facts rail. Assets and liabilities only — a category
	    or an employer holds nothing. */
	const balances = $derived(
		Object.fromEntries((data.networth?.accounts ?? []).map((a) => [a.account, a.value]))
	);

	/** Names already in use, so a duplicate is named in the form rather than as a ledger error. */
	const taken = $derived<Record<string, string[]>>({
		category: categories,
		employer: employers,
		deduction: deductions.map(accountLeaf)
	});

	/** Kept across reloads and page switches, so Manage reopens on the account last worked on. A ledger
		account path is letters, digits, colons and hyphens. */
	const selection = new Pref<string | null>(
		'manage-selected',
		null,
		orNull(matching(/^[A-Za-z0-9:-]{1,200}$/))
	);
	const selected = $derived(selection.value);
	const select = (account: string | null) => (selection.value = account);
	// Opening an account is a flow of its own, over the page rather than in it — nothing on the page is
	// being looked at while it runs.
	let opening = $state(false);

	function saved() {
		onsaved?.();
	}

	/** An account that has just been renamed is at a new path. The panel resolves where it went, so only
	    a close — or a rename it could not place — drops the selection. */
	$effect(() => {
		if (selected !== null && !accountInfo(selected)) select(null);
	});
</script>

<ViewHeader title="Manage" />

<div class="console">
	<aside>
		<AccountIndex {kindNames} {selected} onselect={select}>
			{#snippet actions()}
				<button type="button" class="btn-primary new" onclick={() => (opening = true)}
					>+ New account</button
				>
			{/snippet}
		</AccountIndex>
	</aside>

	{#if selected !== null}
		<AccountPanel
			account={selected}
			{kinds}
			destinations={[
				...destinations,
				...(accountInfo(selected)?.kind === 'investment' ? cards : [])
			]}
			{employers}
			balance={balances[selected] ?? null}
			onchanged={saved}
			onrenamed={select}
		/>
	{:else}
		<main>
			<p class="cap">{PICK_ACCOUNT}</p>
		</main>
	{/if}
</div>

{#if opening}
	<NewAccount {kinds} {employers} {taken} onclose={() => (opening = false)} onsaved={saved} />
{/if}

<style>
	.console {
		display: grid;
		grid-template-columns: minmax(16rem, 21rem) minmax(0, 1fr);
		gap: var(--gap-grid);
		align-items: start;
	}
	/* AccountPanel is its own card, since it pads each half of its split separately. */
	aside,
	main {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--pad-card-y) var(--pad-card-x);
		min-width: 0;
	}
	aside {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		position: sticky;
		top: var(--space-6);
		max-height: calc(100vh - 8rem);
	}
	.new {
		flex: 0 0 auto;
	}
	.cap {
		font-size: var(--text-caption);
		color: var(--ink-3);
		margin: 0;
	}

	@media (max-width: 60rem) {
		.console {
			grid-template-columns: minmax(0, 1fr);
		}
		aside {
			position: static;
			max-height: none;
		}
	}
</style>
