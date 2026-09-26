<script lang="ts">
	// The page links, shared by the sidebar, its icon rail and the hamburger sheet. Each link reopens its
	// page at the view it was left on, as that view was left (D33).
	import { page } from '$app/stores';
	import { leftAt, viewAt } from '$lib/nav/left';
	import { pageOf } from '$lib/nav/pages';
	import type { NavLink } from '$lib/nav/pages';
	import type { Component } from 'svelte';
	import Bank from '$lib/icons/Bank.svelte';
	import Bars from '$lib/icons/Bars.svelte';
	import Code from '$lib/icons/Code.svelte';
	import Flag from '$lib/icons/Flag.svelte';
	import Grid from '$lib/icons/Grid.svelte';
	import Rows from '$lib/icons/Rows.svelte';
	import Sliders from '$lib/icons/Sliders.svelte';

	const ICONS: Record<string, Component<{ size?: number }>> = {
		'/': Grid,
		'/transactions': Rows,
		'/analytics': Bars,
		'/accounts': Bank,
		'/planning': Flag,
		'/manage': Sliders,
		'/dev': Code
	};

	interface Props {
		links: readonly NavLink[];
		ariaLabel: string;
		onclick?: () => void;
	}
	let { links, ariaLabel, onclick }: Props = $props();
</script>

<nav class="links" aria-label={ariaLabel}>
	{#each links as link (link.href)}
		{@const current = pageOf($page.url.pathname) === link.href}
		{@const href = current ? $page.url.pathname + $page.url.search : leftAt(viewAt(link.href))}
		{@const Icon = ICONS[link.href]}
		<a {href} class:active={current} aria-current={current ? 'page' : undefined} {onclick}>
			{#if Icon}<Icon />{/if}
			<span class="label">{link.label}</span>
		</a>
	{/each}
</nav>

<style>
	.links {
		display: flex;
		flex-direction: column;
	}
	.links a {
		display: flex;
		align-items: center;
		gap: var(--gap-field);
		padding: var(--space-5) var(--space-9);
		border-radius: 0;
		color: var(--ink-2);
		font-size: var(--text-body);
		font-weight: var(--fw-medium);
		text-decoration: none;
		white-space: nowrap;
	}
	.links a :global(.icon) {
		flex: none;
	}
	.links a:hover {
		color: var(--ink);
		background: var(--inset);
	}
	.links a.active {
		background: color-mix(in srgb, var(--lav-wash) calc(16% * var(--wash-scale)), transparent);
		color: var(--ink);
	}
</style>
