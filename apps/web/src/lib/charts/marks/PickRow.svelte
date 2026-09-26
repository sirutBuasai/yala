<script lang="ts">
	// One row of a bar list, spanning its parent grid's columns. A row that chooses its label is a button
	// reading as one control: no button chrome, and a wash BEHIND it on hover and while chosen, so the bars
	// over it keep their colour.
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		/** Makes the row a button choosing its label. */
		onpick?: (label: string) => void;
		picked?: boolean;
		children: Snippet;
	}
	let { label, onpick, picked = false, children }: Props = $props();
</script>

<svelte:element
	this={onpick ? 'button' : 'div'}
	class="pickrow"
	class:pickable={!!onpick}
	class:picked
	type={onpick ? 'button' : undefined}
	role={onpick ? 'button' : undefined}
	aria-pressed={onpick ? picked : undefined}
	onclick={onpick ? () => onpick(label) : undefined}
>
	{@render children()}
</svelte:element>

<style>
	.pickrow {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		font-size: var(--text-caption);
	}
	.pickable {
		border: 0;
		margin: 0;
		padding: 0;
		background: none;
		font-family: inherit;
		line-height: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
		border-radius: var(--radius-sm);
	}
	.pickable:hover,
	.picked {
		background: var(--inset);
	}
</style>
