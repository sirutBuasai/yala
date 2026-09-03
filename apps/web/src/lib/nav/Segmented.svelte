<script lang="ts" generics="T extends string">
	// Pill segmented control — the app's standard "pick one of a few views" affordance. Extracted
	// so the Activity range switch and the Net Worth view switch can't drift apart.
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
	}
	let { options, value, onchange, ariaLabel }: Props = $props();
</script>

<div
	class="seg"
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
			aria-selected={value === o.id}
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
	}
	.seg button.active {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
		color: var(--ink);
	}
	.seg button:hover:not(.active) {
		color: var(--ink);
	}
	.seg button:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--lav) 45%, transparent);
	}
</style>
