<script lang="ts">
	// A bank row: set/clear its sweep target, or drain-close it to a chosen destination.
	import { setSweep, drainCloseAccount } from '$lib/data/load';
	import { formatAccount } from '$lib/utils/format';
	import Select from '$lib/forms/fields/Select.svelte';

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

	let open = $state(false);
	let busy = $state(false);
	let err = $state('');

	let sweepSel = $state('');
	let drainSel = $state('');
	let confirmingDrain = $state(false);

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

<li>
	<div class="head">
		<span class="name">{formatAccount(account)}</span>
		{#if sweepDest}<span class="chip" title="sweeps to">→ {formatAccount(sweepDest)}</span>{/if}
		<button type="button" class="btn-mini" aria-expanded={open} onclick={() => (open = !open)}>
			{open ? 'Done' : 'Manage'}
		</button>
	</div>

	{#if open}
		<div class="panel">
			<div class="ctl">
				<span class="lbl">Sweep to</span>
				<div class="grow">
					<Select
						ariaLabel={`sweep destination for ${formatAccount(account)}`}
						bind:value={sweepSel}
						options={['', ...destinations.filter((d) => d !== account)]}
						optionLabel={(a) => (a ? formatAccount(a) : 'None (not a passthrough)')}
					/>
				</div>
				<button type="button" class="btn-mini" onclick={saveSweep} disabled={busy}>Set</button>
				{#if sweepDest}
					<button type="button" class="btn-mini" onclick={clearSweep} disabled={busy}>Clear</button>
				{/if}
			</div>

			<div class="ctl">
				<span class="lbl">Retire into</span>
				<div class="grow">
					<Select
						ariaLabel={`drain destination for ${formatAccount(account)}`}
						bind:value={drainSel}
						options={destinations.filter((d) => d !== account)}
						optionLabel={formatAccount}
					/>
				</div>
				{#if confirmingDrain}
					<button type="button" class="btn-mini danger" onclick={drainClose} disabled={busy}>
						Yes, drain & close
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
						Drain & close
					</button>
				{/if}
			</div>

			{#if err}<span class="err" role="alert">{err}</span>{/if}
		</div>
	{/if}
</li>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip {
		font-size: var(--text-caption);
		color: var(--ink-3);
		background: color-mix(in srgb, var(--lav) 15%, transparent);
		border-radius: var(--radius-pill);
		padding: 0 var(--space-3);
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		margin-top: var(--gap-row);
		padding-top: var(--gap-row);
		border-top: 1px solid var(--border);
	}
	.ctl {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
	}
	.lbl {
		flex: 0 0 5.5rem;
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.danger {
		color: var(--crit-text);
		border-color: var(--crit-text);
	}
	.err {
		font-size: var(--text-caption);
		color: var(--crit-text);
	}
</style>
