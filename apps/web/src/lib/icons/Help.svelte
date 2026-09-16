<script lang="ts">
	// A question mark in a ring, drawn rather than typed: the "?" glyph carries the text font's own weight and
	// side bearings, so it never centred in a ring nor matched the other icons' stroke.
	import Icon from './Icon.svelte';

	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();
</script>

<Icon {size} weight={1.5}>
	<circle cx="8" cy="8" r="6.25" />
	<!-- The hook and the dot are separate marks so the stem's gap survives at icon sizes. -->
	<path d="M6.15 6.05a1.9 1.9 0 1 1 2.75 1.72c-.55.32-.9.7-.9 1.28v.35" />
	<circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
</Icon>
