<script lang="ts">
	// The per-tab header: a serif title with optional trailing content (a subtitle, month
	// stepper, year stepper, …). Shared by every view so the title size and row layout live
	// in one place.
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		children?: Snippet;
	}
	let { title, children }: Props = $props();
</script>

<div class="viewhead">
	<h2 class="serif">{title}</h2>
	{@render children?.()}
</div>

<style>
	.viewhead {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}
	.viewhead h2 {
		font-size: 22px;
		font-weight: 600;
		margin: 0;
	}
</style>
