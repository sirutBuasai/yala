<script lang="ts">
	// An investment row: value its holdings, split that total across destinations, then close it. The
	// split must balance to the penny, or retiring the account would invent or destroy money.
	import { investmentValue, closeInvestment, type DrainLeg } from '$lib/data/load';
	import { problems } from '$lib/forms/validate';
	import { formatAccount, money } from '$lib/utils/format';
	import Select from '$lib/forms/fields/Select.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';
	import ExpandableRow from '$lib/ui/ExpandableRow.svelte';

	interface Props {
		account: string;
		/** Candidate destination accounts (full money set + other investments, minus this one). */
		destinations: string[];
		onchanged: () => void;
	}
	let { account, destinations, onchanged }: Props = $props();

	let busy = $state(false);
	let err = $state('');
	let value = $state<number | null>(null);
	let legs = $state<DrainLeg[]>([]);

	const dests = $derived(destinations.filter((d) => d !== account));
	const allocated = $derived(legs.reduce((s, l) => s + (Number(l.amount) || 0), 0));
	// Rounded to cents before comparing: floating-point addition of a split will not land on zero.
	const remaining = $derived(value == null ? 0 : Math.round((value - allocated) * 100) / 100);

	/** Value the account when the drawer opens; the split can't be offered before the total is known. */
	async function start() {
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

	// A leg left at zero moves nothing, so it is dropped rather than sent: an empty account retires
	// with no legs at all, which is what "split its whole value" means when the value is nothing.
	const moving = $derived(legs.filter((leg) => (leg.amount ?? 0) !== 0));

	/** Each leg that moves money needs a destination and a positive figure, and the legs together
	    must total the account's value — an unbalanced split would invent or lose money. */
	function problem(): string | null {
		const checks = problems().add(
			remaining === 0 ? null : `Split must total ${money(value ?? 0)} (off by ${money(remaining)}).`
		);

		moving.forEach((leg, i) => {
			checks
				.require(leg.destination, `Destination ${i + 1}`)
				.positive(leg.amount ?? null, `Amount ${i + 1}`);
		});

		return checks.message() || null;
	}

	async function retire() {
		const invalid = problem();
		if (invalid) {
			err = invalid;
			return;
		}
		busy = true;
		err = '';
		const failure = await closeInvestment(account, moving);
		busy = false;
		if (failure) err = failure;
		else onchanged();
	}
</script>

<ExpandableRow
	name={formatAccount(account)}
	action="Retire"
	onopen={start}
	error={value != null ? err : undefined}
>
	{#if value == null}
		<p class="cap">{err || 'Valuing…'}</p>
	{:else}
		<p class="cap">Worth <b>{money(value)}</b> — split it across destinations:</p>
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
				<div class="amt">
					<AmountInput bind:value={leg.amount} ariaLabel={`amount ${i + 1}`} />
				</div>
				{#if legs.length > 1}
					<button type="button" class="btn-mini" onclick={() => removeLeg(i)}>✕</button>
				{/if}
			</div>
		{/each}
		<div class="foot">
			<button type="button" class="btn-mini" onclick={addLeg}>+ destination</button>
			<span class="rem" class:off={remaining !== 0}>remaining {money(remaining)}</span>
			<button type="button" class="btn-mini" onclick={retire} disabled={busy || remaining !== 0}>
				Retire account
			</button>
		</div>
	{/if}
</ExpandableRow>

<style>
	.leg,
	.foot {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		flex-wrap: wrap;
	}
	.grow {
		flex: 1;
		min-width: 6rem;
	}
	.amt {
		flex: 0 0 8rem;
	}
	.rem {
		flex: 1;
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
	/* An unbalanced split is what blocks the action, so it says so. */
	.rem.off {
		color: var(--crit-text);
	}
</style>
