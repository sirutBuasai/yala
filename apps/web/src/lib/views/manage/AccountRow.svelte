<script lang="ts">
	// A bank row: set or clear its sweep target, or retire it by draining the balance into another
	// account and closing it. The row chrome and the open/closed drawer come from ExpandableRow; what
	// is left here is the two actions and the state they need.
	import { setSweep, drainCloseAccount } from '$lib/data/load';
	import { formatAccount } from '$lib/utils/format';
	import Select from '$lib/forms/fields/Select.svelte';
	import ControlRow from '$lib/ui/ControlRow.svelte';
	import ExpandableRow from '$lib/ui/ExpandableRow.svelte';

	interface Props {
		account: string;
		/** Candidate destination accounts (the full money set, minus this one). */
		destinations: string[];
		/** This account's current `sweep_to` target, if it's a passthrough. */
		sweepDest?: string;
		/** Called after a successful sweep change or drain-close. */
		onchanged: () => void;
	}
	let { account, destinations, sweepDest, onchanged }: Props = $props();

	let busy = $state(false);
	let err = $state('');

	let sweepSel = $state('');
	let drainSel = $state('');
	let confirmingDrain = $state(false);

	const label = $derived(formatAccount(account));
	const others = $derived(destinations.filter((d) => d !== account));

	$effect(() => {
		sweepSel = sweepDest ?? '';
		if (!drainSel) drainSel = destinations[0] ?? '';
	});

	async function run(action: () => Promise<string | null>) {
		busy = true;
		err = '';
		const problem = await action();
		busy = false;
		if (problem) err = problem;
		else onchanged();
	}

	const saveSweep = () => run(() => setSweep(account, sweepSel || null));
	const clearSweep = () => run(() => setSweep(account, null));
	const drainClose = () => run(() => drainCloseAccount(account, drainSel));
</script>

<ExpandableRow name={label} error={err}>
	{#snippet chip()}
		{#if sweepDest}
			<span class="sweep" title="sweeps to">→ {formatAccount(sweepDest)}</span>
		{/if}
	{/snippet}

	<ControlRow label="Sweep to">
		{#snippet control()}
			<Select
				ariaLabel={`sweep destination for ${label}`}
				bind:value={sweepSel}
				options={['', ...others]}
				optionLabel={(a) => (a ? formatAccount(a) : 'None (not a passthrough)')}
			/>
		{/snippet}
		<button type="button" class="btn-mini" onclick={saveSweep} disabled={busy}>Set</button>
		{#if sweepDest}
			<button type="button" class="btn-mini" onclick={clearSweep} disabled={busy}>Clear</button>
		{/if}
	</ControlRow>

	<ControlRow label="Retire into">
		{#snippet control()}
			<Select
				ariaLabel={`drain destination for ${label}`}
				bind:value={drainSel}
				options={others}
				optionLabel={formatAccount}
			/>
		{/snippet}
		{#if confirmingDrain}
			<button type="button" class="btn-mini danger" onclick={drainClose} disabled={busy}>
				Yes, drain &amp; close
			</button>
			<button type="button" class="btn-mini" onclick={() => (confirmingDrain = false)}>
				Cancel
			</button>
		{:else}
			<button
				type="button"
				class="btn-mini"
				onclick={() => (confirmingDrain = true)}
				disabled={busy || !drainSel}
			>
				Drain &amp; close
			</button>
		{/if}
	</ControlRow>
</ExpandableRow>

<style>
	.sweep {
		font-size: var(--text-caption);
		color: var(--ink-3);
		background: color-mix(in srgb, var(--lav) 15%, transparent);
		border-radius: var(--radius-pill);
		padding: 0 var(--space-3);
		white-space: nowrap;
	}
	.danger {
		color: var(--crit-text);
		border-color: var(--crit-text);
	}
</style>
