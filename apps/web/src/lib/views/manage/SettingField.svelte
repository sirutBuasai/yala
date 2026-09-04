<script lang="ts">
	// One settable figure, rendered entirely from the spec the API sends so the form can't disagree
	// with what the ledger will accept. Each setting is independent, so it commits on blur or Enter
	// rather than behind one submit for unrelated values.
	import { setSetting, type SettingSpec } from '$lib/data/load';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { validateRange } from '$lib/forms/validate';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';

	interface Props {
		spec: SettingSpec;
		/** Current effective value, or null when unset and the setting has no default. */
		value: number | null;
		/** Called after a successful save, with the stored value. */
		onsaved: (key: string, value: number) => void;
	}
	let { spec, value, onsaved }: Props = $props();

	const integer = $derived(spec.kind !== 'percent');
	const step = $derived(integer ? 1 : 0.1);

	// Local edit buffer, re-seeded whenever the incoming value changes so an external save or the
	// initial load shows through without clobbering what is being typed.
	let entry = $state<number | null>(null);
	let lastSeen: number | null | undefined;
	$effect(() => {
		if (value !== lastSeen) {
			lastSeen = value;
			entry = value;
		}
	});

	const save = new SaveState();

	async function commit() {
		// Cleared means "leave it alone": unsetting isn't something the ledger models (a directive
		// either exists or it doesn't), so restore the field rather than pretend we removed it.
		if (entry == null) {
			entry = value;
			save.reset();
			return;
		}

		const problem = validateRange(entry, spec.label, spec.min, spec.max, integer);
		if (problem) {
			save.fail(problem);
			return;
		}

		if (entry === value) {
			save.reset();
			return;
		}

		const chosen = entry;
		if (await save.run(() => setSetting(spec.key, chosen), 'Saved.')) {
			onsaved(spec.key, chosen);
		}
	}

	const unset = $derived(value == null);
</script>

<div class="field">
	<div class="row">
		<label for={`setting-${spec.key}`}>{spec.label}</label>
		<div class="input">
			<input
				id={`setting-${spec.key}`}
				type="number"
				inputmode="decimal"
				min={spec.min}
				max={spec.max}
				{step}
				placeholder={unset ? 'not set' : ''}
				bind:value={entry}
				disabled={save.busy}
				oninput={() => save.reset()}
				onblur={commit}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						(e.currentTarget as HTMLInputElement).blur();
					}
				}}
			/>
			{#if spec.kind === 'percent'}<span class="unit">%</span>{/if}
		</div>
	</div>

	<p class="help">{spec.help}</p>

	<SaveFeedback {save}>
		{#snippet fallback()}
			{#if unset}Unset — features needing it stay hidden.{/if}
		{/snippet}
	</SaveFeedback>
</div>

<style>
	.field + :global(.field) {
		margin-top: var(--gap-section);
		padding-top: var(--gap-section);
		border-top: 1px solid var(--border);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--gap-field);
	}
	label {
		flex: 1;
		min-width: 0;
		font-size: var(--text-control);
		color: var(--ink);
	}
	.input {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex: 0 0 auto;
	}
	input {
		width: 6rem;
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
		font-size: var(--text-control);
		font-family: inherit;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	input:disabled {
		opacity: 0.6;
	}
	.unit {
		color: var(--ink-3);
		font-size: var(--text-control);
	}
	.help {
		margin: var(--space-3) 0 0;
		color: var(--ink-3);
		font-size: var(--text-caption);
	}
</style>
