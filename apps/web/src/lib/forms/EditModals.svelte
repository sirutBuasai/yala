<script module lang="ts">
	export type EntryKind = 'transaction' | 'paycheck' | 'transfer';

	const KINDS: { value: EntryKind; label: string }[] = [
		{ value: 'transaction', label: 'Transaction' },
		{ value: 'paycheck', label: 'Paycheck' },
		{ value: 'transfer', label: 'Bill pay' }
	];
</script>

<script lang="ts">
	// One Add overlay with a kind switcher (Transaction / Paycheck / Bill pay) plus per-type edit
	// overlays. Shared by the Monthly and Calendar tabs, which open it imperatively (bind:this)
	// and refresh their data via `onsaved`. Editing is always type-specific (a row is one kind),
	// so only adding needs the switcher.
	import type { AccountsInfo } from '$lib/data/load';
	import Overlay from '$lib/overlay/Overlay.svelte';
	import SegTabs from '$lib/forms/SegTabs.svelte';
	import TransactionForm from '$lib/forms/TransactionForm.svelte';
	import PaycheckForm from '$lib/forms/PaycheckForm.svelte';
	import TransferForm from '$lib/forms/TransferForm.svelte';

	interface Props {
		accounts: AccountsInfo | null;
		/** Called after any successful add / edit / delete (parent re-pulls data). */
		onsaved: () => void;
		/** Add-mode date preset (e.g. the calendar day clicked). */
		presetDate?: string;
		addTitle?: string;
	}
	let { accounts, onsaved, presetDate, addTitle = 'Add entry' }: Props = $props();

	let showAdd = $state(false);
	let addKind = $state<EntryKind>('transaction');
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
	<Overlay title={addTitle} onclose={() => (showAdd = false)}>
		<SegTabs options={KINDS} bind:value={addKind} ariaLabel="Entry type" />
		{#if addKind === 'transaction'}
			<TransactionForm {accounts} {presetDate} onsaved={afterSave} />
		{:else if addKind === 'paycheck'}
			<PaycheckForm {accounts} {presetDate} onsaved={afterSave} />
		{:else}
			<TransferForm {accounts} {presetDate} onsaved={afterSave} />
		{/if}
	</Overlay>
{/if}

{#if editingTxn && accounts}
	<Overlay title="Edit transaction" onclose={() => (editingTxn = null)}>
		<TransactionForm locator={editingTxn} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingPaycheck && accounts}
	<Overlay title="Edit paycheck" onclose={() => (editingPaycheck = null)}>
		<PaycheckForm locator={editingPaycheck} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingTransfer && accounts}
	<Overlay title="Edit bill pay" onclose={() => (editingTransfer = null)}>
		<TransferForm locator={editingTransfer} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}
