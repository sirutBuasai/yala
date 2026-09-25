<script lang="ts">
	// A row's metadata column between the main cell and the amount: an account, a category, a bill.
	let { text }: { text: string } = $props();
</script>

<span class="col">{text}</span>

<style>
	.col {
		color: var(--ink-2);
		font-size: var(--text-caption);
		white-space: nowrap;
	}
</style>
