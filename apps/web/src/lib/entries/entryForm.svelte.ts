// The round trips an entry form makes, reported through the shared `SaveState`; `.svelte.ts` because what
// the entry loaded as is `$state`.

import { entryAction, fetchEntry, postJson, type AccountsInfo } from '$lib/data/load';
import { SaveState } from '$lib/forms/saveState.svelte';

/** What every add/edit entry form takes. Declared once: the three forms differ in what they ask
    for, never in how they are opened. */
export interface EntryFormProps {
	accounts: AccountsInfo;
	/** When set, edit that entry; when absent, add a new one. */
	locator?: string;
	/** Add mode only: pre-fill the date field. */
	presetDate?: string;
	/** Called after a successful save or delete (the parent refreshes data and closes the modal). */
	onsaved: () => void;
}

/** An entry kind, which is also its API path segment: `/api/<kind>` adds, `/api/<kind>/update` edits. */
export type EntryKind = 'transaction' | 'transfer' | 'paycheck';

/** The three round trips an add/edit form makes. `body` is what the form would send, which is also how an edit
    tells whether anything has changed since it loaded. */
export class EntryForm extends SaveState {
	readonly #kind: EntryKind;
	readonly #onsaved: () => void;
	readonly #body: () => object;
	/** The body as the entry loaded, serialized; null while adding, when everything is new. */
	#loaded = $state<string | null>(null);

	constructor(kind: EntryKind, onsaved: () => void, body: () => object) {
		super();
		this.#kind = kind;
		this.#onsaved = onsaved;
		this.#body = body;
	}

	/** An add always has something to write; an edit, once the body differs from what loaded. */
	get dirty(): boolean {
		return this.#loaded === null || JSON.stringify(this.#body()) !== this.#loaded;
	}

	/** Prefill from the entry `locator` names, handing the record to `apply`. */
	async load(locator: string, apply: (entry: Record<string, any>) => void): Promise<void> {
		const { entry, error } = await fetchEntry(this.#kind, locator);
		if (!entry) {
			this.fail(error ?? 'load failed');
			return;
		}
		apply(entry);
		this.#loaded = JSON.stringify(this.#body());
	}

	/** Adds or updates by whether the body carries a locator. `remember` runs only after a successful add. */
	async save(problem: string | null, remember?: () => void): Promise<void> {
		if (problem) {
			this.fail(problem);
			return;
		}
		const body = this.#body();
		const editing = 'locator' in body && body.locator != null;
		const ok = await this.run(async () => {
			const { ok, error } = await postJson(`/api/${this.#kind}${editing ? '/update' : ''}`, body);
			return ok ? null : (error ?? 'save failed');
		});
		if (!ok) return;
		if (!editing) remember?.();
		this.#onsaved();
	}

	async remove(locator: string): Promise<void> {
		if (await this.run(() => entryAction('delete', locator))) this.#onsaved();
	}
}
