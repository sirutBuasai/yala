<script lang="ts">
	// A labeled group inside an add/edit form: an uppercase section label over its fields, with a
	// divider between sections. Shared by the transaction / paycheck / bill-pay forms.
	import type { Snippet } from 'svelte';
	interface Props {
		label: string;
		children: Snippet;
	}
	let { label, children }: Props = $props();
</script>

<section class="sec">
	<div class="seclabel">{label}</div>
	{@render children()}
</section>

<style>
	.sec {
		padding: var(--space-7) 0;
		border-top: 1px solid var(--border);
	}
	.sec:first-child {
		border-top: 0;
		padding-top: 0;
	}
	.seclabel {
		margin-bottom: var(--space-6);
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wider);
		color: var(--ink-2);
		font-weight: var(--fw-semibold);
	}
</style>
