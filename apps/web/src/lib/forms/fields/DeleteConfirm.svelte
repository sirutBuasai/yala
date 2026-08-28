<script lang="ts">
	// Two-step destructive action: the first click arms an inline confirmation so a
	// delete never fires on a single misclick.
	interface Props {
		label: string;
		question: string;
		ondelete: () => void;
		/** Called when the user backs out of the confirmation, e.g. to clear a prior delete error. */
		oncancel?: () => void;
	}
	let { label, question, ondelete, oncancel }: Props = $props();

	let confirming = $state(false);

	function cancel() {
		confirming = false;
		oncancel?.();
	}
</script>

{#if confirming}
	<div class="confirm">
		<span class="confirm-q">{question}</span>
		<button type="button" class="btn-danger" onclick={ondelete}>Yes, delete</button>
		<button type="button" class="btn-cancel" onclick={cancel}>Cancel</button>
	</div>
{:else}
	<button type="button" class="btn-danger" onclick={() => (confirming = true)}>{label}</button>
{/if}

<style>
	.confirm {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: var(--gap-row);
	}
	.confirm-q {
		font-size: var(--text-secondary);
		color: var(--crit-text);
	}
</style>
