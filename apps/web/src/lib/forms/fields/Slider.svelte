<script lang="ts">
	// A labelled range whose reading is also an input, so a figure can be dragged to or typed in. Takes
	// its bounds and step from the caller rather than owning any, so whatever describes the figure — a
	// backend spec, a form — is what both controls are drawn from.
	//
	// Its three parts each sit in their own row of the parent grid (see `.field`), so a stack of these
	// aligns across the row however many lines a label or a help line takes.
	interface Props {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		/** Printed before the figure — a currency sign. */
		prefix?: string;
		/** Group the resting figure with thousands separators. For an amount, not a rate or an age. */
		grouped?: boolean;
		/** Printed straight after the figure: a unit sign, never a word that needs spacing. */
		suffix?: string;
		/** A live figure under the track, for what the current value works out to. */
		footnote?: string;
		/** Sits beside the label — a "?" explaining how the figure is used. */
		hint?: import('svelte').Snippet;
		/** Sits at the foot of the block, under the help — a reset, say. */
		footer?: import('svelte').Snippet;
		disabled?: boolean;
	}
	let {
		label,
		value = $bindable(),
		min,
		max,
		step = 1,
		prefix = '',
		grouped = false,
		suffix = '',
		footnote,
		hint,
		footer,
		disabled = false
	}: Props = $props();

	const id = $props.id();

	/**
	 * What the number field currently holds, as text. A buffer rather than the bound number, because
	 * binding a number straight to the input made every keystroke re-render it from the clamped value: the
	 * field could not be emptied, so deleting a digit in place was impossible and only replacing the whole
	 * selection worked. Cleared on commit to fall back through to `value`.
	 */
	let typed = $state<string | null>(null);

	/** Grouped at rest so six digits are readable, plain while being typed into — separators in a field
	    you are editing fight the caret. */
	const shown = $derived(typed ?? (grouped ? value.toLocaleString() : String(value)));

	/**
	 * How wide the field has to be: the longest text it can hold, not the text it holds now — a box sized
	 * to "5" clipped "11.9" the moment a second digit and a decimal arrived. `ch` is a digit's width, and
	 * the extra covers the padding, the border and a decimal point, which are all narrower than a digit.
	 */
	const widest = $derived(
		Math.max(
			(grouped ? Math.round(max).toLocaleString() : String(max)).length,
			(grouped ? Math.round(min).toLocaleString() : String(min)).length,
			// A stepped rate can hold one more character than either bound: "11.9" against a bound of "20".
			String(max).length + (Number.isInteger(step) ? 0 : 2)
		)
	);

	/** Where the thumb sits along the track, as a percentage — the stop the filled half runs to. */
	const filled = $derived(max > min ? ((value - min) / (max - min)) * 100 : 0);

	/** Commit the typed text, holding it to the bounds. Empty snaps to the minimum, which is what an
	    emptied bounded field can only mean. */
	function commit() {
		if (typed !== null) {
			// Separators are stripped, so a grouped figure the caller pasted back in still parses.
			const entered = Number(typed.replace(/,/g, ''));
			value =
				typed.trim() === '' || !Number.isFinite(entered)
					? min
					: Math.min(max, Math.max(min, entered));
		}
		typed = null;
	}
</script>

