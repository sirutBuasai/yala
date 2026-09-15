<script lang="ts">
	// Closing an account, asked as questions. What it asks comes from the kind, so an account with
	// nothing to place asks nothing at all and opens straight on the review.
	//
	// The review is the confirmation: a close moves a whole balance and only a reopen undoes it, so it is
	// stated in full before the button that does it, and there is no second prompt.
	import { SvelteSet } from 'svelte/reactivity';
	import { closeAccount, investmentValue, type CloseOptions, type DrainLeg } from '$lib/data/load';
	import { accountDirectory, accountInfo } from '$lib/data/directory.svelte';
	import type { AccountKind } from '$lib/data/types';
	import { NOT_SET, PICK_ACCOUNT } from '$lib/copy';
	import { problems } from '$lib/forms/validate';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { accountLeaf, formatAccount, moneyExact } from '$lib/utils/format';
	import Guided, { type GuidedStep } from '$lib/forms/Guided.svelte';
	import Review, { type ReviewRow } from '$lib/forms/Review.svelte';
	import DatePicker from '$lib/forms/fields/DatePicker.svelte';
	import Select from '$lib/forms/fields/Select.svelte';
	import AmountInput from '$lib/ui/AmountInput.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import { CLOSE } from '$lib/views/manage/copy';
	import { kindSingular } from '$lib/views/manage/kinds';

	interface Props {
		account: string;
		kind: AccountKind;
		/** Where the balance may land, this account already excluded. */
		destinations: string[];
		/** What it holds, when the page knows — used to refuse a close the API would refuse anyway. */
		balance?: number | null;
		onclose: () => void;
		/** Called after the account is closed, before the overlay is dismissed. */
		onclosed: () => void;
	}
	let { account, kind, destinations, balance = null, onclose, onclosed }: Props = $props();

	const save = new SaveState();
	const label = $derived(formatAccount(account));

	let at = $state(0);
	// Blank means today. Asked on the review rather than as a question of its own, like the date an
	// account is opened with: it is today unless you say otherwise.
	let date = $state('');
	let destination = $state('');
	let legs = $state<DrainLeg[]>([]);
	let value = $state<number | null>(null);
	let valuing = $state(false);
	/** Divide it across several accounts, rather than send it all to one. Off by default for every
	    kind: sending it to one place is the common errand. */
	let dividing = $state(false);

	const moves = $derived(kind.splits || kind.drains);
	/** Whether dividing is on offer at all — `splits` is what the API takes a list of legs for. */
	const divisible = $derived(kind.splits);

	/** A kind that cannot move money at all is refused by the API while any is left, so the flow says
	    so rather than walking to a button that will fail. */
	const owing = $derived(!moves && balance != null && Math.abs(balance) > 0.005);

	/** Whether there is anything to move. An empty account is closed with nothing sent, so it is never
	    asked where its nothing should go — but the question stays up while the figure is still coming,
	    rather than appearing a moment later. */
	const holds = $derived(value != null && Math.abs(value) > 0.005);
	const asks = $derived(moves && (valuing || holds));

	const allocated = $derived(legs.reduce((sum, leg) => sum + (Number(leg.amount) || 0), 0));
	// Rounded to cents before comparing: floating-point addition of a split will not land on zero.
	const remaining = $derived(value == null ? 0 : Math.round((value - allocated) * 100) / 100);
	// A leg left at zero moves nothing, so it is dropped rather than sent: an empty account closes with
	// no legs at all.
	const moving = $derived(legs.filter((leg) => (leg.amount ?? 0) !== 0));

	/** The accounts scoped to this employer, open ones only. Matched on the account's leaf, which is
	    what the `employer` meta stores — the display name has been through the renderer and reads
	    differently as soon as it splits into words. */
	const linked = $derived(
		kind.name === 'employer'
			? accountDirectory()
					.filter(([, entry]) => !entry.closed && entry.employer === accountLeaf(account))
					.map(([other]) => other)
			: []
	);

	// A deduction is payroll and nothing else, so it ends with the job by default; a plan outlives it.
	// Either way what is left unticked is unlinked, not closed.
	let closeWith = $state(new SvelteSet<string>());

	$effect(() => {
		closeWith = new SvelteSet(linked.filter((a) => accountInfo(a)?.kind === 'deduction'));
	});

	// What it holds, for the figure the question quotes and for the split to add up to.
	$effect(() => {
		if (!moves) return;
		valuing = true;
		investmentValue(account).then(({ value: current, error }) => {
			valuing = false;
			if (current == null) {
				save.fail(error ?? 'could not value account');
				return;
			}
			value = current;
			legs = [{ destination: '', amount: current }];
		});
	});

	const addLeg = () =>
		(legs = [...legs, { destination: '', amount: remaining > 0 ? remaining : 0 }]);
	const removeLeg = (i: number) => (legs = legs.filter((_, j) => j !== i));

	/** Every leg that moves money needs a destination and a positive figure, and the legs together must
	    total what the account holds. An empty account has nothing to place. */
	function whereProblem(): string | null {
		if (!holds) return null;

		const checks = problems();
		if (dividing) {
			checks.add(
				remaining === 0
					? null
					: `The parts must total ${moneyExact(value ?? 0)} (off by ${moneyExact(remaining)}).`
			);
			moving.forEach((leg, i) => {
				checks
					.require(leg.destination, `Destination ${i + 1}`)
					.positive(leg.amount ?? null, `Amount ${i + 1}`);
			});
		} else {
			checks.require(destination, 'Destination');
		}
		return checks.message() || null;
	}

	const steps = $derived.by<GuidedStep[]>(() => {
		// Nothing else is worth asking: the close cannot go through until the balance is gone.
		if (owing) {
			return [
				{
					key: 'owing',
					q: CLOSE.owing.q,
					sub: `Please account for all transactions made with ${label} before closing.`,
					terminal: true,
					body: askOwing
				}
			];
		}

		const list: GuidedStep[] = [];
		if (asks) {
			list.push({ key: 'where', ...CLOSE.where, problem: whereProblem, body: askWhere });
		}
		if (linked.length) {
			list.push({ key: 'with', ...CLOSE.with, body: askWith });
		}
		return list;
	});

	const rows = $derived.by<ReviewRow[]>(() => {
		const list: ReviewRow[] = [{ label: 'Closing', value: label }];
		if (moves) list.push({ label: 'Holding', value: valuing ? '...' : moneyExact(value ?? 0) });
		if (!holds) {
			if (moves) list.push({ label: 'Moves', value: 'Already empty' });
		} else if (dividing) {
			list.push({
				label: 'Divided into',
				value: moving.length
					? moving
							.map((leg) => `${moneyExact(leg.amount)} to ${formatAccount(leg.destination)}`)
							.join(', ')
					: NOT_SET,
				unset: !moving.length,
				step: 'where'
			});
		} else {
			list.push({
				label: 'All of it to',
				value: destination ? formatAccount(destination) : NOT_SET,
				unset: !destination,
				step: 'where'
			});
		}
		if (linked.length) {
			list.push({
				label: 'Closes with it',
				value: closeWith.size ? [...closeWith].map(formatAccount).join(', ') : 'All unlinked',
				unset: !closeWith.size,
				step: 'with'
			});
		}
		list.push({ label: 'Closed on', body: askClosedOn });
		return list;
	});

	/**
	 * The close, in the shape this kind's route accepts. "All to one account" is a `destination` where
	 * the kind drains and a single leg carrying the whole value where it only splits — the same act,
	 * and the API refuses a `destination` it has no way to apply.
	 */
	function options(): CloseOptions {
		const opts: CloseOptions = { date: date || undefined };
		if (holds) {
			if (dividing) opts.legs = moving;
			else if (kind.drains) opts.destination = destination;
			else opts.legs = [{ destination, amount: value ?? 0 }];
		}
		if (kind.name === 'employer') opts.close_with = [...closeWith];
		return opts;
	}

	async function submit() {
		const invalid = whereProblem();
		if (invalid) return void save.fail(invalid);
		if (await save.run(() => closeAccount(account, options()))) {
			onclosed();
			onclose();
		}
	}
