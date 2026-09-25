<script lang="ts">
	// The wordmark and the snapshot caption, shown at the top of the sidebar or of the folded header.
	import { data, live } from '$lib/data/load';
	import { yearSpan } from '$lib/utils/format';
</script>

<div class="brandline">
	<a href="/" class="brand">
		<span class="dot"></span>
		<h1 class="serif">Yala</h1>
	</a>
	<span class="cap">
		{#if $data}
			{$live ? 'live' : 'snapshot'} ·
			{$data.meta.transaction_count.toLocaleString()} txns ·
			{yearSpan($data.meta.years)}
		{:else}
			personal finance
		{/if}
	</span>
</div>

<style>
	.brandline {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: var(--gap-field);
		text-decoration: none;
		color: inherit;
		cursor: pointer;
	}
	.brand:hover h1 {
		color: var(--lav-text);
	}
	.brand h1 {
		font-size: var(--text-brand);
		margin: 0;
		font-weight: var(--fw-semibold);
		letter-spacing: var(--ls-tight);
	}
	.brand .dot {
		width: 9px;
		height: 9px;
		border-radius: var(--radius-pill);
		background: var(--lav);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--lav) 20%, transparent);
		align-self: center;
	}
</style>
