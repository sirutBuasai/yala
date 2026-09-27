<script lang="ts">
	// A native `<dialog>` via `showModal()`, so the top layer, scrim, Esc and focus restoration are the
	// platform's. Transitions are CSS, since Svelte can't reach a `::backdrop`.
	import type { Snippet } from 'svelte';
	import { modal } from './modal';
	import { dur } from '$lib/utils/motion';

	interface Props {
		title: string;
		onclose: () => void;
		/** Tints the header into a full-bleed band in this accent color (band fill + border). */
		accent?: string;
		/** Kicker text color; use a mode-aware `-text` accent so it stays legible on the light band. */
		accentText?: string;
		/** Small uppercase label above the title. */
		kicker?: string;
		/** A line under the title saying what the panel is for. */
		caption?: string;
		/** Room for two columns of content side by side — controls beside what they drive. */
		wide?: boolean;
		/** The children scroll their own regions, and the body fills the panel and clips. */
		paned?: boolean;
		/** Extra header content below the title row, inside the band. */
		controls?: Snippet;
		children: Snippet;
	}
	let {
		title,
		onclose,
		accent,
		accentText,
		kicker,
		caption,
		wide = false,
		paned = false,
		controls,
		children
	}: Props = $props();

	/** Matches the panel's own exit transition below. */
	const EXIT_MS = 170;
</script>

<dialog
	class="sheet"
	aria-labelledby="overlay-title"
	use:modal={{ onclose, closeMs: dur(EXIT_MS) }}
>
	<div class="panel" class:wide>
		<div
			class="head"
			class:tinted={accent}
			style={accent ? `--accent: ${accent}; --accent-text: ${accentText ?? accent}` : undefined}
		>
			<div class="titlerow">
				<div class="titles">
					{#if kicker}<span class="kicker">{kicker}</span>{/if}
					<h2 id="overlay-title" class="serif">{title}</h2>
					{#if caption}<p class="cap">{caption}</p>{/if}
				</div>
				<!-- data-dismiss keeps focus off "close" on open (see overlay/modal); the label gives it a
				     spoken name, since "✕" alone is not one. -->
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
		<div class="body" class:scroller={!paned} class:trap={!paned} class:paned>
			{@render children()}
		</div>
	</div>
</dialog>

<style>
	/* Anchored to the top so content loading in grows downward instead of re-centring and jumping. The
	   dialog's own reset and scrim are the shared `.sheet` (app.css). */
	.sheet {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 6vh var(--space-11) var(--space-11);
	}

	/* Shrinks to fit narrow screens; content shrinks with it, so it never needs a horizontal scroll. */
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-modal);
		width: min(760px, 100%);
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		/* Clip the full-bleed header band to the panel's rounded corners; the body owns scrolling. */
		overflow: hidden;
		transition:
			opacity 170ms,
			translate 170ms;
	}
	/* Two columns of content need room for both; below that the panel is already full-width and the
	   content itself falls back to one column. */
	.wide {
		width: min(1180px, 100%);
	}
	/* One pair of offsets for both directions, so opening and closing are the same movement reversed. */
	@starting-style {
		.sheet[open] .panel {
			opacity: 0;
			translate: 0 10px;
		}
	}
	.sheet:global(.closing) .panel {
		opacity: 0;
		translate: 0 10px;
	}

	.head {
		flex-shrink: 0;
		padding: var(--space-8) var(--space-11);
	}
	.head.tinted {
		background: color-mix(
			in srgb,
			oklch(from var(--accent) var(--wash-lightness) c h) calc(14% * var(--wash-scale)),
			var(--surface)
		);
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
	.head .cap {
		margin: var(--space-1) 0 0;
		font-size: var(--text-caption);
		color: var(--ink-3);
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
	/* `min-height: 0` is load-bearing: without it the flex child won't shrink, and the panel grows past
	   `max-height` instead of the pane scrolling. */
	.body.paned {
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
		/* A grid row: the body's height is flex-resolved, so a `height: 100%` child fell back to auto and grew. */
		display: grid;
		grid-template-rows: minmax(0, 1fr);
	}
</style>
