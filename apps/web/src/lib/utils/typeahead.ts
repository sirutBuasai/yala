// ARIA APG listbox typeahead: typed characters build a query that jumps to the first option whose
// label starts with it, ignoring case. The query resets after a pause, like a native <select>.

/** Pause, in milliseconds, after which the next keystroke starts a fresh query. */
const RESET_MS = 500;

/** A single printable character with no command modifier, i.e. one the user is typing. */
export function isTypeKey(e: KeyboardEvent): boolean {
	return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * Index of the option matching `query`, searched from `active` and wrapping, or -1 for none. A query
 * of one repeated character cycles through the options starting with it, so typing a letter again
 * moves on from the current match instead of staying on it.
 */
export function matchIndex(labels: string[], query: string, active: number): number {
	const q = query.toLowerCase();
	const cycling = [...q].every((c) => c === q[0]);
	const needle = cycling ? q.slice(0, 1) : q;
	const start = Math.max(0, cycling ? active + 1 : active);

	for (let i = 0; i < labels.length; i++) {
		const idx = (start + i) % labels.length;
		if (labels[idx]?.toLowerCase().startsWith(needle)) return idx;
	}
	return -1;
}

export class Typeahead {
	#query = '';
	#last = -Infinity;

	/** Whether a query is still being typed, so a space belongs to it rather than committing. */
	pending(now = Date.now()): boolean {
		return this.#query !== '' && now - this.#last < RESET_MS;
	}

	/** Append `key` to the running query and return the matching index (see `matchIndex`). */
	type(key: string, labels: string[], active: number, now = Date.now()): number {
		this.#query = this.pending(now) ? this.#query + key : key;
		this.#last = now;
		return matchIndex(labels, this.#query, active);
	}
}
