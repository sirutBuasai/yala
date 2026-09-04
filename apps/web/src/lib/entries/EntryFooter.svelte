<script lang="ts">
	// Shared footer for the entry forms (transaction / paycheck / bill pay): a running summary on
	// the left, and on the right either an Add button (add mode) or Save + Delete (edit mode).
	import type { Snippet } from 'svelte';
	import DeleteConfirm from '$lib/ui/DeleteConfirm.svelte';

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
		msg = $bindable(),
		err = $bindable(),
		addLabel,
		deleteLabel,
		deleteQuestion,
		onsubmit,
		ondelete,
		summary
	}: Props = $props();

	// Backing out of a delete should also drop the error a failed delete left behind, so the footer
	// returns to its resting layout instead of staying widened by the message.
	function clearMessage() {
		msg = '';
		err = false;
	}
</script>

<div class="foot">
	<span class="summary"
		>{#if summary}{@render summary()}{/if}</span
	>
	<div class="right">
		<!-- Same roles SaveFeedback uses, so a validation failure is announced immediately and a
		     success politely — this message was previously silent to a screen reader, which meant a
		     rejected submit looked to them like a button that simply did nothing. -->
		{#if msg}<span class="edit-msg" class:err role={err ? 'alert' : 'status'}>{msg}</span>{/if}
		{#if editing}
			<div class="actions">
				<button class="btn-primary" onclick={onsubmit}>Save changes</button>
				<DeleteConfirm
					label={deleteLabel}
					question={deleteQuestion}
					{ondelete}
					oncancel={clearMessage}
				/>
			</div>
		{:else}
			<button class="btn-primary" onclick={onsubmit}>{addLabel}</button>
		{/if}
	</div>
</div>

<style>
	/* Wraps rather than squeezing: in a narrow overlay the summary drops above the buttons instead
	   of the two fighting over one line. */
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
