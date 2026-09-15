<script lang="ts">
	// Activity · All time — the lifetime picture, read-only.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { BoardLayout } from '$lib/layout/grid/types';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import { live, words } from '$lib/ui/label';
	import { CASH_FLOW_COLUMNS, cashFlowHeading } from '$lib/data/catalog';
	import { statCells } from '$lib/charts/statMatrix';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';
	import { yearSpan } from '$lib/utils/format';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const all: Scope = { level: 'all' };
	const years = $derived(data.meta.years);
	const span = $derived(yearSpan(years, 'no tracked years'));

	const PANES = $derived({
		// `scale` so the matrix is given room or taken down to where its rows would clip, like a KPI card.
		cashflow: { x: 0, y: 0, w: 48, h: 11, content: 'scale' },
		// Rate beside levels: how efficient, versus how big, which the bars alone can't say. The rate is one
		// series against a reference line, so it reads in a narrow pane where the four-series levels do not.
		rate: {
			x: 0,
			y: 11,
			w: 14,
			h: 13,
			content: 'scale',
			figure: {
				figure: 'overview.savings_rate',
				scope: all,
				chart: 'bar',
				title: words('Savings rate by year'),
				caption: words('of net income')
			}
		},
		levels: {
			x: 14,
			y: 11,
			w: 34,
			h: 13,
			content: 'scale',
			figure: {
				figure: 'overview.cash_flow_bars',
				scope: all,
				chart: 'bar',
				title: words('Net income vs take-home vs spending vs saved'),
				caption: words('per year')
			}
		},
		flow: {
			x: 0,
			y: 24,
			w: 48,
			h: 25,
			content: 'scale',
			figure: {
				figure: 'money.flow',
				scope: all,
				chart: 'sankey',
				title: words('Where it all went'),
				caption: { context: 'Lifetime', text: 'gross income to each spending category' }
			}
		},
		// Log scale, since a linear axis crushes the small categories under the biggest ones.
		categories: {
			x: 0,
			y: 49,
			w: 48,
			h: 18,
			content: 'scale',
			figure: {
				figure: 'spending.category_by_year',
				scope: all,
				chart: 'line',
				log: true,
				endLabels: true,
				title: words('Spending by category, by year'),
				caption: words('log-scaled yearly trend of spending by category')
			}
		}
	} satisfies BoardLayout);

	// Headings and ids both come from the catalog's one ordered chain, so a heading cannot end up over
	// another measure's figure.
	const columns = CASH_FLOW_COLUMNS.map(cashFlowHeading);
	const cellsOf = (pick: (c: (typeof CASH_FLOW_COLUMNS)[number]) => string) =>
		statCells(CASH_FLOW_COLUMNS.map(pick), all);

	// The averages carry no caption: their divisor is each figure's own footnote.
	const rows = $derived([
		{ label: words('Lifetime total'), caption: live(span), cells: cellsOf((c) => c.total) },
		{ label: words('Avg / year'), cells: cellsOf((c) => c.perYear) },
		{ label: words('Avg / month'), cells: cellsOf((c) => c.perMonth) }
	]);
</script>

<Board key="activity:all" layout={PANES}>
	<Pane
		id="cashflow"
		title={words('Lifetime cash flow')}
		caption={{ context: span, text: 'totals, yearly, and monthly rates' }}
	>
		<StatMatrix {data} {columns} {rows} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane {id} {data} spec={figure} />
	{/each}
</Board>
