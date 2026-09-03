<script lang="ts">
	// The one empty-state line, shared by every pane / chart so the wording style stays identical
	// wherever a section has nothing to show. The message itself is supplied by the caller; the
	// voice is the app's shared `.cap` (see app.css), which every supporting line uses.
	import type { Snippet } from 'svelte';
	interface Props {
		children: Snippet;
	}
	let { children }: Props = $props();
</script>

<p class="cap">{@render children()}</p>
