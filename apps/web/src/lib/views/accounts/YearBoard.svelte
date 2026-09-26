<script lang="ts">
	// Accounts · Year: the record read year by year. Read-only: a balance belongs to the month it was taken in.
	// Picking a year's bars narrows the KPI cards to its close and marks it on every chart with a year axis.
	import type { DashboardData } from '$lib/data/types';
	import type { Scope } from '$lib/data/scope';
	import type { KpiBoardDefs } from '$lib/kpi/spec';
	import { page } from '$app/stores';
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
	import { yearOf } from '$lib/utils/period';
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
	import { openAccount } from './drill';

	interface Props {
		data: DashboardData;
		monthKey: string;
		/** Whether the board reads at the focus year rather than its window. */
		scoped: boolean;
		/** The window's first year; absent, the board reads the lifetime. */
		since?: number;
		/** The years the window covers, as the header words them. */
		spanText: string;
		/** Picks a year, by its label. */
		onpick: (year: string) => void;
	}
	let { data, monthKey, scoped, since, spanText, onpick }: Props = $props();

	const all = $derived<Scope>({ level: 'all', since });
	const lifetime = $derived(since == null);
	const year = $derived(yearOf(monthKey));
	const scope = $derived<Scope>(scoped ? { level: 'year', year } : all);
	const mark = $derived(scoped ? String(year) : undefined);
	/** The bars that pick a year. */
	const PICKS = new Set(['sources', 'buckets']);
	/** A lifetime caption `total lifetime <what>`; under a window, `<years> · total <what>`. */
	const totalOf = (what: string) =>
		lifetime ? words(`total lifetime ${what}`) : { context: spanText, text: `total ${what}` };

	// Unpicked, all read today's live totals, so they cannot disagree about which snapshot they describe;
	// picked, all read the year's close.
	const KPIS = $derived<KpiBoardDefs>({
		networth: {
			rect: { x: 0, y: 11, w: 11, h: 5 },
			spec: { figure: 'networth.current', scope, chart: 'bar', series: 'networth.by_year' }
		},
		assets: {
			rect: { x: 0, y: 16, w: 11, h: 5 },
			spec: {
				figure: 'networth.assets',
				scope,
				chart: 'bar',
				series: 'networth.assets_by_year'
			}
		},
		liabilities: {
			rect: { x: 0, y: 21, w: 11, h: 5 },
			spec: {
				figure: 'networth.liabilities',
				scope,
				chart: 'bar',
				series: 'networth.liabilities_by_year'
			}
		},
		// A bar per year rather than a ring: the ring clamps at 100 and a compound rate has no ceiling, so
		// it would sit full at any growth worth having.
		growthRate: {
			rect: { x: 0, y: 26, w: 11, h: 5 },
			spec: {
				figure: 'networth.balance_growth',
				scope,
				chart: 'bar',
				series: 'networth.growth_rate_by_year'
			}
		}
	});

	const kpis = useKpiBoard('accounts:year', () => KPIS, [
		{ ids: ['networth', 'assets', 'liabilities', 'growthRate'], axis: 'column' }
	]);

	const PANES = $derived(
		kpis.board({
			// `scale` so each pane is given room or taken down to where its rows would clip, like a KPI card.
			growth: { x: 0, y: 0, w: 48, h: 11, content: 'scale' },
			// Assets dashed so net worth stays the primary reading.
			trend: {
				x: 11,
				y: 11,
				w: 37,
				h: 12,
				content: 'scale',
				figure: {
					figure: 'networth.vs_assets',
					scope: all,
					chart: 'line',
					area: true,
					dashed: ['Assets'],
					mark,
					title: words(TREND),
					caption: totalOf('net worth snapshots')
				}
			},
			liabilitiesTrend: {
				x: 11,
				y: 23,
				w: 37,
				h: 8,
				content: 'scale',
				figure: {
					figure: 'networth.liabilities_trend',
					scope: all,
					chart: 'line',
					area: true,
					mark,
					title: words(LIABILITIES),
					caption: totalOf('liabilities snapshots')
				}
			},
			accounts: {
				x: 0,
				y: 31,
				w: 20,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.accounts',
					scope: all,
					chart: 'ranked-bars',
					// Keyed by account, so each bar takes its institution's hue rather than the category fallback.
					colorBy: 'account',
					title: words('Where the money sits'),
					caption: words('asset allocation as account balances')
				}
			},
			allocation: {
				x: 20,
				y: 31,
				w: 28,
				h: 15,
				content: 'scale',
				figure: {
					figure: 'networth.allocation_value',
					scope: all,
					chart: 'stacked-area',
					mark,
					title: words(ALLOCATION),
					caption: words(ALLOCATION_CAPTION)
				}
			},
			sources: {
				x: 0,
				y: 46,
				w: 20,
				h: 14,
				content: 'scale',
				figure: {
					figure: 'networth.saved_vs_other',
					scope: all,
					chart: 'bar',
					title: words(`${ATTRIBUTION}, by year`),
					caption: words(ATTRIBUTION_CAPTION)
				}
			},
			buckets: {
				x: 20,
				y: 46,
				w: 28,
				h: 14,
				content: 'scale',
				figure: {
					figure: 'networth.bucket_change_by_year',
					scope: all,
					chart: 'bar',
					title: words(BUCKET_CHANGE),
					caption: {
						context: lifetime ? 'Lifetime' : spanText,
						text: 'dollars gained or lost each year'
					}
				}
			},
			table: {
				x: 0,
				y: 60,
				w: 48,
				h: 16,
				content: 'scale',
				figure: {
					figure: 'networth.year_table',
					scope: all,
					chart: 'heatmap',
					mark,
					title: words('Yearly snapshots'),
					caption: words(`${SNAPSHOT_LEVELS} YoY`)
				}
			}
		})
	);

	// Headings and ids both come from the catalog's one ordered set, so a heading cannot end up over
	// another part's figure.
	const columns = NET_WORTH_GROWTH.map(columnHeading);
	const cellsOf = (pick: (c: (typeof NET_WORTH_GROWTH)[number]) => string) =>
		statCells(NET_WORTH_GROWTH.map(pick), all);

	// The rate rows carry no caption: each states its own divisor, and the matrix hoists it where they
	// agree.
	const growth = $derived([
		{
			label: words(lifetime ? 'Lifetime total' : 'Total'),
			caption: live(spanText),
			cells: cellsOf((c) => c.total)
		},
		{ label: words('Avg / year'), cells: cellsOf((c) => c.perYear) },
		{ label: words('Avg / month'), cells: cellsOf((c) => c.perMonth) }
	]);
</script>

<Board key="accounts:year" layout={PANES} names={Object.keys(KPIS)} onreset={() => kpis.reset()}>
	<KpiCards {data} />

	<Pane
		id="growth"
		title={words(lifetime ? 'Lifetime growth' : 'Growth')}
		caption={{ context: spanText, text: 'totals, yearly, and monthly rates' }}
	>
		<StatMatrix {data} {columns} rows={growth} />
	</Pane>

	{#each figurePanes(PANES) as [id, figure] (id)}
		<FigurePane
			{id}
			{data}
			spec={figure}
			picked={PICKS.has(id) ? mark : undefined}
			onpick={id === 'accounts'
				? (label) => openAccount($page.url, data, label)
				: PICKS.has(id)
					? onpick
					: undefined}
		/>
	{/each}
</Board>
