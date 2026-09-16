<script lang="ts">
	// A question mark in a ring, drawn rather than typed: the "?" glyph carries the text font's own
	// weight and side bearings, so beside a small-caps label it never centred and never matched the
	// other icons' stroke.
	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" />
	<!-- The hook, then the dot: two marks so the stem's gap reads at 14px. -->
	<path
		d="M6.15 6.05a1.9 1.9 0 1 1 2.75 1.72c-.55.32-.9.7-.9 1.28v.35"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
</svg>
