<script lang="ts">
	// The naming half of an "add account" form, shared by every account panel so they can't drift on
	// wording or on which fields are optional. No live preview of the resulting name: that rule lives in
	// Python, and reproducing it here is what would let the two drift.
	import { TEXT_MAX } from '$lib/forms/validate';

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
			class="field-input"
			aria-label="institution"
			bind:value={institution}
			placeholder={institutionPlaceholder}
			maxlength={TEXT_MAX}
			{disabled}
		/>
	</label>
	{#if withAccountName}
		<label>
			<span>Account name</span>
			<input
				class="field-input"
				aria-label="account name"
				bind:value={accountName}
				placeholder={accountNamePlaceholder}
				maxlength={TEXT_MAX}
				{disabled}
			/>
		</label>
	{/if}
</div>

<p class="cap">
	Written into the ledger as the full name, spelled as you type it. The short forms below are only
	used if that name is too long for a list row. Leave them blank and it is kept in full.
</p>

<div class="fields">
	<label>
		<span>Institution short form <i>optional</i></span>
		<input
			class="field-input"
			aria-label="institution alias"
			bind:value={bankAlias}
			placeholder="e.g. BoE"
			maxlength={TEXT_MAX}
			{disabled}
		/>
	</label>
	{#if withAccountName}
		<label>
			<span>Account short form <i>optional</i></span>
			<input
				class="field-input"
				aria-label="account alias"
				bind:value={accountAlias}
				placeholder={accountAliasPlaceholder}
				maxlength={TEXT_MAX}
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
		min-width: 0;
	}
	p.cap {
		margin-bottom: var(--space-6);
	}
</style>
