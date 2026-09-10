<script lang="ts">
	// The universal dashboard card: title + subtitle + a body slot for any figure, list or form.
	// Deliberately grid-agnostic — it knows nothing about placement or units, so `grid/Pane`,
	// overlays and rails can all compose it.
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		/** A tally rendered beside the title. */
		count?: number;
		caption?: string;
		/** Controls at the top-right of the header, level with the title/caption. */
		actions?: Snippet;
		tone?: 'default' | 'attention';
		/** 'figure' is a dashboard pane; 'panel' is a form block. */
		density?: 'figure' | 'panel';
		/** Scroll the body once its content overruns the card. Set by whatever owns the height. */
		scroll?: boolean;
		/** The card element, for a caller that must measure it (see `grid/Pane`). */
		card?: HTMLElement;
		/** The body element, likewise — `grid/spill.ts` measures inside it. */
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
	/* The actions' bottom margin must match the last title line's trailing margin, so flex-end
	   lands them on that line's baseline. */
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
	/* Actions wrap under the title rather than squeezing it in a narrow pane. */
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
	/* Bug: a `.bleed-x` child inside a padded scroll body overflows horizontally — the scroller
	   clipped the bleed and the resize probe read the overflow as a spill, refusing every attempt to
	   narrow the pane. Trading the inset for padding keeps the bled child flush and nothing
	   overflows; overflow-x stays hidden against sub-pixel scrollbars. */
	.body.scroller {
		margin-inline: calc(-1 * var(--pad-card-x));
		padding-inline: var(--pad-card-x);
		overflow-x: hidden;
	}
	/* Panel rhythm comes from a flex gap, not the browser's default <p> margins, so every panel
	   spaces the same way whatever its children are. */
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
