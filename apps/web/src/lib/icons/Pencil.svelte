<script lang="ts">
	// The "rename this" mark, drawn small enough to sit at the end of a line of text without becoming
	// part of it.
	interface Props {
		size?: number;
	}
	let { size = 12 }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d="M11.2 2.6a1.7 1.7 0 0 1 2.4 2.4L5.7 12.9l-3.2.8.8-3.2z" />
	<path d="M10.2 3.6l2.2 2.2" />
</svg>
