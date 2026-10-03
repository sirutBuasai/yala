<script module lang="ts">
	/** What a row's main cell says, whatever kind of entry it is. */
	export interface RowHead {
		title: string;
		pending?: boolean;
		/** The smaller line under the title. */
		sub?: string;
		/** Re-derived by the ledger, so it offers no marks. */
		fixed?: boolean;
	}
</script>

<script lang="ts">
	// A row's main cell: the title, a pending badge, the row's marks, and the line under them. Laid out as areas
	// rather than nested lines, so a narrow list can drop the marks down beside the lower line.
	import type { Snippet } from 'svelte';
	import Badge from '$lib/ui/Badge.svelte';

	interface Props {
		head: RowHead;
		/** Prefix of the ids a clickable row names itself by; see RowList. */
		labelId: string;
		marks?: Snippet;
	}
	let { head, labelId, marks }: Props = $props();
</script>

<span class="main">
	<span class="text" id="{labelId}-t">
		<span class="title">{head.title}</span>
		{#if head.pending}<Badge tone="warn" dot><span class="word">pending</span></Badge>{/if}
	</span>
	{#if marks}<span class="marks">{@render marks()}</span>{/if}
	{#if head.sub}<span class="sub" id="{labelId}-s">{head.sub}</span>{/if}
</span>

<style>
	/* Bug: a full-length title floored the cell, and with the marks beside it the row ran its amount past the
	   pane's edge. The title now gives way to an ellipsis before the amount does; `auto` keeps its min-width
	   in the cell's floor, so the badge never lands on it. */
	.main {
		display: grid;
		grid-template-columns: minmax(auto, max-content) max-content max-content;
		grid-template-areas: 't b m' 's s s';
		column-gap: var(--space-3);
		align-items: center;
		justify-content: start;
		min-width: 0;
	}
	.text {
		display: contents;
	}
	.title {
		grid-area: t;
		min-width: 4em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-row);
		font-weight: var(--fw-medium);
	}
	.text :global(.badge) {
		grid-area: b;
		justify-self: start;
	}
	.marks {
		grid-area: m;
	}
	.sub {
		grid-area: s;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink-3);
		font-size: var(--text-badge);
	}
	/* Narrow, where date, title line, marks and amount stop fitting side by side: the badge keeps its dot but
	   not its word, and the marks move down beside the lower line. The word stays for screen readers. */
	@container (max-width: 23rem) {
		.main {
			grid-template-columns: minmax(auto, 1fr) max-content;
			grid-template-areas: 't b' 's m';
		}
		.title {
			min-width: 3em;
		}
		.word {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
	}
</style>
