<script lang="ts">
	// Shared footer for the entry forms (transaction / paycheck / bill pay): a running summary on
	// the left, and on the right either an Add button (add mode) or Save + Delete (edit mode).
	import type { Snippet } from 'svelte';
	import DeleteConfirm from '$lib/forms/DeleteConfirm.svelte';

	interface Props {
		editing: boolean;
		msg: string;
		err: boolean;
		addLabel: string;
		deleteLabel: string;
		deleteQuestion: string;
		onsubmit: () => void;
		ondelete: () => void;
		/** Left-side running total (e.g. "Your share", "Take-home", "Moves"). */
		summary?: Snippet;
	}
	let {
		editing,
		msg,
		err,
		addLabel,
		deleteLabel,
		deleteQuestion,
		onsubmit,
		ondelete,
		summary
	}: Props = $props();
</script>

<div class="foot">
	<span class="summary"
		>{#if summary}{@render summary()}{/if}</span
	>
	<div class="right">
		{#if msg}<span class="edit-msg" class:err>{msg}</span>{/if}
		{#if editing}
			<div class="actions">
				<button class="btn-primary" onclick={onsubmit}>Save changes</button>
				<DeleteConfirm label={deleteLabel} question={deleteQuestion} {ondelete} />
			</div>
		{:else}
			<button class="btn-primary" onclick={onsubmit}>{addLabel}</button>
		{/if}
	</div>
</div>

<style>
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--gap-grid);
		margin-top: var(--space-8);
	}
	.right {
		display: flex;
		align-items: flex-start;
		gap: var(--gap-grid);
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--gap-row);
	}
</style>
