<script lang="ts">
	// Net Worth · Year — the flow half. Balances are logged monthly, so editing belongs at this range.
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
	import { live, words } from '$lib/ui/label';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	// Where you ended, the rate that got you there, and the two parts of the move. Net worth is a
	// position, so its badge carries the year's move; the two parts are signed, so their own sign carries
	// it. Each of the three money cards draws its own month-by-month shape behind the figure: the position
	// as a level, the parts as the per-month amounts that accumulate into it.
	//
	// Declared in reading order, and the widths are what the two merged cards divide themselves by.
	const KPIS = $derived<KpiBoardDefs>({
		networth: {
			rect: { x: 0, y: 0, w: 11, h: 5 },
			spec: {
				figure: 'networth.change',
				scope: yr,
				caption: live(`end of ${year}`),
				// A line, where the two parts below it take an area: the spark is zero-anchored, and a
				// position that never approaches zero fills the whole box as a flat wash.
				chart: 'line',
				series: 'networth.by_month'
			}
		},
		rate: {
			rect: { x: 11, y: 0, w: 7, h: 5 },
			spec: { figure: 'ratio.savings_rate', scope: yr, chart: 'ring' }
		},
		saved: {
			rect: { x: 0, y: 5, w: 9, h: 5 },
			spec: {
				figure: 'networth.saved',
				scope: yr,
				chart: 'bar',
				series: 'networth.saved_by_month'
			}
		},
		other: {
			rect: { x: 9, y: 5, w: 9, h: 5 },
			spec: {
				figure: 'networth.other',
				scope: yr,
				chart: 'bar',
				series: 'networth.other_by_month'
			}
		}
	});

	// Two cards, one per row: where you stand and how efficiently you got there, then the two halves of
	// the same move, which are the point read together.
	const kpis = useKpiBoard('networth:year', () => KPIS, [
		{ ids: ['networth', 'rate'], axis: 'row' },
		{ ids: ['saved', 'other'], axis: 'row' }
	]);

	const PANES = $derived(
		kpis.board({
			// Beside the KPI column rather than under it: the matrix is the same reading those cards give,
			// against last year. `scale` so it is given room or taken down to where its rows would clip.
			growth: { x: 18, y: 0, w: 30, h: 10, content: 'scale' },
			// Assets dashed so net worth stays the primary reading, as on the lifetime board. The gap between
			// the two lines is what is owed.
			trend: {
				x: 0,
				y: 10,
				w: 23,
				h: 12,
				content: 'scale',
				figure: {
					figure: 'networth.vs_assets',
					scope: yr,
					chart: 'line',
					area: true,
					dashed: ['Assets'],
					title: words('Net worth & assets'),
					caption: { context: String(year), text: 'total net worth and assets MoM' }
				}
			},
			// The trend and what is owed stack down the left; the mix takes the taller pane beside them.
			allocation: {
				x: 23,
				y: 10,
				w: 25,
				h: 20,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_value',
					scope: yr,
					chart: 'stacked-area',
					title: words('Asset allocations'),
					caption: words('dollar amount and shares by asset type')
				}
			},
			liabilities: {
				x: 0,
				y: 22,
				w: 23,
				h: 8,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_trend',
					scope: yr,
					chart: 'line',
					area: true,
					title: words('Liabilities'),
					caption: { context: String(year), text: 'total liabilities MoM' }
				}
			},
			// Who added the dollars, beside where they landed. Dollars on both axes, since the asset types are
			// parts of one total; each move's percentage of its own opening balance rides along on hover.
			attribution: {
				x: 0,
				y: 30,
				w: 20,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.saved_vs_other_by_month',
					scope: yr,
					chart: 'bar',
					title: words('You vs the market, by month'),
					caption: {
						context: String(year),
						text: 'direct savings vs market gains + other income'
					}
				}
			},
			buckets: {
				x: 20,
				y: 30,
				w: 28,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.bucket_change_by_month',
					scope: yr,
					chart: 'bar',
					title: words('Change by asset type'),
					caption: { context: String(year), text: 'dollars gained or lost each month' }
				}
			},
			table: {
				x: 0,
				y: 43,
				w: 48,
				h: 16,
				content: 'flow',
				mode: 'fit',
				figure: {
					figure: 'networth.monthly_table',
					scope: yr,
					chart: 'table',
					title: words('Monthly snapshots'),
					caption: words('changes to net worth, assets, and liabilities MoM')
				}
			}
		})
	);

	// The year's move and the two terms it splits into, each against last year, then the same three as a
	// monthly rate. Headings and ids both come from the catalog's one ordered set, so a heading cannot end
	// up over another term's figure.
	const columns = NET_WORTH_GROWTH.map(netWorthGrowthHeading);
	const cellsOf = (pick: (c: (typeof NET_WORTH_GROWTH)[number]) => string) =>
		statCells(NET_WORTH_GROWTH.map(pick), yr);

	// The run-rate row carries no caption: its divisor is stated by the figures themselves, which agree,
	// so the matrix hoists it under the label.
	const growth = $derived([
		{
			label: live(`Total ${year}`),
			caption: words('across the year, against last'),
			cells: cellsOf((c) => c.total)
		},
		{ label: words('Avg / month'), cells: cellsOf((c) => c.perMonth) }
	]);
</script>

<Board key="networth:year" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<Pane
		id="growth"
		title={{ context: String(year), text: 'growth' }}
		caption={words('year total and monthly rates')}
	>
		<StatMatrix {data} {columns} rows={growth} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
