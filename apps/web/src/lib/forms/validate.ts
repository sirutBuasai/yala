// Shared client-side validation for every form that writes to the ledger. A fast first pass only —
// the API re-validates authoritatively. Problems are collected and reported together.

/** Mirrors the backend's `MAX_TEXT` / `MAX_LEAF` ceilings. */
export const TEXT_MAX = 200;
export const LEAF_MAX = 60;

function amountProblem(value: number, label: string, allowZero: boolean): string | null {
	if (Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)) return null;
	return allowZero ? `${label} must be 0 or more.` : `${label} must be greater than 0.`;
}

/** Mirrors the backend's `_LEAF_RE`: a name is a single leaf segment. */
const LEAF_RE = /^[A-Za-z0-9-]+$/;
const ALNUM_RE = /[A-Za-z0-9]/;

/** Returns a message, or null when the name passes. */
export function validateLeaf(leaf: string, noun: string): string | null {
	if (!leaf) return `Enter ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}.`;
	if (!LEAF_RE.test(leaf)) return 'Use only letters, numbers, or hyphens.';
	if (leaf.length > LEAF_MAX) return `Use at most ${LEAF_MAX} characters.`;
	return null;
}

/**
 * Validate a name typed as words. The backend composes the stored leaf from the letters and digits
 * alone, so a value with neither would compose to an empty account name.
 */
export function validateName(value: string, label: string): string | null {
	const text = value.trim();
	if (!text) return `${label} is required.`;
	if (!ALNUM_RE.test(text)) return `${label} needs at least one letter or number.`;
	if (text.length > TEXT_MAX) return `${label} must be at most ${TEXT_MAX} characters.`;
	return null;
}

/** The same rules for a name the form allows to be left blank. */
export function validateOptionalName(value: string, label: string): string | null {
	return value.trim() ? validateName(value, label) : null;
}

/** Inclusive range check mirroring the backend's `coerce`. */
export function validateRange(
	value: number | null,
	label: string,
	min: number,
	max: number,
	integer = false
): string | null {
	if (value == null || !Number.isFinite(value)) return `${label} must be a number.`;
	if (integer && !Number.isInteger(value)) return `${label} must be a whole number.`;
	if (value < min || value > max) return `${label} must be between ${min} and ${max}.`;
	return null;
}

/**
 * A row is only submitted with both a type and an amount, so a wholly empty row is a no-op and
 * passes; only an amount with no type, or a non-positive amount, are flagged.
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
	require(value: string, label: string): Problems;
	positive(value: number | null, label: string): Problems;
	nonNegative(value: number | null, label: string): Problems;
	/** Any other check that already produced a full-sentence message (or null). */
	add(message: string | null): Problems;
	/** The combined message, or '' when everything passed. */
	message(): string;
}

/**
 * Collect every problem so they surface together: missing required fields merge into one clause,
 * other problems follow on their own lines. Newline-separated so the footer shows one per line.
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
			else api.add(amountProblem(value, label, false));
			return api;
		},
		nonNegative(value, label) {
			if (value == null) missing.push(label);
			else api.add(amountProblem(value, label, true));
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
