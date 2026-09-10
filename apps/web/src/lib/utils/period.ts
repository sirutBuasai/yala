// Month-key arithmetic; a month key is "YYYY-MM". Display formatting of them lives in format.ts.

/** Numeric Date args, so year rollover works and the string form's UTC parse pitfall is avoided. */
export function addMonths(key: string, delta: number): string {
	const [y = 0, m = 1] = key.split('-').map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
