<script lang="ts">
	// An account's name in the parts the API stores, each beside its own alias. Labels and placeholders
	// come from the kind, so the add flow and the edit pane cannot word the same field differently.
	import TextField from '$lib/forms/fields/TextField.svelte';
	import { INSTITUTION, INSTITUTION_ALIAS } from '$lib/views/manage/copy';
	import { placeholder, productAliasLabel, productLabel } from '$lib/views/manage/kinds';

	interface Props {
		kind: string;
		institutionName: string;
		institutionAlias: string;
		/** The product half. Omitted for cash accounts, which are named by institution alone. */
		accountName?: string;
		accountAlias?: string;
		/** False for cash accounts: they take no account half, so neither is offered. */
		withAccountName?: boolean;
		disabled?: boolean;
	}
	let {
		kind,
		institutionName = $bindable(),
		institutionAlias = $bindable(),
		accountName = $bindable(''),
		accountAlias = $bindable(''),
		withAccountName = true,
		disabled = false
	}: Props = $props();
</script>

<div class="pairs">
	<TextField
		label={INSTITUTION}
		bind:value={institutionName}
		placeholder={placeholder(kind, 'institution')}
		{disabled}
	/>
	<TextField
		label={INSTITUTION_ALIAS}
		bind:value={institutionAlias}
		placeholder={placeholder(kind, 'institutionAlias')}
		optional
		{disabled}
	/>
	{#if withAccountName}
		<TextField
			label={productLabel(kind)}
			bind:value={accountName}
			placeholder={placeholder(kind, 'product')}
			{disabled}
		/>
		<TextField
			label={productAliasLabel(kind)}
			bind:value={accountAlias}
			placeholder={placeholder(kind, 'productAlias')}
			optional
			{disabled}
		/>
	{/if}
</div>

<style>
	.pairs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
		gap: var(--gap-field);
	}
</style>
