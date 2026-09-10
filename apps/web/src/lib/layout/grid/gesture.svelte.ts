// One pane's gesture, as a state object: what the press captured, what the pointer has done to it
// since, and whether the content will stand for it.
//
// Runes, but no DOM. Both things it cannot work out for itself — whether the content spilled, and
// when the candidate size has actually been laid out — arrive as functions, so the whole of a
// gesture's behaviour can be driven from a test with a scripted answer instead of a browser.
//
// ── The minimum size ─────────────────────────────────────────────────────────
// Never predicted. During a resize the pane is already laid out at the candidate size, so the DOM
// is asked whether the content spilled (see `spill.ts`). If it did, the preview is held at the
// last size that fitted — so the edge sticks the way a native min-size does — and the pane wears
// its rejected state while the pointer pushes past that limit. On release the last fitting size
// stands: the gesture is never thrown away.
//
// That costs a synchronous layout read on every pointer move, and is meant to: one pane is being
// dragged at a time, and there is no board in this app where that read is measurable. It is the
// resizing pane's own content that bounds it — a table with thousands of rows in a fitted pane would
// be the first thing to notice.

import { EDGES, moveRect, resizeRect, type Edge } from './resize';
import { UNIT } from './units';
import type { AuthoredPane, HeightMode, PlacedPane, Rect } from './types';

/**
 * What a gesture needs from the arrangement it is editing. Declared structurally rather than by
 * importing `Arrangement`, so a test can hand in a fake and so the class on the other side of the
 * seam stays free to change shape without reaching in here.
 */
export interface GestureTarget {
	authored(id: string): AuthoredPane;
	placed(id: string): PlacedPane;
	mode(id: string): HeightMode;
	snapshot(): AuthoredPane[];
	restore(panes: AuthoredPane[]): void;
	promote(id: string): void;
	drop(id: string, x: number, y: number, offset: number): void;
	resizeTo(id: string, rect: Rect): void;
	commit(): void;
}

export interface GestureProbes {
	/** Has the content outgrown the box the candidate size gave it? Injected, so the gesture never
	    looks at the DOM: the pane is the one that knows which elements to ask (see `spill.ts`). */
	spills: () => boolean;
	/** Wait for the candidate size to have been laid out, so there is something to check. The pane
	    passes Svelte's `tick`. */
	settle: () => Promise<void>;
}

export class PaneGesture {
	readonly #pane: () => string;
	readonly #arrangement: GestureTarget;
	readonly #spills: () => boolean;
	readonly #settle: () => Promise<void>;

	/** True while the pointer is pushing past the size the content will fit in. */
	invalid = $state(false);

	/** The whole board as it was at the press, so Escape puts it back — including the promotion. */
	#before: AuthoredPane[] | null = null;
	/** The rectangle the deltas apply to. Deltas are cumulative from the press, never incremental. */
	#base: Rect | null = null;
	/** Displacement the pane carried at the press — subtracted before a drop is stored. */
	#carried = 0;
	/** The most recent candidate whose content fitted; where a rejected resize is held. */
	#fitting: Rect | null = null;
	/** Serial, so a superseded spill check cannot undo a newer candidate. */
	#attempt = 0;

	/** `pane` is read on each use rather than taken once: which pane a component shows is a live prop,
	    and a gesture that captured it at construction would go on arranging whichever pane was there
	    first. */
	constructor(pane: () => string, arrangement: GestureTarget, probes: GestureProbes) {
		this.#pane = pane;
		this.#arrangement = arrangement;
		this.#spills = probes.spills;
		this.#settle = probes.settle;
	}

	get #id(): string {
		return this.#pane();
	}

	/** The rectangle a resize edits. On a capped pane the vertical extent IS the ceiling. */
	#editable(): Rect {
		const authored = this.#arrangement.authored(this.#id);
		const capped = this.#arrangement.mode(this.#id) === 'cap';
		return { x: authored.x, y: authored.y, w: authored.w, h: capped ? authored.cap : authored.h };
	}

	abandon(): void {
		if (this.#before) this.#arrangement.restore(this.#before);
		this.#before = null;
		this.#base = null;
		this.invalid = false;
		this.#attempt++;
	}

	beginMove(): void {
		this.#before = this.#arrangement.snapshot();
		const placed = this.#arrangement.placed(this.#id);
		this.#base = { ...placed };
		this.#carried = placed.offset;
		// The pane the user picked up wins ties on authored top, which is what makes "drop it onto its
		// neighbour and the NEIGHBOUR goes below" hold — and hold after a reload, because the priority
		// order is stored alongside the rectangles rather than remembered for the gesture.
		this.#arrangement.promote(this.#id);
	}

	moveTo(dx: number, dy: number): void {
		if (!this.#base) return;
		const { x, y } = moveRect(this.#base, dx, dy);
		this.#arrangement.drop(this.#id, x, y, this.#carried);
	}

	endMove(dx: number, dy: number): void {
		this.moveTo(dx, dy);
		this.#arrangement.commit();
		this.#before = null;
		this.#base = null;
	}

	beginResize(): void {
		this.#before = this.#arrangement.snapshot();
		this.#base = this.#editable();
		this.#fitting = this.#base;
		this.invalid = false;
		this.#attempt++;
	}

	async previewResize(edge: Edge, dx: number, dy: number): Promise<void> {
		if (!this.#base) return;
		const seq = ++this.#attempt;
		this.#arrangement.resizeTo(this.#id, resizeRect(this.#base, edge, dx, dy));
		await this.#settle();
		// A newer pointer move has already replaced this candidate; its check is the one that counts.
		if (seq !== this.#attempt) return;

		if (this.#spills()) {
			this.invalid = true;
			if (this.#fitting) this.#arrangement.resizeTo(this.#id, this.#fitting);
		} else {
			this.invalid = false;
			this.#fitting = this.#editable();
		}
	}

	async endResize(edge: Edge, dx: number, dy: number): Promise<void> {
		await this.previewResize(edge, dx, dy);
		// Whatever the pointer ended on, the pane keeps the last size its content fitted in.
		if (this.invalid && this.#fitting) this.#arrangement.resizeTo(this.#id, this.#fitting);
		this.invalid = false;
		this.#arrangement.commit();
		this.#before = null;
		this.#base = null;
	}

	/**
	 * One keypress worth of gesture — pressed, travelled a single unit and released at once. The
	 * resize goes to whichever edge the arrow points at, and does nothing at all if this height mode
	 * does not put that edge in the user's hands.
	 */
	step(dx: number, dy: number, resize: boolean): void {
		if (resize) {
			const edge: Edge = dx ? 'e' : 's';
			if (!EDGES[this.#arrangement.mode(this.#id)].includes(edge)) return;
			this.beginResize();
			void this.endResize(edge, dx * UNIT, dy * UNIT);
			return;
		}
		this.beginMove();
		this.endMove(dx * UNIT, dy * UNIT);
	}
}
