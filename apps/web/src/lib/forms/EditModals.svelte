<script lang="ts">
	// The add/edit transaction + paycheck modal set, shared by the Monthly and Calendar tabs so
	// the four overlays and their open/close + after-save orchestration live in one place. The
	// parent opens them imperatively (bind:this) and refreshes its data via `onsaved`.
	import type { AccountsInfo } from '$lib/data/load';
	import Overlay from '$lib/ui/Overlay.svelte';
	import TransactionForm from '$lib/forms/TransactionForm.svelte';
	import PaycheckForm from '$lib/forms/PaycheckForm.svelte';

	interface Props {
		accounts: AccountsInfo | null;
		/** Called after any successful add / edit / delete (parent re-pulls data). */
		onsaved: () => void;
		/** Add-mode date preset (e.g. the calendar day clicked). */
		presetDate?: string;
		addTxnTitle?: string;
		addPayTitle?: string;
	}
	let {
		accounts,
		onsaved,
		presetDate,
		addTxnTitle = 'Add transaction',
		addPayTitle = 'Add paycheck'
	}: Props = $props();

	let showAdd = $state(false);
	let showPaycheck = $state(false);
	let editingLocator = $state<string | null>(null);
	let editingPaycheck = $state<string | null>(null);

	// Imperative openers — the parent calls these from its trigger buttons / row clicks.
	export function addTransaction() {
		showAdd = true;
	}
	export function addPaycheck() {
		showPaycheck = true;
	}
	export function editTransaction(locator: string) {
		editingLocator = locator;
	}
	export function editPaycheck(locator: string) {
		editingPaycheck = locator;
	}

	function afterSave() {
		showAdd = false;
		showPaycheck = false;
		editingLocator = null;
		editingPaycheck = null;
		onsaved();
	}
</script>

{#if showAdd && accounts}
	<Overlay title={addTxnTitle} onclose={() => (showAdd = false)}>
		<TransactionForm {accounts} {presetDate} onsaved={afterSave} />
	</Overlay>
{/if}

{#if showPaycheck && accounts}
	<Overlay title={addPayTitle} onclose={() => (showPaycheck = false)}>
		<PaycheckForm {accounts} {presetDate} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingLocator && accounts}
	<Overlay title="Edit transaction" onclose={() => (editingLocator = null)}>
		<TransactionForm locator={editingLocator} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}

{#if editingPaycheck && accounts}
	<Overlay title="Edit paycheck" onclose={() => (editingPaycheck = null)}>
		<PaycheckForm locator={editingPaycheck} {accounts} onsaved={afterSave} />
	</Overlay>
{/if}
