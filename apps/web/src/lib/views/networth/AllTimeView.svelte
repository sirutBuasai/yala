<script lang="ts">
	// Net Worth · All time — the stock half. Read-only: a balance belongs to the month it was taken in.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import Board from '$lib/layout/grid/Board.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { KpiBoard } from '$lib/kpi/board.svelte';
	import { setKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const all: Scope = { level: 'all' };

	// The position, what it is made of, and how long it would last. All four read today's live totals,
	// so they cannot disagree about which snapshot they are describing. No charts: the trend below is
	// the same figures over time, and repeating it small would say nothing new.
	const KPIS: KpiBoardDefs = {
		networth: {
			rect: { x: 0, y: 0, w: 12, h: 7 },
			spec: { figure: 'networth.current', scope: all }
		},
		assets: { rect: { x: 12, y: 0, w: 12, h: 7 }, spec: { figure: 'networth.assets', scope: all } },
		liabilities: {
			rect: { x: 24, y: 0, w: 12, h: 7 },
			spec: { figure: 'networth.liabilities', scope: all }
		},
		freedom: {
			rect: { x: 36, y: 0, w: 12, h: 7 },
			spec: { figure: 'networth.years_of_freedom', scope: all }
		}
	};

	const kpis = new KpiBoard('networth:all', () => KPIS);
	setKpiBoard(kpis);

	const PANES = $derived(
		kpis.board({
			// Assets dashed so net worth stays the primary reading.
			trend: {
				x: 0,
				y: 7,
				w: 32,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.vs_assets',
					scope: all,
					chart: 'line',
					area: true,
					dashed: ['Assets'],
					title: 'Net worth & assets over time',
					caption: 'Every logged snapshot — the gap between them is what you owe'
				}
			},
			thresholds: {
				x: 32,
				y: 7,
				w: 16,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.thresholds',
					scope: all,
					chart: 'bullet',
					title: 'Progress to thresholds',
					caption: 'Value, its target, and the bands either side'
				}
			},
			liabilitiesTrend: {
				x: 0,
				y: 22,
				w: 16,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_trend',
					scope: all,
					chart: 'line',
					// No `color` override: the registry's role map already colours this series by its name.
					title: 'Liabilities',
					caption: 'What you owe, on a scale you can read'
				}
			},
			forces: {
				x: 16,
				y: 22,
				w: 32,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.saved_vs_other',
					scope: all,
					chart: 'bar',
					title: 'You vs the market, by year',
					caption: 'What you saved against everything else that moved the balance'
				}
			},
			// Stacked rather than overlaid: a band's thickness answers "what's the mix" directly.
			mix: {
				x: 0,
				y: 35,
				w: 24,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_share',
					scope: all,
					chart: 'stacked-area',
					title: 'Allocation mix over time',
					caption: 'Share of assets — the level is already in the trend above'
				}
			},
			accounts: {
				x: 24,
				y: 35,
				w: 24,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.accounts',
					scope: all,
					chart: 'ranked-bars',
					// Keyed by ACCOUNT, so each bar takes its institution's hue rather than the category
					// fallback, which gave every bar the same colour.
					colorBy: 'account',
					title: 'Where the money sits',
					caption: 'Every asset account, largest first — concentration at a glance'
				}
			},
			table: {
				x: 0,
				y: 50,
				w: 48,
				h: 16,
				content: 'flow',
				mode: 'fit',
				figure: {
					figure: 'networth.year_table',
					scope: all,
					chart: 'table',
					title: 'Year by year',
					caption: 'The audit trail behind every chart above'
				}
			}
		})
	);
</script>

<Board key="networth:all" layout={PANES} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
