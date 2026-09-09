// One board's state: the authored intents, the measurements a fitted pane needs, and the resolved
// placement derived from both. Runes only — this layer never touches the DOM, so every rule it
// applies is the pure one from `resolve.ts` / `sizing.ts` and can be tested without a browser.
//
// What is persisted is exactly the authored intent: a rectangle, a height mode, a ceiling, and the
// ORDER of the array (which is the priority order the resolver breaks ties with). Displacement is
// never written. The array order is authored intent too — dragging a pane moves it to the front,
// which is how "drop a pane on its neighbour and the neighbour goes below" survives a reload.

import { Pref, listOf, type Revive } from '$lib/utils/persist.svelte';
import { assertNoOverlap, authoredY, clampRect, resolve, boardRows } from './resolve';
import { readingOrder } from './fold';
import { effectiveMode, hugs, scrolls, sizeAll } from './sizing';
import { COLS, MIN_H, MIN_W, pxFor, unitsFor } from './units';
import type { GridEnv } from './env.svelte';
import type { HeightMode, Intent, Layout, PaneSpec, Placed, Rect } from './types';

const MODES: HeightMode[] = ['fixed', 'fit', 'cap'];

/** Which edges of a pane a gesture is dragging: any of `n s e w`. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function whole(v: unknown, min: number): number | undefined {
	return typeof v === 'number' && Number.isFinite(v) && v >= min ? Math.round(v) : undefined;
}

/**
 * Reviver for a stored board. Every field must survive or the entry is dropped: a half-read
 * rectangle would place a pane somewhere nobody chose, which is worse than falling back to the
 * declared default.
 */
function storedIntents(): Revive<Intent[]> {
	return listOf((raw) => {
		if (typeof raw !== 'object' || raw === null) return undefined;
		const o = raw as Record<string, unknown>;
		const [x, y, w, h, cap] = [
			whole(o.x, 0),
			whole(o.y, 0),
			whole(o.w, MIN_W),
			whole(o.h, MIN_H),
			whole(o.cap, MIN_H)
		];
		const mode = MODES.find((m) => m === o.mode);
		if (typeof o.id !== 'string' || !mode) return undefined;
		if (x === undefined || y === undefined || w === undefined) return undefined;
		if (h === undefined || cap === undefined) return undefined;
		return { id: o.id, mode, cap, ...clampRect({ x, y, w, h }) };
	});
}

function defaultIntent(id: string, spec: PaneSpec): Intent {
	return {
		id,
		mode: effectiveMode(spec.content, spec.mode ?? 'fixed'),
		cap: spec.cap ?? spec.h,
		...clampRect(spec)
	};
}

export class BoardLayout {
	readonly #specs: Layout;
	readonly #ids: string[];
	readonly #pref: Pref<Intent[]>;
	readonly #env: GridEnv;

	/** Card heights in px, reported by fitted cells. */
	#measured = $state<Record<string, number>>({});
	/** Authored intents in priority order. Mutated live during a gesture; flushed on release. */
	#intents = $state<Intent[]>([]);

	constructor(key: string, specs: Layout, env: GridEnv) {
		this.#specs = specs;
		this.#ids = Object.keys(specs);
		this.#env = env;
		this.#pref = new Pref<Intent[]>(`board-${key}`, [], storedIntents());
		this.#intents = this.#merge(this.#pref.value);
	}

