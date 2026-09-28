// Preferences only, never ledger data. Every read is revived, since a stored value outlives the shape that
// wrote it; rejects fall back to the default. Kept in this browser unless a `PrefStore` says otherwise.

import { writable, type Writable } from 'svelte/store';

/** Namespace, so the app's keys are identifiable in devtools and can't collide with a host page. */
const PREFIX = 'yala-';

/** Where a preference is kept. `read` gives back what was written, or undefined when nothing is. */
export interface PrefStore {
	read(key: string): unknown;
	write(key: string, value: unknown): void;
	remove(key: string): void;
}

/** This browser alone. Best-effort: storage can be unavailable, and a preference never throws. */
export const browserStore: PrefStore = {
	read(key) {
		try {
			const raw = localStorage.getItem(PREFIX + key);
			return raw === null ? undefined : (JSON.parse(raw) as unknown);
		} catch {
			return undefined;
		}
	},
	write(key, value) {
		try {
			localStorage.setItem(PREFIX + key, JSON.stringify(value));
		} catch {
			/* storage unavailable — persistence is best-effort */
		}
	},
	remove(key) {
		try {
			localStorage.removeItem(PREFIX + key);
		} catch {
			/* storage unavailable */
		}
	}
};

function read<T>(store: PrefStore, key: string, fallback: T, revive: Revive<T>): T {
	const raw = store.read(key);
	return raw === undefined ? fallback : (revive(raw) ?? fallback);
}

/** Validates a value read back from storage; returns undefined to reject it. */
export type Revive<T> = (value: unknown) => T | undefined;

/** A store whose every value is mirrored into localStorage. */
export function persisted<T>(key: string, fallback: T, revive: Revive<T>): Writable<T> {
	const store = writable(read(browserStore, key, fallback, revive));
	store.subscribe((v) => browserStore.write(key, v));
	return store;
}

/** The same for a component's own `$state`: `pref.value` reads like a rune and every write persists. */
export class Pref<T> {
	#value: T;
	readonly #key: string;
	readonly #fallback: T;
	readonly #store: PrefStore;

	constructor(key: string, fallback: T, revive: Revive<T>, store: PrefStore = browserStore) {
		this.#key = key;
		this.#fallback = fallback;
		this.#store = store;
		this.#value = $state(read(store, key, fallback, revive));
		// Written before a default stopped being stored, or adopted from this browser: drop it here too.
		if (this.#isDefault(this.#value) && store.read(key) !== undefined) store.remove(key);
	}

	#isDefault(v: T): boolean {
		return JSON.stringify(v) === JSON.stringify(this.#fallback);
	}

	get value(): T {
		return this.#value;
	}

	/** A value back on the default is removed rather than stored, so a later change to the default
	    reaches it. */
	set value(v: T) {
		this.#value = v;
		if (this.#isDefault(v)) this.#store.remove(this.#key);
		else this.#store.write(this.#key, v);
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

/** `null` kept as a stored choice of nothing, anything else revived by `value`. */
export function orNull<T>(value: Revive<T>): Revive<T | null> {
	return (v) => (v === null ? null : value(v));
}

/** Free text up to `max` characters. */
export function text(max: number): Revive<string> {
	return (v) => (typeof v === 'string' && v.length <= max ? v : undefined);
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
