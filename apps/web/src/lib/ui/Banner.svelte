<script lang="ts">
	// A page-level notice — loading, an error, or a standing note — as one component so the three
	// can't drift on padding, tone or how they're announced.
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
	/* Chrome comes from the shared `.banner`; local rules only make room for the dismiss button. */
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
