<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	interface Props {
		title: string;
		onclose: () => void;
		children: Snippet;
	}
	let { title, onclose, children }: Props = $props();
</script>

<div class="backdrop" role="presentation" onclick={onclose} transition:fade={{ duration: 140 }}>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && onclose()}
		transition:fly={{ y: 10, duration: 170 }}
	>
		<div class="mhead">
			<h2 class="serif">{title}</h2>
			<button type="button" class="x" onclick={onclose}>✕</button>
		</div>
		<div class="mbody">
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
		display: flex;
		/* Anchor near the top so content that loads in (e.g. paycheck rows) grows downward
		   instead of re-centering and jumping. */
		align-items: flex-start;
		justify-content: center;
		padding: 6vh 24px 24px;
	}
	/* Shrinks to fit narrow screens; content shrinks with it, so it never needs a horizontal scroll. */
	.modal {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.6);
		padding: 22px 24px;
		width: min(760px, 100%);
		max-height: 88vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}
	.mhead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}
	.mhead h2 {
		margin: 0;
		font-size: 18px;
	}
	.x {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 7px;
		padding: 3px 9px;
		cursor: pointer;
	}
	.x:hover {
		border-color: var(--crit);
		color: var(--crit-text);
	}
</style>
