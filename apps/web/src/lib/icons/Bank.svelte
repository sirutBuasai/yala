<script lang="ts">
	// A columned building. Marks Accounts.
	import Icon from './Icon.svelte';

	let { size = 16 }: { size?: number } = $props();
</script>

<Icon {size} weight={1.4}>
	<path d="M2 6l6-4 6 4M3.5 7v5.5M6.5 7v5.5M9.5 7v5.5M12.5 7v5.5M2 14h12" />
</Icon>
