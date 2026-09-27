<script module lang="ts">
	import type { SettingSpec } from '$lib/data/load';

	/** What an arrow key moves a figure by. */
	const STEP: Record<string, number> = { percent: 0.1, money: 500 };
	const SUFFIX: Record<string, string> = { percent: '%', months: ' mo' };
	const PREFIX: Record<string, string> = { money: '$' };

	const plainRate = (n: number) => n.toFixed(4).replace(/\.?0+$/, '');
</script>

<script lang="ts">
	// One group of the assumptions the ledger can't derive, as a pane of typed figures. Every control moves the
	// draft only; the page previews it everywhere until Save.
	import type { DashboardData } from '$lib/data/types';
	import { assumptionsOf, realRate } from '$lib/data/assumptions';
	import { coastTarget, fiNumber, plannedRates, trailingAnnual } from '$lib/data/networth';
	import { balanceAtRetirement, depletionYear, lastsToHorizon } from '$lib/data/projection';
	import { NO_VALUE } from '$lib/copy';
	import NumberField from '$lib/forms/fields/NumberField.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import Hint from '$lib/ui/Hint.svelte';
	import { money } from '$lib/utils/format';
	import { words } from '$lib/ui/label';
	import type { PlanDraft } from './draft.svelte';

	interface Props {
		id: string;
		title: string;
		caption: string;
		/** The settings this pane holds, by their ledger keys, in the order drawn. */
		keys: string[];
		/** The ledger's data with the draft stated over it. */
		data: DashboardData;
		draft: PlanDraft;
	}
	let { id, title, caption, keys, data, draft }: Props = $props();

	const specs = $derived(keys.flatMap((key) => draft.specs.find((spec) => spec.key === key) ?? []));
	const preview = $derived(assumptionsOf(data));
	const rates = $derived(plannedRates(data, preview));
	const real = $derived(realRate(preview));
	const busy = $derived(draft.save.busy);

	/** Where a control sits while its draft is null. Must agree with what `preview` resolves a null draft
	    to, or the field would show one figure while the chart beside it drew another. */
	function seedOf(spec: SettingSpec): number | null {
		if (spec.key === 'planned-spending') return Math.round(rates.spending);
		if (spec.key === 'out-of-pocket') return Math.round(rates.residual);
		// A year with no default is unset, not the earliest one allowed.
		if (spec.kind === 'year') return spec.default;
		return spec.default ?? spec.min;
	}

	const adjusted = $derived(`Compounds at ${real.toFixed(2)}% a year after inflation.`);

	/** What a control's current value works out to. Prose takes a capital and a period; worked arithmetic
	    takes neither. */
	function footnoteOf(spec: SettingSpec): string | undefined {
		if (spec.key === 'swr') return standing;
		if (spec.key === 'nominal-return' || spec.key === 'inflation') return adjusted;
		return undefined;
	}

	/** What the plan invests a year, worked through. */
	const investing = $derived(
		`${money(rates.contributions)}/yr contributions + ${money(rates.investing - rates.contributions)} = ${money(rates.investing)}/yr`
	);

	const depletion = $derived(depletionYear(data, preview));

	/** Driven by the projection: rate against return only describes a portfolio exactly at the FI number, and
	    claimed a rising balance couldn't last. */
	const standing = $derived.by(() => {
		const at = balanceAtRetirement(data, preview);
		const target = fiNumber(data, preview).value;
		if (at === null || !target) return undefined;

		const runsOut = depletion.value === null ? '' : ` It will deplete in ${depletion.value}.`;
		return `Your balance reaches ${money(at)} by ${preview.retireAge}, ${
			at >= target ? 'above' : 'below'
		} the ${money(target)} FI number.${runsOut}`;
	});

	/** The figures the hints work through, each read from the same builder the charts use. */
	const worked = $derived.by(() => ({
		fi: fiNumber(data, preview).value,
		lasts: lastsToHorizon(data, preview),
		drawnYears: preview.horizonAge - preview.retireAge,
		liquid: data.networth?.current?.breakdown?.['Liquid'] ?? null,
		age: preview.birthYear === null ? null : new Date().getFullYear() - preview.birthYear,
		coast: coastTarget(data, preview),
		loggedSpend: trailingAnnual(data, 'spending')
	}));
</script>

