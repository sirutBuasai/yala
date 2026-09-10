<script lang="ts">
	// The one empty-state line. The caller supplies the message; the voice is the shared `.cap`.
	import type { Snippet } from 'svelte';
	interface Props {
		children: Snippet;
	}
	let { children }: Props = $props();
</script>

<p class="cap">{@render children()}</p>
