<script lang="ts">
	// Net Worth · All time — the stock half. Read-only: a balance belongs to the month it was taken in.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import Board from '$lib/layout/grid/Board.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import { words } from '$lib/ui/label';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const all: Scope = { level: 'all' };

	// The position, what it is made of, and how long it would last. All four read today's live totals, so
	// they cannot disagree about which snapshot they are describing. The three levels carry a bar per
	// logged year behind them; freedom is a duration, which has no yearly level to plot.
	const KPIS: KpiBoardDefs = {
		networth: {
			rect: { x: 0, y: 0, w: 10, h: 6 },
			spec: {
				figure: 'networth.current',
				scope: all,
				chart: 'bar',
				series: 'networth.by_year'
			}
		},
		assets: {
			rect: { x: 0, y: 6, w: 10, h: 6 },
			spec: {
				figure: 'networth.assets',
				scope: all,
				chart: 'bar',
				series: 'networth.assets_by_year'
			}
		},
		liabilities: {
			rect: { x: 0, y: 12, w: 10, h: 6 },
			spec: {
				figure: 'networth.liabilities',
				scope: all,
				chart: 'bar',
				series: 'networth.liabilities_by_year'
			}
		},
		freedom: {
			rect: { x: 0, y: 18, w: 10, h: 5 },
			spec: { figure: 'networth.years_of_freedom', scope: all }
		}
	};

	// One column down the side: the position, its parts, then how long it lasts, read top to bottom.
	const kpis = useKpiBoard('networth:all', () => KPIS, [
		{ ids: ['networth', 'assets', 'liabilities', 'freedom'], axis: 'column' }
	]);

	const PANES = $derived(
		kpis.board({
			// Assets dashed so net worth stays the primary reading.
			trend: {
				x: 10,
				y: 0,
				w: 38,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.vs_assets',
					scope: all,
					chart: 'line',
					area: true,
					dashed: ['Assets'],
					title: words('Net worth & assets over time'),
					caption: words('total lifetime net worth')
				}
			},
			thresholds: {
				x: 32,
				y: 23,
				w: 16,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.thresholds',
					scope: all,
					chart: 'bullet',
					title: words('Progress to thresholds'),
					caption: words('key metrics for financial independence')
				}
			},
			liabilitiesTrend: {
				x: 10,
				y: 15,
				w: 38,
				h: 8,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_trend',
					scope: all,
					chart: 'line',
					// No `color` override: the registry's role map already colours this series by its name.
					title: words('Liabilities'),
					caption: words('lifetime liabilities snapshot')
				}
			},
			forces: {
				x: 0,
				y: 23,
				w: 32,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.saved_vs_other',
					scope: all,
					chart: 'bar',
					title: words('You vs the market, by year'),
					caption: words('direct savings vs market gains + other income')
				}
			},
			// Stacked rather than overlaid: a band's thickness answers "what's the mix" directly.
			mix: {
				x: 0,
				y: 36,
				w: 24,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_share',
					scope: all,
					chart: 'stacked-area',
					title: words('Allocation mix over time'),
					caption: words('share of assets trends over time')
				}
			},
			accounts: {
				x: 24,
				y: 36,
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
					title: words('Where the money sits'),
					caption: words('asset allocation as account balances')
				}
			},
			table: {
				x: 0,
				y: 51,
				w: 48,
				h: 16,
				content: 'flow',
				mode: 'fit',
				figure: {
					figure: 'networth.year_table',
					scope: all,
					chart: 'table',
					title: words('Year by year'),
					caption: words('changes to net worth, assets, and liabilities YoY')
				}
			}
		})
	);
</script>

<Board key="networth:all" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