	/**
	 * Stored intents first, in their stored (priority) order, then any pane the storage predates, in
	 * declaration order. Entries for panes that no longer exist are dropped rather than kept as
	 * ghosts that reserve space nothing can fill.
	 */
	#merge(stored: Intent[]): Intent[] {
		const known = new Map(stored.filter((i) => i.id in this.#specs).map((i) => [i.id, i]));
		return [
			...known.values(),
			...this.#ids.filter((id) => !known.has(id)).map((id) => defaultIntent(id, this.#specs[id]!))
		];
	}

	readonly #placed = $derived.by<Placed[]>(() => {
		const placed = resolve(sizeAll(this.#intents, this.#specs, this.#measured, this.#env.active));
		// The board can never render an overlap. Asserted rather than trusted: a break here is
		// invisible until two panes visibly stack, by which point the cause is three edits away.
		if (import.meta.env.DEV) assertNoOverlap(placed);
		return placed;
	});

	readonly #byId = $derived(new Map(this.#placed.map((p) => [p.id, p])));

	readonly rows = $derived(boardRows(this.#placed));
	/** Row-major reading order, for sequencing the folded layout. */
	readonly order = $derived(readingOrder(this.#placed));

	spec(id: string): PaneSpec {
		const spec = this.#specs[id];
		if (!spec) throw new Error(`grid: pane "${id}" is not in this board's layout`);
		return spec;
	}

	intent(id: string): Intent {
		return this.#intents.find((i) => i.id === id) ?? defaultIntent(id, this.spec(id));
	}

	placed(id: string): Placed {
		const p = this.#byId.get(id);
		if (p) return p;
		const i = this.intent(id);
		return { id, x: i.x, y: i.y, w: i.w, h: i.h, offset: 0 };
	}

	mode(id: string): HeightMode {
		return effectiveMode(this.spec(id).content, this.intent(id).mode);
	}

	/** The card hugs its content (and so must be measured) rather than filling the cell. */
	hugs(id: string): boolean {
		return !this.#env.folded && hugs(this.mode(id));
	}

	/** The body scrolls once the content overruns the pane. Never when folded — a folded pane hugs
	    its content, so there is nothing to overrun. */
	scrolls(id: string): boolean {
		return !this.#env.folded && scrolls(this.spec(id).content, this.mode(id));
	}

	/** Ceiling in px for a capped pane, so the card can stop there. */
	capPx(id: string): number {
		return pxFor(this.intent(id).cap);
	}

	/** Only a `flow` pane's height mode is the user's to choose (see `PaneContent`). */
	editableMode(id: string): boolean {
		return this.spec(id).content === 'flow';
	}

	setMeasured(id: string, px: number): void {
		if (this.#measured[id] === px) return;
		this.#measured = { ...this.#measured, [id]: px };
	}

	#update(id: string, next: (intent: Intent) => Intent): void {
		this.#intents = this.#intents.map((i) => (i.id === id ? next(i) : i));
	}

	/** Move the pane to the front of the priority order, so it wins ties on authored top. */
	promote(id: string): void {
		const found = this.#intents.find((i) => i.id === id);
		if (!found) return;
		this.#intents = [found, ...this.#intents.filter((i) => i.id !== id)];
	}

	/**
	 * Drop a pane at a board position expressed in PLACED coordinates — where it is on screen.
	 * `offset` is the displacement it was carrying when the gesture started, and subtracting it is
	 * what stops the push being counted twice on the next render.
	 */
	drop(id: string, x: number, y: number, offset: number): void {
		const { w, h } = this.intent(id);
		const rect = clampRect({ x, y: authoredY(y, offset), w, h });
		this.#update(id, (i) => ({ ...i, x: rect.x, y: rect.y }));
	}

	/** Resize a pane. On a capped pane the bottom edge sets the CEILING, not the height. */
	resizeTo(id: string, rect: Rect): void {
		const mode = this.mode(id);
		if (mode === 'cap') {
			const clamped = clampRect({ ...rect, h: this.intent(id).h });
			this.#update(id, (i) => ({
				...i,
				x: clamped.x,
				w: clamped.w,
				cap: Math.max(MIN_H, Math.round(rect.h))
			}));
			return;
		}
		const clamped = clampRect(rect);
		this.#update(id, (i) => ({ ...i, ...clamped }));
	}

	/**
	 * Switch a list's height mode. Leaving a fitted mode freezes the height at what the content
	 * currently needs, so "fit it, then hold it there" costs no extra control; entering `cap` seeds
	 * the ceiling from the same figure, so the pane doesn't jump on the way in.
	 */
	setMode(id: string, mode: HeightMode): void {
		const fitted = this.#measured[id] === undefined ? undefined : unitsFor(this.#measured[id]!);
		this.#update(id, (i) => ({
			...i,
			mode,
			h: mode === 'fixed' ? (fitted ?? i.h) : i.h,
			cap: mode === 'cap' ? Math.max(fitted ?? i.cap, MIN_H) : i.cap
		}));
		this.commit();
	}

	/** Copy of the whole authored board — rectangles AND priority order — so an abandoned gesture
	    can be put back exactly, including the promotion it did on the way in. */
	snapshot(): Intent[] {
		return this.#intents.map((i) => ({ ...i }));
	}

	restore(intents: Intent[]): void {
		this.#intents = intents.map((i) => ({ ...i }));
	}

	/** Persist the authored intents. Called on gesture release, never per pointer move. */
	commit(): void {
		this.#pref.value = this.#intents.map((i) => ({ ...i }));
	}

	/** Back to the arrangement the view declares. */
	reset(): void {
		this.#pref.value = [];
		this.#intents = this.#merge([]);
	}

	/** Columns the board runs at — the full lattice, or the folded count. `$derived.by` rather than
	    `$derived`: a field initialiser runs BEFORE the constructor body, so reading `#env` directly
	    here would read it before it is assigned. The closure defers that to first use. */
	readonly columns = $derived.by(() => (this.#env.folded ? this.#env.columns : COLS));
}
