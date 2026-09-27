<script lang="ts">
	// Dashboard: where you stand this month, each card a headline that opens the page owning its figures.
	// It reads now, so it has no period controls.
	import type { DashboardData } from '$lib/data/types';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import { latestMonthKey, type Scope } from '$lib/data/scope';
	import { latestSnapshotMonth } from '$lib/data/networth';
	import { measureValue } from '$lib/data/metric';
	import { categorical, incomeParts } from '$lib/data/categorical';
	import { earningPace, spendingPace } from '$lib/data/series';
	import { MONEY } from '$lib/data/primitives';
	import { MONTH_PARAM } from '$lib/nav/focus';
	import { drillTo } from '$lib/nav/drill';
	import { monthLabel } from '$lib/utils/format';
	import { daysIn, todayIso } from '$lib/utils/period';
	import { live, words } from '$lib/ui/label';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Board from '$lib/layout/grid/Board.svelte';
	import Pane from '$lib/layout/grid/Pane.svelte';
	import { useKpiBoard } from '$lib/kpi/context';
	import KpiCards from '$lib/kpi/KpiCards.svelte';
	import SplitPane from '$lib/kpi/SplitPane.svelte';
	import AttentionPane from './AttentionPane.svelte';
	import PacePane from './PacePane.svelte';
	import FigurePane from '$lib/layout/grid/FigurePane.svelte';
	import TransactionList from '$lib/lists/TransactionList.svelte';
	import { recentRows } from '$lib/data/pending';
	import { PROGRESS, PROGRESS_CAPTION } from '$lib/copy';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const monthKey = $derived(latestMonthKey(data));
	const snapshotMonth = $derived(latestSnapshotMonth(data) || monthKey);
	const mo = $derived<Scope>({ level: 'month', monthKey });
	const unit = $derived(MONEY(data.currency));
	const income = $derived(measureValue(data, mo, 'income'));
	const spent = $derived(measureValue(data, mo, 'spending'));

	const at = (path: string, params: Record<string, string>) =>
		`${path}?${new URLSearchParams(params)}`;
	const asOf = (key: string) => live(`as of ${monthLabel(key)}`);

	const KPIS = $derived<KpiBoardDefs>({
		networth: {
			rect: { x: 0, y: 0, w: 16, h: 9 },
			spec: {
				figure: 'networth.change',
				scope: { level: 'month', monthKey: snapshotMonth },
				caption: asOf(snapshotMonth),
				chart: 'area',
				series: 'networth.by_month',
				level: true,
				open: '/accounts'
			}
		}
	});
	const kpis = useKpiBoard('dashboard', () => KPIS);

	const LAYOUT = $derived(
		kpis.board({
			month: { x: 16, y: 0, w: 16, h: 9, content: 'scale' },
			pace: { x: 0, y: 9, w: 32, h: 16, content: 'scale' },
			earning: { x: 0, y: 25, w: 32, h: 17, content: 'scale' },
			attention: { x: 32, y: 9, w: 16, h: 11, content: 'flow', mode: 'fixed' },
			recent: { x: 32, y: 20, w: 16, h: 22, content: 'flow', mode: 'fixed' },
			progress: {
				x: 32,
				y: 0,
				w: 16,
				h: 9,
				content: 'scale',
				figure: {
					figure: 'networth.thresholds',
					scope: { level: 'all' },
					chart: 'bullet',
					title: words(PROGRESS),
					caption: words(PROGRESS_CAPTION)
				}
			}
		})
	);

	const rows = $derived([
		{
			label: 'Income',
			parts: incomeParts(income, spent, unit),
			base: income,
			colorBy: 'role' as const
		},
		{
			label: 'Spent',
			parts: categorical(data.months[monthKey]?.by_category ?? [], unit, Infinity),
			fit: true
		}
	]);

	// Today in a month still running, else the month's last day: how far its own line has got.
	const today = todayIso();
	const through = $derived(today.startsWith(monthKey) ? today : `${monthKey}-${daysIn(monthKey)}`);

	const RECENT = 10;
	const recent = $derived(recentRows(data, RECENT));

	/** A recent row opens its month's history, where it can be read among the rest and edited. */
	function openRow(locator: string) {
		const row = recent.find((r) => r.locator === locator);
		if (row)
			void drillTo(at('/transactions', { [MONTH_PARAM]: row.date.slice(0, 7) }), {
				pane: 'history'
			});
	}
</script>

<ViewHeader title="Dashboard" />

<Board key="dashboard" layout={LAYOUT} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<SplitPane
		id="month"
		{data}
		title={words('Cash flow')}
		caption={asOf(monthKey)}
		{rows}
		open="/analytics"
	/>

	<AttentionPane id="attention" {data} {monthKey} />

	<Pane
		id="recent"
		title={words('Recent transactions')}
		caption={words('the latest entries, newest first')}
		open="/transactions"
	>
		<TransactionList transactions={recent} onedit={openRow} fields={['source']} />
	</Pane>

	<FigurePane id="progress" {data} spec={LAYOUT.progress.figure!} open="/planning" />

	<PacePane
		id="pace"
		title="Spending pace"
		what="spending"
		verb="spent"
		pace={spendingPace(data, monthKey, through)}
		{monthKey}
		{through}
	/>

	<PacePane
		id="earning"
		title="Earning pace"
		what="net income"
		verb="earned"
		pace={earningPace(data, monthKey, through)}
		{monthKey}
		{through}
	/>
</Board>
