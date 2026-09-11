<script lang="ts">
	// The body of an "add an account" pane, used for banks, credit cards and investments. Presentational:
	// it has no pane of its own, so the view places and titles it, which also lets the folded layout reuse
	// it. What differs per kind is props and a snippet; naming, validation, submit and confirmation are
	// identical and live here once.
	//
	// The caller's `open` does the POST and hands back what the API resolved. The panel never composes a
	// display name itself: that rule lives in Python (see `yala.ledger.naming`), and previewing it here is
	// what would let the two drift apart.

	import type { Snippet } from 'svelte';
	import type { AccountNaming, OpenedAccount } from '$lib/data/load';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { problems, validateName, validateOptionalName } from '$lib/forms/validate';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import NamingFields from '$lib/views/manage/NamingFields.svelte';

	interface Props {
		/** False for cash accounts, which are named by institution alone. */
		withAccountName?: boolean;
		institutionPlaceholder?: string;
		accountNamePlaceholder?: string;
		accountAliasPlaceholder?: string;
		/** What to call the account half in a validation message ("Card name", "Account name"). */
		accountNameLabel?: string;
		/** Controls specific to one kind — the investment subtree and its flags. */
		extra?: Snippet;
		/** Validate whatever `extra` renders; a message here blocks the open. */
		validateExtra?: () => string | null;
		/** Perform the open. Returns what the API resolved, including its display name. */
		open: (naming: AccountNaming) => Promise<OpenedAccount>;
	}
	let {
		withAccountName = true,
		institutionPlaceholder,
		accountNamePlaceholder,
		accountAliasPlaceholder,
		accountNameLabel = 'Account name',
		extra,
		validateExtra,
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
		const checks = problems()
			.add(validateName(institution, 'Institution'))
			.add(validateOptionalName(bankAlias, 'Institution short form'));

		if (withAccountName) {
			naming.account_name = accountName.trim();
			naming.account_alias = accountAlias.trim();
			checks
				.add(validateName(accountName, accountNameLabel))
				.add(validateOptionalName(accountAlias, 'Account short form'));
		}

		const problem = checks.add(validateExtra?.() ?? null).message();
		if (problem) return save.fail(problem);

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

<style>
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-4);
	}
</style>
