<script lang="ts">
	import Icon from './Icon.svelte';

	let { size = 16 }: { size?: number } = $props();
</script>

<Icon {size} weight={1.4}>
	<path d="M3 14V2M3 3h9l-2 3 2 3H3" />
</Icon>
