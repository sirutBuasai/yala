<script lang="ts">
	// The universal dashboard card: title + subtitle + a body slot for any figure, list or form.
	// What differs between a stat, a chart and a settings form lives in the body, not the card.
	//
	// Deliberately GRID-AGNOSTIC. It knows nothing about placement, arranging or units — which is
	// exactly what lets the folded layout reuse it unchanged, and what lets an overlay or a rail use
	// one outside a board. `grid/Pane` composes it; the two are separate for that reason.
	//
	// `density="panel"` is the quieter variant that used to be a second component (`ui/Panel`): a
	// smaller sans heading and a tighter box, for a column of forms rather than a dashboard figure.
	// A modifier rather than a sibling, so the two can never drift on surface, border or elevation.
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		/** A tally beside the title — "Existing categories 11". */
		count?: number;
		caption?: string;
		/** Controls at the top-right of the header, level with the title/caption. */
		actions?: Snippet;
		/** 'attention' tints the border in the warning accent — the pane holds something waiting on
		    you. A prop rather than each caller reaching into `.card` with :global(). */
		tone?: 'default' | 'attention';
		/** 'figure' is a dashboard pane; 'panel' is a form block. */
		density?: 'figure' | 'panel';
		/** Scroll the body once its content overruns the card. Set by whatever owns the height. */
		scroll?: boolean;
		/** The card element, for a caller that must measure it (see `grid/Pane`). */
		card?: HTMLElement;
		/** The body element, likewise. Handed out rather than left to be found by its class: the
		    measurement (see `grid/spill.ts`) reaches inside the body, and which class the card wraps its
		    children in is the card's business alone. */
		body?: HTMLElement;
		children: Snippet;
	}
	let {
		title,
		count,
		caption,
		actions,
		tone = 'default',
		density = 'figure',
		scroll = false,
		card = $bindable(),
		body = $bindable(),
		children
	}: Props = $props();
</script>

<section
	class="card"
	class:compact={density === 'panel'}
	class:panel={density === 'panel'}
	class:attention={tone === 'attention'}
	bind:this={card}
>
	{#if title || caption || actions}
		<header class="head" class:has-cap={!!caption}>
			<div class="titles">
				{#if title}
					{#if density === 'panel'}
						<h3>
							{title}{#if count !== undefined}&nbsp;<span class="count">{count}</span>{/if}
						</h3>
					{:else}
						<h2 class="serif">
							{title}{#if count !== undefined}&nbsp;<span class="count">{count}</span>{/if}
						</h2>
					{/if}
				{/if}
				{#if caption}<p class="cap">{caption}</p>{/if}
			</div>
			{#if actions}<div class="actions">{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class="body" class:scroller={scroll} bind:this={body}>{@render children()}</div>
</section>

<style>
	/* Flex column so a chart in the body can grow to fill a stretched pane's height. */
	.card {
		display: flex;
		flex-direction: column;
	}
	/* Title/cap on the left, optional controls on the right. Title/cap element margins are left
	   untouched so every pane keeps its original spacing; flex-end plus an actions bottom margin
	   matching the last line's trailing margin lifts the actions onto that line's baseline —
	   the cap's --space-7 when a cap is present, else the title's --space-1. */
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--gap-field);
		flex: none;
	}
	.titles {
		min-width: 0;
	}
	/* The actions drop under the title rather than squeezing it — a sort menu plus an Add button
	   needs more room than a narrow pane's header has left. */
	.actions {
		flex: none;
		margin-bottom: var(--space-1);
	}
	.head.has-cap .actions {
		margin-bottom: var(--space-7);
	}
	.count {
		color: var(--ink-3);
		font-weight: var(--fw-medium);
	}
	.body {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	/* A scrolling body has to REACH the card's edges, and this is not cosmetic. A list inside pulls out
	   by --pad-card-x (`.bleed-x`) so its hover runs edge to edge; against a body inset by the card's
	   padding that overhang is 20px of horizontal overflow, which a scroll container then clips — the
	   bleed disappears — and which the resize probe reads as the content spilling, so every attempt to
	   narrow the pane was refused. Pushing the body out to the card's padding box and putting the inset
	   back as padding leaves the bled child flush with it: nothing overflows, nothing is clipped.
	   overflow-x stays hidden so a stray sub-pixel can't raise a horizontal scrollbar. */
	.body.scroller {
		margin-inline: calc(-1 * var(--pad-card-x));
		padding-inline: var(--pad-card-x);
		overflow-x: hidden;
	}
	/* The panel voice: the vertical rhythm comes from a flex gap rather than the browser's default
	   <p> margins, which is why every panel spaces the same way whatever its children are. */
	.panel > .body {
		gap: var(--gap-row);
	}
	.panel h3 {
		margin: 0;
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		color: var(--ink);
	}
	.panel .head {
		margin-bottom: var(--gap-row);
	}
	.panel .head .cap {
		margin-bottom: 0;
	}
</style>
