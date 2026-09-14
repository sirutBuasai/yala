<script module lang="ts">
	import { ENTRY_KINDS, type EntryKind } from '$lib/utils/editPrefs';

	// Each entry type carries an icon + accent driving the switcher pill and the Overlay's tinted
	// band. `accentText` is the mode-aware variant that keeps the kicker legible on the pale
	// light-mode band.
	const LABELS: Record<EntryKind, string> = {
		transaction: 'Transaction',
		paycheck: 'Paycheck',
		transfer: 'Bill pay',
		balance: 'Balance'
	};
	const ICONS: Record<EntryKind, 'up' | 'down' | 'swap'> = {
		transaction: 'up',
		paycheck: 'down',
		transfer: 'swap',
		balance: 'swap'
	};

	const KINDS = ENTRY_KINDS.map((value) => ({
		value,
		label: LABELS[value],
		icon: ICONS[value],
		accent: `var(--entry-${value})`,
		accentText: `var(--entry-${value}-text)`
	}));
	const KIND = Object.fromEntries(KINDS.map((k) => [k.value, k])) as Record<
		EntryKind,
		(typeof KINDS)[number]
	>;

	/**
	 * Requested kinds intersected with what the page permits, falling back to the page's whole set
	 * when the request is absent or entirely disallowed.
	 */
	export function resolveKinds(
		requested: EntryKind | EntryKind[] | undefined,
		permitted: EntryKind[]
	): EntryKind[] {
		if (requested == null) return permitted;
		const asked = Array.isArray(requested) ? requested : [requested];
		const allowed = asked.filter((k) => permitted.includes(k));
		return allowed.length ? allowed : permitted;
	}
</script>

<script lang="ts">
	// One Add overlay with a kind switcher plus per-type edit overlays. Pages open it imperatively
	// (bind:this) and refresh via `onsaved`. Editing is always type-specific, so only adding
	// needs the switcher.
	import { get } from 'svelte/store';
	import { data } from '$lib/data/load';
	import type { AccountsInfo } from '$lib/data/load';
	import { EDIT_ENTRY } from '$lib/copy';
	import { latestEntryDate } from '$lib/data/scope';
	import { lastEntryDate, lastEntryKind } from '$lib/utils/editPrefs';
	import { tablistKeydown } from '$lib/utils/tablist';
	import Overlay from '$lib/overlay/Overlay.svelte';
	import Arrow from '$lib/icons/Arrow.svelte';
	import Swap from '$lib/icons/Swap.svelte';
	import TransactionForm from '$lib/entries/transaction/TransactionForm.svelte';
	import PaycheckForm from '$lib/entries/paycheck/PaycheckForm.svelte';
	import TransferForm from '$lib/entries/transfer/TransferForm.svelte';
	import BalanceForm from '$lib/balance/BalanceForm.svelte';

	interface Props {
		accounts: AccountsInfo | null;
		/** Called after any successful add / edit / delete (parent re-pulls data). */
		onsaved: () => void;
		/** Overrides the resolved default add date. */
		presetDate?: string;
		addTitle?: string;
		/** Entry kinds this page may add, in switcher order. A single kind hides the switcher. */
		kinds?: EntryKind[];
	}
	let {
		accounts,
		onsaved,
		presetDate,
		addTitle = 'New entry',
		kinds = KINDS.map((k) => k.value)
	}: Props = $props();

	/**
	 * The date an add opens on, resolved once so every form agrees. Today is deliberately excluded:
	 * logging runs in batches, so the last-logged date beats it. An empty result leaves the field
	 * blank, which is right for an empty ledger.
	 */
	const openDate = $derived(
		presetDate || $lastEntryDate || ($data ? latestEntryDate($data) : '') || undefined
	);

	let showAdd = $state(false);
	let addKind = $state<EntryKind>('transaction');
	/** Kinds offered by the CURRENT add invocation; `null` falls back to the page's whole set. */
	let openKinds = $state<EntryKind[] | null>(null);
	const allowedKinds = $derived(KINDS.filter((k) => (openKinds ?? kinds).includes(k.value)));
	const addMeta = $derived(KIND[addKind]);
	let editingTxn = $state<string | null>(null);
	let editingPaycheck = $state<string | null>(null);
	let editingTransfer = $state<string | null>(null);

	/**
	 * Open the add overlay on one kind, a choice of several, or (omitted) the page's full set.
	 * Requests are intersected with the `kinds` prop, and the form opens on the last-logged kind
	 * whenever this invocation offers it.
	 */
	export function add(only?: EntryKind | EntryKind[]) {
		const offered = resolveKinds(only, kinds);
		openKinds = offered;
		const remembered = get(lastEntryKind);
		addKind = offered.includes(remembered) ? remembered : (offered[0] ?? 'transaction');
		showAdd = true;
	}
	export function editTransaction(locator: string) {
		editingTxn = locator;
	}
	export function editPaycheck(locator: string) {
		editingPaycheck = locator;
	}
	export function editTransfer(locator: string) {
		editingTransfer = locator;
	}

	/** Switch the add form, remembering the choice for the next bare add(). */
	function pickKind(kind: EntryKind) {
		addKind = kind;
		lastEntryKind.set(kind);
	}

	function closeAdd() {
		showAdd = false;
		// Drop the per-invocation kind set so the next bare add() offers the page's full set again.
		openKinds = null;
	}

	function afterSave() {
		closeAdd();
		editingTxn = null;
		editingPaycheck = null;
		editingTransfer = null;
		onsaved();
	}
