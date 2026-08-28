// Shared client-side validation for the entry forms (transaction / paycheck / bill pay).
//
// The first, fast line of defense — specific messages before a round trip; the API re-validates
// authoritatively (a form is not a security boundary). Problems are collected and reported
// together, so the user fixes everything at once instead of one prompt at a time.

export function requirePositive(value: number | null, label: string): string | null {
	if (value == null) return `${label} is required.`;
	if (!Number.isFinite(value) || value <= 0) return `${label} must be greater than 0.`;
	return null;
}

/**
 * A row is only submitted when it has both a type and an amount, so the two mistakes worth flagging
 * are the ones that lose input or write a bad leg: an amount with no type picked, and a
 * non-positive amount against a type. A wholly empty row is a harmless no-op and passes.
 */
export function validateRows(
	rows: { value: string; amount: number | null }[],
	noun: string
): string | null {
	for (const r of rows) {
		if (r.amount == null) continue;
		if (!Number.isFinite(r.amount) || r.amount <= 0)
			return `Enter an amount greater than 0 for each ${noun}.`;
		if (!r.value) return `Pick a type for each ${noun}.`;
	}
	return null;
}

/** "A", "A and B", "A, B and C". */
function andList(items: string[]): string {
	if (items.length <= 2) return items.join(' and ');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

interface Problems {
	/** A required free text / selection value. */
	require(value: string, label: string): Problems;
	/** A required amount that must be present and strictly positive. */
	positive(value: number | null, label: string): Problems;
	/** Any other one-off check that already produced a full-sentence message (or null). */
	add(message: string | null): Problems;
	/** The combined message, or '' when everything passed. */
	message(): string;
}

/**
 * Collect every validation problem so they surface together: missing required fields merge into one
 * clause ("Title and Total bill are required."), and any other problems follow on their own lines
 * ("Total bill must be greater than 0."). Newline-separated so the footer shows one per line.
 */
export function problems(): Problems {
	const missing: string[] = [];
	const other: string[] = [];
	const api: Problems = {
		require(value, label) {
			if (!value.trim()) missing.push(label);
			return api;
		},
		positive(value, label) {
			if (value == null) missing.push(label);
			else api.add(requirePositive(value, label));
			return api;
		},
		add(message) {
			if (message) other.push(message);
			return api;
		},
		message() {
			const parts = [...other];
			if (missing.length) {
				const verb = missing.length > 1 ? 'are' : 'is';
				parts.unshift(`${andList(missing)} ${verb} required.`);
			}
			return parts.join('\n');
		}
	};
	return api;
}
