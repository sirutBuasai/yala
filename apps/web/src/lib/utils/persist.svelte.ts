// Sticky UI preferences in localStorage. Only PREFERENCES belong here, never ledger data.
//
// Every read goes through a `revive` validator, because a stored preference outlives the release
// that wrote it: a key from a shape the app no longer uses WILL show up. Rejected values fall back
// to the default.

import { writable, type Writable } from 'svelte/store';

/** Namespace, so the app's keys are identifiable in devtools and can't collide with a host page. */
const PREFIX = 'yala-';

function read<T>(key: string, fallback: T, revive: Revive<T>): T {
	try {
		const raw = localStorage.getItem(PREFIX + key);
		if (raw === null) return fallback;
		return revive(JSON.parse(raw) as unknown) ?? fallback;
	} catch {
		// Corrupt JSON, or storage unavailable — preferences are best-effort, so never throw.
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

/** A store whose every value is mirrored into localStorage. */
export function persisted<T>(key: string, fallback: T, revive: Revive<T>): Writable<T> {
	const store = writable(read(key, fallback, revive));
	store.subscribe((v) => write(key, v));
	return store;
}

/** The same for a component's own `$state`: `pref.value` reads like a rune and every write persists. */
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

export function oneOf<T extends string>(allowed: readonly T[]): Revive<T> {
	return (v) =>
		typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function matching(pattern: RegExp): Revive<string> {
	return (v) => (typeof v === 'string' && pattern.test(v) ? v : undefined);
}

export function number(min = -Infinity, max = Infinity): Revive<number> {
	return (v) =>
		typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
}

/** Known key set; unknown keys are dropped. Use `record` when the keys aren't known ahead of time. */
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

/** Arbitrary keys; entries whose value is rejected are dropped, so one can't discard the table. */
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

/** Rejected items are dropped rather than failing the whole list. */
export function listOf<T>(item: Revive<T>): Revive<T[]> {
	return (v) => {
		if (!Array.isArray(v)) return undefined;
		return v.map(item).filter((x): x is T => x !== undefined);
	};
}