</script>

{#if showAdd && accounts}
	<Overlay
		title={addMeta.label}
		kicker={addTitle}
		accent={addMeta.accent}
		accentText={addMeta.accentText}
		onclose={closeAdd}
	>
		{#snippet controls()}
			{#if allowedKinds.length > 1}
				<!-- Roving tabindex (ARIA APG): one tab stop for the group, arrows move between kinds. -->
				<div
					class="switch"
					role="tablist"
					aria-label="Entry type"
					tabindex="-1"
					onkeydown={(e) =>
						tablistKeydown(
							e,
							allowedKinds.length,
							allowedKinds.findIndex((k) => k.value === addKind),
							(i) => pickKind(allowedKinds[i]!.value)
						)}
				>
					{#each allowedKinds as k (k.value)}
						<button
							type="button"
							role="tab"
							aria-selected={addKind === k.value}
							tabindex={addKind === k.value ? 0 : -1}
							class:active={addKind === k.value}
							style="--accent: {k.accent}"
							onclick={() => pickKind(k.value)}
						>
							{#if k.icon === 'swap'}
								<Swap size={14} />
							{:else}
								<Arrow dir={k.icon} size={14} />
							{/if}
							{k.label}
						</button>
					{/each}
				</div>
			{/if}
		{/snippet}
		{#if addKind === 'transaction'}
			<TransactionForm {accounts} presetDate={openDate} onsaved={afterSave} />
		{:else if addKind === 'paycheck'}
			<PaycheckForm {accounts} presetDate={openDate} onsaved={afterSave} />
		{:else if addKind === 'transfer'}
			<TransferForm {accounts} presetDate={openDate} onsaved={afterSave} />
		{:else}
			<BalanceForm {accounts} presetDate={openDate} onsaved={afterSave} />
		{/if}
	</Overlay>
{/if}

{#if editingTxn && accounts}
	<Overlay
		title={KIND.transaction.label}
		kicker={EDIT_ENTRY}
		accent={KIND.transaction.accent}
		accentText={KIND.transaction.accentText}
		onclose={() => (editingTxn = null)}
	>
		<TransactionForm locator={editingTxn} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingPaycheck && accounts}
	<Overlay
		title={KIND.paycheck.label}
		kicker={EDIT_ENTRY}
		accent={KIND.paycheck.accent}
		accentText={KIND.paycheck.accentText}
		onclose={() => (editingPaycheck = null)}
	>
		<PaycheckForm locator={editingPaycheck} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingTransfer && accounts}
	<Overlay
		title={KIND.transfer.label}
		kicker={EDIT_ENTRY}
		accent={KIND.transfer.accent}
		accentText={KIND.transfer.accentText}
		onclose={() => (editingTransfer = null)}
	>
		<TransferForm locator={editingTransfer} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

<style>
	.switch {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.switch button {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-inline);
		border: 1px solid var(--border);
		background: color-mix(in srgb, var(--surface) 70%, transparent);
		color: var(--ink-2);
		border-radius: var(--radius-pill);
		padding: var(--space-3) var(--space-7);
		font: inherit;
		font-size: var(--text-control);
		cursor: pointer;
	}
	.switch button:hover {
		color: var(--ink);
		border-color: var(--accent);
	}
	.switch button.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		font-weight: var(--fw-bold);
	}
</style>
