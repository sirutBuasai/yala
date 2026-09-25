<script module lang="ts">
	export type PageGlyph =
		'dashboard' | 'transactions' | 'cashflow' | 'accounts' | 'planning' | 'manage' | 'development';
</script>

<script lang="ts">
	// One glyph per page, for the icon rail.
	import Icon from './Icon.svelte';

	interface Props {
		glyph: PageGlyph;
		size?: number;
	}
	let { glyph, size = 16 }: Props = $props();
</script>

<Icon {size} weight={1.4}>
	{#if glyph === 'dashboard'}
		<rect x="2" y="2" width="5" height="5" rx="1" />
		<rect x="9" y="2" width="5" height="5" rx="1" />
		<rect x="2" y="9" width="5" height="5" rx="1" />
		<rect x="9" y="9" width="5" height="5" rx="1" />
	{:else if glyph === 'transactions'}
		<path d="M2 4h12M2 8h12M2 12h8" />
	{:else if glyph === 'cashflow'}
		<path d="M3 14V8M7 14V3M11 14V6M14 14H2" />
	{:else if glyph === 'accounts'}
		<path d="M2 6l6-4 6 4M3.5 7v5.5M6.5 7v5.5M9.5 7v5.5M12.5 7v5.5M2 14h12" />
	{:else if glyph === 'planning'}
		<path d="M3 14V2M3 3h9l-2 3 2 3H3" />
	{:else if glyph === 'manage'}
		<path d="M2 4h7M12 4h2M2 12h2M7 12h7" />
		<circle cx="10.5" cy="4" r="1.6" />
		<circle cx="5.5" cy="12" r="1.6" />
	{:else}
		<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" />
	{/if}
</Icon>
