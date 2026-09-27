<script lang="ts">
	// A paycheck row's main cell: the payee alone, since its figures sit in their own column.
	let { p }: { p: { payee: string } } = $props();
</script>

<span class="title">{p.payee}</span>

<style>
	.title {
		font-size: var(--text-row);
		font-weight: var(--fw-medium);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
