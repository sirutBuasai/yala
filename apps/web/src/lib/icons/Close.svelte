<script lang="ts">
	// A dismissal cross. One source of truth for the glyph, so every close button matches — and so
	// none of them is a text "✕", which never centres in a button the way a drawn glyph does.
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
