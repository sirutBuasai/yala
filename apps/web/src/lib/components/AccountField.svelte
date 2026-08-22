<script lang="ts">
	import { postJson, refreshAccounts } from '$lib/data';
	import Select from './Select.svelte';

	export interface CreatableKind {
		value: 'category' | 'deduction' | 'contribution' | 'funding_credit' | 'funding_cash';
		label: string;
	}

	interface Props {
		/** The selected value (a category leaf or a full account name). Bindable. */
		value: string;
		label: string;
		id: string;
		options: string[];
		/** How to render each option in the dropdown (default: as-is). */
		optionLabel?: (a: string) => string;
		/** Kinds this field can create. If more than one, the user picks which. */
		kinds: CreatableKind[];
		/** Map the created full account name to the select value (default: identity). */
		deriveValue?: (fullAccount: string) => string;
	}
	let {
		value = $bindable(),
		label,
		id,
		options,
		optionLabel = (a) => a,
		kinds,
		deriveValue = (a) => a
	}: Props = $props();

	let adding = $state(false);
	let leaf = $state('');
	// Placeholder; open() sets the real default from `kinds` before the picker renders.
	let kind = $state<string>('category');
	let err = $state('');
	let busy = $state(false);

	const kindLabel = (v: string) => kinds.find((k) => k.value === v)?.label ?? v;

	function open() {
		adding = true;
		leaf = '';
		err = '';
		kind = kinds[0].value;
	}

	async function commit() {
		const trimmed = leaf.trim();
		if (!trimmed) {
			err = 'Enter a name.';
			return;
		}
		busy = true;
		err = '';
		const { ok, data, error } = await postJson<{ account?: string }>('/api/account', {
			kind,
			leaf: trimmed
		});
		if (ok) {
			await refreshAccounts();
			value = deriveValue(data.account ?? trimmed);
			adding = false;
			leaf = '';
		} else {
			err = error ?? 'add failed';
		}
		busy = false;
	}
</script>

<div class="field">
	<label for={id}>{label}</label>
	{#if adding}
		<div class="addrow">
			{#if kinds.length > 1}
				<div class="kindsel">
					<Select
						ariaLabel="new account type"
						bind:value={kind}
						options={kinds.map((k) => k.value)}
						optionLabel={kindLabel}
					/>
				</div>
			{/if}
			<input
				aria-label={`new ${label.toLowerCase()} name`}
				bind:value={leaf}
				placeholder="new name"
				disabled={busy}
			/>
			<button type="button" class="btn-mini" onclick={commit} disabled={busy}>Add</button>
			<button type="button" class="btn-mini" onclick={() => (adding = false)} disabled={busy}
				>Cancel</button
			>
		</div>
		{#if err}<span class="err">{err}</span>{/if}
	{:else}
		<div class="selrow">
			<div class="grow"><Select {id} ariaLabel={label} bind:value {options} {optionLabel} /></div>
			<button
				type="button"
				class="btn-mini"
				onclick={open}
				title={`Add a new ${label.toLowerCase()}`}>＋ new</button
			>
		</div>
	{/if}
</div>

<style>
	.selrow,
	.addrow {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.grow,
	.kindsel {
		flex: 1;
		min-width: 0;
	}
	.kindsel {
		flex: 0 0 auto;
		min-width: 120px;
	}
	input {
		flex: 1;
		min-width: 0; /* shrink to fit the popup width; no horizontal scroll */
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: 8px;
		padding: 6px 9px;
		font-size: 12.5px;
		font-family: inherit;
	}
	.err {
		font-size: 11px;
		color: var(--crit-text);
	}
</style>
