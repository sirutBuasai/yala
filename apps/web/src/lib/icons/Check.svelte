<script lang="ts">
	// A tick, settling a pending entry.
	import Icon from './Icon.svelte';

	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();
</script>

<Icon {size}>
	<path d="M3.5 8.5l3 3 6-7" />
</Icon>
