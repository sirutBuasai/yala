<script lang="ts">
	// A dismissible overlay panel over a backdrop. `variant` picks the presentation:
	// 'modal' floats near the top-center; 'drawer' slides in from the right edge. When `accent`
	// is set the header becomes a full-bleed tinted band (with an optional `kicker` and a
	// `controls` snippet, e.g. an entry-type switcher); the header stays fixed and the body scrolls.
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { focusTrap } from '$lib/utils/focusTrap';
	import { dur } from '$lib/utils/motion';

	interface Props {
		title: string;
		onclose: () => void;
		variant?: 'modal' | 'drawer';
		/** Tints the header into a full-bleed band in this accent color (band fill + border). */
		accent?: string;
		/** Kicker text color; use a mode-aware `-text` accent so it stays legible on the light band. */
		accentText?: string;
		/** Small uppercase label above the title (e.g. "New entry"). */
		kicker?: string;
		/** Extra header content below the title row, inside the band (e.g. a type switcher). */
		controls?: Snippet;
		children: Snippet;
	}
	let {
		title,
		onclose,
		variant = 'modal',
		accent,
		accentText,
		kicker,
		controls,
		children
	}: Props = $props();
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={onclose}
	transition:fade={{ duration: dur(150) }}
>
	<div
		class="panel {variant}"
		role="dialog"
		aria-modal="true"
		aria-labelledby="overlay-title"
		tabindex="-1"
		use:focusTrap
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && onclose()}
		transition:fly={variant === 'drawer'
			? { x: 480, duration: dur(220) }
			: { y: 10, duration: dur(170) }}
	>
		<div
			class="head"
			class:tinted={accent}
			style={accent ? `--accent: ${accent}; --accent-text: ${accentText ?? accent}` : undefined}
		>
			<div class="titlerow">
				<div class="titles">
					{#if kicker}<span class="kicker">{kicker}</span>{/if}
					<h2 id="overlay-title" class="serif">{title}</h2>
				</div>
				<!-- data-dismiss keeps the focus trap from opening on "close" (see focusTrap); the label
				     gives it a spoken name, since "✕" alone is not one. -->
				<button
					type="button"
					class="x"
					data-dismiss
					aria-label={`Close ${title.toLowerCase()}`}
					onclick={onclose}>✕</button
				>
			</div>
			{#if controls}
				<div class="controls">{@render controls()}</div>
			{/if}
		</div>
		<div class="body scroller trap">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 50;
	}
	.backdrop:has(.modal) {
		/* Anchor near the top so content that loads in (e.g. paycheck rows) grows downward
		   instead of re-centering and jumping. */
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 6vh 24px 24px;
	}
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		/* Clip the full-bleed header band to the panel's rounded corners; the body owns scrolling. */
		overflow: hidden;
	}
	/* Shrinks to fit narrow screens; content shrinks with it, so it never needs a horizontal scroll. */
	.modal {
		border-radius: var(--radius-xl);
		box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.6);
		width: min(760px, 100%);
		max-height: 88vh;
	}
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		height: 100%;
		width: min(680px, 100%);
		border-left: 1px solid var(--border);
		box-shadow: -18px 0 40px -20px rgba(0, 0, 0, 0.7);
	}
	.head {
		flex-shrink: 0;
		padding: var(--space-8) var(--space-11);
	}
	.head.tinted {
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
	}
	.titlerow {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.kicker {
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wider);
		color: var(--ink-3);
	}
	.head.tinted .kicker {
		color: var(--accent-text);
	}
	.head h2 {
		margin: 0;
		font-size: var(--text-dialog);
	}
	.controls {
		margin-top: var(--space-6);
	}
	.x {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: var(--radius-sm);
		padding: var(--pad-btn-sm);
		cursor: pointer;
	}
	.x:hover {
		border-color: var(--crit);
		color: var(--crit-text);
	}
	/* Scrolling, scroll containment and the slim scrollbar all come from the shared `.scroller`. */
	.body {
		padding: var(--space-10) var(--space-11);
	}
</style>
