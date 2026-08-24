// Month-key arithmetic shared by the Monthly and Calendar views. A month key is "YYYY-MM".
// Pure string/date logic — display formatting of month keys lives in format.ts.

/** Shift a month key by whole months. Numeric Date args handle year rollover and avoid the
 * UTC string-parse pitfall (`new Date("2026-07-01")` is parsed as UTC). */
export function addMonths(key: string, delta: number): string {
	const [y = 0, m = 1] = key.split('-').map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The set of months a picker should offer: every month with data, one empty month past the
 * latest (so you can step into a not-yet-populated month), and `current` (so a navigated-to
 * month is always representable). Sorted ascending, de-duped.
 */
export function pickableMonths(monthKeys: string[], current: string): string[] {
	const sorted = [...monthKeys].sort();
	const latest = sorted[sorted.length - 1] ?? '';
	const nextEmpty = latest ? addMonths(latest, 1) : '';
	return [...new Set([...sorted, nextEmpty, current].filter(Boolean))].sort();
}

/**
 * Resolve which month to show when the year is changed: keep the same month-of-year if that
 * year offers it, else fall back to that year's latest pickable month.
 */
export function monthForYear(pickable: string[], year: string, current: string): string {
	const inYear = pickable.filter((k) => k.startsWith(year + '-'));
	const same = `${year}-${current.slice(5)}`;
	return inYear.includes(same) ? same : (inYear[inYear.length - 1] ?? current);
}
