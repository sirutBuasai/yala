<script lang="ts">
	// Two-step destructive action: the first click arms an inline confirmation so a
	// delete never fires on a single misclick.
	interface Props {
		label: string;
		question: string;
		ondelete: () => void;
		/** Called when the user backs out of the confirmation, e.g. to clear a prior delete error. */
		oncancel?: () => void;
		/** The confirm-button text (default "Yes, delete") for non-delete destructive actions. */
		confirmLabel?: string;
	}
	let { label, question, ondelete, oncancel, confirmLabel = 'Yes, delete' }: Props = $props();

	let confirming = $state(false);
	let confirmEl = $state<HTMLButtonElement>();

	// Move focus onto the confirm button as soon as the question appears, so a keyboard user lands on
	// the decision instead of having to hunt for where the buttons went.
	$effect(() => {
		if (confirming) confirmEl?.focus();
	});

	function cancel() {
		confirming = false;
		oncancel?.();
	}
</script>

{#if confirming}
	<div class="confirm">
		<!-- role="status" so the question is spoken when it appears; without it, arming the confirm was
		     silent and the buttons simply changed underneath a screen-reader user. -->
		<span class="confirm-q" role="status">{question}</span>
		<button type="button" class="btn-danger" bind:this={confirmEl} onclick={ondelete}
			>{confirmLabel}</button
		>
		<button type="button" class="btn-cancel" onclick={cancel}>Cancel</button>
	</div>
{:else}
	<!-- Quiet until armed: this button only OFFERS to delete (see .btn-danger-quiet). -->
	<button
		type="button"
		class="btn-danger-quiet"
		aria-expanded={confirming}
		onclick={() => (confirming = true)}>{label}</button
	>
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
