<script lang="ts">
	// The universal dashboard card: title + subtitle + a body slot for any figure, list or form.
	// Deliberately grid-agnostic — it knows nothing about placement or units, so `grid/Pane`,
	// overlays and rails can all compose it.
	import type { Snippet } from 'svelte';
	import LabelLine from './LabelLine.svelte';
	import { DOT, labelText, type Label, type Slot } from './label';

	interface Props {
		title?: Label;
		/** A tally rendered beside the title. */
		count?: number;
		caption?: Label;
		/** Hook from whoever stores renames; absent leaves these labels the app's to name. Given only while
		    the board is being edited. */
		rename?: (slot: Slot, text: string) => void;
		/** These labels as the app declares them, for the editor to stand in where a rename emptied one. */
		shipped?: Partial<Record<Slot, Label>>;
		/** Controls at the top-right of the header, level with the title/caption. */
		actions?: Snippet;
		tone?: 'default' | 'attention';
		/** 'figure' is a dashboard pane; 'panel' is a form block. */
		density?: 'figure' | 'panel';
		/** Scroll the body once its content overruns the card. Set by whatever owns the height. */
		scroll?: boolean;
		/** The board is being edited: the card's own controls go out of reach, its labels stay live. */
		frozen?: boolean;
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
		rename,
		shipped,
		actions,
		tone = 'default',
		density = 'figure',
		scroll = false,
		frozen = false,
		card = $bindable(),
		body = $bindable(),
		children
	}: Props = $props();

	const heading = $derived(labelText(title));
	const sub = $derived(labelText(caption, DOT));
	// A card being renamed offers BOTH lines whatever they currently say: an empty one is where a caption
	// gets added, and a line the user emptied is how they get it back. Whoever supplies `rename` has
	// already decided this card is one we name at all.
	const naming = $derived(!!rename);
	// A card with no heading of its OWN keeps its labels in its body — a KPI card is sections, each titled.
	// Freezing that body took the pencils with it and the press fell through to the drag surface beneath,
	// so the click moved the pane. Such a body holds figures, never controls, so there is nothing to freeze.
	const freezeBody = $derived(frozen && !!heading);
</script>

<section
	class="card"
	class:compact={density === 'panel'}
	class:panel={density === 'panel'}
	class:attention={tone === 'attention'}
	bind:this={card}
>
	{#if heading || sub || actions || naming}
		<header class="head" class:has-cap={!!sub || naming}>
			<div class="titles">
				<!-- One level whatever the density: every card is a peer on its board, and picking the
				     heading level by how the card LOOKS puts two neighbours at different depths. -->
				{#if heading || naming}
					<h2 class:serif={density !== 'panel'}>
						<LabelLine
							label={title ?? {}}
							what="title"
							shipped={shipped?.title}
							onrename={rename && ((t) => rename('title', t))}
						>
							{#snippet after()}{#if count !== undefined}&nbsp;<span class="count">{count}</span
									>{/if}{/snippet}
						</LabelLine>
					</h2>
				{/if}
				{#if sub || naming}
					<p class="cap">
						<LabelLine
							label={caption ?? {}}
							what="caption"
							join={DOT}
							shipped={shipped?.caption}
							onrename={rename && ((t) => rename('caption', t))}
						/>
					</p>
				{/if}
			</div>
			<!-- Inert, not hidden: while the board is edited a press anywhere on the card belongs to the drag,
			     and these must not be tab stops either. -->
			{#if actions}<div class="actions" inert={frozen || undefined}>{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class="body" class:scroller={scroll} inert={freezeBody || undefined} bind:this={body}>
		{@render children()}
	</div>
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
	.panel h2 {
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
