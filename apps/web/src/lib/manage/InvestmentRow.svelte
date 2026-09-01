<script lang="ts">
	// One investment account on the Manage tab. "Retire" values its holdings in USD, then lets you
	// split that total across one or more destination accounts before liquidating and closing it.
	import { investmentValue, closeInvestment, type DrainLeg } from '$lib/data/load';
	import { formatAccount, money } from '$lib/utils/format';
	import Select from '$lib/forms/fields/Select.svelte';

	interface Props {
		account: string;
		/** Candidate destination accounts (full money set + other investments, minus this one). */
		destinations: string[];
		onchanged: () => void;
	}
	let { account, destinations, onchanged }: Props = $props();

	let open = $state(false);
	let busy = $state(false);
	let err = $state('');
	let value = $state<number | null>(null);
	let legs = $state<DrainLeg[]>([]);

	const dests = $derived(destinations.filter((d) => d !== account));
	const allocated = $derived(legs.reduce((s, l) => s + (Number(l.amount) || 0), 0));
	const remaining = $derived(value == null ? 0 : Math.round((value - allocated) * 100) / 100);

	async function start() {
		open = true;
		err = '';
		value = null;
		const { value: v, error } = await investmentValue(account);
		if (v == null) {
			err = error ?? 'could not value account';
			return;
		}
		value = v;
		legs = [{ destination: dests[0] ?? '', amount: v }];
	}

	function addLeg() {
		legs = [...legs, { destination: dests[0] ?? '', amount: remaining > 0 ? remaining : 0 }];
	}
	function removeLeg(i: number) {
		legs = legs.filter((_, j) => j !== i);
	}

	async function retire() {
		if (remaining !== 0) {
			err = `Split must total ${money(value ?? 0)} (off by ${money(remaining)}).`;
			return;
		}
		busy = true;
		err = '';
		const problem = await closeInvestment(account, legs);
		busy = false;
		if (problem) err = problem;
		else onchanged();
	}
</script>

<li>
	<div class="head">
		<span class="name">{formatAccount(account)}</span>
		<button
			type="button"
			class="btn-mini"
			aria-expanded={open}
			onclick={() => (open ? (open = false) : start())}
		>
			{open ? 'Done' : 'Retire'}
		</button>
	</div>

	{#if open}
		<div class="panel">
			{#if value == null}
				<p class="hint">{err || 'Valuing…'}</p>
			{:else}
				<p class="hint">Worth <b>{money(value)}</b> — split it across destinations:</p>
				{#each legs as leg, i (i)}
					<div class="leg">
						<div class="grow">
							<Select
								ariaLabel={`destination ${i + 1}`}
								bind:value={leg.destination}
								options={dests}
								optionLabel={formatAccount}
							/>
						</div>
						<input
							type="number"
							step="0.01"
							min="0"
							inputmode="decimal"
							aria-label={`amount ${i + 1}`}
							bind:value={leg.amount}
						/>
						{#if legs.length > 1}
							<button type="button" class="btn-mini" onclick={() => removeLeg(i)}>✕</button>
						{/if}
					</div>
				{/each}
				<div class="foot">
					<button type="button" class="btn-mini" onclick={addLeg}>+ destination</button>
					<span class="rem" class:off={remaining !== 0}>remaining {money(remaining)}</span>
					<button
						type="button"
						class="btn-mini"
						onclick={retire}
						disabled={busy || remaining !== 0}
					>
						Retire account
					</button>
				</div>
			{/if}
			{#if err && value != null}<span class="err" role="alert">{err}</span>{/if}
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
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		margin-top: var(--gap-row);
		padding-top: var(--gap-row);
		border-top: 1px solid var(--border);
	}
	.leg {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.leg input {
		width: 8rem;
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
		font-size: var(--text-control);
		font-family: inherit;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
	}
	.rem {
		flex: 1;
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
	.rem.off {
		color: var(--crit-text);
	}
	.hint {
		color: var(--ink-3);
		font-size: var(--text-caption);
		margin: 0;
	}
	.err {
		font-size: var(--text-caption);
		color: var(--crit-text);
	}
</style>
