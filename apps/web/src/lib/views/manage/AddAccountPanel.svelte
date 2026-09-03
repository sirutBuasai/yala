<script lang="ts">
	// One "add an account" panel, used for banks, credit cards and investments.
	//
	// The three differ in exactly three ways: whether the account has a product half, what the
	// placeholders say, and whether extra controls (subtree, share/payroll flags) ride along. Those
	// are props and a snippet. Everything else — the four naming fields, the submit, the busy state,
	// the "what is it actually called" confirmation, and clearing the form afterwards — is identical,
	// so it lives here once rather than three times.
	//
	// The caller supplies `open`, which does the actual POST and hands back what the API resolved. The
	// panel never composes a display name itself: that rule lives in Python (see
	// `yala.ledger.naming`), and guessing at it here to render a preview is what would let the two
	// drift apart.

	import type { Snippet } from 'svelte';
	import type { AccountNaming, OpenedAccount } from '$lib/data/load';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import NamingFields from '$lib/views/manage/NamingFields.svelte';

	interface Props {
		title: string;
		cap?: string;
		/** False for cash accounts, which are named by institution alone. */
		withAccountName?: boolean;
		institutionPlaceholder?: string;
		accountNamePlaceholder?: string;
		accountAliasPlaceholder?: string;
		/** What to call the account half in the "required" message ("card name", "account name"). */
		accountNameLabel?: string;
		/** Controls specific to one kind — the investment subtree and its flags. */
		extra?: Snippet;
		/** Perform the open. Returns what the API resolved, including its display name. */
		open: (naming: AccountNaming) => Promise<OpenedAccount>;
	}
	let {
		title,
		cap,
		withAccountName = true,
		institutionPlaceholder,
		accountNamePlaceholder,
		accountAliasPlaceholder,
		accountNameLabel = 'account name',
		extra,
		open
	}: Props = $props();

	let institution = $state('');
	let accountName = $state('');
	let bankAlias = $state('');
	let accountAlias = $state('');
	const save = new SaveState();

	async function submit() {
		const naming: AccountNaming = {
			institution: institution.trim(),
			bank_alias: bankAlias.trim()
		};
		if (!naming.institution) return save.fail('Enter the institution.');

		if (withAccountName) {
			naming.account_name = accountName.trim();
			naming.account_alias = accountAlias.trim();
			if (!naming.account_name) return save.fail(`Enter the ${accountNameLabel}.`);
		}

		let opened = '';
		const ok = await save.run(async () => {
			const result = await open(naming);
			opened = result.name ?? '';
			return result.error;
		});

		if (ok) {
			save.note = `Added ${opened}.`;
			institution = '';
			accountName = '';
			bankAlias = '';
			accountAlias = '';
		}
	}
</script>

<Panel {title} {cap}>
	{@render extra?.()}
	<NamingFields
		bind:institution
		bind:accountName
		bind:bankAlias
		bind:accountAlias
		{withAccountName}
		{institutionPlaceholder}
		{accountNamePlaceholder}
		{accountAliasPlaceholder}
		disabled={save.busy}
	/>
	<div class="actions">
		<button class="btn-primary" disabled={save.busy} onclick={submit}>Add</button>
	</div>
	<SaveFeedback {save} />
</Panel>

<style>
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-4);
	}
</style>
