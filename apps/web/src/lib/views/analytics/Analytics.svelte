<script lang="ts">
	// Analytics: read trends across months and years (docs/redesign/specs/analytics.md). Each grain is its
	// own board with its own stored arrangement.
	import { page } from '$app/stores';
	import type { DashboardData } from '$lib/data/types';
	import { latestMonthKey } from '$lib/data/scope';
	import { yearSpan } from '$lib/utils/format';
	import { monthForYear, pickableMonths, yearOf } from '$lib/utils/period';
	import { focusMonth, MONTH_PARAM } from '$lib/nav/focus';
	import { step } from '$lib/nav/step';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import Segmented from '$lib/nav/Segmented.svelte';
	import YearNav from '$lib/nav/YearNav.svelte';
	import MonthBoard from './MonthBoard.svelte';
	import YearBoard from './YearBoard.svelte';

	type View = 'month' | 'year';

	interface Props {
		data: DashboardData;
	}
	let { data }: Props = $props();

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'month', label: 'Month' },
		{ id: 'year', label: 'Year' }
	];
	// Page state in the URL (D9). `scope` names the grain the board is narrowed to, and only counts on the
	// view of that grain: `scope=month` on Month, `scope=year` on Year.
	const P = { view: 'view', scope: 'scope' } as const;

	const params = $derived($page.url.searchParams);
	const view = $derived<View>(params.get(P.view) === 'year' ? 'year' : 'month');
	const scoped = $derived(params.get(P.scope) === view);
	const monthKey = $derived(focusMonth($page.url, latestMonthKey(data)));
	const year = $derived(yearOf(monthKey));
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
	function pickYear(label: string) {
		if (scoped && Number(label) === year) navigate({ [P.scope]: null });
		else navigate({ [MONTH_PARAM]: monthForYear(pickable, label, monthKey), [P.scope]: 'year' });
	}
</script>

<ViewHeader title="Analytics">
	<Segmented
		options={VIEWS}
		value={view}
		onchange={(v) => navigate({ [P.view]: v === 'month' ? null : v, [P.scope]: null })}
		ariaLabel="Analytics time range"
	/>
	{#if view === 'month'}
		<YearNav value={year} {years} onchange={moveToYear} />
	{:else}
		<span class="cap">Lifetime · {yearSpan(data.meta.years)}</span>
	{/if}
</ViewHeader>

{#if view === 'month'}
	<MonthBoard {data} {monthKey} {scoped} onpick={pickMonth} />
{:else}
	<YearBoard {data} {monthKey} {scoped} onpick={pickYear} />
{/if}
