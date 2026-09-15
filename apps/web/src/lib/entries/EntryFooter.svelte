<script lang="ts">
	// Shared footer for the entry forms: a running summary left, and right either an Add button
	// (add mode) or Save + Delete (edit mode).
	import type { Snippet } from 'svelte';
	import { SAVE_CHANGES } from '$lib/copy';
	import DeleteConfirm from '$lib/ui/DeleteConfirm.svelte';
	import type { EntryMessage } from '$lib/entries/entryForm.svelte';

	interface Props {
		editing: boolean;
		/** The form's message strip, which is also where a cancelled delete clears its error. */
		message: EntryMessage;
		addLabel: string;
		onsubmit: () => void;
		/** Edit mode only: what the delete button says, asks, and does. */
		deleteLabel?: string;
		deleteQuestion?: string;
		ondelete?: () => void;
		/** Left-side running total, worded by the form that owns it. */
		summary?: Snippet;
	}
	let {
		editing,
		message,
		addLabel,
		onsubmit,
		deleteLabel = '',
		deleteQuestion = '',
		ondelete,
		summary
	}: Props = $props();
</script>

<div class="foot">
	<span class="summary"
		>{#if summary}{@render summary()}{/if}</span
	>
	<div class="right">
		<!-- Same roles SaveFeedback uses: while this message was silent, a rejected submit looked to a
		     screen-reader user like a button that did nothing. -->
		{#if message.text}<span
				class="edit-msg"
				class:err={message.failed}
				role={message.failed ? 'alert' : 'status'}>{message.text}</span
			>{/if}
		{#if editing}
			<div class="actions">
				<button class="btn-primary" onclick={onsubmit}>{SAVE_CHANGES}</button>
				<!-- Backing out also drops the error a failed delete left, so the footer returns to rest. -->
				<DeleteConfirm
					label={deleteLabel}
					question={deleteQuestion}
					ondelete={() => ondelete?.()}
					oncancel={() => message.clear()}
				/>
			</div>
		{:else}
			<button class="btn-primary" onclick={onsubmit}>{addLabel}</button>
		{/if}
	</div>
</div>

<style>
	/* Wraps rather than squeezing: in a narrow overlay the summary drops above the buttons. */
	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--gap-grid);
		margin-top: var(--space-8);
	}
	.right {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: flex-end;
		gap: var(--gap-grid);
		margin-inline-start: auto;
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--gap-row);
	}
</style>
