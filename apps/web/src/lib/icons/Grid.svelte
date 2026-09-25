<script lang="ts">
	// Four tiles. Marks the Dashboard.
	import Icon from './Icon.svelte';

	let { size = 16 }: { size?: number } = $props();
</script>

<Icon {size} weight={1.4}>
	<rect x="2" y="2" width="5" height="5" rx="1" />
	<rect x="9" y="2" width="5" height="5" rx="1" />
	<rect x="2" y="9" width="5" height="5" rx="1" />
	<rect x="9" y="9" width="5" height="5" rx="1" />
</Icon>
