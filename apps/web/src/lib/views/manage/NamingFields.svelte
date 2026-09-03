<script lang="ts">
	// The naming half of an "add account" form: who holds it, what it is called, and the short forms
	// to fall back on. Shared by the bank / credit card / investment panels so the three can't drift
	// on wording or on which fields are optional.
	//
	// Deliberately no live preview of the resulting name. Composing it means applying the naming rule
	// (de-CamelCase, particles, letter/digit splits, then the alias substitutions), and that rule
	// lives in Python so there is exactly one of it — reproducing it here to render a preview would
	// reintroduce the drift the rule was moved to avoid. The panel reports the name the API actually
	// created once the account is open, which is the same answer from the authoritative source.

	interface Props {
		/** Institution / bank / brokerage, as a person writes it. Required. */
		institution: string;
		/** The card or account half. Omitted for cash accounts, which are named by institution. */
		accountName?: string;
		bankAlias: string;
		/** Unused when `withAccountName` is false — a cash account has no account half to shorten. */
		accountAlias?: string;
		/** False for cash accounts: they take no account half. */
		withAccountName?: boolean;
		institutionPlaceholder?: string;
		accountNamePlaceholder?: string;
		accountAliasPlaceholder?: string;
		disabled?: boolean;
	}
	let {
		institution = $bindable(),
		accountName = $bindable(''),
		bankAlias = $bindable(),
		accountAlias = $bindable(''),
		withAccountName = true,
		institutionPlaceholder = 'e.g. Bank of Example',
		accountNamePlaceholder = 'e.g. Cash Rewards',
		accountAliasPlaceholder = 'short account name (e.g. Cash)',
		disabled = false
	}: Props = $props();
</script>

<div class="fields">
	<label>
		<span>Institution</span>
		<input
			aria-label="institution"
			bind:value={institution}
			placeholder={institutionPlaceholder}
			{disabled}
		/>
	</label>
	{#if withAccountName}
		<label>
			<span>Account name</span>
			<input
				aria-label="account name"
				bind:value={accountName}
				placeholder={accountNamePlaceholder}
				{disabled}
			/>
		</label>
	{/if}
</div>

<p class="cap">
	Written into the ledger as the full name, spelled as you type it. The short forms below are only
	used if that name is too long for a list row — leave them blank and it is kept in full.
</p>

<div class="fields">
	<label>
		<span>Institution short form <i>optional</i></span>
		<input
			aria-label="institution alias"
			bind:value={bankAlias}
			placeholder="e.g. BoE"
			{disabled}
		/>
	</label>
	{#if withAccountName}
		<label>
			<span>Account short form <i>optional</i></span>
			<input
				aria-label="account alias"
				bind:value={accountAlias}
				placeholder={accountAliasPlaceholder}
				{disabled}
			/>
		</label>
	{/if}
</div>

<style>
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
		gap: var(--gap-row);
		margin-bottom: var(--space-3);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	label span {
		font-size: var(--text-label);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
	}
	label span i {
		text-transform: none;
		letter-spacing: 0;
		opacity: 0.8;
	}
	.fields input {
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
		font-size: var(--text-control);
		font-family: inherit;
		min-width: 0;
	}
	p.cap {
		margin-bottom: var(--space-6);
	}
</style>
