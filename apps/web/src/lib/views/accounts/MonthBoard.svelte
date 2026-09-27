<script lang="ts">
	// Logging lives here alone, since a balance belongs to the month it was taken in.
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
	import SplitPane from '$lib/kpi/SplitPane.svelte';
	import { netWorthParts } from '$lib/data/networth';
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
	const parts = $derived(netWorthParts(data, scope));
	/** The bars that pick a month, which mark it by its label. A line or area picks by its `pickBy`, by
	    month key. */
	const PICKS = new Set(['attribution', 'buckets']);
	const pickedMonth = $derived(scoped ? monthName(monthKey) : undefined);

	// Stacked, as the user arranged them; the card splits evenly whatever the rectangles' spans.
	const KPIS = $derived<KpiBoardDefs>({
		saved: {
			rect: { x: 41, y: 6, w: 7, h: 5 },
			spec: {
				figure: 'networth.saved',
				scope,
				chart: 'bar',
				series: 'networth.saved_by_month'
			}
		},
		other: {
			rect: { x: 41, y: 0, w: 7, h: 6 },
			spec: {
				figure: 'networth.other',
				scope,
				chart: 'bar',
				series: 'networth.other_by_month'
			}
		}
	});

	const kpis = useKpiBoard('accounts:month', () => KPIS, [
		{ ids: ['other', 'saved'], axis: 'column', weights: [5, 5] }
	]);

	const PANES = $derived(
		kpis.board({
			// `scale` so each pane is given room or taken down to where its rows would clip, like a KPI card.
			growth: { x: 16, y: 0, w: 25, h: 11, content: 'scale' },
			standing: { x: 0, y: 0, w: 16, h: 11, content: 'scale' },
			// As long as your accounts are, so it fits its content rather than scaling.
			balances: { x: 0, y: 24, w: 48, h: 24, content: 'flow', mode: 'fixed' },
			// Assets dashed so net worth stays the primary reading; the gap between the two is what is owed.
			trend: {
				x: 0,
				y: 48,
				w: 23,
				h: 12,
				content: 'scale',
				figure: {
					figure: 'networth.vs_assets',
					scope: yr,
					mark,
					pickBy: 'month',
					chart: 'line',
					area: true,
					dashed: ['Assets'],
					title: words(TREND),
					caption: { context: String(year), text: 'total net worth and assets MoM' }
				}
			},
			allocation: {
				x: 23,
				y: 48,
				w: 25,
				h: 20,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_value',
					scope: yr,
					mark,
					pickBy: 'month',
					chart: 'stacked-area',
					title: words(ALLOCATION),
					caption: words(ALLOCATION_CAPTION)
				}
			},
			liabilities: {
				x: 0,
				y: 60,
				w: 23,
				h: 8,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_trend',
					scope: yr,
					mark,
					pickBy: 'month',
					chart: 'line',
					area: true,
					title: words(LIABILITIES),
					caption: { context: String(year), text: 'total liabilities MoM' }
				}
			},
			attribution: {
				x: 0,
				y: 11,
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
				y: 11,
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
				y: 68,
				w: 48,
				h: 19,
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
		{ label: words('Avg / month'), cells: cellsOf((c) => c.perMonth) },
		{
			label: words('On pace for'),
			caption: words('avg / month × 12'),
			cells: cellsOf((c) => c.pace)
		}
	]);
</script>

<Board key="accounts:month" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<SplitPane
		id="standing"
		{data}
		title={words('Net worth')}
		caption={live(`end of ${scoped ? monthLabel(monthKey) : year}`)}
		headline={{ figure: 'networth.change', scope }}
		rows={[
			{ label: 'Assets', parts: parts.assets, colorBy: 'role', fit: true },
			{ label: 'Liabilities', parts: parts.liabilities, colorBy: 'account', fit: true }
		]}
	/>

	<Pane
		id="growth"
		title={{ context: String(year), text: 'growth' }}
		caption={words('year total and monthly rates')}
	>
		<StatMatrix {data} {columns} rows={growth} />
	</Pane>

	<BalanceChecklist id="balances" {data} {accounts} {onsaved} {monthKey} {account} />

	{#each figurePanes(PANES) as [id, figure] (id)}
		{@const bars = PICKS.has(id)}
		<FigurePane
			{id}
			{data}
			spec={figure}
			picked={bars ? pickedMonth : figure.pickBy ? mark : undefined}
			onpick={bars
				? (label) => onpick(keyOf(year, MONTHS.indexOf(label) + 1))
				: figure.pickBy
					? onpick
					: undefined}
		/>
	{/each}
</Board>
