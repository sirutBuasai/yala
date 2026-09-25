<script lang="ts">
	// Analytics: read trends across months and years (docs/redesign/specs/analytics.md). Each grain is its
	// own board with its own stored arrangement.
	import { page } from '$app/stores';
	import type { DashboardData } from '$lib/data/types';
	import { latestMonthKey, latestYear } from '$lib/data/scope';
	import { yearSpan } from '$lib/utils/format';
	import { monthForYear, pickableMonths, yearOf } from '$lib/utils/period';
	import { focusMonth, MONTH_PARAM } from '$lib/nav/focus';
	import { step } from '$lib/nav/step';
	import { pageOf } from '$lib/nav/pages';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import MonthBoard from './MonthBoard.svelte';
	import YearBoard from './YearBoard.svelte';

	type View = 'month' | 'year';
	type Span = '5' | '10' | '20' | '50' | 'all';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'month', label: 'Month' },
		{ id: 'year', label: 'Year' }
	];
	// How far back Year reaches, always ending at the latest year (D25).
	const SPANS: { id: Span; label: string }[] = [
		{ id: '5', label: '5Y' },
		{ id: '10', label: '10Y' },
		{ id: '20', label: '20Y' },
		{ id: '50', label: '50Y' },
		{ id: 'all', label: 'All' }
	];
	const DEFAULT_SPAN: Span = '10';
	// Page state in the URL (D9). The view is the path, which a reload keeps; the picks are the query, which
	// it drops (D27). `scope` names the grain the board is narrowed to, and only counts on the view of that
	// grain: `scope=month` on Month, `scope=year` on Year.
	const P = { scope: 'scope', span: 'span' } as const;

	const params = $derived($page.url.searchParams);
	const view = $derived<View>($page.params.view === 'year' ? 'year' : 'month');
	const base = $derived(pageOf($page.url.pathname));
	const span = $derived(SPANS.find((s) => s.id === params.get(P.span))?.id ?? DEFAULT_SPAN);
	const last = $derived(latestYear(data));

	/** The window's first year, or nothing when it reaches back past the record: then it is the lifetime. */
	function sinceOf(s: Span): number | undefined {
		if (s === 'all') return undefined;
		const from = last - Number(s) + 1;
		return (data.meta.years[0] ?? from) < from ? from : undefined;
	}
	const since = $derived(sinceOf(span));
	const spanText = $derived(yearSpan(since == null ? data.meta.years : [since, last]));

	const monthKey = $derived(focusMonth($page.url, latestMonthKey(data)));
	const year = $derived(yearOf(monthKey));
	// A picked year the window has moved past is dropped, so the board never reads a year it hides.
	const scoped = $derived(
		params.get(P.scope) === view && (view === 'month' || since == null || year >= since)
	);
	const pickable = $derived(pickableMonths(data.meta.month_keys, monthKey));
	const years = $derived([...new Set(pickable.map(yearOf))].sort((a, b) => b - a));

	const navigate = (patch: Record<string, string | null>) => step($page.url, patch);

	/** A year's month, as close to the focus month as that year allows; nothing when it has none. */
	function moveToYear(y: number) {
		const next = monthForYear(pickable, String(y), monthKey);
		if (next !== monthKey) navigate({ [MONTH_PARAM]: next });
	}

	/** Picking the period the board is already narrowed to widens it again. */
	function pickMonth(key: string) {
		if (scoped && key === monthKey) navigate({ [P.scope]: null });
		else navigate({ [MONTH_PARAM]: key, [P.scope]: 'month' });
	}
	function pickSpan(s: Span) {
		const from = sinceOf(s);
		navigate({
			[P.span]: s === DEFAULT_SPAN ? null : s,
			[P.scope]: scoped && from != null && year < from ? null : params.get(P.scope)
		});
	}
	function pickYear(label: string) {
		if (scoped && Number(label) === year) navigate({ [P.scope]: null });
		else navigate({ [MONTH_PARAM]: monthForYear(pickable, label, monthKey), [P.scope]: 'year' });
	}
</script>

<ViewHeader title="Analytics">
	<Segmented
		options={VIEWS}
		value={view}
		onchange={(v) =>
			step($page.url, { [P.scope]: null }, { pathname: v === 'month' ? base : `${base}/${v}` })}
		ariaLabel="Analytics time range"
	/>
	{#if view === 'month'}
		<YearNav value={year} {years} onchange={moveToYear} />
	{:else}
		<Segmented options={SPANS} value={span} onchange={pickSpan} ariaLabel="Years shown" />
		<span class="cap">{since == null ? `Lifetime · ${spanText}` : spanText}</span>
	{/if}
</ViewHeader>

{#if view === 'month'}
	<MonthBoard {data} {monthKey} {scoped} onpick={pickMonth} />
{:else}
	<YearBoard {data} {monthKey} {scoped} {since} {spanText} onpick={pickYear} />
{/if}
