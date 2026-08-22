<script lang="ts">
	import { refreshAccounts } from '$lib/data';

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
	let kind = $state<CreatableKind['value']>('category');
	let err = $state('');
	let busy = $state(false);

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
		try {
			const res = await fetch('/api/account', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind, leaf: trimmed })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				err = body.detail || `error ${res.status}`;
				return;
			}
			await refreshAccounts();
			value = deriveValue(body.account ?? trimmed);
			adding = false;
			leaf = '';
		} catch (e) {
			err = 'API unreachable: ' + (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="field">
	<label for={id}>{label}</label>
	{#if adding}
		<div class="addrow">
			{#if kinds.length > 1}
				<select aria-label="new account type" bind:value={kind}>
					{#each kinds as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
				</select>
			{/if}
			<input
				aria-label={`new ${label.toLowerCase()} name`}
				bind:value={leaf}
				placeholder="new name"
				disabled={busy}
			/>
			<button type="button" class="mini" onclick={commit} disabled={busy}>Add</button>
			<button type="button" class="mini" onclick={() => (adding = false)} disabled={busy}
				>Cancel</button
			>
		</div>
		{#if err}<span class="err">{err}</span>{/if}
	{:else}
		<div class="selrow">
			<select {id} bind:value>
				{#each options as a (a)}<option value={a}>{optionLabel(a)}</option>{/each}
			</select>
			<button type="button" class="mini" onclick={open} title={`Add a new ${label.toLowerCase()}`}
				>＋ new</button
			>
		</div>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 130px;
		flex: 1;
	}
	.field label {
		font-size: 11px;
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.6px;
	}
	.selrow,
	.addrow {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	select,
	input {
		flex: 1;
		min-width: 0; /* shrink to fit the popup width; no horizontal scroll */
		background: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: 8px;
		padding: 6px 9px;
		font-size: 12.5px;
		font-family: inherit;
	}
	.mini {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 7px;
		padding: 5px 9px;
		cursor: pointer;
		font-size: 11.5px;
		white-space: nowrap;
	}
	.mini:hover {
		border-color: var(--lav);
		color: var(--ink);
	}
	.err {
		font-size: 11px;
		color: var(--crit-text);
	}
</style>
