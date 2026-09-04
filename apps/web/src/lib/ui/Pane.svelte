<script lang="ts">
	// The universal dashboard card: title + subtitle + a body slot for any Figure. What
	// differs between a stat and a chart lives in the body, not the card.
	import type { Snippet } from 'svelte';
	interface Props {
		title?: string;
		cap?: string;
		/** Controls rendered at the top-right of the header, level with the title/cap. */
		actions?: Snippet;
		/** 'attention' tints the border in the warning accent — the pane holds something waiting on
		    you. A prop rather than each caller reaching into `.card` with :global(). */
		tone?: 'default' | 'attention';
		children: Snippet;
	}
	let { title, cap, actions, tone = 'default', children }: Props = $props();
</script>

<section class="card" class:attention={tone === 'attention'}>
	{#if title || cap || actions}
		<header class="head" class:has-cap={!!cap}>
			<div class="titles">
				{#if title}<h2 class="serif">{title}</h2>{/if}
				{#if cap}<p class="cap">{cap}</p>{/if}
			</div>
			{#if actions}<div class="actions">{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class="body">{@render children()}</div>
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
	.body {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
</style>
