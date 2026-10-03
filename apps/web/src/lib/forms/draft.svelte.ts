// A form's unsaved input, kept while the reader switches pages. Module memory rather than storage, so a reload
// drops every draft.

const kept = new Map<string, unknown>();

/** Mirrors `current` under `key` from the owning component's init; `current` returns undefined while there is
    nothing worth keeping yet, which leaves the last draft in place. */
export class Draft<T> {
	/** What the form held when it was last left, or undefined when it starts fresh. */
	readonly saved: T | undefined;
	readonly #key: string;
	#cleared = false;

	constructor(key: string, current: () => T | undefined) {
		this.#key = key;
		this.saved = kept.get(key) as T | undefined;
		$effect(() => {
			const value = $state.snapshot(current());
			if (value !== undefined && !this.#cleared) kept.set(key, value);
		});
	}

	/** Once the input is written: forget it, and stop mirroring for the rest of this form's life. */
	clear(): void {
		this.#cleared = true;
		kept.delete(this.#key);
	}
}

/** Drop every draft, as a reload would. */
export function forgetDrafts(): void {
	kept.clear();
}
