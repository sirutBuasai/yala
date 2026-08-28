<script lang="ts">
	// Two vertical arrows pointing opposite ways (↑↓) — a value moving between two places, e.g. a
	// bill pay / transfer between accounts. Stroke on currentColor so it inherits its context's accent.
	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	<path
		d="M5.5 12V4M3.5 6 5.5 4 7.5 6M10.5 4v8M8.5 10 10.5 12 12.5 10"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
