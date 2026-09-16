<script module lang="ts">
	import type { SettingSpec } from '$lib/data/load';

	/** How finely each kind is stepped. Only a rate carries a decimal; an amount moves in useful jumps. */
	const STEP: Record<string, number> = { percent: 0.1, money: 500 };

	/** The signs a reading wears, by kind. Both are the app's own (see `formatUnit`), so a slider and a
	    figure elsewhere read the same figure the same way. */
	const SUFFIX: Record<string, string> = { percent: '%', months: ' mo' };
	const PREFIX: Record<string, string> = { money: '$' };

	/** A year is typed, not dragged: its range spans two centuries, so a track could not land on one. */
	const isSlider = (spec: SettingSpec) => spec.kind !== 'year';
</script>

<script lang="ts">
	// The assumptions the ledger can't derive, with what they imply drawn beside them. Every control moves
	// the preview only — nothing reaches the ledger until Save — so a figure can be tried before it is
	// committed.
	//
	// Driven entirely by the specs the backend sends, like the panel it replaced: a setting added
	// server-side arrives here as a bounded, explained control with nothing to add on this side.
	import type { DashboardData } from '$lib/data/types';
	import { getSettings, setSetting, type SettingsInfo } from '$lib/data/load';
	import {
		assumptionKey,
		assumptionsOf,
		realRate,
		yearsToRetirement,
		type Assumptions
	} from '$lib/data/assumptions';
	import {
		coastTarget,
		fiNumber,
		netWorthThresholds,
		plannedRates,
		trailingAnnual
	} from '$lib/data/networth';
	import {
		balanceAtRetirement,
		breakEven,
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

	/** Only what differs from what the ledger already states: Save writes these and nothing else. */
	const changed = $derived(
		specs.filter((spec) => {
			const value = draft[spec.key];
			return value != null && value !== info?.values[spec.key];
		})
	);

	/**
	 * The ledger's assumptions with the form's values laid over them. Every preview reads this one object,
	 * so they move together and none can be left showing a figure the controls no longer say.
	 */
	const preview = $derived(
		specs.reduce<Assumptions>((acc, spec) => {
			const value = draft[spec.key];
			return value == null ? acc : { ...acc, [assumptionKey(spec.key)]: value };
		}, assumptionsOf(data))
	);

	const rates = $derived(plannedRates(data, preview));

	/** What the stated return comes to once inflation is taken out — the rate everything compounds at. */
	const real = $derived(realRate(preview));

	/**
	 * Where a control sits while its draft is null. A planning amount has no sensible fixed default — it is
	 * whatever the ledger logged — so the spec ships none and the form seeds from the data instead.
	 *
	 * This must agree with what `preview` resolves a null draft to, or the slider would show one figure
	 * while the chart beside it drew another.
	 */
	function seedOf(spec: SettingSpec): number {
		if (spec.key === 'planned-spending') return Math.round(rates.spending);
		if (spec.key === 'out-of-pocket') return Math.round(rates.residual);
		return spec.default ?? spec.min;
	}

	/** What a control's current value works out to, printed under its help and moving as it is dragged. */
	function footnoteOf(spec: SettingSpec): string | undefined {
		if (spec.key === 'swr') return standing;
		// The rate stated is nominal; the rate that compounds is this one, so it is shown as you slide.
		if (spec.key === 'nominal-return') return `${real.toFixed(2)}% inflation adjusted return`;
		if (spec.key === 'inflation') return `${real.toFixed(2)}% inflation adjusted return`;
		if (spec.key !== 'out-of-pocket') return undefined;

		const extra = draft[spec.key] ?? rates.residual;
		return `${money(rates.contributions)}/yr contributions + ${money(extra)} = ${money(
			rates.contributions + extra
		)}/yr`;
	}

	const depletion = $derived(depletionYear(data, preview));

	/**
	 * Where the balance lands against the FI number, and whether it actually runs out. The depletion clause
	 * is driven by the projection rather than by the two rates: comparing the withdrawal rate to the return
	 * only describes a portfolio sitting exactly AT the FI number, so on its own it claimed a balance could
	 * not last while the chart correctly drew it rising for ever.
	 */
	const standing = $derived.by(() => {
		const at = balanceAtRetirement(data, preview);
		const target = fiNumber(data, preview).value;
		if (at === null || !target) return undefined;

		const runsOut = depletion.value === null ? '' : ` It will deplete in ${depletion.value}.`;
		return `Your balance reaches ${money(at)} by ${preview.retireAge}, ${
			at >= target ? 'above' : 'below'
		} the ${money(target)} FI number.${runsOut}`;
	});

	/**
	 * The value axis ends at the largest FI number the withdrawal slider can ask for. A fixed frame, so
	 * dragging the rate moves the target line WITHIN the chart instead of rescaling the whole plot — and
	 * one taken from the slider's own bound, never a literal, so the two cannot drift apart.
	 */
	const ceiling = $derived.by(() => {
		const swr = specs.find((s) => s.key === 'swr');
		return swr && swr.min > 0 && rates.spending ? rates.spending / (swr.min / 100) : undefined;
	});

	/** The figures the hints work through, each read from the same builder the chart uses. */
	const worked = $derived.by(() => {
		const fi = fiNumber(data, preview).value;
		const lasts = lastsToHorizon(data, preview);
		return {
			fi,
			lasts,
			years: yearsToRetirement(preview),
			drawnYears: preview.horizonAge - preview.retireAge,
			liquid: data.networth?.current?.breakdown?.['Liquid'] ?? null,
			age: preview.birthYear === null ? null : new Date().getFullYear() - preview.birthYear,
			coast: coastTarget(data, preview),
			loggedSpend: trailingAnnual(data, 'spending')
		};
	});

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

		// One request per setting, because per-key is what the API takes. Stops at the first refusal rather
		// than pressing on; the form is still on screen to retry from.
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

<Overlay
	paned
	title="Financial planning"
	caption="Assumptions used to calculate financial independence metrics and runway targets."
	wide
	{onclose}
>
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
		<!-- Controls beside what they drive, so a figure can be moved with its effect still on screen. -->
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
								<!-- Always offered, disabled once it would do nothing: a control you have been
								     dragging should say what its normal figure was without you having to
								     remember, so the way back must not vanish when it is not needed. -->
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
				<Card
					title={words('Projected investments')}
					caption={words('invested balance growth and financial independence projection')}
				>
					<Figure
						primitive={investedProjection(data, preview)}
						chart="line"
						dashed={secondaryLines(preview)}
						{ceiling}
					/>
					<!-- Under the chart it is read off, since the year it names is where the Investing line hits zero. -->
					<p class="figureline">
						Depletion year: <strong
							>{depletion.value === null
								? 'never'
								: formatUnit(depletion.value, depletion.unit)}</strong
						>
						at {money(rates.spending)}/yr
					</p>
				</Card>

				<Card
					title={words('Financial progress')}
					caption={words('key metrics for financial independence')}
				>
					<Figure primitive={netWorthThresholds(data, preview)} chart="bullet" />
				</Card>
			</div>
		</div>
	{:else if loading}
		<p class="hint">Loading...</p>
	{:else}
		<p class="err" role="alert">{loadError}</p>
		<button type="button" class="btn-accent" onclick={load}>Try again</button>
	{/if}
</Overlay>

<!-- One hint per setting, each stating the arithmetic its own figure takes part in. Beside the control
     rather than in a panel of its own, so the explanation sits where the question gets asked. -->
{#snippet explains(spec: SettingSpec)}
	{spec.help}
	{#if spec.key === 'swr'}
		<b
			>{money(rates.spending)} / {(preview.swr / 100).toFixed(4).replace(/0+$/, '')} = {worked.fi ===
			null
				? NO_VALUE
				: money(worked.fi)}</b
		>
		FI number: where your investment won't run out at {preview.swr}% withdrawal rate for your
		everyday spending.
		<!-- Raw figures, no separators: this line is read as arithmetic to check, not as money to compare. -->
		<b
			>{worked.fi === null ? NO_VALUE : money(worked.fi)} / {(1 + real / 100).toFixed(2)} ^ ({preview.retireAge}-{worked.age ??
				NO_VALUE}) = {worked.coast === null ? NO_VALUE : money(worked.coast)}</b
		>
		Coast FI: what you would need today to reach the FI number by {preview.retireAge} with no further
		contribution.
	{:else if spec.key === 'nominal-return'}
		<b
			>({(1 + preview.nominalReturn / 100).toFixed(4).replace(/0+$/, '')} / {(
				1 +
				preview.inflation / 100
			)
				.toFixed(4)
				.replace(/0+$/, '')}) − 1 = {real.toFixed(2)}% adjusted</b
		>
		Coasting: Balance grows at real rate of return.
		<span class="line"
			>Investing: Balance grows at {money(rates.investing)}/yr compounded with real rate of return
			until retirement at {preview.retireAge}.</span
		>
	{:else if spec.key === 'inflation'}
		<b
			>({(1 + preview.nominalReturn / 100).toFixed(4).replace(/0+$/, '')} / {(
				1 +
				preview.inflation / 100
			)
				.toFixed(4)
				.replace(/0+$/, '')}) − 1 = {real.toFixed(2)}% adjusted</b
		>
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
		Average saved and spent metrics from your logged activity or custom spending rate
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
	/**
	 * Knobs beside what they drive, each pane scrolling on its own so a figure stays in view while the
	 * controls are worked through. The Overlay hands its scrolling over for this (`paned`), so the panes
	 * are what own the height — hence `min-height: 0` on both, without which a flex child refuses to
	 * shrink below its content and the panel grows instead of the pane scrolling.
	 */
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
		/* The scrollbar sits at the pane's inline end, INSIDE this padding — so the padding is what keeps it
		   off the controls beside it, and the grid gap is what keeps it off the next pane. `scrollbar-gutter:
		   stable` (from `.scroller`) reserves the same room whether or not the bar is showing, so nothing
		   shifts sideways when content grows. */
		padding-right: var(--space-8);
	}
	.figures {
		display: flex;
		flex-direction: column;
	}
	@media (max-width: 60rem) {
		/* One column on a narrow panel: the panes stack and the split scrolls as one. */
		.split {
			grid-template-columns: minmax(0, 1fr);
			overflow-y: auto;
		}
		.knobs,
		.figures {
			overflow: visible;
		}
	}
	/**
	 * As many per row as fit, each wide enough that its title takes one line.
	 *
	 * `grid-auto-rows` in threes with each slider spanning them as a subgrid, so a row's label lines, its
	 * tracks and its help lines each line up — a two-line label used to push its own track down past its
	 * neighbour's.
	 */
	/* Named `.knobs`, not `.controls`: the Overlay header uses that class for its own button row, and two
	   grids of the same name in one dialog is a trap even with scoped styles. */
	.knobs {
		display: grid;
		/* One per row: a title then gets the column to itself rather than sharing it with a reading. */
		grid-template-columns: minmax(0, 1fr);
		grid-auto-rows: auto auto auto;
	}
	.knobs > :global(*) {
		margin-bottom: var(--gap-section);
	}
	/* The typed field keeps the same three rows, so it sits level with the sliders beside it. */
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
	/* Each figure a block down its own pane. */
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
	/* Inside a hint bubble: a sentence that reads as its own paragraph rather than running on. */
	.line {
		display: block;
		margin-top: var(--space-2);
	}
	/* Inside a hint bubble: the formula's own key, above the arithmetic that follows it. */
	.legend {
		display: block;
		margin: var(--space-2) 0;
		color: var(--ink-3);
	}
	.hint {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
		margin: 0;
	}
	.err {
		color: var(--crit-text);
		font-size: var(--text-subtitle);
		margin: 0 0 var(--gap-row);
	}
</style>
