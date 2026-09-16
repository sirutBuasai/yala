<script lang="ts">
	// A help mark beside a control that reveals how its figure is worked out. Hovering previews it; clicking
	// PINS it open so the text can be read and selected without keeping the pointer still.
	//
	// The text is real DOM content the button points at with `aria-describedby`: a pointer-only tooltip puts the
	// arithmetic out of reach of a keyboard or a screen reader.
	import type { Snippet } from 'svelte';
	import Help from '$lib/icons/Help.svelte';

	interface Props {
		/** What the hint is about, so the button has a spoken name of its own. */
		label: string;
		children: Snippet;
	}
	let { label, children }: Props = $props();

	const id = $props.id();
	let pinned = $state(false);
	let hovering = $state(false);
	const open = $derived(pinned || hovering);

	let root = $state<HTMLElement>();
	let bubble = $state<HTMLElement>();
	/** Viewport coordinates, because the bubble is positioned `fixed`. Null until measured. */
	let at = $state<{ left: number; top: number } | null>(null);

	/**
	 * Placed against the viewport rather than the mark it belongs to: an absolutely-positioned bubble is clipped
	 * by any scrolling ancestor, and these sit inside a pane that scrolls. Alignment is measured rather than
	 * decided by column, since the column count moves with the panel's width.
	 */
	function place() {
		if (!root || !bubble) return;

		const mark = root.getBoundingClientRect();
		const width = bubble.offsetWidth;
		// The dialog clips before the viewport does; fall back to the page when there is no dialog.
		const host = (
			root.closest('[role="dialog"]') ?? document.documentElement
		).getBoundingClientRect();

		let left = mark.left - 8;
		if (left + width > host.right - 8) left = Math.max(host.left + 8, mark.right + 8 - width);
		at = { left, top: mark.bottom + 6 };
	}

	// Re-placed on scroll and resize: a pinned hint whose pane scrolls underneath it would otherwise drift
	// away from the control it is describing. Capture phase, since the scroll happens on an ancestor.
	$effect(() => {
		if (!open) {
			at = null;
			return;
		}

		// After layout, so the bubble has a width to measure.
		const frame = requestAnimationFrame(place);
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		};
	});

	// A press outside puts a pinned hint away. Captured on the window rather than via a blur, so
	// selecting the text inside the bubble does not dismiss the thing being read.
	$effect(() => {
		if (!pinned) return;

		const away = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node) && bubble && !bubble.contains(e.target as Node))
				pinned = false;
		};
		// Deferred a frame: the click that pinned it is still propagating, and would close it at once.
		const id = requestAnimationFrame(() => window.addEventListener('pointerdown', away));
		return () => {
			cancelAnimationFrame(id);
			window.removeEventListener('pointerdown', away);
		};
	});
</script>

<span
	class="hint"
	bind:this={root}
	onmouseenter={() => (hovering = true)}
	onmouseleave={() => (hovering = false)}
	role="presentation"
>
	<button
		type="button"
		class="dot"
		class:pinned
		aria-label={`How ${label} is calculated`}
		aria-describedby={id}
		aria-expanded={open}
		onfocus={() => (hovering = true)}
		onblur={() => (hovering = false)}
		onclick={() => (pinned = !pinned)}
	>
		<Help />
	</button>
	<!-- Present whether or not it is shown, so `aria-describedby` always resolves; `inert` keeps the
	     hidden copy off the tab order and out of a find-in-page. -->
	<span
		{id}
		bind:this={bubble}
		class="bubble"
		class:open
		class:pinned
		style:left={at ? `${at.left}px` : undefined}
		style:top={at ? `${at.top}px` : undefined}
		inert={!open || undefined}>{@render children()}</span
	>
</span>

<style>
	/* Not `.wrap`: that is the app's page shell (see app.css), and borrowing the name inherited its page
	   padding. */
	.hint {
		position: relative;
		display: inline-flex;
		vertical-align: text-bottom;
	}
	.dot {
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink-3);
		cursor: help;
	}
	.dot:hover,
	.dot:focus-visible,
	.dot.pinned {
		color: var(--control-line);
	}
	/* `fixed`, so no scrolling ancestor can clip it; `place()` supplies the coordinates. */
	.bubble {
		position: fixed;
		z-index: 60;
		width: max-content;
		max-width: 22rem;
		padding: var(--space-5) var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		box-shadow: var(--shadow);
		color: var(--ink-2);
		font-size: var(--text-caption);
		font-weight: var(--fw-regular);
		text-transform: none;
		letter-spacing: normal;
		line-height: var(--lh-body);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.09s;
	}
	/* Only once `place()` has given it coordinates, so it never flashes in the viewport's corner. */
	.bubble.open[style*='left'] {
		opacity: 1;
	}
	/* Only a pinned bubble takes the pointer: a hovered one must not swallow a press meant for the
	   control it is covering. */
	.bubble.pinned {
		pointer-events: auto;
		user-select: text;
		border-color: var(--control-line);
	}
	.bubble :global(b) {
		display: block;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		margin: var(--space-3) 0 var(--space-2);
	}
	.bubble :global(b:first-child) {
		margin-top: 0;
	}
</style>
