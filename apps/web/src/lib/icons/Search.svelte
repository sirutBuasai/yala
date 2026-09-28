<script lang="ts">
	// A magnifier, marking a field that finds rather than one that records.
	import Icon from './Icon.svelte';

	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();
</script>

<Icon {size}>
	<circle cx="7" cy="7" r="4.5" />
	<path d="M10.5 10.5 14 14" />
</Icon>
