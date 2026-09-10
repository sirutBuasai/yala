// One pane's gesture as a state object: what the press captured, what the pointer has done since, and
// whether the content will stand for it. No DOM — whether the content spilled and when a candidate size
// has been laid out both arrive as functions, so a test can drive a gesture with scripted answers
// instead of a browser.

import { EDGES, moveRect, resizeRect, type Edge } from './resize';
import { UNIT } from './units';
import type { DragOrigin } from './lift';
import type { AuthoredPane, HeightMode, Rect } from './types';

/**
 * What a gesture needs from the arrangement it is editing. Declared structurally rather than by
 * importing `Arrangement`, so a test can hand in a fake.
 */
export interface GestureTarget {
	authored(id: string): AuthoredPane;
	mode(id: string): HeightMode;
	snapshot(): AuthoredPane[];
	restore(panes: AuthoredPane[]): void;
	beginDrag(id: string): DragOrigin;
	dragTo(id: string, x: number, y: number, origin: DragOrigin): void;
	resizeTo(id: string, rect: Rect): void;
	commit(): void;
}

export interface GestureProbes {
	/** Has the content outgrown the box the candidate size gave it? Injected, so the gesture never
	    looks at the DOM: the pane knows which elements to ask (see `spill.ts`). */
	spills: () => boolean;
	/** Wait for the candidate size to have been laid out. The pane passes Svelte's `tick`. */
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
	/** The board a move re-derives from, so a swap made mid-drag can be undone by dragging back. */
	#origin: DragOrigin | null = null;
	/** The most recent candidate whose content fitted. A rejected resize is held here, so the edge
	    sticks the way a native min-size does and the gesture is never thrown away on release. */
	#fitting: Rect | null = null;
	/** Serial, so a superseded spill check cannot undo a newer candidate. */
	#attempt = 0;

	/** `pane` is read on each use rather than taken once: which pane a component shows is a live prop,
	    and a gesture that captured it at construction would go on arranging the first one. */
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
		this.#origin = null;
		this.invalid = false;
		this.#attempt++;
	}

	beginMove(): void {
		const origin = this.#arrangement.beginDrag(this.#id);
		this.#before = origin.authored;
		this.#origin = origin;
		this.#base = origin.placed.find((p) => p.id === this.#id) ?? null;
	}

	moveTo(dx: number, dy: number): void {
		if (!this.#base || !this.#origin) return;
		const { x, y } = moveRect(this.#base, dx, dy);
		this.#arrangement.dragTo(this.#id, x, y, this.#origin);
	}

	endMove(dx: number, dy: number): void {
		this.moveTo(dx, dy);
		this.#arrangement.commit();
		this.#before = null;
		this.#base = null;
		this.#origin = null;
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
	 * One keypress worth of gesture — pressed, travelled a single unit and released at once. Does
	 * nothing if this height mode does not put the edge the arrow points at in the user's hands.
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
