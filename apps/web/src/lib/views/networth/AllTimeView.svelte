<script lang="ts">
	// Net Worth · All time — the stock half. Read-only: a balance belongs to the month it was taken in.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';
	import { NET_WORTH_GROWTH, netWorthGrowthHeading } from '$lib/data/catalog';
	import { statCells } from '$lib/charts/statMatrix';
	import { snapshotYears } from '$lib/data/networth';
	import { yearSpan } from '$lib/utils/format';
	import { live, words } from '$lib/ui/label';
	import Planning from '$lib/views/networth/Planning.svelte';

	interface Props {
		data: DashboardData;
		/** Called after the planning assumptions change, to re-pull the figures derived from them. */
		onsaved: () => void;
	}
	let { data, onsaved }: Props = $props();

	// The one pane on this board you can act on: every bar it draws is measured against an assumption, so
	// the assumptions are edited from it rather than from a settings page a page away.
	let planning = $state(false);

	const all: Scope = { level: 'all' };
	const span = $derived(yearSpan(snapshotYears(data)));

	// The position, what it is made of, how long it would last, then the rate that got it there. All read
	// today's live totals, so they cannot disagree about which snapshot they are describing. The three
	// levels carry a bar per logged year behind them; a duration and a rate have no yearly level to plot.
	// Opens below the matrix and the progress bars, which read across the full width; declared in reading
	// order down the column.
	const KPIS: KpiBoardDefs = {
		networth: {
			rect: { x: 0, y: 11, w: 11, h: 5 },
			spec: { figure: 'networth.current', scope: all, chart: 'bar', series: 'networth.by_year' }
		},
		assets: {
			rect: { x: 0, y: 16, w: 11, h: 5 },
			spec: {
				figure: 'networth.assets',
				scope: all,
				chart: 'bar',
				series: 'networth.assets_by_year'
			}
		},
		liabilities: {
			rect: { x: 0, y: 21, w: 11, h: 5 },
			spec: {
				figure: 'networth.liabilities',
				scope: all,
				chart: 'bar',
				series: 'networth.liabilities_by_year'
			}
		},
		// A bar per year rather than a ring: the ring clamps at 100 and a compound rate has no ceiling, so
		// it would sit full at any growth worth having. The bars say whether it is slowing.
		growthRate: {
			rect: { x: 0, y: 26, w: 11, h: 5 },
			spec: {
				figure: 'networth.balance_growth',
				scope: all,
				chart: 'bar',
				series: 'networth.growth_rate_by_year'
			}
		},
		// Measured against the years left until retirement, which the figure carries as its own target. The
		// meter sits on the figure's own row, so this costs no more height than a bare card.
		freedom: {
			rect: { x: 0, y: 31, w: 11, h: 5 },
			spec: { figure: 'networth.years_of_freedom', scope: all, chart: 'meter' }
		}
	};

	// One column down the side: the position, its parts, the rate that got it there, then how long it
	// lasts, read top to bottom.
	const kpis = useKpiBoard('networth:all', () => KPIS, [
		{ ids: ['networth', 'assets', 'liabilities', 'growthRate', 'freedom'], axis: 'column' }
	]);

	const PANES = $derived(
		kpis.board({
			// The board opens on where you stand against your own targets: the lifetime split, then how far
			// along each threshold you are. `scale` so each is given room or taken down to where its rows
			// would clip, like a KPI card.
			growth: { x: 0, y: 0, w: 28, h: 11, content: 'scale' },
			thresholds: {
				x: 28,
				y: 0,
				w: 20,
				h: 11,
				content: 'scale',
				figure: {
					figure: 'networth.thresholds',
					scope: all,
					chart: 'bullet',
					title: words('Financial progress'),
					caption: words('key metrics for financial independence')
				}
			},
			// Assets dashed so net worth stays the primary reading.
			trend: {
				x: 11,
				y: 11,
				w: 37,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.vs_assets',
					scope: all,
					chart: 'line',
					area: true,
					dashed: ['Assets'],
					title: words('Net worth & assets'),
					caption: words('total lifetime net worth snapshots')
				}
			},
			liabilitiesTrend: {
				x: 11,
				y: 26,
				w: 37,
				h: 10,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_trend',
					scope: all,
					chart: 'line',
					area: true,
					title: words('Liabilities'),
					caption: words('total lifetime liabilities snapshots')
				}
			},
			// Where it sits, beside what it is made of.
			accounts: {
				x: 0,
				y: 36,
				w: 20,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.accounts',
					scope: all,
					chart: 'ranked-bars',
					// Keyed by account, so each bar takes its institution's hue rather than the category
					// fallback, which gave every bar the same colour.
					colorBy: 'account',
					title: words('Where the money sits'),
					caption: words('asset allocation as account balances')
				}
			},
			// Dollars on the axis with each band's share on hover, the same reading the year board gives.
			allocation: {
				x: 20,
				y: 36,
				w: 28,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_value',
					scope: all,
					chart: 'stacked-area',
					title: words('Asset allocations'),
					caption: words('dollar amount and shares by asset type')
				}
			},
			// Who added the dollars, beside where they landed. The per-level change is in the table below.
			sources: {
				x: 0,
				y: 51,
				w: 20,
				h: 14,
				content: 'scale',
				figure: {
					figure: 'networth.saved_vs_other',
					scope: all,
					chart: 'bar',
					title: words('You vs the market, by year'),
					caption: words('direct savings vs market gains + other income')
				}
			},
			// Dollars on the axis, since the three types are parts of one total and their moves compare
			// directly; the percentage each move was of its own opening balance rides along on hover.
			buckets: {
				x: 20,
				y: 51,
				w: 28,
				h: 14,
				content: 'scale',
				figure: {
					figure: 'networth.bucket_change_by_year',
					scope: all,
					chart: 'bar',
					title: words('Change by asset type'),
					caption: { context: 'Lifetime', text: 'dollars gained or lost each year' }
				}
			},
			table: {
				x: 0,
				y: 65,
				w: 48,
				h: 16,
				content: 'flow',
				mode: 'fit',
				figure: {
					figure: 'networth.year_table',
					scope: all,
					chart: 'table',
					title: words('Yearly snapshots'),
					caption: words('changes to net worth, assets, and liabilities YoY')
				}
			}
		})
	);

	// The lifetime move and the two parts it splits into, then the same three as a yearly and a monthly
	// rate. Headings and ids both come from the catalog's one ordered set, so a heading cannot end up over
	// another part's figure.
	const columns = NET_WORTH_GROWTH.map(netWorthGrowthHeading);
	const cellsOf = (pick: (c: (typeof NET_WORTH_GROWTH)[number]) => string) =>
		statCells(NET_WORTH_GROWTH.map(pick), all);

	// The rate rows carry no caption: each states its own divisor, and the matrix hoists it where they
	// agree.
	const growth = $derived([
		{ label: words('Lifetime total'), caption: live(span), cells: cellsOf((c) => c.total) },
		{ label: words('Avg / year'), cells: cellsOf((c) => c.perYear) },
		{ label: words('Avg / month'), cells: cellsOf((c) => c.perMonth) }
	]);
</script>

<Board key="networth:all" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<Pane
		id="growth"
		title={words('Lifetime growth')}
		caption={{ context: span, text: 'totals, yearly, and monthly rates' }}
	>
		<StatMatrix {data} {columns} rows={growth} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} actions={id === 'thresholds' ? adjust : undefined} />
	{/each}
</Board>

{#snippet adjust()}
	<button class="btn-ghost" onclick={() => (planning = true)}>Adjust</button>
{/snippet}

{#if planning}
	<Planning {data} {onsaved} onclose={() => (planning = false)} />
{/if}
