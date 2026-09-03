<script lang="ts" generics="T extends string">
	// Pill segmented control — the app's ONE "pick one of a few views" affordance. The top-level
	// dashboard tabs, the Activity range switch and the Net Worth range switch are all this
	// component; they used to be two near-identical implementations that had already drifted apart
	// on padding and elevation.
	//
	// ARIA tablist with a roving tabindex: the group is one tab stop, arrows move between options,
	// Home/End jump to the ends.
	import { tablistKeydown } from '$lib/utils/tablist';

	interface Option {
		id: T;
		label: string;
	}
	interface Props {
		options: Option[];
		value: T;
		onchange: (id: T) => void;
		/** Accessible name for the group. */
		ariaLabel: string;
		/** id of the panel these tabs control, when they drive a real tabpanel. */
		controls?: string;
		/** Prefix for each tab's own id, so a tabpanel can name its tab via aria-labelledby. */
		idPrefix?: string;
		/** Lift the control off the page — for a switch that floats in the page header. */
		elevated?: boolean;
	}
	let {
		options,
		value,
		onchange,
		ariaLabel,
		controls,
		idPrefix,
		elevated = false
	}: Props = $props();
</script>

<div
	class="seg"
	class:elevated
	role="tablist"
	aria-label={ariaLabel}
	tabindex="-1"
	onkeydown={(e) =>
		tablistKeydown(
			e,
			options.length,
			options.findIndex((o) => o.id === value),
			(i) => onchange(options[i]!.id)
		)}
>
	{#each options as o (o.id)}
		<button
			role="tab"
			id={idPrefix ? `${idPrefix}${o.id}` : undefined}
			aria-selected={value === o.id}
			aria-controls={controls}
			tabindex={value === o.id ? 0 : -1}
			class:active={value === o.id}
			onclick={() => onchange(o.id)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		display: flex;
		gap: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: var(--space-2);
		/* Options wrap onto a second row inside the pill rather than forcing the header wider than
		   the page: four labelled tabs need ~315px, which a 380px phone doesn't have once the page
		   gutters are taken out. A two-row pill still reads as one control; a horizontally scrolling
		   page does not. */
		flex-wrap: wrap;
		justify-content: center;
		min-width: 0;
	}
	.seg.elevated {
		box-shadow: var(--shadow);
	}
	.seg button {
		border: 0;
		background: none;
		color: var(--ink-2);
		padding: var(--space-3) var(--space-7);
		border-radius: var(--radius-pill);
		font: inherit;
		font-size: var(--text-control);
		font-weight: var(--fw-medium);
		cursor: pointer;
		white-space: nowrap;
	}
	.seg button.active {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
		color: var(--ink);
	}
	.seg button:hover:not(.active) {
		color: var(--ink);
	}
</style>
