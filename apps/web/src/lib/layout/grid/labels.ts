// Only the `text` half is stored; `context` is rebuilt each render, so a renamed pane still names its period.

import { Pref, record, shape, text } from '$lib/utils/persist.svelte';
import { LABEL_MAX, type Label, type Slot } from '$lib/ui/label';

/** Bump when a board id starts naming something else, or its old rename sits on the new card. Not needed for
    a new card: unknown ids drop on read. */
const VERSION = 1;

type Renamed = Partial<Record<Slot, string>>;

export class BoardLabels {
	readonly #pref: Pref<Record<string, Renamed>>;

	/** `ids` is everything on this board that can be renamed: its panes, plus each KPI section, whose id
	    is its own and not the card's. */
	constructor(key: string, ids: string[]) {
		this.#pref = new Pref<Record<string, Renamed>>(
			`labels-${key}-${VERSION}`,
			{},
			record(shape<Renamed>({ title: text(LABEL_MAX), caption: text(LABEL_MAX) }))
		);

		// A rename for a card this board no longer has is dropped rather than left to sit in storage for
		// the life of the browser — and to be picked up by whatever takes that id next.
		const known = Object.entries(this.#pref.value).filter(([id]) => ids.includes(id));
		if (known.length !== Object.keys(this.#pref.value).length) {
			this.#pref.value = Object.fromEntries(known);
		}
	}

	/** The declared label with the user's text in place of the code's, or as it was declared. */
	label(id: string, slot: Slot, declared: Label | undefined): Label | undefined {
		const own = this.#pref.value[id]?.[slot];
		return own === undefined ? declared : { ...declared, text: own };
	}

	/** What is stored for one slot, if anything — the tests' window on the table. */
	textOf(id: string, slot: Slot): string | undefined {
		return this.#pref.value[id]?.[slot];
	}

	/** Stored verbatim, empty included: emptying a label hides that half of it, and the separator goes with
	    it (see `labelText`). Not trimmed here, which would eat the space between two words as they're typed. */
	set(id: string, slot: Slot, value: string): void {
		this.#pref.value = {
			...this.#pref.value,
			[id]: { ...this.#pref.value[id], [slot]: value.slice(0, LABEL_MAX) }
		};
	}

	reset(): void {
		this.#pref.value = {};
	}
}
