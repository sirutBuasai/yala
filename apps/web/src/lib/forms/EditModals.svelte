<script module lang="ts">
	type EntryKind = 'transaction' | 'paycheck' | 'transfer' | 'balance';

	// Each entry type carries an icon + accent that drive the switcher pill and the Overlay's
	// tinted band: transaction = spending outward (↑), paycheck = money coming in (↓), bill pay
	// = moved between accounts (↑↓). Up/down reuse the shared Arrow; the Swap glyph is the pair.
	// `accent` is the bright band fill / pill fill; `accentText` is the mode-aware `-text` variant
	// that keeps the kicker legible on the pale light-mode band.
	const KINDS: {
		value: EntryKind;
		label: string;
		icon: 'up' | 'down' | 'swap';
		accent: string;
		accentText: string;
	}[] = [
		{
			value: 'transaction',
			label: 'Transaction',
			icon: 'up',
			accent: 'var(--salmon)',
			accentText: 'var(--salmon-text)'
		},
		{
			value: 'paycheck',
			label: 'Paycheck',
			icon: 'down',
			accent: 'var(--green)',
			accentText: 'var(--good-text)'
		},
		{
			value: 'transfer',
			label: 'Bill pay',
			icon: 'swap',
			accent: 'var(--teal)',
			accentText: 'var(--teal-text)'
		},
		{
			value: 'balance',
			label: 'Balance',
			icon: 'swap',
			accent: 'var(--lav)',
			accentText: 'var(--lav-text)'
		}
	];
	const KIND = Object.fromEntries(KINDS.map((k) => [k.value, k])) as Record<
		EntryKind,
		(typeof KINDS)[number]
	>;
</script>

<script lang="ts">
	// One Add overlay with a kind switcher (Transaction / Paycheck / Bill pay) plus per-type edit
	// overlays. Shared by the Monthly and Calendar tabs, which open it imperatively (bind:this)
	// and refresh their data via `onsaved`. Editing is always type-specific (a row is one kind),
	// so only adding needs the switcher.
	import type { AccountsInfo } from '$lib/data/load';
	import Overlay from '$lib/overlay/Overlay.svelte';
	import Arrow from '$lib/icons/Arrow.svelte';
	import Swap from '$lib/icons/Swap.svelte';
	import TransactionForm from '$lib/forms/transaction/TransactionForm.svelte';
	import PaycheckForm from '$lib/forms/paycheck/PaycheckForm.svelte';
	import TransferForm from '$lib/forms/transfer/TransferForm.svelte';
	import BalanceForm from '$lib/forms/balance/BalanceForm.svelte';

	interface Props {
		accounts: AccountsInfo | null;
		/** Called after any successful add / edit / delete (parent re-pulls data). */
		onsaved: () => void;
		/** Add-mode date preset (e.g. the calendar day clicked). */
		presetDate?: string;
		addTitle?: string;
	}
	let { accounts, onsaved, presetDate, addTitle = 'New entry' }: Props = $props();

	let showAdd = $state(false);
	let addKind = $state<EntryKind>('transaction');
	const addMeta = $derived(KIND[addKind]);
	let editingTxn = $state<string | null>(null);
	let editingPaycheck = $state<string | null>(null);
	let editingTransfer = $state<string | null>(null);

	export function add(kind: EntryKind = 'transaction') {
		addKind = kind;
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

	function afterSave() {
		showAdd = false;
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
		onclose={() => (showAdd = false)}
	>
		{#snippet controls()}
			<div class="switch" role="tablist" aria-label="Entry type">
				{#each KINDS as k (k.value)}
					<button
						type="button"
						role="tab"
						aria-selected={addKind === k.value}
						class:active={addKind === k.value}
						style="--accent: {k.accent}"
						onclick={() => (addKind = k.value)}
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
		{/snippet}
		{#if addKind === 'transaction'}
			<TransactionForm {accounts} {presetDate} onsaved={afterSave} />
		{:else if addKind === 'paycheck'}
			<PaycheckForm {accounts} {presetDate} onsaved={afterSave} />
		{:else if addKind === 'transfer'}
			<TransferForm {accounts} {presetDate} onsaved={afterSave} />
		{:else}
			<BalanceForm {accounts} {presetDate} onsaved={afterSave} />
		{/if}
	</Overlay>
{/if}

{#if editingTxn && accounts}
	<Overlay
		title={KIND.transaction.label}
		kicker="Edit entry"
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
		kicker="Edit entry"
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
		kicker="Edit entry"
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
