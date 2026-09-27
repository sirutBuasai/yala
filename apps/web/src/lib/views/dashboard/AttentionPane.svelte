<script lang="ts">
	// Needs attention: what only you can fix, each row opening the pane that clears it. The balances
	// row needs the API's dated read, so a read-only snapshot leaves it out rather than guessing.
	import type { DashboardData } from '$lib/data/types';
	import { attentionItems, type AttentionItem, type Unlogged } from '$lib/data/attention';
	import { live, networthAt } from '$lib/data/load';
	import { drillTo } from '$lib/nav/drill';
	import { formatAccount } from '$lib/utils/format';
	import { todayIso } from '$lib/utils/period';
	import { categoryVar } from '$lib/utils/theme';
	import { words } from '$lib/ui/label';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import Chevron from '$lib/icons/Chevron.svelte';

	interface Props {
		id: string;
		data: DashboardData;
		monthKey: string;
	}
	let { id, data, monthKey }: Props = $props();

	let unlogged = $state<Unlogged | null>(null);
	$effect(() => {
		void data;
		if (!$live) {
			unlogged = null;
			return;
		}
		const today = todayIso();
		void networthAt(today).then((read) => {
			if (!read) return;
			const roster = [...read.balance_accounts, ...read.liability_accounts];
			unlogged = {
				month: today.slice(0, 7),
				roster,
				missing: roster.filter((a) => !read.standing[a])
			};
		});
	});

	const items = $derived(attentionItems(data, monthKey, unlogged, formatAccount));

	const CHIP: Record<AttentionItem['kind'], string> = {
		pending: 'P',
		balances: '$',
		category: '↑'
	};
	const hue = (item: AttentionItem) =>
		item.category
			? categoryVar(item.category)
			: item.kind === 'pending'
				? 'var(--gold)'
				: 'var(--lav)';
</script>

<Pane {id} title={words('Needs attention')} count={items.length || undefined}>
	{#if items.length}
		<ul class="items">
			{#each items as item (item.kind + item.title)}
				<li>
					<button
						type="button"
						onclick={() => drillTo(item.href, { pane: item.pane, focus: item.focus })}
					>
						<span class="chip" style:--hue={hue(item)} aria-hidden="true">{CHIP[item.kind]}</span>
						<span class="text">
							<span class="title">{item.title}</span>
							<span class="detail">{item.detail}</span>
						</span>
						<span class="go"><Chevron dir="right" size={13} /></span>
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="cap empty">Nothing needs attention.</p>
	{/if}
</Pane>

<style>
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}
	button {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--gap-row);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	button:hover {
		background: var(--inset);
	}
	.chip {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		font-size: var(--text-caption);
		font-weight: var(--fw-semibold);
		background: color-mix(
			in srgb,
			oklch(from var(--hue) var(--wash-lightness) c h) calc(24% * var(--wash-scale)),
			transparent
		);
	}
	.text {
		display: grid;
		min-width: 0;
	}
	.title {
		font-size: var(--text-secondary);
	}
	.detail {
		font-size: var(--text-caption);
		color: var(--ink-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-variant-numeric: tabular-nums;
	}
	.go {
		color: var(--ink-3);
	}
	.empty {
		margin: 0;
	}
</style>
