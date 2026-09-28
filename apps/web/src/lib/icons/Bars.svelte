<script lang="ts">
	import Icon from './Icon.svelte';

	let { size = 16 }: { size?: number } = $props();
</script>

<Icon {size} weight={1.4}>
	<path d="M3 14V8M7 14V3M11 14V6M14 14H2" />
</Icon>
