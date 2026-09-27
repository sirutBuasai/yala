<script lang="ts">
	// No period controls: it reads now. Every pane draws the draft, and leaving the page drops it.
	import { onMount } from 'svelte';
	import type { DashboardData } from '$lib/data/types';
	import type { BoardLayout } from '$lib/layout/grid/types';
	import { assumptionsOf } from '$lib/data/assumptions';
	import { plannedRates } from '$lib/data/networth';
	import {
		depletionYear,
		investedProjection,
		marketRisk,
		riskSummary,
		secondaryLines
	} from '$lib/data/projection';
	import { formatUnit } from '$lib/data/primitives';
	import { DISCARD, NO_VALUE, PROGRESS, PROGRESS_CAPTION, SAVE_CHANGES } from '$lib/copy';
	import { labelText, words } from '$lib/ui/label';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import AssumptionGroup from './AssumptionGroup.svelte';
	import MilestonesPane from './MilestonesPane.svelte';
	import { PlanDraft } from './draft.svelte';
	import { GROUPS, PROJECTION, PROJECTION_CAPTION } from './copy';

	interface Props {
		data: DashboardData;
		onsaved: () => void;
	}
	let { data, onsaved }: Props = $props();

	const draft = new PlanDraft();
	onMount(() => void draft.load());

	const preview = $derived(draft.preview(data));
	const a = $derived(assumptionsOf(preview));
	const depletion = $derived(depletionYear(preview, a));
	/** Run once here, for the projection's band, the line under it and the summary's success rate. */
	const risk = $derived(marketRisk(preview, a));

	/** Fixed at the largest FI number the setting's bound allows, so moving the rate moves the line, not the
	    scale. */
	const ceiling = $derived.by(() => {
		const swr = draft.specs.find((s) => s.key === 'swr');
		const spending = plannedRates(preview, a).spending;
		return swr && swr.min > 0 && spending ? spending / (swr.min / 100) : undefined;
	});

	// The rings and the timeline sit at their floors, found by resizing in Edit; the assumption panes fit
	// their fields.
	const LAYOUT: BoardLayout = {
		progress: {
			x: 0,
			y: 0,
			w: 14,
			h: 9,
			content: 'scale',
			figure: {
				figure: 'networth.thresholds',
				scope: { level: 'all' },
				chart: 'rings',
				title: words(PROGRESS),
				caption: words(PROGRESS_CAPTION)
			}
		},
		milestones: { x: 14, y: 0, w: 34, h: 9, content: 'scale' },
		projection: { x: 0, y: 9, w: 48, h: 15, content: 'scale' },
		timeline: { x: 0, y: 24, w: 16, h: 9, content: 'flow', mode: 'fit' },
		market: { x: 16, y: 24, w: 16, h: 9, content: 'flow', mode: 'fit' },
		money: { x: 32, y: 24, w: 16, h: 11, content: 'flow', mode: 'fit' },
		changes: { x: 38, y: 35, w: 10, h: 4, content: 'flow', mode: 'fit' }
	};

	async function commit() {
		if (await draft.commit()) onsaved();
	}
</script>

<ViewHeader title="Planning" />

<Board key="planning" layout={LAYOUT}>
	<!-- A pane of its own, so the save sits wherever the board is arranged to have it. -->
	<Pane id="changes">
		<div class="acts">
			<SaveFeedback save={draft.save} />
			<button
				type="button"
				class="btn-cancel"
				disabled={!draft.info || draft.save.busy || !draft.changed.length}
				onclick={() => draft.discard()}>{DISCARD}</button
			>
			<button
				type="button"
				class="btn-primary"
				disabled={!draft.info || draft.save.busy || !draft.changed.length}
				onclick={commit}>{SAVE_CHANGES}</button
			>
		</div>
	</Pane>

	<MilestonesPane id="milestones" data={preview} {a} {risk} />

	<FigurePane id="progress" data={preview} spec={LAYOUT.progress!.figure!} />

	<Pane id="projection" title={words(PROJECTION)} caption={words(PROJECTION_CAPTION)}>
		<Figure
			primitive={investedProjection(preview, a, risk)}
			chart="line"
			dashed={secondaryLines(a)}
			{ceiling}
		/>
		<p class="figureline">
			{labelText(depletion.label)}:
			<strong
				>{depletion.value === null ? NO_VALUE : formatUnit(depletion.value, depletion.unit)}</strong
			>
			{labelText(depletion.note)}{#if risk}{' · '}{labelText(riskSummary(risk, a))}{/if}
		</p>
	</Pane>

	{#each GROUPS as g (g.id)}
		<AssumptionGroup
			id={g.id}
			title={g.title}
			caption={g.caption}
			keys={[...g.keys]}
			data={preview}
			{draft}
		/>
	{/each}
</Board>

<style>
	/* The buttons at the pane's right, the save's outcome before them. */
	.acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--gap-inline);
	}
	.acts :global(.note),
	.acts :global(.err) {
		margin-top: 0;
	}
	.figureline {
		margin: var(--gap-row) 0 0;
		font-size: var(--text-control);
		color: var(--ink-2);
		flex: none;
	}
	.figureline strong {
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
</style>
