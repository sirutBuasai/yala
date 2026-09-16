<script module lang="ts">
	import type { SettingSpec } from '$lib/data/load';

	const STEP: Record<string, number> = { percent: 0.1, money: 500 };
	const SUFFIX: Record<string, string> = { percent: '%', months: ' mo' };
	const PREFIX: Record<string, string> = { money: '$' };

	/** A year is typed, not dragged: its range spans two centuries, so a track could not land on one. */
	const isSlider = (spec: SettingSpec) => spec.kind !== 'year';

	const plainRate = (n: number) => n.toFixed(4).replace(/\.?0+$/, '');
</script>

<script lang="ts">
	// The assumptions the ledger can't derive, with what they imply drawn beside them. Every control moves
	// the preview only — nothing reaches the ledger until Save.
	import type { DashboardData } from '$lib/data/types';
	import { getSettings, setSetting, type SettingsInfo } from '$lib/data/load';
	import { assumptionKey, assumptionsOf, realRate, type Assumptions } from '$lib/data/assumptions';
	import {
		coastTarget,
		fiNumber,
		netWorthThresholds,
		plannedRates,
		trailingAnnual
	} from '$lib/data/networth';
	import {
		balanceAtRetirement,
		depletionYear,
		investedProjection,
		lastsToHorizon,
		secondaryLines
	} from '$lib/data/projection';
	import { formatUnit } from '$lib/data/primitives';
	import { DISCARD, NOT_SET, NO_VALUE, SAVE_CHANGES } from '$lib/copy';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { validateRange } from '$lib/forms/validate';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import Slider from '$lib/forms/fields/Slider.svelte';
	import Overlay from '$lib/overlay/Overlay.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Hint from '$lib/ui/Hint.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import { money } from '$lib/utils/format';
	import { labelText, words } from '$lib/ui/label';
	import {
		PLANNING,
		PLANNING_CAPTION,
		PROGRESS,
		PROGRESS_CAPTION,
		PROJECTION,
		PROJECTION_CAPTION
	} from '$lib/views/networth/copy';

	interface Props {
		data: DashboardData;
		onclose: () => void;
		/** Called after a save, so the dashboard's derived figures pick the new values up. */
		onsaved: () => void;
	}
	let { data, onclose, onsaved }: Props = $props();

	let info = $state<SettingsInfo | null>(null);
	let loadError = $state('');
	let loading = $state(true);

	/** Value per setting key as the form currently holds it. Null is a setting left at what the ledger
	    states, which is what keeps Save disabled until something is actually moved. */
	let draft = $state<Record<string, number | null>>({});

	const save = new SaveState();

	async function load() {
		loading = true;
		const { info: loaded, error } = await getSettings();
		info = loaded;
		loadError = error ?? '';
		draft = { ...(loaded?.values ?? {}) };
		loading = false;
	}

	// One-shot on mount. Kept out of the dependency graph deliberately: the fetch writes the state it
	// would otherwise be seen to read.
	$effect(() => {
		void load();
	});

	const specs = $derived(info?.specs ?? []);

	const changed = $derived(
		specs.filter((spec) => {
			const value = draft[spec.key];
			return value != null && value !== info?.values[spec.key];
		})
	);

	/** Every preview reads this one object, so none can be left showing a figure the controls no longer
	    say. */
	const preview = $derived(
		specs.reduce<Assumptions>((acc, spec) => {
			const value = draft[spec.key];
			return value == null ? acc : { ...acc, [assumptionKey(spec.key)]: value };
		}, assumptionsOf(data))
	);

	const rates = $derived(plannedRates(data, preview));

	const real = $derived(realRate(preview));

	/** Where a control sits while its draft is null. Must agree with what `preview` resolves a null draft
	    to, or the slider would show one figure while the chart beside it drew another. */
	function seedOf(spec: SettingSpec): number {
		if (spec.key === 'planned-spending') return Math.round(rates.spending);
		if (spec.key === 'out-of-pocket') return Math.round(rates.residual);
		return spec.default ?? spec.min;
	}

	const adjusted = $derived(`Compounds at ${real.toFixed(2)}% a year after inflation.`);

	/** What a control's current value works out to. Prose takes a capital and a period; worked arithmetic
	    takes neither. */
	function footnoteOf(spec: SettingSpec): string | undefined {
		if (spec.key === 'swr') return standing;
		if (spec.key === 'nominal-return' || spec.key === 'inflation') return adjusted;
		if (spec.key !== 'out-of-pocket') return undefined;

		const extra = draft[spec.key] ?? rates.residual;
		return `${money(rates.contributions)}/yr contributions + ${money(extra)} = ${money(
			rates.contributions + extra
		)}/yr`;
	}

	const depletion = $derived(depletionYear(data, preview));

	/** The depletion clause is driven by the projection, not by the withdrawal rate against the return:
	    comparing those two only describes a portfolio sitting exactly AT the FI number, so on its own it
	    claimed a balance could not last while the chart correctly drew it rising for ever. */
	const standing = $derived.by(() => {
		const at = balanceAtRetirement(data, preview);
		const target = fiNumber(data, preview).value;
		if (at === null || !target) return undefined;

		const runsOut = depletion.value === null ? '' : ` It will deplete in ${depletion.value}.`;
		return `Your balance reaches ${money(at)} by ${preview.retireAge}, ${
			at >= target ? 'above' : 'below'
		} the ${money(target)} FI number.${runsOut}`;
	});

	/** A frame fixed at the largest FI number the slider can ask for, so dragging the rate moves the target
	    line WITHIN the chart instead of rescaling the plot. Read off the slider's own bound, never a
	    literal, so the two cannot drift apart. */
	const ceiling = $derived.by(() => {
		const swr = specs.find((s) => s.key === 'swr');
		return swr && swr.min > 0 && rates.spending ? rates.spending / (swr.min / 100) : undefined;
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

	async function commit() {
		for (const spec of changed) {
			const problem = validateRange(
				draft[spec.key] ?? null,
				spec.label,
				spec.min,
				spec.max,
				spec.kind !== 'percent'
			);
			if (problem) {
				save.fail(problem);
				return;
			}
		}

		// One request per setting, because per-key is what the API takes.
		const ok = await save.run(async () => {
			for (const spec of changed) {
				const problem = await setSetting(spec.key, draft[spec.key]!);
				if (problem) return problem;
			}
			return null;
		});

		if (ok) {
			onsaved();
			onclose();
		}
	}
</script>

<Overlay paned title={PLANNING} caption={PLANNING_CAPTION} wide {onclose}>
	{#snippet controls()}
		{#if info}
			<div class="acts">
				<SaveFeedback {save} />
				<div class="btns">
					<button type="button" class="btn-cancel" disabled={save.busy} onclick={onclose}
						>{DISCARD}</button
					>
					<button
						type="button"
						class="btn-primary"
						disabled={save.busy || !changed.length}
						onclick={commit}>{SAVE_CHANGES}</button
					>
				</div>
			</div>
		{/if}
	{/snippet}

	{#if info}
		<div class="split">
			<div class="knobs scroller trap">
				{#each specs as spec (spec.key)}
					{#if isSlider(spec)}
						<Slider
							label={spec.label}
							min={spec.min}
							max={spec.max}
							step={STEP[spec.kind] ?? 1}
							prefix={PREFIX[spec.kind] ?? ''}
							grouped={spec.kind === 'money'}
							suffix={SUFFIX[spec.kind] ?? ''}
							footnote={footnoteOf(spec)}
							disabled={save.busy}
							bind:value={
								() => draft[spec.key] ?? seedOf(spec),
								(v) => {
									draft[spec.key] = v;
									save.reset();
								}
							}
						>
							{#snippet hint()}
								<Hint label={spec.label}>{@render explains(spec)}</Hint>
							{/snippet}
							{#snippet footer()}
								<button
									type="button"
									class="btn-mini"
									disabled={save.busy || draft[spec.key] === spec.default}
									onclick={() => {
										draft[spec.key] = spec.default;
										save.reset();
									}}>Default</button
								>
							{/snippet}
						</Slider>
					{:else}
						<div class="typed">
							<label for={`plan-${spec.key}`}>{spec.label}</label>
							<input
								id={`plan-${spec.key}`}
								class="field-input"
								type="number"
								inputmode="numeric"
								min={spec.min}
								max={spec.max}
								placeholder={NOT_SET}
								disabled={save.busy}
								bind:value={draft[spec.key]}
								oninput={() => save.reset()}
							/>
						</div>
					{/if}
				{/each}
			</div>

			<div class="figures scroller trap">
				<Card title={words(PROJECTION)} caption={words(PROJECTION_CAPTION)}>
					<Figure
						primitive={investedProjection(data, preview)}
						chart="line"
						dashed={secondaryLines(preview)}
						{ceiling}
					/>
					<p class="figureline">
						{labelText(depletion.label)}:
						<strong
							>{depletion.value === null
								? NO_VALUE
								: formatUnit(depletion.value, depletion.unit)}</strong
						>
						{labelText(depletion.note)}
					</p>
				</Card>

				<Card title={words(PROGRESS)} caption={words(PROGRESS_CAPTION)}>
					<Figure primitive={netWorthThresholds(data, preview)} chart="bullet" />
				</Card>
			</div>
		</div>
	{:else if loading}
		<p class="cap">Loading...</p>
	{:else}
		<div class="failed">
			<p class="err" role="alert">{loadError}</p>
			<button type="button" class="btn-accent" onclick={load}>Try again</button>
		</div>
	{/if}
</Overlay>

{#snippet fisher()}
	<b
		>({plainRate(1 + preview.nominalReturn / 100)} / {plainRate(1 + preview.inflation / 100)}) − 1 = {real.toFixed(
			2
		)}% adjusted</b
	>
{/snippet}

{#snippet explains(spec: SettingSpec)}
	{spec.help}
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
			>spending × (1 − (1+r)^−n) / r, where r = {real.toFixed(2)}% adjusted return and n = {worked.drawnYears}
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
		<b>trailing savings based on your activity: {money(rates.residual)}/yr</b>
		<b
			>{money(rates.contributions)}/yr contributions + {money(draft[spec.key] ?? rates.residual)} = {money(
				rates.investing
			)}/yr</b
		>
	{/if}
{/snippet}

<style>
	.acts {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--gap-field);
	}
	.btns {
		display: flex;
		gap: var(--gap-inline);
		margin-left: auto;
	}
	.failed {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--gap-row);
	}
	/* The Overlay hands its scrolling over (`paned`), so the panes own the height — hence `min-height: 0`,
	   without which a flex child refuses to shrink below its content and the panel grows instead. */
	.split {
		display: grid;
		grid-template-columns: minmax(0, 21rem) minmax(0, 1fr);
		/* Wider than the usual grid gap: one pane's scrollbar ends at this gap, so it carries the clearance
		   between the bar and the next pane. */
		gap: var(--space-11);
		min-height: 0;
	}
	.knobs,
	.figures {
		min-width: 0;
		min-height: 0;
		/* The scrollbar sits INSIDE this padding, so the padding is what keeps it off the controls. */
		padding-right: var(--space-8);
	}
	.figures {
		display: flex;
		flex-direction: column;
	}
	@media (max-width: 60rem) {
		.split {
			grid-template-columns: minmax(0, 1fr);
			overflow-y: auto;
		}
		.knobs,
		.figures {
			overflow: visible;
		}
	}
	/* Rows in threes with each slider spanning them as a subgrid, so a row's label lines, tracks and help
	   lines each line up — a two-line label used to push its own track down past its neighbour's. */
	/* Named `.knobs`, not `.controls`: the Overlay header uses that class for its own button row, and two
	   grids of the same name in one dialog is a trap even with scoped styles. */
	.knobs {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-auto-rows: auto auto auto;
	}
	.knobs > :global(*) {
		margin-bottom: var(--gap-section);
	}
	/* The same three rows as a slider, so it sits level with the ones beside it. */
	.typed {
		display: grid;
		grid-template-rows: subgrid;
		grid-row: span 3;
		min-width: 0;
	}
	.typed label {
		align-self: end;
		padding-bottom: var(--space-3);
		font-size: var(--text-label);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
	}
	.typed input {
		align-self: center;
		min-width: 0;
	}
	.figures :global(.card) + :global(.card) {
		margin-top: var(--gap-section);
		padding-top: var(--gap-section);
		border-top: 1px solid var(--border);
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
