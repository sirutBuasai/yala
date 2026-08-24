<script lang="ts">
	// Prev/next stepper scaffold for the period navs: a ‹ button, the caller's selects, and a ›
	// button. Shared by MonthNav and YearNav so the arrows, layout, and aria live in one place.
	import type { Snippet } from 'svelte';
	import Chevron from '$lib/ui/Chevron.svelte';

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
	.rangenav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
