<script lang="ts">
	// A managed item that hides its controls until asked: name, an optional chip, and a Manage/Done
	// toggle opening a drawer underneath. Keeping the controls closed is the point — a long column of
	// open drawers is unreadable and makes the destructive action as prominent as the safe one.
	import type { Snippet } from 'svelte';

	interface Props {
		/** The item's display name. */
		name: string;
		/** Small chip beside the name — a state worth seeing without opening the drawer. */
		chip?: Snippet;
		/** Error from the last action, shown at the foot of the open drawer. */
		error?: string;
		/** Verb on the closed toggle, named by the caller. Closing always says Done. */
		action?: string;
		/** Fired when the drawer opens, for a row whose controls need loading first. Deliberately not
		    on close: backing out shouldn't fetch anything. */
		onopen?: () => void;
		/** The controls, revealed when open. */
		children: Snippet;
	}
	let { name, chip, error, action = 'Manage', onopen, children }: Props = $props();

	let open = $state(false);

	function toggle() {
		open = !open;
		if (open) onopen?.();
	}
</script>

<li>
	<div class="head">
		<span class="name" title={name}>{name}</span>
		{#if chip}{@render chip()}{/if}
		<button type="button" class="btn-mini" aria-expanded={open} onclick={toggle}>
			{open ? 'Done' : action}
		</button>
	</div>

	{#if open}
		<div class="drawer">
			{@render children()}
			{#if error}<span class="err" role="alert">{error}</span>{/if}
		</div>
	{/if}
</li>

<style>
	li {
		display: flex;
		flex-direction: column;
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-5);
		font-size: var(--text-control);
		color: var(--ink-2);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.drawer {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		margin-top: var(--gap-row);
		padding-top: var(--gap-row);
		border-top: 1px solid var(--border);
	}
	.err {
		font-size: var(--text-caption);
		color: var(--crit-text);
	}
</style>
