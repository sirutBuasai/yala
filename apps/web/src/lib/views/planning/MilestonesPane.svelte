<script lang="ts">
	// When the plan reaches FI and how often it lasts, over its milestones and phases on one timeline, with the
	// counts that say how far off they are.
	import type { DashboardData } from '$lib/data/types';
	import type { Assumptions } from '$lib/data/assumptions';
	import { realRate } from '$lib/data/assumptions';
	import { plannedRates } from '$lib/data/networth';
	import { fiDate, plan, type MarketRisk } from '$lib/data/projection';
	import { NO_VALUE } from '$lib/copy';
	import Milestones from '$lib/charts/Milestones.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import Hint from '$lib/ui/Hint.svelte';
	import { money, moneyCompact } from '$lib/utils/format';
	import { scaleToFit } from '$lib/ui/fit';

	interface Props {
		id: string;
		/** The ledger's data with the draft stated over it. */
		data: DashboardData;
		a: Assumptions;
		risk: MarketRisk | null;
	}
	let { id, data, a, risk }: Props = $props();

	const p = $derived(plan(data, a));
	const fi = $derived(fiDate(data, a).value);
	const rates = $derived(plannedRates(data, a));
	const rate = $derived(risk ? Math.round(risk.lasting) : null);
	const now = new Date().getFullYear();
	const years = (n: number | null) => (n === null ? NO_VALUE : `${n} yr`);

	const counts = $derived(
		p
			? [
					{ value: years(p.toFi), label: 'to FI' },
					{ value: years(p.toRetire), label: 'to retirement' },
					{ value: moneyCompact(p.atRetirement), label: 'at retirement' },
					...(p.levers.spend
						? [
								{
									value: `spend ${money(p.levers.spend.monthly)}/mo`,
									label: `less for FI in ${p.levers.spend.year}`
								}
							]
						: []),
					...(p.levers.invest
						? [
								{
									value: `invest ${money(p.levers.invest.monthly)}/mo`,
									label: `more for FI in ${p.levers.invest.year}`
								}
							]
						: [])
				]
			: []
	);
</script>

<Pane {id}>
	<p class="headline serif" data-floor use:scaleToFit={0.55}>
		{#if a.birthYear === null}
			Set your birth year in Timeline to see when you reach FI.
		{:else if a.birthYear + a.horizonAge <= now}
			Your plan runs to {a.horizonAge}, which has passed.
		{:else if !p}
			There is no invested balance to plan from yet.
		{:else if a.birthYear! + a.retireAge < now}
			You're retired{#if rate !== null}, with success rate of <b>{rate}%</b>{/if}.
		{:else if fi === null}
			At this rate, you don't reach FI before {a.retireAge}.
		{:else if fi === now}
			You're past FI already{#if rate !== null}, with success rate of <b>{rate}%</b>{/if}.
		{:else}
			You reach FI in <b>{fi}</b>, at {fi - a.birthYear!}{#if rate !== null}, with success rate of
				<b>{rate}%</b>{/if}.
		{/if}
	</p>
	{#if p && risk}
		<p class="caption">
			{rate}% of simulated runs result in lasting balance after the age of {a.horizonAge}.
			<Hint label="success rate">
				Success rate is the share of 1,000 simulated markets in which your invested money lasts to {a.horizonAge}.
				Each simulated year's return is drawn at random based on your expected {realRate(a).toFixed(
					2
				)}% after inflation, swinging about {a.volatility}% a year. Every run follows your plan:
				invest {money(rates.investing)} a year until {a.retireAge}, then withdraw {money(
					rates.spending
				)} a year.
			</Hint>
		</p>
	{/if}
	{#if p}
		<Milestones marks={p.milestones} phases={p.phases} />
		<div class="counts">
			{#each counts as c (c.label)}
				<span class="count"><b class="serif">{c.value}</b>{c.label}</span>
			{/each}
		</div>
	{/if}
</Pane>

<style>
	/* One line, scaled to its room (`scaleToFit`) rather than broken into a ragged stack. */
	.headline {
		min-width: 0;
		white-space: nowrap;
		margin: 0;
		font-size: calc(var(--text-title) * var(--fit, 1));
		/* Held at the full size's height as the type scales: the pane's floor is measured with the line
		   unscaled, and a line that shrank would hand the difference to the rail, which then never reached
		   its thinnest at the floor. */
		line-height: calc(var(--text-title) * 1.25);
		color: var(--ink);
	}
	.headline > b {
		color: var(--lav-text);
		font-weight: var(--fw-semibold);
	}
	/* The pane's caption, under the sentence that stands as its title. */
	.caption {
		margin: 0 0 var(--gap-row);
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
	.caption :global(.hint) {
		margin-left: var(--space-2);
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-11);
		margin-top: var(--gap-row);
		flex: none;
	}
	.count {
		display: grid;
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
	.count b {
		font-size: var(--text-figure);
		font-weight: var(--fw-semibold);
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
</style>
