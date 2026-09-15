// The write half the entry forms share: the footer's message strip, and the round trips that all report
// failure through it.
//
// `.svelte.ts` because the strip is `$state` the footer reads.

import { deleteTransaction, fetchEntry, postJson } from '$lib/data/load';

/** One form's message strip. Every failure in a form goes through `fail`, so the footer has one source. */
export class EntryMessage {
	text = $state('');
	failed = $state(false);

	fail(message: string): void {
		this.text = message;
		this.failed = true;
	}

	clear(): void {
		this.text = '';
		this.failed = false;
	}
}

/** An entry kind, which is also its API path segment: `/api/<kind>` adds, `/api/<kind>/update` edits. */
export type EntryKind = 'transaction' | 'transfer' | 'paycheck';

/** The strip plus the three round trips an add/edit form makes. */
export class EntryForm extends EntryMessage {
	readonly #kind: EntryKind;
	readonly #onsaved: () => void;

	constructor(kind: EntryKind, onsaved: () => void) {
		super();
		this.#kind = kind;
		this.#onsaved = onsaved;
	}

	/** Prefill from the entry `locator` names, handing the record to `apply`. */
	async load(locator: string, apply: (entry: Record<string, any>) => void): Promise<void> {
		const { entry, error } = await fetchEntry(this.#kind, locator);
		if (!entry) {
			this.fail(error ?? 'load failed');
			return;
		}
		apply(entry);
	}

	/**
	 * Save `body`, adding or updating by whether it carries a locator. `problem` is what validation
	 * refused, or null. `remember` runs only on a successful add, where this entry's picks become the
	 * next one's defaults.
	 */
	async save(problem: string | null, body: object, remember?: () => void): Promise<void> {
		if (problem) {
			this.fail(problem);
			return;
		}
		const editing = 'locator' in body && body.locator != null;
		const { ok, error } = await postJson(`/api/${this.#kind}${editing ? '/update' : ''}`, body);
		if (!ok) {
			this.fail(error ?? 'save failed');
			return;
		}
		if (!editing) remember?.();
		this.#onsaved();
	}

	async remove(locator: string): Promise<void> {
		const problem = await deleteTransaction(locator);
		if (problem) {
			this.fail(problem);
			return;
		}
		this.#onsaved();
	}
}
