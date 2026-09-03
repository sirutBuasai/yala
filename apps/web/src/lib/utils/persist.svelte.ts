// Sticky UI preferences: values that survive a refresh, a tab switch, and a trip through /dev.
//
// Only PREFERENCES belong here — which entry type the Add overlay opens on, which month a view is
// looking at, how a list is sorted. Never ledger data: the ledger is the source of truth for that,
// and a stale mirror of it would be a bug dressed as a convenience.
//
// Everything reads through `revive`, a validator applied to whatever came back from storage. It is
// not optional politeness: a stored preference outlives the release that wrote it, so a month key
// from a deleted year or an entry kind that no longer exists WILL show up, and without a validator
// the app would be poisoned by its own cache. A rejected value falls back to the default.

import { writable, type Writable } from 'svelte/store';

/** Namespace, so the app's keys are identifiable in devtools and can't collide with a host page. */
const PREFIX = 'yala-';

function read<T>(key: string, fallback: T, revive: Revive<T>): T {
	try {
		const raw = localStorage.getItem(PREFIX + key);
		if (raw === null) return fallback;
		return revive(JSON.parse(raw) as unknown) ?? fallback;
	} catch {
		// Corrupt JSON, or storage unavailable (private mode, quota exceeded). Preferences are
		// best-effort by definition, so fall back rather than take the page down with them.
		return fallback;
	}
}

function write(key: string, value: unknown): void {
	try {
		localStorage.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		/* storage unavailable — persistence is best-effort */
	}
}

/** Validates a value read back from storage; returns undefined to reject it. */
export type Revive<T> = (value: unknown) => T | undefined;

/** A store whose every value is mirrored into localStorage. For app-wide sticky preferences. */
export function persisted<T>(key: string, fallback: T, revive: Revive<T>): Writable<T> {
	const store = writable(read(key, fallback, revive));
	store.subscribe((v) => write(key, v));
	return store;
}

/**
 * The same thing for a component's own `$state`: `pref.value` reads and writes like a rune, and
 * every assignment persists. Use this where a store would force a `$`-prefixed read into markup
 * that is otherwise all runes.
 */
export class Pref<T> {
	#value: T;
	readonly #key: string;

	constructor(key: string, fallback: T, revive: Revive<T>) {
		this.#key = key;
		this.#value = $state(read(key, fallback, revive));
	}

	get value(): T {
		return this.#value;
	}

	set value(v: T) {
		this.#value = v;
		write(this.#key, v);
	}
}

// --- revivers ---

/** Accepts only one of a known set — a tab id, an entry kind, a sort direction. */
export function oneOf<T extends string>(allowed: readonly T[]): Revive<T> {
	return (v) =>
		typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Accepts any string matching a shape, e.g. a "YYYY-MM" month key. */
export function matching(pattern: RegExp): Revive<string> {
	return (v) => (typeof v === 'string' && pattern.test(v) ? v : undefined);
}

/** Accepts a finite number, optionally within bounds. */
export function number(min = -Infinity, max = Infinity): Revive<number> {
	return (v) =>
		typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
}

/** Accepts an object with a KNOWN key set, each entry surviving its own reviver; unknown keys are
    dropped. Use `record` instead when the keys aren't known ahead of time. */
export function shape<T extends Record<string, unknown>>(revivers: {
	[K in keyof T]: Revive<T[K]>;
}): Revive<Partial<T>> {
	return (v) => {
		if (typeof v !== 'object' || v === null) return undefined;
		const src = v as Record<string, unknown>;
		const out: Partial<T> = {};
		for (const key of Object.keys(revivers) as (keyof T)[]) {
			const kept = revivers[key](src[key as string]);
			if (kept !== undefined) out[key] = kept;
		}
		return out;
	};
}

/**
 * Accepts an object with ARBITRARY keys whose values each survive `value` — a lookup table, e.g.
 * scroll offset per tab. Entries whose value is rejected are dropped, so one bad entry can't
 * discard the rest of the table.
 */
export function record<T>(value: Revive<T>): Revive<Record<string, T>> {
	return (v) => {
		if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
		const out: Record<string, T> = {};
		for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
			const kept = value(raw);
			if (kept !== undefined) out[k] = kept;
		}
		return out;
	};
}

/**
 * Accepts an array whose items each survive `item`. Rejected items are dropped rather than failing
 * the whole list — a remembered set of paycheck row labels shouldn't be lost because one label was
 * hand-edited into nonsense.
 */
export function listOf<T>(item: Revive<T>): Revive<T[]> {
	return (v) => {
		if (!Array.isArray(v)) return undefined;
		return v.map(item).filter((x): x is T => x !== undefined);
	};
}
