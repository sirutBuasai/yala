// One board's state: the authored panes, the measurements a fitted pane needs, and the resolved
// placement derived from both. Runes only, no DOM.
//
// What is persisted is exactly the authored pane — rectangle, height mode, ceiling — plus the ORDER
// of the array, which is the priority order the resolver breaks ties with. Displacement is never
// written.

import { Pref, listOf, type Revive } from '$lib/utils/persist.svelte';
import { assertNoOverlap, authoredY, clampRect, resolve, boardRows } from './resolve';
import { readingOrder } from './fold';
import { effectiveMode, hugs, scrolls, sizePanes } from './sizing';
import { COLS, MIN_H, MIN_W, pxForRows, rowsForPx } from './units';
import type { GridEnv } from './env.svelte';
import type { AuthoredPane, BoardLayout, HeightMode, PaneSpec, PlacedPane, Rect } from './types';

const MODES: HeightMode[] = ['fixed', 'fit', 'cap'];

function whole(v: unknown, min: number): number | undefined {
	return typeof v === 'number' && Number.isFinite(v) && v >= min ? Math.round(v) : undefined;
}

/**
 * Reviver for a stored board. Every field must survive or the entry is dropped: a half-read
 * rectangle would place a pane somewhere nobody chose.
 */
function storedPanes(): Revive<AuthoredPane[]> {
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

function defaultPane(id: string, spec: PaneSpec): AuthoredPane {
	return {
		id,
		mode: effectiveMode(spec.content, spec.mode ?? 'fixed'),
		cap: spec.cap ?? spec.h,
		...clampRect(spec)
	};
}

export class Arrangement {
	readonly #specs: BoardLayout;
	readonly #ids: string[];
	readonly #pref: Pref<AuthoredPane[]>;
	readonly #env: GridEnv;

	/** Card heights in px, reported by fitted panes. */
	#measured = $state<Record<string, number>>({});
	/** Authored panes in priority order. Mutated live during a gesture; flushed on release. */
	#panes = $state<AuthoredPane[]>([]);

	constructor(key: string, specs: BoardLayout, env: GridEnv) {
		this.#specs = specs;
		this.#ids = Object.keys(specs);
		this.#env = env;
		this.#pref = new Pref<AuthoredPane[]>(`board-${key}`, [], storedPanes());
		this.#panes = this.#merge(this.#pref.value);
	}

	/**
	 * Stored panes first, in their stored (priority) order, then any pane the storage predates. Panes
	 * that no longer exist are dropped rather than kept as ghosts reserving space nothing can fill.
	 */
	#merge(stored: AuthoredPane[]): AuthoredPane[] {
		const known = new Map(stored.filter((p) => p.id in this.#specs).map((p) => [p.id, p]));
		return [
			...known.values(),
			...this.#ids.filter((id) => !known.has(id)).map((id) => defaultPane(id, this.#specs[id]!))
		];
	}

	readonly #placed = $derived.by<PlacedPane[]>(() => {
		const placed = resolve(
			sizePanes(this.#panes, this.#specs, this.#measured, this.#env.arranging)
		);
		if (import.meta.env.DEV) assertNoOverlap(placed);
		return placed;
	});

	readonly #byId = $derived(new Map(this.#placed.map((p) => [p.id, p])));

	readonly rows = $derived(boardRows(this.#placed));
	readonly order = $derived(readingOrder(this.#placed));

	spec(id: string): PaneSpec {
		const spec = this.#specs[id];
		if (!spec) throw new Error(`grid: pane "${id}" is not in this board's layout`);
		return spec;
	}

	authored(id: string): AuthoredPane {
		return this.#panes.find((p) => p.id === id) ?? defaultPane(id, this.spec(id));
	}

	placed(id: string): PlacedPane {
		const p = this.#byId.get(id);
		if (p) return p;
		const a = this.authored(id);
		return { id, x: a.x, y: a.y, w: a.w, h: a.h, offset: 0 };
	}

	mode(id: string): HeightMode {
		return effectiveMode(this.spec(id).content, this.authored(id).mode);
	}

	/** The card hugs its content, and so must be measured. Never when folded. */
	hugs(id: string): boolean {
		return !this.#env.folded && hugs(this.mode(id));
	}

	/** The body scrolls once the content overruns. Never when folded — a folded pane hugs its
	    content, so there is nothing to overrun. */
	scrolls(id: string): boolean {
		return !this.#env.folded && scrolls(this.spec(id).content, this.mode(id));
	}

	capPx(id: string): number {
		return pxForRows(this.authored(id).cap);
	}

	/** Only a `flow` pane's height mode is the user's to choose (see `PaneContent`). */
	canSetHeight(id: string): boolean {
		return this.spec(id).content === 'flow';
	}

	setMeasured(id: string, px: number): void {
		if (this.#measured[id] === px) return;
		this.#measured = { ...this.#measured, [id]: px };
	}

	#update(id: string, next: (pane: AuthoredPane) => AuthoredPane): void {
		this.#panes = this.#panes.map((p) => (p.id === id ? next(p) : p));
	}

	/** Move the pane to the front of the priority order, so it wins ties on authored top. */
	promote(id: string): void {
		const found = this.#panes.find((p) => p.id === id);
		if (!found) return;
		this.#panes = [found, ...this.#panes.filter((p) => p.id !== id)];
	}

	/**
	 * Drop a pane at a position in PLACED coordinates — where it is on screen. `offset` is the
	 * displacement it was carrying at the press; `authoredY` subtracts it back out.
	 */
	drop(id: string, x: number, y: number, offset: number): void {
		const { w, h } = this.authored(id);
		const rect = clampRect({ x, y: authoredY(y, offset), w, h });
		this.#update(id, (p) => ({ ...p, x: rect.x, y: rect.y }));
	}

	/** Resize a pane. On a capped pane the bottom edge sets the CEILING, not the height. */
	resizeTo(id: string, rect: Rect): void {
		const mode = this.mode(id);
		if (mode === 'cap') {
			const clamped = clampRect({ ...rect, h: this.authored(id).h });
			this.#update(id, (p) => ({
				...p,
				x: clamped.x,
				w: clamped.w,
				cap: Math.max(MIN_H, Math.round(rect.h))
			}));
			return;
		}
		const clamped = clampRect(rect);
		this.#update(id, (p) => ({ ...p, ...clamped }));
	}

	/**
	 * Switch a list's height mode. Leaving a fitted mode freezes the height at what the content
	 * currently needs, and entering `cap` seeds the ceiling from the same figure, so the pane does not
	 * jump either way.
	 */
	setMode(id: string, mode: HeightMode): void {
		const fitted = this.#measured[id] === undefined ? undefined : rowsForPx(this.#measured[id]!);
		this.#update(id, (p) => ({
			...p,
			mode,
			h: mode === 'fixed' ? (fitted ?? p.h) : p.h,
			cap: mode === 'cap' ? Math.max(fitted ?? p.cap, MIN_H) : p.cap
		}));
		this.commit();
	}

	/** Copy of the whole authored board — rectangles AND priority order — so an abandoned gesture
	    can be put back exactly, including the promotion it did on the way in. */
	snapshot(): AuthoredPane[] {
		return this.#panes.map((p) => ({ ...p }));
	}

	restore(panes: AuthoredPane[]): void {
		this.#panes = panes.map((p) => ({ ...p }));
	}

	/** Persist the authored panes. Called on gesture release, never per pointer move. */
	commit(): void {
		this.#pref.value = this.#panes.map((p) => ({ ...p }));
	}

	reset(): void {
		this.#pref.value = [];
		this.#panes = this.#merge([]);
	}

	/** Columns the board runs at. `$derived.by` rather than `$derived`: a field initialiser runs BEFORE
	    the constructor body, so reading `#env` directly here would read it before it is assigned. */
	readonly columns = $derived.by(() => (this.#env.folded ? this.#env.columns : COLS));
}
