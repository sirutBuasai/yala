// A board's period picks, read from and written to the URL. The view is the path, which a
// reload keeps; the picks are the query, which it drops. `scope` names the grain the board is narrowed
// to, and only counts on the view of that grain: `scope=month` on Month, `scope=year` on Year. `span` is how
// far back Year reaches, always ending at the latest year.

import type { DashboardData } from '$lib/data/types';
import { latestMonthKey, latestYear } from '$lib/data/scope';
import { yearSpan } from '$lib/utils/format';
import { monthForYear, pickableMonths, yearOf } from '$lib/utils/period';
import { focusMonth, MONTH_PARAM } from '$lib/nav/focus';
import { step } from '$lib/nav/step';
import type { View } from '$lib/nav/views';

export type Span = '3' | '5' | '10' | 'all';

export const SPANS: { id: Span; label: string }[] = [
	{ id: '3', label: '3Y' },
	{ id: '5', label: '5Y' },
	{ id: '10', label: '10Y' },
	{ id: 'all', label: 'All' }
];
const DEFAULT_SPAN: Span = '10';

const P = { scope: 'scope', span: 'span' } as const;

/** `record` is the years the page's figures span, ascending: the tracked years unless it reads another
    record, as net worth reads its snapshots'. */
export function periodPicks(
	url: URL,
	data: DashboardData,
	view: View,
	record: number[] = data.meta.years
) {
	const params = url.searchParams;
	const navigate = (patch: Record<string, string | null>) => step(url, patch);

	const span = SPANS.find((s) => s.id === params.get(P.span))?.id ?? DEFAULT_SPAN;
	const last = record.at(-1) ?? latestYear(data);
	/** The window's first year, or nothing when it reaches back past the record: then it is the lifetime. */
	const sinceOf = (s: Span): number | undefined => {
		if (s === 'all') return undefined;
		const from = last - Number(s) + 1;
		return (record[0] ?? from) < from ? from : undefined;
	};
	const since = sinceOf(span);

	const monthKey = focusMonth(url, latestMonthKey(data));
	const year = yearOf(monthKey);
	// A picked year the window has moved past is dropped, so the board never reads a year it hides.
	const scoped =
		params.get(P.scope) === view && (view === 'month' || since == null || year >= since);
	const pickable = pickableMonths(data.meta.month_keys, monthKey);

	return {
		monthKey,
		year,
		/** Years holding a pickable month, newest first: `month` cannot name a month in any other. */
		years: [...new Set(pickable.map(yearOf))].sort((a, b) => b - a),
		/** Whether the board reads at the focus period rather than its whole span. */
		scoped,
		span,
		since,
		spanText: yearSpan(since == null ? record : [since, last]),

		/** A year's month, as close to the focus month as that year allows; nothing when it has none. */
		moveToYear(y: number) {
			const next = monthForYear(pickable, String(y), monthKey);
			if (next !== monthKey) navigate({ [MONTH_PARAM]: next });
		},
		/** Picking the period the board is already narrowed to widens it again. */
		pickMonth(key: string) {
			if (scoped && key === monthKey) navigate({ [P.scope]: null });
			else navigate({ [MONTH_PARAM]: key, [P.scope]: 'month' });
		},
		pickYear(label: string) {
			if (scoped && Number(label) === year) navigate({ [P.scope]: null });
			else navigate({ [MONTH_PARAM]: monthForYear(pickable, label, monthKey), [P.scope]: 'year' });
		},
		pickSpan(s: Span) {
			const from = sinceOf(s);
			navigate({
				[P.span]: s === DEFAULT_SPAN ? null : s,
				[P.scope]: scoped && from != null && year < from ? null : params.get(P.scope)
			});
		}
	};
}