<Pane {id} title={words(title)} caption={words(caption)}>
	{#if draft.info}
		<div class="knobs">
			{#each specs as spec (spec.key)}
				<NumberField
					label={spec.label}
					min={spec.min}
					max={spec.max}
					step={STEP[spec.kind] ?? 1}
					prefix={PREFIX[spec.kind] ?? ''}
					grouped={spec.kind === 'money'}
					suffix={SUFFIX[spec.kind] ?? ''}
					disabled={busy}
					optional={spec.kind === 'year'}
					track={spec.kind !== 'year'}
					bind:value={() => draft.value(spec.key) ?? seedOf(spec), (v) => draft.set(spec.key, v)}
				>
					{#snippet hint()}
						<Hint label={spec.label}>{@render explains(spec)}</Hint>
						<!-- A year has no default to return to; clearing the field is how it is unset. -->
						{#if spec.kind !== 'year'}<button
								type="button"
								class="btn-mini reset"
								disabled={busy || draft.atDefault(spec.key)}
								onclick={() => draft.set(spec.key, null)}>Default</button
							>{/if}
					{/snippet}
				</NumberField>
			{/each}
		</div>
	{:else if draft.loading}
		<p class="cap">Loading...</p>
	{:else}
		<div class="failed">
			<p class="err" role="alert">{draft.loadError}</p>
			<button type="button" class="btn-accent" onclick={() => draft.load()}>Try again</button>
		</div>
	{/if}
</Pane>

{#snippet fisher()}
	<b
		>({plainRate(1 + preview.nominalReturn / 100)} / {plainRate(1 + preview.inflation / 100)}) - 1 = {real.toFixed(
			2
		)}% adjusted</b
	>
{/snippet}

{#snippet explains(spec: SettingSpec)}
	{spec.help}
	{#if footnoteOf(spec)}<span class="line">{footnoteOf(spec)}</span>{/if}
	{#if spec.key === 'swr'}
		<b
			>{money(rates.spending)} / {plainRate(preview.swr / 100)} = {worked.fi === null
				? NO_VALUE
				: money(worked.fi)}</b
		>
		FI number: where your investment won't run out at {preview.swr}% withdrawal rate for your
		everyday spending.
		<b
			>{worked.fi === null ? NO_VALUE : money(worked.fi)} / {plainRate(1 + real / 100)} ^ ({preview.retireAge}-{worked.age ??
				NO_VALUE}) = {worked.coast === null ? NO_VALUE : money(worked.coast)}</b
		>
		Coast FI: what you would need today to reach the FI number by {preview.retireAge} with no further
		contribution.
	{:else if spec.key === 'nominal-return'}
		{@render fisher()}
		Coasting: balance grows at the real rate of return.
		<span class="line"
			>Investing: balance grows at {money(rates.investing)}/yr compounded with the real rate of
			return until retirement at {preview.retireAge}.</span
		>
	{:else if spec.key === 'inflation'}
		{@render fisher()}
	{:else if spec.key === 'runway-target'}
		<b
			>{worked.liquid === null ? NO_VALUE : money(worked.liquid)} / {money(worked.loggedSpend / 12)} =
			{worked.liquid === null || !worked.loggedSpend
				? NO_VALUE
				: (worked.liquid / (worked.loggedSpend / 12)).toFixed(1)} months</b
		>
	{:else if spec.key === 'horizon-age'}
		<span class="legend"
			>spending × (1 - (1+r)^-n) / r, where r = {real.toFixed(2)}% adjusted return and n = {worked.drawnYears}
			yr of withdrawals</span
		>
		<b
			>{money(rates.spending)} over {worked.drawnYears} yr at {real.toFixed(2)}% = {worked.lasts ===
			null
				? NO_VALUE
				: money(worked.lasts)}</b
		>
		The number at which you can stop contributing and you will use up your investment and its gains by
		{preview.horizonAge} at a {real.toFixed(2)}% real return.
	{:else if spec.key === 'planned-spending'}
		<b>trailing spending based on your activity: {money(worked.loggedSpend)}/yr</b>
		Average saved and spent metrics from your logged activity or custom spending rate.
	{:else if spec.key === 'out-of-pocket'}
		<b>trailing take-home after spending: {money(rates.residual)}/yr</b>
		<b>{investing}</b>
	{/if}
{/snippet}

<style>
	.knobs {
		display: grid;
		gap: var(--gap-row);
		align-content: start;
	}
	.failed {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--gap-row);
	}
	/* Both sit inside a hint bubble: a sentence of its own, and the formula's key above the arithmetic. */
	.line {
		display: block;
		margin-top: var(--space-2);
	}
	.legend {
		display: block;
		margin: var(--space-2) 0;
		color: var(--ink-3);
	}
</style>
