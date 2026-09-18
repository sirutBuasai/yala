// Shared client-side validation for every form that writes to the ledger. A fast first pass only —
// the API re-validates authoritatively. Problems are collected and reported together.

import { sentenceCase } from '$lib/utils/format';

/** Mirrors the backend's `MAX_TEXT` / `MAX_LEAF` ceilings. */
export const TEXT_MAX = 200;
export const LEAF_MAX = 60;

/** What an amount is allowed to be: its test, and how the field says so when it isn't. */
const AMOUNT_RULES = {
	positive: { ok: (v: number) => v > 0, wording: 'must be greater than 0' },
	nonNegative: { ok: (v: number) => v >= 0, wording: 'must be 0 or more' },
	nonZero: { ok: (v: number) => v !== 0, wording: 'must be non-zero' }
};

type AmountRule = keyof typeof AMOUNT_RULES;

function amountProblem(value: number, label: string, rule: AmountRule): string | null {
	const { ok, wording } = AMOUNT_RULES[rule];

	return Number.isFinite(value) && ok(value) ? null : `${label} ${wording}.`;
}

const NAME_RE = /^[A-Za-z0-9 ]+$/;

/** The character and length rules every typed name shares, worded the same whatever is being named. */
function nameProblem(text: string, label: string, max: number): string | null {
	const Label = sentenceCase(label);
	if (!NAME_RE.test(text)) return `${Label} can only contain letters, numbers and spaces.`;
	if (text.length > max) return `${Label} must be at most ${max} characters.`;
	return null;
}

/**
 * A contribution label. Shown as typed rather than composed into an account path, so it takes a
 * space — but not whitespace at large: an account's labels are written as one comma-joined metadata
 * value on a single ledger line, which a newline or a tab would break.
 */
export function validateLabel(value: string, noun = 'contribution option'): string | null {
	const text = value.trim();
	if (!text) return `${sentenceCase(noun)} is required.`;
	// Named on its own, ahead of the general rule: a comma is what joins them, so it is the one
	// character a person has a reason to expect would work.
	if (text.includes(',')) return `${sentenceCase(noun)} cannot contain a comma.`;
	return nameProblem(text, noun, LEAF_MAX);
}

/**
 * Validate a name typed as words. The backend composes the stored leaf from the letters and digits
 * alone, so anything else would be dropped and the account stored under a name nobody typed.
 */
export function validateName(value: string, label: string): string | null {
	const text = value.trim();
	if (!text) return `${label} is required.`;
	return nameProblem(text, label, TEXT_MAX);
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
	/** Either sign, but not nothing: a refund is a negative bill. */
	nonZero(value: number | null, label: string): Problems;
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
	// An amount that was never typed is a missing field, whatever the rule would have said about it.
	const amount = (rule: AmountRule) => (value: number | null, label: string) => {
		if (value == null) missing.push(label);
		else api.add(amountProblem(value, label, rule));
		return api;
	};
	const api: Problems = {
		require(value, label) {
			if (!value.trim()) missing.push(label);
			return api;
		},
		positive: amount('positive'),
		nonNegative: amount('nonNegative'),
		nonZero: amount('nonZero'),
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
