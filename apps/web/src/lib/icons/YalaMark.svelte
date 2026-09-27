<script lang="ts">
	// The app's mark, drawn from the theme's tokens so it follows light and dark. The favicon is the same
	// shape fixed to the dark palette, since a browser tab cannot read the app's theme.
	let { size = 20 }: { size?: number } = $props();
</script>

<svg class="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
	<rect x="1" y="1" width="30" height="30" rx="8" />
	<circle cx="16" cy="16" r="7" />
</svg>

<style>
	rect {
		fill: var(--bg);
		stroke: var(--border);
		stroke-width: 2;
	}
	circle {
		fill: var(--lav);
	}
</style>
