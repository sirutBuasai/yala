<script lang="ts">
	// The one empty-state line, shared by every pane / chart so the wording style stays identical
	// wherever a section has nothing to show. The message itself is supplied by the caller.
	import type { Snippet } from 'svelte';
	interface Props {
		children: Snippet;
	}
	let { children }: Props = $props();
</script>

<p class="empty">{@render children()}</p>

<style>
	.empty {
		margin: 0;
		color: var(--ink-3);
		font-size: var(--text-secondary);
	}
</style>
