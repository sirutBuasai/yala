// Shared client-side validation for every form that writes to the ledger.
//
// The first, fast line of defense — specific messages before a round trip; the API re-validates
// authoritatively (a form is not a security boundary). Problems are collected and reported
// together, so the user fixes everything at once instead of one prompt at a time.

/** The backend's own ceilings (`MAX_TEXT` / `MAX_LEAF` in api.py), so a form rejects what it would. */
export const TEXT_MAX = 200;
export const LEAF_MAX = 60;

/** A typed amount, once it is known to be present. Non-finite fails the same way as out-of-range. */
function amountProblem(value: number, label: string, allowZero: boolean): string | null {
	if (Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)) return null;
	return allowZero ? `${label} must be 0 or more.` : `${label} must be greater than 0.`;
}

/** A new account / category name is a single leaf segment (mirrors the backend's `_LEAF_RE`). */
const LEAF_RE = /^[A-Za-z0-9-]+$/;
const ALNUM_RE = /[A-Za-z0-9]/;

/**
 * Validate a name typed for a new account, category, employer, or contribution label. Returns a
 * message, or null when it passes. Shared by every "add a …" field so they can't drift apart.
 */
export function validateLeaf(leaf: string, noun: string): string | null {
	if (!leaf) return `Enter ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}.`;
	if (!LEAF_RE.test(leaf)) return 'Use only letters, numbers, or hyphens.';
	if (leaf.length > LEAF_MAX) return `Use at most ${LEAF_MAX} characters.`;
	return null;
}

/**
 * Validate a name typed as words — an institution, a product name, a short form. The backend joins
 * these into the stored leaf by keeping only letters and digits, so a value with neither would
 * compose to an empty account name.
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

/**
 * Validate a number against an inclusive range, optionally requiring a whole number. Mirrors the
 * backend's `coerce`, so a setting rejected in the form is rejected the same way in the ledger.
 */
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
	/** A required amount that must be present and zero or more (a balance can be nothing). */
	nonNegative(value: number | null, label: string): Problems;
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
