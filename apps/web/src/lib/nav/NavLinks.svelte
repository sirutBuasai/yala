<script lang="ts">
	// The page links, shared by the sidebar, its icon rail and the hamburger sheet. Each link carries the
	// focus month, so switching pages keeps your place.
	import { page } from '$app/stores';
	import PageIcon from '$lib/icons/PageIcon.svelte';
	import { withFocus } from '$lib/nav/focus';
	import type { NavLink } from '$lib/nav/pages';

	interface Props {
		links: readonly NavLink[];
		ariaLabel: string;
		onclick?: () => void;
	}
	let { links, ariaLabel, onclick }: Props = $props();
</script>

<nav class="links" aria-label={ariaLabel}>
	{#each links as link (link.href)}
		{@const current = $page.url.pathname === link.href}
		<a
			href={withFocus(link.href, $page.url)}
			class:active={current}
			aria-current={current ? 'page' : undefined}
			{onclick}
		>
			<PageIcon glyph={link.glyph} />
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
		background: color-mix(in srgb, var(--lav) 16%, transparent);
		color: var(--ink);
	}
</style>
