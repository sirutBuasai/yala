<script lang="ts">
	// Accounts · Month: one year of balances read month by month, and the month's balances logged under the
	// KPI cards. Logging lives here alone, since a balance belongs to the month it was taken in. Picking a
	// month's bars narrows the KPI cards to it, which is the net worth bridge, and marks it on every chart.
	import type { DashboardData } from '$lib/data/types';
	import type { AccountsInfo } from '$lib/data/load';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { figurePanes } from '$lib/layout/grid/figure';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import StatMatrix from '$lib/charts/StatMatrix.svelte';
	import { NET_WORTH_GROWTH, columnHeading } from '$lib/data/catalog';
	import { statCells } from '$lib/charts/statMatrix';
	import { live, words } from '$lib/ui/label';
	import { monthKey as keyOf, yearOf } from '$lib/utils/period';
	import { monthLabel, monthName, MONTHS } from '$lib/utils/format';
	import BalanceChecklist from '$lib/balance/BalanceChecklist.svelte';
	import {
		ALLOCATION,
		ALLOCATION_CAPTION,
		ATTRIBUTION,
		ATTRIBUTION_CAPTION,
		BUCKET_CHANGE,
		LIABILITIES,
		SNAPSHOT_LEVELS,
		TREND
	} from './copy';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		onsaved: () => void;
		/** The focus month, "YYYY-MM": Log balances logs it, and the board reads its year. */
		monthKey: string;
		/** Whether the board reads at the focus month rather than its year. */
		scoped: boolean;
		/** Picks a month of the focus year, by key. */
		onpick: (monthKey: string) => void;
		/** An account for Log balances to open at, by ledger path. */
		account?: string | null;
	}
	let { data, accounts, onsaved, monthKey, scoped, onpick, account }: Props = $props();

	const year = $derived(yearOf(monthKey));

	const yr = $derived<Scope>({ level: 'year', year });
	const scope = $derived<Scope>(scoped ? { level: 'month', monthKey } : yr);
	const mark = $derived(scoped ? monthKey : undefined);
	/** The bars that pick a month, which mark it by its label. */
	const PICKS = new Set(['attribution', 'buckets']);
	const pickedMonth = $derived(scoped ? monthName(monthKey) : undefined);

	// The widths are what the two merged cards divide themselves by.
	const KPIS = $derived<KpiBoardDefs>({
		networth: {
			rect: { x: 0, y: 0, w: 11, h: 5 },
			spec: {
				figure: 'networth.change',
				scope,
				caption: live(`end of ${scoped ? monthLabel(monthKey) : year}`),
				// A line, where the two parts below it take an area: the spark is zero-anchored, and a
				// position that never approaches zero fills the whole box as a flat wash.
				chart: 'line',
				series: 'networth.by_month'
			}
		},
		rate: {
			rect: { x: 11, y: 0, w: 7, h: 5 },
			spec: { figure: 'ratio.savings_rate', scope, chart: 'ring' }
		},
		saved: {
			rect: { x: 0, y: 5, w: 9, h: 5 },
			spec: {
				figure: 'networth.saved',
				scope,
				chart: 'bar',
				series: 'networth.saved_by_month'
			}
		},
		other: {
			rect: { x: 9, y: 5, w: 9, h: 5 },
			spec: {
				figure: 'networth.other',
				scope,
				chart: 'bar',
				series: 'networth.other_by_month'
			}
		}
	});

	const kpis = useKpiBoard('accounts:month', () => KPIS, [
		{ ids: ['networth', 'rate'], axis: 'row' },
		{ ids: ['saved', 'other'], axis: 'row' }
	]);

	const PANES = $derived(
		kpis.board({
			// `scale` so each pane is given room or taken down to where its rows would clip, like a KPI card.
			growth: { x: 18, y: 0, w: 30, h: 10, content: 'scale' },
			// As long as your accounts are, so it fits its content rather than scaling.
			balances: { x: 0, y: 10, w: 48, h: 18, content: 'flow', mode: 'fit' },
			// Assets dashed so net worth stays the primary reading; the gap between the two is what is owed.
			trend: {
				x: 0,
				y: 28,
				w: 23,
				h: 12,
				content: 'scale',
				figure: {
					figure: 'networth.vs_assets',
					scope: yr,
					mark,
					chart: 'line',
					area: true,
					dashed: ['Assets'],
					title: words(TREND),
					caption: { context: String(year), text: 'total net worth and assets MoM' }
				}
			},
			allocation: {
				x: 23,
				y: 28,
				w: 25,
				h: 20,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_value',
					scope: yr,
					mark,
					chart: 'stacked-area',
					title: words(ALLOCATION),
					caption: words(ALLOCATION_CAPTION)
				}
			},
			liabilities: {
				x: 0,
				y: 40,
				w: 23,
				h: 8,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_trend',
					scope: yr,
					mark,
					chart: 'line',
					area: true,
					title: words(LIABILITIES),
					caption: { context: String(year), text: 'total liabilities MoM' }
				}
			},
			attribution: {
				x: 0,
				y: 48,
				w: 20,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.saved_vs_other_by_month',
					scope: yr,
					chart: 'bar',
					title: words(`${ATTRIBUTION}, by month`),
					caption: { context: String(year), text: ATTRIBUTION_CAPTION }
				}
			},
			buckets: {
				x: 20,
				y: 48,
				w: 28,
				h: 13,
				content: 'scale',
				figure: {
					figure: 'networth.bucket_change_by_month',
					scope: yr,
					chart: 'bar',
					title: words(BUCKET_CHANGE),
					caption: { context: String(year), text: 'dollars gained or lost each month' }
				}
			},
			table: {
				x: 0,
				y: 61,
				w: 48,
				h: 16,
				content: 'scale',
				figure: {
					figure: 'networth.monthly_table',
					scope: yr,
					chart: 'heatmap',
					mark,
					title: words('Monthly snapshots'),
					caption: words(`${SNAPSHOT_LEVELS} MoM`)
				}
			}
		})
	);

	// Headings and ids both come from the catalog's one ordered set, so a heading cannot end up over
	// another term's figure.
	const columns = NET_WORTH_GROWTH.map(columnHeading);
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

<Board key="accounts:month" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<Pane
		id="growth"
		title={{ context: String(year), text: 'growth' }}
		caption={words('year total and monthly rates')}
	>
		<StatMatrix {data} {columns} rows={growth} />
	</Pane>

	<BalanceChecklist id="balances" {data} {accounts} {onsaved} {monthKey} {account} />

	{#each figurePanes(PANES) as [id, figure] (id)}
		{@const picks = PICKS.has(id)}
		<FigurePane
			{id}
			{data}
			spec={figure}
			picked={picks ? pickedMonth : undefined}
			onpick={picks ? (label) => onpick(keyOf(year, MONTHS.indexOf(label) + 1)) : undefined}
		/>
	{/each}
</Board>
