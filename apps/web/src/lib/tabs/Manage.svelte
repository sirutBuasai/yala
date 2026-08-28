<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();
</script>

<ViewHeader title="Manage" />
