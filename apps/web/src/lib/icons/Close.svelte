<script lang="ts">
	// A dismissal cross. Drawn rather than a text "✕", which never centres in a button.
	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	<path
		d="M4 4l8 8M12 4l-8 8"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
	/>
</svg>
