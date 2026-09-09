<script lang="ts">
	// A page-level notice: loading, an error, or the standing "the local API isn't there" message.
	// One component so the three can't drift on padding, tone or how they're announced — and so the
	// dismissible one gets a drawn cross rather than a text glyph that never centres.
	import type { Snippet } from 'svelte';
	import Close from '$lib/icons/Close.svelte';

	interface Props {
		/** 'alert' is announced assertively (a failure); 'status' politely (progress, a standing note). */
		role?: 'status' | 'alert';
		/** Supply to make the banner dismissible. */
		onclose?: () => void;
		closeLabel?: string;
		children: Snippet;
	}
	let { role = 'status', onclose, closeLabel = 'Dismiss', children }: Props = $props();
</script>

<div class="banner" {role}>
	<div class="msg">{@render children()}</div>
	{#if onclose}
		<button class="iconbtn" type="button" aria-label={closeLabel} onclick={onclose}>
			<Close />
		</button>
	{/if}
</div>

<style>
	/* Chrome comes from the shared `.banner` in app.css; what's local is the row that makes room for
	   the dismiss button. */
	.banner {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--gap-field);
	}
	.msg {
		min-width: 0;
	}
</style>
