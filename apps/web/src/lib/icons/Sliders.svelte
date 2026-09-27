<script lang="ts">
	// Two sliders. Marks Manage.
	import Icon from './Icon.svelte';

	let { size = 16 }: { size?: number } = $props();
</script>

<Icon {size} weight={1.4}>
	<path d="M2 4h7M12 4h2M2 12h2M7 12h7" />
	<circle cx="10.5" cy="4" r="1.6" />
	<circle cx="5.5" cy="12" r="1.6" />
</Icon>
