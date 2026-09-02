<script lang="ts" generics="T">
	// A vertical scroll wheel: rows snap to a centred selection slot. A short drag snaps to the
	// neighbouring row; a longer flick scrolls smoothly and settles on the nearest snap point.
	// The centred row is the selection (`selected`, two-way bound) — the caller emphasises it via
	// the `row` snippet's `isCurrent`. `focus(i)` centres a row programmatically (e.g. after a save).
	import type { Snippet } from 'svelte';

	interface Props {
		items: T[];
		/** Row renderer; `isCurrent` is true for the centred (selected) row. */
		row: Snippet<[T, number, boolean]>;
		/** Index of the centred row (two-way bound). */
		selected?: number;
		/** Height of one row, px. */
		rowHeight?: number;
		/** Visible height of the wheel, px. */
		height?: number;
		/** Label of an item, for the width sizer. Supply it (with `sizer`) when the selected row
		    renders larger than the others, so the wheel reserves width for the longest label and
		    never truncates or jiggles as the selection moves. */
		label?: (item: T) => string;
		/** Renders the invisible width sizer for one label (style it like your selected row). */
		sizer?: Snippet<[string]>;
	}
	let {
		items,
		row,
		selected = $bindable(0),
		rowHeight = 44,
		height = 220,
		label,
		sizer
	}: Props = $props();

	let scrollEl = $state<HTMLDivElement>();
	// Top/bottom padding so the first and last rows can reach the centre slot.
	const pad = $derived(Math.max(0, (height - rowHeight) / 2));

	let raf = 0;
	function onScroll() {
		if (!scrollEl) return;
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			if (!scrollEl) return;
			// With the centring padding, row i is centred when scrollTop === i * rowHeight.
			const i = Math.round(scrollEl.scrollTop / rowHeight);
			const c = Math.max(0, Math.min(items.length - 1, i));
			if (c !== selected) selected = c;
		});
	}

	/** Centre row `i` (and select it). Smooth so post-save advances glide to the next account. */
	export function focus(i: number) {
		const c = Math.max(0, Math.min(items.length - 1, i));
		selected = c;
		scrollEl?.scrollTo({ top: c * rowHeight, behavior: 'smooth' });
	}

	// Centre the initial selection once mounted (no animation).
	let mounted = false;
	$effect(() => {
		if (!scrollEl || mounted) return;
		mounted = true;
		requestAnimationFrame(() => {
			if (scrollEl) scrollEl.scrollTop = selected * rowHeight;
		});
	});
</script>

{#if sizer && label}
	<!-- Zero-height, hidden: only its intrinsic width matters, so the wheel's column is as wide as
	     its longest label rendered at the selected row's size. -->
	<div class="wsizer" aria-hidden="true">
		{#each items as item, i (i)}
			{@render sizer(label(item))}
		{/each}
	</div>
{/if}

<div
	class="wheel"
	bind:this={scrollEl}
	style:height="{height}px"
	style:padding-block="{pad}px"
	onscroll={onScroll}
>
	{#each items as item, i (i)}
		<button
			type="button"
			class="wrow"
			data-wheel-row
			style:height="{rowHeight}px"
			onclick={() => focus(i)}
		>
			{@render row(item, i, i === selected)}
		</button>
	{/each}
</div>

<style>
	.wsizer {
		visibility: hidden;
		height: 0;
		overflow: hidden;
	}
	.wheel {
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		scroll-snap-type: y mandatory;
		scroll-behavior: smooth;
		scrollbar-width: none;
	}
	.wheel::-webkit-scrollbar {
		display: none;
	}
	.wrow {
		display: flex;
		align-items: center;
		width: 100%;
		text-align: left;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0;
		scroll-snap-align: center;
	}
</style>