<div class="slider">
	<div class="line">
		<span class="naming"
			><label for={id}>{label}</label>{#if hint}{@render hint()}{/if}</span
		>
		<span class="reading">
			{#if prefix}<span class="sign">{prefix}</span>{/if}
			<!-- Text, not number: a number input reports an empty or half-typed value as NaN, which is what
			     made the digits undeletable. Bounds still ride along for assistive tech. -->
			<input
				class="num"
				type="text"
				inputmode="decimal"
				aria-label={label}
				role="spinbutton"
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={value}
				style:width="calc({widest}ch + 1.6rem)"
				{disabled}
				value={shown}
				onfocus={() => (typed = String(value))}
				oninput={(e) => (typed = (e.currentTarget as HTMLInputElement).value)}
				onchange={commit}
				onblur={commit}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						(e.currentTarget as HTMLInputElement).blur();
					}
				}}
			/>{#if suffix}<span class="sign">{suffix}</span>{/if}
		</span>
	</div>

	<input
		{id}
		type="range"
		{min}
		{max}
		{step}
		{disabled}
		style:--filled="{filled}%"
		{value}
		oninput={(e) => {
			typed = null;
			value = (e.currentTarget as HTMLInputElement).valueAsNumber;
		}}
	/>

	<!-- The reading and the way back on one line, the reading wrapping under itself rather than pushing the
	     button down: a control's reset should sit at a predictable place whatever its figure says. -->
	<div class="notes">
		{#if footnote}<p class="foot">{footnote}</p>{/if}
		{#if footer}<div class="footer">{@render footer()}</div>{/if}
	</div>
</div>

<style>
	/* Three rows inherited from the parent grid, so the label lines, the tracks and the help lines each
	   align across a row of sliders regardless of how many lines any one of them wraps to. */
	.slider {
		display: grid;
		grid-template-rows: subgrid;
		grid-row: span 3;
		min-width: 0;
	}
	.line {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--gap-inline);
		/* Bottom-aligned within its row, so a label that wraps to two lines still sits its last line level
		   with a neighbour's single one — and the reading beside it never floats. */
		align-self: end;
		padding-bottom: var(--space-3);
	}
	/* The label and its "?" flow as one run of text, so the mark trails the last word rather than landing
	   alone on a new row. */
	.naming {
		min-width: 0;
	}
	.naming :global(.hint) {
		margin-left: var(--space-2);
	}
	label {
		font-size: var(--text-label);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		min-width: 0;
	}
	/* The reading, not the name: it is what changes as the track is dragged, so it carries the weight. */
	.reading {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-1);
		flex: 0 0 auto;
	}
	.num {
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		color: var(--ink);
		font: inherit;
		font-size: var(--text-row);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		text-align: right;
		min-width: 0;
	}
	/* Borderless until reached for, so the row reads as a figure rather than as a second form field. */
	.num:hover:not(:disabled),
	.num:focus {
		border-color: var(--border);
		background: var(--inset);
	}
	.sign {
		font-size: var(--text-row);
		font-weight: var(--fw-semibold);
		color: var(--ink-2);
	}
	/**
	 * Drawn rather than left to `accent-color`, which colours only the filled half and the thumb: the
	 * browser picked the UNFILLED half itself and chose a near-black bar, so on the light page the track
	 * read as a heavy rule with a bright dot on it. Styling both halves puts the empty one on `--inset`.
	 *
	 * Both vendor sets are needed — WebKit has no `::-moz-range-progress`, so its fill comes from a
	 * gradient stopped at `--filled` instead.
	 */
	input[type='range'] {
		appearance: none;
		width: 100%;
		min-width: 0;
		height: 1.1rem;
		align-self: center;
		background: none;
		cursor: pointer;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: linear-gradient(
			to right,
			var(--control-fill) var(--filled),
			var(--inset) var(--filled)
		);
	}
	input[type='range']::-moz-range-track {
		height: 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--inset);
	}
	input[type='range']::-moz-range-progress {
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--control-fill);
	}
	/* Ringed in the surface colour so it reads as sitting ON the track rather than in it. The negative
	   margin is what centres it on a 6px track; without it WebKit hangs the thumb off the top. */
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 15px;
		height: 15px;
		margin-top: -5px;
		border: 2px solid var(--surface);
		border-radius: var(--radius-pill);
		background: var(--control-fill);
		box-shadow: 0 0 0 1px var(--border);
	}
	input[type='range']::-moz-range-thumb {
		width: 15px;
		height: 15px;
		border: 2px solid var(--surface);
		border-radius: var(--radius-pill);
		background: var(--control-fill);
		box-shadow: 0 0 0 1px var(--border);
	}
	input[type='range']:focus-visible::-webkit-slider-thumb {
		box-shadow: 0 0 0 2px var(--control-fill);
	}
	input[type='range']:focus-visible::-moz-range-thumb {
		box-shadow: 0 0 0 2px var(--control-fill);
	}
	input:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.notes {
		display: flex;
		align-items: flex-start;
		gap: var(--gap-inline);
		padding-top: var(--space-3);
	}
	.foot {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-size: var(--text-caption);
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	/* Right-aligned whether or not there is a figure beside it, so a column of these lines up. */
	.footer {
		flex: 0 0 auto;
		margin-left: auto;
	}
</style>
