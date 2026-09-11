<script lang="ts">
	// Net Worth · Year — the flow half. Balances are logged monthly, so editing belongs at this range.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import Board from '$lib/layout/grid/Board.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';

	interface Props {
		data: DashboardData;
		year: number;
	}
	let { data, year }: Props = $props();

	const yr = $derived<Scope>({ level: 'year', year });

	// Where you ended, the two forces that got you there, and the rate behind one of them. Net worth is
	// a position, so its badge carries the year's move; the two forces are signed, so their own sign
	// carries it.
	const KPIS = $derived<KpiBoardDefs>({
		networth: {
			rect: { x: 0, y: 0, w: 12, h: 5 },
			spec: { figure: 'networth.change', scope: yr, caption: `end of ${year}` }
		},
		saved: { rect: { x: 12, y: 0, w: 12, h: 5 }, spec: { figure: 'networth.saved', scope: yr } },
		other: { rect: { x: 24, y: 0, w: 12, h: 5 }, spec: { figure: 'networth.other', scope: yr } },
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
			trend: {
				x: 0,
				y: 5,
				w: 24,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.by_month',
					scope: yr,
					chart: 'line',
					area: true,
					title: 'Net worth by month',
					caption: `${year} · one point per logged snapshot`
				}
			},
			mix: {
				x: 24,
				y: 5,
				w: 24,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_share',
					scope: yr,
					chart: 'stacked-area',
					title: 'Allocation mix',
					caption: 'Share of assets · liquid · taxable · tax-advantaged'
				}
			},
			table: {
				x: 0,
				y: 20,
				w: 48,
				h: 16,
				content: 'flow',
				mode: 'fit',
				figure: {
					figure: 'networth.monthly_table',
					scope: yr,
					chart: 'table',
					title: 'Monthly snapshots',
					caption: 'Month-over-month change'
				}
			}
		})
	);
</script>

<Board key="networth:year" layout={PANES} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
