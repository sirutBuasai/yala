<script lang="ts">
	// A legend key: a rounded square for a filled mark, or a dashed rule for a dashed line.
	let { color, dashed = false }: { color: string; dashed?: boolean } = $props();
</script>

{#if dashed}
	<svg class="sw" width="16" height="3" viewBox="0 0 16 3" aria-hidden="true">
		<line x1="0" y1="1.5" x2="16" y2="1.5" stroke-dasharray="4 3" style:stroke={color} />
	</svg>
{:else}
	<svg class="sw" width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
		<rect width="11" height="11" rx="3" style:fill={color} />
	</svg>
{/if}

<style>
	.sw {
		display: block;
		flex: none;
	}
	line {
		stroke-width: 3;
	}
</style>
