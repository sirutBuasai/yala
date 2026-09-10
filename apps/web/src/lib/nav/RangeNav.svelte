<script lang="ts">
	// Prev/next stepper scaffold shared by MonthNav and YearNav.
	import type { Snippet } from 'svelte';
	import Chevron from '$lib/icons/Chevron.svelte';

	interface Props {
		prevLabel: string;
		nextLabel: string;
		onprev: () => void;
		onnext: () => void;
		/** The period selector(s) rendered between the arrows. */
		children: Snippet;
	}
	let { prevLabel, nextLabel, onprev, onnext, children }: Props = $props();
</script>

<div class="rangenav">
	<button class="navbtn" aria-label={prevLabel} onclick={onprev}>
		<Chevron dir="left" />
	</button>
	{@render children()}
	<button class="navbtn" aria-label={nextLabel} onclick={onnext}>
		<Chevron dir="right" />
	</button>
</div>

<style>
	/* Wraps rather than pushing the header past the page; the arrows keep their size as tap targets,
	   so the picker between them gives up the width. */
	.rangenav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-row);
		min-width: 0;
	}
	.rangenav .navbtn {
		flex: none;
	}
</style>
