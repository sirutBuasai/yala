<script lang="ts">
	// Lines of a list. Marks Transactions.
	import Icon from './Icon.svelte';

	let { size = 16 }: { size?: number } = $props();
</script>

<Icon {size} weight={1.4}>
	<path d="M2 4h12M2 8h12M2 12h8" />
</Icon>
