<script lang="ts">
	// A dismissible overlay panel over a backdrop. `variant` picks the presentation:
	// 'modal' floats near the top-center; 'drawer' slides in from the right edge.
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { focusTrap } from '$lib/utils/focusTrap';

	interface Props {
		title: string;
		onclose: () => void;
		variant?: 'modal' | 'drawer';
		children: Snippet;
	}
	let { title, onclose, variant = 'modal', children }: Props = $props();
</script>

<div class="backdrop" role="presentation" onclick={onclose} transition:fade={{ duration: 150 }}>
	<div
		class="panel {variant}"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		use:focusTrap
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && onclose()}
		transition:fly={variant === 'drawer' ? { x: 480, duration: 220 } : { y: 10, duration: 170 }}
	>
		<div class="head">
			<h2 class="serif">{title}</h2>
			<button type="button" class="x" onclick={onclose}>✕</button>
		</div>
		<div class="body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 50;
	}
	.backdrop:has(.modal) {
		/* Anchor near the top so content that loads in (e.g. paycheck rows) grows downward
		   instead of re-centering and jumping. */
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 6vh 24px 24px;
	}
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding: var(--space-10) var(--space-11);
	}
	/* Shrinks to fit narrow screens; content shrinks with it, so it never needs a horizontal scroll. */
	.modal {
		border-radius: var(--radius-xl);
		box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.6);
		width: min(760px, 100%);
		max-height: 88vh;
	}
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		height: 100%;
		width: min(680px, 100%);
		border-left: 1px solid var(--border);
		box-shadow: -18px 0 40px -20px rgba(0, 0, 0, 0.7);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-8);
	}
	.head h2 {
		margin: 0;
		font-size: var(--text-dialog);
	}
	.x {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: var(--radius-sm);
		padding: var(--pad-btn-sm);
		cursor: pointer;
	}
	.x:hover {
		border-color: var(--crit);
		color: var(--crit-text);
	}
</style>