</script>

{#snippet askOwing()}
	<p class="cap">{label} still holds <b>{moneyExact(Math.abs(balance ?? 0))}</b>.</p>
{/snippet}

{#snippet askWhere()}
	{#if valuing}
		<p class="cap">Valuing...</p>
	{:else}
		<!-- One line for both branches: the amount is the same either way. -->
		<p class="cap">Transfer <b>{moneyExact(value ?? 0)}</b> to the accounts below.</p>
		{#if dividing}
			{#each legs as leg, i (i)}
				<div class="leg">
					<div class="cell">
						<Select
							ariaLabel={`Destination ${i + 1}`}
							bind:value={leg.destination}
							options={destinations}
							optionLabel={formatAccount}
							placeholder={PICK_ACCOUNT}
						/>
					</div>
					<div class="amt">
						<AmountInput bind:value={leg.amount} ariaLabel={`Amount ${i + 1}`} />
					</div>
					{#if legs.length > 1}
						<button
							type="button"
							class="btn-mini rm"
							aria-label={`Remove destination ${i + 1}`}
							onclick={() => removeLeg(i)}>✕</button
						>
					{/if}
				</div>
			{/each}
			<div class="leg">
				<button type="button" class="btn-mini" onclick={addLeg}>{CLOSE.addDestination}</button>
				<span class="rem" class:off={remaining !== 0}>remaining {moneyExact(remaining)}</span>
			</div>
			<button type="button" class="btn-mini other" onclick={() => (dividing = false)}
				>{CLOSE.toOne}</button
			>
		{:else}
			<label class="field">
				<span>Move it into</span>
				<Select
					ariaLabel={`Closing account balance destination for ${label}`}
					bind:value={destination}
					options={destinations}
					optionLabel={formatAccount}
					placeholder="Pick an account"
				/>
			</label>
			{#if divisible}
				<button type="button" class="btn-mini other" onclick={() => (dividing = true)}
					>{CLOSE.toMany}</button
				>
			{/if}
		{/if}
	{/if}
{/snippet}

{#snippet askWith()}
	<div class="links">
		{#each linked as other (other)}
			<label class="link">
				<input
					type="checkbox"
					aria-label={`Close ${formatAccount(other)} with ${label}`}
					checked={closeWith.has(other)}
					onchange={() => (closeWith.has(other) ? closeWith.delete(other) : closeWith.add(other))}
				/>
				<span>{formatAccount(other)}</span>
				<Badge filled>{kindSingular(accountInfo(other)?.kind ?? '')}</Badge>
			</label>
		{/each}
	</div>
{/snippet}

{#snippet askClosedOn()}
	<div class="on">
		<DatePicker bind:value={date} ariaLabel={`Close date for ${label}`} />
	</div>
{/snippet}

<Guided
	kicker={CLOSE.kicker}
	title={label}
	{steps}
	{save}
	bind:at
	danger
	confirmLabel={CLOSE.confirm}
	reviewQuestion={CLOSE.question}
	reviewSub={CLOSE.sub}
	accent="var(--crit)"
	accentText="var(--crit-text)"
	onsubmit={submit}
	{onclose}
>
	{#snippet review(jump)}
		<Review {rows} {jump} />
	{/snippet}
</Guided>

<style>
	.cap {
		color: var(--ink-3);
		font-size: var(--text-secondary);
		margin: 0 0 var(--gap-row);
	}
	.cap b {
		color: var(--ink);
	}
	.field {
		max-width: 22rem;
	}
	.leg {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		margin-bottom: var(--gap-inline);
	}
	.cell {
		flex: 1;
		min-width: 0;
	}
	.amt {
		width: 8rem;
		flex: 0 0 8rem;
	}
	.rm:hover {
		border-color: var(--crit);
		color: var(--crit-text);
	}
	.rem {
		font-size: var(--text-caption);
		color: var(--ink-3);
		margin-left: auto;
	}
	.rem.off {
		color: var(--crit-text);
	}
	/* The other way of placing the money. Always reachable, so neither way is a dead end. */
	.other {
		margin-top: var(--space-7);
	}
	.links {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
	}
	.link {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		font-size: var(--text-body);
		color: var(--ink-2);
		background: var(--inset);
		border-radius: var(--radius-md);
		padding: var(--space-6) var(--space-8);
	}
	.on {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		flex-wrap: wrap;
	}
</style>
