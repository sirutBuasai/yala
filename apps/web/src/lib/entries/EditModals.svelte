<script module lang="ts">
	import { ENTRY_KINDS, type EntryKind } from '$lib/utils/editPrefs';

	// Each entry type carries an icon + accent that drive the switcher pill and the Overlay's
	// tinted band: transaction = spending outward (↑), paycheck = money coming in (↓), bill pay
	// = moved between accounts (↑↓). Up/down reuse the shared Arrow; the Swap glyph is the pair.
	// `accent` is the bright band fill / pill fill; `accentText` is the mode-aware `-text` variant
	// that keeps the kicker legible on the pale light-mode band.
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

	// Accents come from the `--entry-*` tokens, so the switcher pill, the Overlay band and the
	// kicker are all driven by one place in app.css rather than by literals here.
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
	 * Which kinds one `add()` call should offer: the requested ones intersected with what the page
	 * permits, falling back to the page's whole set when the request is absent or entirely
	 * disallowed. Pure and exported so the rule is unit-testable without mounting the overlay.
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
	// One Add overlay with a kind switcher (Transaction / Paycheck / Bill pay) plus per-type edit
	// overlays. Shared by the Monthly and Calendar tabs, which open it imperatively (bind:this)
	// and refresh their data via `onsaved`. Editing is always type-specific (a row is one kind),
	// so only adding needs the switcher.
	import { get } from 'svelte/store';
	import { data } from '$lib/data/load';
	import type { AccountsInfo } from '$lib/data/load';
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
		/** Add-mode date preset (e.g. the calendar day clicked). Overrides the resolved default. */
		presetDate?: string;
		addTitle?: string;
		/** Entry kinds this page may add, in switcher order. Defaults to all four; a page passes a
		    subset (e.g. the calendar omits `balance`). A single kind hides the switcher. */
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
	 * The date an add opens on, resolved once here so all four forms agree and none of them has to
	 * know the rule. In precedence order:
	 *   1. `presetDate` — the caller was explicit (you clicked a calendar day).
	 *   2. The date you last logged on — logging runs in batches, so this is usually the right one.
	 *   3. The ledger's newest entry date — the right answer on a fresh session.
	 * Today's date is deliberately NOT in the list: you log a week's spending on a Sunday, so today
	 * is nearly always wrong. An empty result leaves the field blank and the picker opens on today,
	 * which is correct for an empty ledger.
	 */
	const openDate = $derived(
		presetDate || $lastEntryDate || ($data ? latestEntryDate($data) : '') || undefined
	);

	let showAdd = $state(false);
	let addKind = $state<EntryKind>('transaction');
	// Kinds offered by the CURRENT add invocation. `null` falls back to the page's whole set, so a
	// bare `add()` still behaves as before.
	let openKinds = $state<EntryKind[] | null>(null);
	/** Switcher options for this invocation, in the caller's order, restricted to known kinds. */
	const allowedKinds = $derived(KINDS.filter((k) => (openKinds ?? kinds).includes(k.value)));
	const addMeta = $derived(KIND[addKind]);
	let editingTxn = $state<string | null>(null);
	let editingPaycheck = $state<string | null>(null);
	let editingTransfer = $state<string | null>(null);

	/**
	 * Open the add overlay. Pass one kind to go straight into that form (no switcher — the button
	 * that opened it already said what it adds), or several to offer a choice between them. Omit
	 * for the page's full set. Requests are intersected with the `kinds` prop, so a page can never
	 * be talked into an entry type it doesn't allow.
	 *
	 * A bare add() lands on the kind you last logged, so a run of bill pays doesn't mean re-picking
	 * Bill pay every time — but only when this invocation actually offers it, so a button that
	 * names its own type still opens on that type.
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
				<!-- Roving tabindex (ARIA APG): one tab stop for the group, arrows move between kinds,
				     so switching entry type costs one key rather than four Tabs. -->
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
