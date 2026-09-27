// A pane follows its label while the label is typed: it grows to fit the words and gives room back down
// to the size the edit opened at. Words the card cannot fit are put back.

import { selectContents } from '$lib/utils/selection';
import { fits, overrun } from './spill';
import { COLS, UNIT } from './units';
import type { Rect } from './types';

/** Structural rather than an `Arrangement` import, as `GestureTarget` is. */
export interface DraftTarget {
	placed(id: string): Rect;
	startDraft(id: string, w: number, h: number): void;
	relaxDraft(id: string): void;
	setDraft(id: string, w: number, h: number): void;
	endDraft(id: string): void;
}

export interface DraftBox {
	card?: HTMLElement;
	body?: HTMLElement;
}

/** The field a label edit opens (see `ui/LabelLine`), whose own events say when an edit is in progress. */
export function isLabelField(target: EventTarget | null): target is HTMLElement {
	return (
		target instanceof HTMLElement && target.isContentEditable && target.classList.contains('name')
	);
}

export class LabelDraft {
	readonly #pane: () => string;
	readonly #target: DraftTarget;
	readonly #box: () => DraftBox;
	readonly #settle: () => Promise<void>;

	/** The last words the card could fit. */
	#fitting = '';
	/** Set while the words are put back, so the revert is not read as one more edit. */
	#reverting = false;
	/** Keystrokes arrive inside the frames an earlier run awaits, and only the latest may decide what fitted. */
	#run = 0;

	constructor(
		pane: () => string,
		target: DraftTarget,
		box: () => DraftBox,
		settle: () => Promise<void>
	) {
		this.#pane = pane;
		this.#target = target;
		this.#box = box;
		this.#settle = settle;
	}

	begin(field: HTMLElement): void {
		const id = this.#pane();
		const { w, h } = this.#target.placed(id);
		this.#fitting = field.textContent ?? '';
		this.#target.startDraft(id, w, h);
	}

	/** Drops to the size the edit opened at first, or the pane never learns it could shrink. */
	async track(field: HTMLElement): Promise<void> {
		if (!this.#box().card || this.#reverting) return;
		const run = ++this.#run;
		await this.#regrow();
		const { card, body } = this.#box();
		if (!card || run !== this.#run) return;

		if (fits(card, body)) {
			this.#fitting = field.textContent ?? '';
			return;
		}
		// Not a loop: a loop here spun forever when the restored words didn't fit either.
		this.#reverting = true;
		field.textContent = this.#fitting;
		field.dispatchEvent(new Event('input', { bubbles: true }));
		selectContents(field, true);
		await this.#regrow();
		this.#reverting = false;
	}

	async end(field: HTMLElement): Promise<void> {
		await this.track(field);
		this.#target.endDraft(this.#pane());
	}

	async #regrow(): Promise<void> {
		this.#target.relaxDraft(this.#pane());
		await this.#settle();
		await this.#growUntilItFits();
	}

	/** Repeats until the content fits or the pane can't grow: room changes wrapping, and a merged section gets
	    only its weighted share. Bounded by the grid, since a pass budget left some sections short. */
	async #growUntilItFits(): Promise<void> {
		const id = this.#pane();
		for (let pass = 0; pass < COLS; pass++) {
			const { card, body } = this.#box();
			if (!card) return;
			const over = overrun(card, body);
			if (!over.x && !over.y) return;
			const was = this.#target.placed(id);
			this.#target.setDraft(id, was.w + Math.ceil(over.x / UNIT), was.h + Math.ceil(over.y / UNIT));
			await this.#settle();
			const now = this.#target.placed(id);
			if (now.w === was.w && now.h === was.h) return;
		}
	}
}
