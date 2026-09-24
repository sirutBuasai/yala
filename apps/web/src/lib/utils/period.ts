// Month-key arithmetic; a month key is "YYYY-MM". Display formatting of them lives in format.ts.

/** `month` is 1-based. */
export function monthKey(year: number, month: number): string {
	return `${year}-${String(month).padStart(2, '0')}`;
}

/** The year of a month key or an ISO date. */
export function yearOf(key: string): number {
	return +key.slice(0, 4);
}

/** The 1-based month of a month key or an ISO date. */
export function monthOf(key: string): number {
	return +key.slice(5, 7);
}

export function isoDate(monthKey: string, day: number): string {
	return `${monthKey}-${String(day).padStart(2, '0')}`;
}

/** A local date as "YYYY-MM-DD"; `toISOString` would give the UTC day instead. */
export function isoOf(d: Date): string {
	return isoDate(monthKey(d.getFullYear(), d.getMonth() + 1), d.getDate());
}

export function todayIso(): string {
	return isoOf(new Date());
}

/** Numeric Date args, so month and year rollover work and the UTC parse pitfall is avoided. */
export function addDays(iso: string, delta: number): string {
	const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
	return isoOf(new Date(y, m - 1, d + delta));
}

/** Numeric Date args, so year rollover works and the string form's UTC parse pitfall is avoided. */
export function addMonths(key: string, delta: number): string {
	const [y = 0, m = 1] = key.split('-').map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return monthKey(d.getFullYear(), d.getMonth() + 1);
}

/**
 * Every month with data, one empty month past the latest so you can step into an unpopulated month,
 * and `current` so a navigated-to month is always representable. Ascending and de-duped.
 */
export function pickableMonths(monthKeys: string[], current: string): string[] {
	const sorted = [...monthKeys].sort();
	const latest = sorted[sorted.length - 1] ?? '';
	const nextEmpty = latest ? addMonths(latest, 1) : '';
	return [...new Set([...sorted, nextEmpty, current].filter(Boolean))].sort();
}

/** On a year change, keep the same month-of-year if offered, else that year's latest pickable month. */
export function monthForYear(pickable: string[], year: string, current: string): string {
	const inYear = pickable.filter((k) => k.startsWith(year + '-'));
	const same = `${year}-${current.slice(5)}`;
	return inYear.includes(same) ? same : (inYear[inYear.length - 1] ?? current);
}
