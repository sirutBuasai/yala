// No DOM: spilling and settling arrive as functions, so a test can script the content.

import { EDGES, holdFloor, lowest, moveRect, resizeRect, type Edge, type Floor } from './resize';
import { clampRect } from './resolve';
import { COLS, UNIT } from './units';
import type { DragOrigin } from './lift';
import type { AuthoredPane, HeightMode, Rect } from './types';

/** Structural rather than an `Arrangement` import, so a test can hand in a fake. */
export interface GestureTarget {
	authored(id: string): AuthoredPane;
	mode(id: string): HeightMode;
	snapshot(): AuthoredPane[];
	restore(panes: AuthoredPane[]): void;
	beginDrag(): DragOrigin;
	rebase(id: string): void;
	dragTo(id: string, x: number, y: number, origin: DragOrigin): void;
	resizeTo(id: string, rect: Rect): void;
	commit(): void;
}

export interface GestureProbes {
	/** Has the content outgrown the box the candidate size gave it? The pane knows which elements to ask
	    (see `spill.ts`). */
	spills: () => boolean;
	/** Wait for the candidate size to have been laid out. The pane passes Svelte's `tick`. */
	settle: () => Promise<void>;
}

export class PaneGesture {
	readonly #pane: () => string;
	readonly #arrangement: GestureTarget;
	readonly #spills: () => boolean;
	readonly #settle: () => Promise<void>;

	/** True while the pointer is pushing past the pane's floor. */
	invalid = $state(false);

	/** Where the pointer is, not where the pane lands: a raise the push rule refuses leaves the card behind. */
	aim = $state<Rect | null>(null);

	/** The whole board as it was at the press, so Escape puts it back — including the promotion. */
	#before: AuthoredPane[] | null = null;
	/** The rectangle the deltas apply to. Deltas are cumulative from the press, never incremental. */
	#base: Rect | null = null;
	/** The board a move re-derives from, so a swap made mid-drag can be undone by dragging back. */
	#origin: DragOrigin | null = null;
	/** Measured once at the press: per candidate, the floor moved with the path the pointer took. */
	#floor: Promise<Floor> | null = null;
	/** Serial, so a candidate from a pointer move the floor was still being measured for cannot undo a newer
	    one. */
	#attempt = 0;

	/** `pane` is a getter, not a value: which pane a component shows is a live prop, and a gesture that
	    captured it at construction would go on arranging the first one. */
	constructor(pane: () => string, arrangement: GestureTarget, probes: GestureProbes) {
		this.#pane = pane;
		this.#arrangement = arrangement;
		this.#spills = probes.spills;
		this.#settle = probes.settle;
	}

	get #id(): string {
		return this.#pane();
	}

	/** True between press and release. A resize deliberately drives the pane past what fits, so the pane's
	    content-floor probe stands down while this holds. */
	get busy(): boolean {
		return this.#base !== null;
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
		this.#floor = null;
		this.#origin = null;
		this.invalid = false;
		this.aim = null;
		this.#attempt++;
	}

	beginMove(): void {
		const origin = this.#arrangement.beginDrag();
		this.#before = origin.authored;
		this.#origin = origin;
		this.#base = origin.placed.find((p) => p.id === this.#id) ?? null;
	}

	moveTo(dx: number, dy: number): void {
		if (!this.#base || !this.#origin) return;
		const { x, y } = moveRect(this.#base, dx, dy);
		this.aim = clampRect({ ...this.#base, x, y });
		this.#arrangement.dragTo(this.#id, x, y, this.#origin);
	}

	endMove(dx: number, dy: number): void {
		this.moveTo(dx, dy);
		this.#arrangement.commit();
		this.#before = null;
		this.#base = null;
		this.#origin = null;
		this.aim = null;
	}

	beginResize(): void {
		this.#before = this.#arrangement.snapshot();
		this.#arrangement.rebase(this.#id);
		this.#base = this.#editable();
		this.#floor = this.#measureFloor(this.#base);
		this.invalid = false;
		this.#attempt++;
	}

	/** The content's height laid out unwrapped across the board, then the least width it fits at that height, so
	    the floor is never taller than designed. A fitted pane only has a width floor. */
	async #measureFloor(base: Rect): Promise<Floor> {
		const fits = async (rect: Rect) => {
			this.#arrangement.resizeTo(this.#id, rect);
			await this.#settle();
			return !this.#spills();
		};
		const fitted = this.#arrangement.mode(this.#id) === 'fit';
		const h = fitted
			? base.h
			: await lowest(1, base.h + COLS, (h) => fits({ ...base, x: 0, w: COLS, h }));
		const w = await lowest(1, COLS, (w) => fits({ ...base, w, h }));
		this.#arrangement.resizeTo(this.#id, base);
		await this.#settle();
		return { w, h: fitted ? 0 : h };
	}

	async previewResize(edge: Edge, dx: number, dy: number): Promise<void> {
		if (!this.#base || !this.#floor) return;
		const seq = ++this.#attempt;
		const floor = await this.#floor;
		// A newer pointer move has already replaced this candidate.
		if (seq !== this.#attempt || !this.#base) return;

		const wanted = resizeRect(this.#base, edge, dx, dy);
		const held = holdFloor(this.#base, edge, wanted, floor);
		this.invalid = held.w !== wanted.w || held.h !== wanted.h;
		this.#arrangement.resizeTo(this.#id, held);
	}

	async endResize(edge: Edge, dx: number, dy: number): Promise<void> {
		await this.previewResize(edge, dx, dy);
		this.invalid = false;
		this.#arrangement.commit();
		this.#before = null;
		this.#base = null;
		this.#floor = null;
	}

	/** One keypress worth of gesture: pressed, travelled a unit and released at once. Does nothing if this
	    height mode does not put the edge the arrow points at in the user's hands. */
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
