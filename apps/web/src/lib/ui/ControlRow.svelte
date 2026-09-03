<script lang="ts">
	// A labelled control with its actions beside it: fixed-width label, the control taking the slack,
	// then whatever buttons act on it. The shape of every row inside a Manage drawer.
	//
	// The label track is a fixed width rather than `auto` so labels line up down a drawer — with `auto`
	// each row sized to its own label and the controls stepped raggedly across.
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		/** The input/select this row is about. */
		control: Snippet;
		/** Buttons that act on the control. */
		children?: Snippet;
	}
	let { label, control, children }: Props = $props();
</script>

<div class="ctl">
	<span class="lbl">{label}</span>
	<div class="grow">{@render control()}</div>
	{#if children}{@render children()}{/if}
</div>

<style>
	.ctl {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		flex-wrap: wrap;
	}
	.lbl {
		flex: 0 0 5.5rem;
		font-size: var(--text-caption);
		color: var(--ink-3);
	}
	.grow {
		flex: 1;
		min-width: 6rem;
	}
</style>
