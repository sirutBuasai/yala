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
	import { NET_WORTH_FORCES, netWorthForceHeading } from '$lib/data/catalog';
	import { statCells } from '$lib/charts/statMatrix';
	import { live, words } from '$lib/ui/label';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	// Where you ended, the two forces that got you there, and the rate behind one of them. Net worth is
	// a position, so its badge carries the year's move; the two forces are signed, so their own sign
	// carries it. Each of the three money cards draws its own month-by-month shape behind the figure:
	// the position as a level, the forces as the per-month amounts that accumulate into it.
	const KPIS = $derived<KpiBoardDefs>({
		networth: {
			rect: { x: 0, y: 0, w: 12, h: 5 },
			spec: {
				figure: 'networth.change',
				scope: yr,
				caption: live(`end of ${year}`),
				// A line, where the two forces beside it take an area: the spark is zero-anchored, and a
				// position that never approaches zero fills the whole box as a flat wash.
				chart: 'line',
				series: 'networth.by_month'
			}
		},
		saved: {
			rect: { x: 12, y: 0, w: 12, h: 5 },
			spec: {
				figure: 'networth.saved',
				scope: yr,
				chart: 'bar',
				series: 'networth.saved_by_month'
			}
		},
		other: {
			rect: { x: 24, y: 0, w: 12, h: 5 },
			spec: {
				figure: 'networth.other',
				scope: yr,
				chart: 'bar',
				series: 'networth.other_by_month'
			}
		},
		rate: {
			rect: { x: 36, y: 0, w: 12, h: 5 },
			spec: { figure: 'ratio.savings_rate', scope: yr, chart: 'ring' }
		}
	});

	// The two forces open as one card: they are the halves of the same move, and reading them together is
	// the point. The position and the rate stand alone.
	const kpis = useKpiBoard('networth:year', () => KPIS, [{ ids: ['saved', 'other'], axis: 'row' }]);

	const PANES = $derived(
		kpis.board({
			// `scale` so the matrix is given room or taken down to where its rows would clip, like a KPI card.
			growth: { x: 0, y: 5, w: 48, h: 9, content: 'scale' },
			trend: {
				x: 0,
				y: 14,
				w: 24,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.by_month',
					scope: yr,
					chart: 'line',
					area: true,
					title: words('Net worth by month'),
					caption: { context: String(year), text: 'total net worth MoM' }
				}
			},
			// The path beside what moved it: the same months read as a level, then as the two forces behind
			// each step.
			attribution: {
				x: 24,
				y: 14,
				w: 24,
				h: 15,
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
			// One pane, not two: the dollar and percent shapes are near-identical, because the base barely
			// moves month to month. The axis is the percentage and the tooltip carries the dollars, which is
			// also the unit the liabilities pane below plots, so the two can be read against each other.
			change: {
				x: 0,
				y: 29,
				w: 24,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.change_by_month',
					scope: yr,
					chart: 'bar',
					title: words('Net worth & assets change'),
					caption: { context: String(year), text: 'percent gained or lost each month' }
				}
			},
			allocation: {
				x: 24,
				y: 29,
				w: 24,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_value',
					scope: yr,
					chart: 'stacked-area',
					title: words('Allocation by value'),
					caption: words('dollar balance of each asset type')
				}
			},
			// The level and its movement as one row: what you owe, then how fast it moved.
			liabilities: {
				x: 0,
				y: 44,
				w: 24,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_trend',
					scope: yr,
					chart: 'line',
					area: true,
					title: words('Liabilities'),
					caption: { context: String(year), text: 'what you owe, month by month' }
				}
			},
			liabilitiesChange: {
				x: 24,
				y: 44,
				w: 24,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_change',
					scope: yr,
					chart: 'bar',
					title: words('Liabilities change'),
					caption: { context: String(year), text: 'percent gained or lost each month' }
				}
			},
			table: {
				x: 0,
				y: 57,
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
	const columns = NET_WORTH_FORCES.map(netWorthForceHeading);
	const cellsOf = (pick: (c: (typeof NET_WORTH_FORCES)[number]) => string) =>
		statCells(NET_WORTH_FORCES.map(pick), yr);

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
		caption={words("where the year's change came from, against last")}
	>
		<StatMatrix {data} {columns} rows={growth} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
