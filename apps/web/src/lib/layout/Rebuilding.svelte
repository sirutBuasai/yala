<script lang="ts">
	// Stands in for a page the redesign has not built yet (see docs/redesign). Deleted with the last one.
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Empty from '$lib/ui/Empty.svelte';

	let { title }: { title: string } = $props();
</script>

<ViewHeader {title} />
<Empty>This page is being rebuilt.</Empty>
