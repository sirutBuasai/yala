<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	interface Props {
		title: string;
		onclose: () => void;
		children: Snippet;
	}
	let { title, onclose, children }: Props = $props();
</script>

<div class="backdrop" role="presentation" onclick={onclose} transition:fade={{ duration: 150 }}>
	<div
		class="drawer"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && onclose()}
		transition:fly={{ x: 480, duration: 220 }}
	>
		<div class="dhead">
			<h2 class="serif">{title}</h2>
			<button type="button" class="x" onclick={onclose}>✕</button>
		</div>
		<div class="dbody">
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
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		height: 100%;
		width: min(680px, 100%);
		background: var(--surface);
		border-left: 1px solid var(--border);
		box-shadow: -18px 0 40px -20px rgba(0, 0, 0, 0.7);
		padding: 22px 24px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}
	.dhead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}
	.dhead h2 {
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
