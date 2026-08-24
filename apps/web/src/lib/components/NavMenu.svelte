<script lang="ts">
	// Borderless hamburger pinned to the page's top-left corner. Clicking it slides in a left
	// sidebar (with a dimmed backdrop) to switch between the dashboard (Home) and the throwaway
	// Development sandbox. Plain <a> links let SvelteKit handle client-side navigation.
	import { page } from '$app/stores';
	import { fly, fade } from 'svelte/transition';

	let open = $state(false);

	const links = [
		{ href: '/', label: 'Home' },
		{ href: '/dev', label: 'Development' }
	];

	function close() {
		open = false;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') close();
	}}
/>

<button class="burger" aria-label="Open menu" aria-expanded={open} onclick={() => (open = true)}>
	<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
		<line x1="3" y1="6.5" x2="19" y2="6.5" />
		<line x1="3" y1="11" x2="19" y2="11" />
		<line x1="3" y1="15.5" x2="19" y2="15.5" />
	</svg>
</button>

{#if open}
	<button
		class="backdrop"
		aria-label="Close menu"
		transition:fade={{ duration: 150 }}
		onclick={close}
	></button>
	<aside class="sidebar" transition:fly={{ x: -300, duration: 220 }}>
		<div class="head">
			<span class="serif title">Yala</span>
			<button class="close" aria-label="Close menu" onclick={close}>✕</button>
		</div>
		<nav class="links">
			{#each links as link (link.href)}
				<a href={link.href} class:active={$page.url.pathname === link.href} onclick={close}
					>{link.label}</a
				>
			{/each}
		</nav>
	</aside>
{/if}

<style>
	.burger {
		position: fixed;
		top: 20px;
		left: 16px;
		z-index: 30;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink-2);
		cursor: pointer;
	}
	.burger:hover {
		color: var(--ink);
	}
	.burger svg line {
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: rgba(0, 0, 0, 0.45);
		cursor: pointer;
	}
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 41;
		height: 100%;
		width: 264px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px 14px;
		background: var(--surface);
		border-right: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 8px 12px;
		margin-bottom: 6px;
		border-bottom: 1px solid var(--border);
	}
	.head .title {
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.3px;
	}
	.close {
		border: 0;
		background: none;
		color: var(--ink-2);
		font-size: 15px;
		cursor: pointer;
	}
	.close:hover {
		color: var(--ink);
	}
	.links {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.links a {
		padding: 10px 12px;
		border-radius: 8px;
		color: var(--ink-2);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
	}
	.links a:hover {
		color: var(--ink);
		background: var(--inset);
	}
	.links a.active {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
		color: var(--ink);
	}
</style>
