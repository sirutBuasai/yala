<script lang="ts">
	// A filled circle: a row's category, a day's categories. SVG, so it stays round at any position.
	let { color, size = 8 }: { color: string; size?: number } = $props();
</script>

<svg class="dot" width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
	<circle cx="5" cy="5" r="5" style:fill={color} />
</svg>

<style>
	.dot {
		display: block;
		flex: none;
	}
</style>
