<script lang="ts">
	import { tick } from 'svelte';
	import { NOT_SET } from '$lib/copy';
	// Typed and stepped within the caller's bounds, or with `track`, dragged along a range that moves the figure
	// live.
	interface Props {
		label: string;
		/** Null only where `optional`: a figure left unset. */
		value: number | null;
		min: number;
		max: number;
		step?: number;
		/** Printed before the figure — a currency sign. */
		prefix?: string;
		/** Group the resting figure with thousands separators. For an amount, not a rate or an age. */
		grouped?: boolean;
		/** Printed straight after the figure: a unit sign, never a word that needs spacing. */
		suffix?: string;
		/** May be left empty, which reads as unset rather than as the minimum. */
		optional?: boolean;
		/** Draw a range under the field to drag the figure along. */
		track?: boolean;
		/** Sits beside the label: a "?" explaining how the figure is used, a reset. */
		hint?: import('svelte').Snippet;
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
		optional = false,
		track = false,
		hint,
		disabled = false
	}: Props = $props();

	/** A text buffer, not the bound number: binding the number re-rendered the clamped value per keystroke, so
	    the field could not be emptied. Cleared on commit. */
	let typed = $state<string | null>(null);

	/** Grouped at rest so long figures are readable, plain while being typed into — separators in a field
	    you are editing fight the caret. */
	const shown = $derived(
		typed ?? (value === null ? '' : grouped ? value.toLocaleString() : String(value))
	);

	/** Sized to the longest text it can hold, or a box fitted to the opening figure clips as digits arrive. */
	const widest = $derived(
		Math.max(
			(grouped ? Math.round(max).toLocaleString() : String(max)).length,
			(grouped ? Math.round(min).toLocaleString() : String(min)).length,
			// A stepped rate can hold a decimal point and a place beyond what either bound needs.
			String(max).length + (Number.isInteger(step) ? 0 : 2)
		)
	);

	const filled = $derived(max > min && value !== null ? ((value - min) / (max - min)) * 100 : 0);

	/** Places the step carries, so repeated steps land on it rather than drifting in binary fractions. */
	const places = $derived((String(step).split('.')[1] ?? '').length);
	const held = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(places))));

	function by(steps: number) {
		typed = null;
		value = held((value ?? min) + steps * step);
	}

	/** Commit the typed text, holding it to the bounds. Empty or unreadable text is unset where the figure
	    may be, and otherwise the minimum, which is what an emptied bounded field can only mean. */
	function commit() {
		if (typed !== null) {
			// Separators are stripped, so a grouped figure the caller pasted back in still parses.
			const entered = Number(typed.replace(/,/g, ''));
			const readable = typed.trim() !== '' && Number.isFinite(entered);
			value = readable ? Math.min(max, Math.max(min, entered)) : optional ? null : min;
		}
		typed = null;
	}
</script>

<div class="numfield">
	<span class="naming"
		>{label}{#if hint}{@render hint()}{/if}</span
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
			aria-valuenow={value ?? undefined}
			placeholder={optional ? NOT_SET : undefined}
			style:width="calc({widest}ch + 0.6rem)"
			{disabled}
			value={shown}
			onfocus={(e) => {
				const field = e.currentTarget as HTMLInputElement;
				typed = value === null ? '' : String(value);
				// Selected again once the grouping is dropped: the swap lands after the browser selected the
				// old text, so typing appended to it (a reading of 63073400000, held to the maximum).
				void tick().then(() => field.select());
			}}
			oninput={(e) => (typed = (e.currentTarget as HTMLInputElement).value)}
			onchange={commit}
			onblur={commit}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					(e.currentTarget as HTMLInputElement).blur();
				} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					// A spinbutton steps by its arrows, as its role promises.
					e.preventDefault();
					by(e.key === 'ArrowUp' ? 1 : -1);
					typed = String(value);
				}
			}}
		/>{#if suffix}<span class="sign">{suffix}</span>{/if}
	</span>
	{#if track}
		<input
			type="range"
			aria-label={label}
			{min}
			{max}
			{step}
			{disabled}
			style:--filled="{filled}%"
			value={value ?? min}
			oninput={(e) => {
				typed = null;
				value = (e.currentTarget as HTMLInputElement).valueAsNumber;
			}}
		/>
	{/if}
</div>

<style>
	.numfield {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2) var(--gap-inline);
		min-width: 0;
	}
	/* The label and its "?" flow as one run of text, so the mark trails the last word rather than landing
	   alone on a new row. */
	.naming {
		min-width: 0;
		font-size: var(--text-control);
		color: var(--ink-2);
	}
	.naming :global(.hint),
	.naming :global(.reset) {
		margin-left: var(--space-2);
	}
	/* One width for every field, so a stack of them lines up whatever each one's bounds. */
	.reading {
		min-width: 7rem;
		display: inline-flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--inset);
	}
	.reading:focus-within {
		border-color: var(--control-line);
	}
	.num {
		background: none;
		border: 0;
		padding: 0;
		color: var(--ink);
		font: inherit;
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		text-align: right;
		min-width: 0;
	}
	.num:focus {
		outline: none;
	}
	.sign {
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		color: var(--ink-2);
	}
	/* Drawn, not `accent-color`, whose unfilled half came out near-black on the light page. WebKit has no
	   `::-moz-range-progress`, so its fill is a gradient stopped at `--filled`. */
	input[type='range'] {
		appearance: none;
		width: 100%;
		min-width: 0;
		height: 1.1rem;
		grid-column: 1 / -1;
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
</style>
