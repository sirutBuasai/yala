// Runes only, no DOM. Only authored panes persist, in priority order; displacement is never written.

import { DEV_TOOLS } from '$lib/nav/devtools';
import { Pref, listOf, number, type Revive } from '$lib/utils/persist.svelte';
import { assertNoOverlap, clampRect, resolve, boardRows } from './resolve';
import { lift, type DragOrigin } from './lift';
import { readingOrder } from './fold';
import { effectiveMode, hugs, scrolls, sizePanes } from './sizing';
import { COLS, MIN_H, MIN_W, pxForRows, rowsForPx } from './units';
import type { GridEnv } from './env.svelte';
import type {
	AuthoredPane,
	BoardLayout,
	Floor,
	HeightMode,
	PaneSpec,
	PlacedPane,
	Rect
} from './types';

const MODES: HeightMode[] = ['fixed', 'fit', 'cap'];

/** Bumped whenever a board's DEFAULT set of panes changes: new ids land at the back of the priority
    order, so an arrangement saved against the old set would bury them below everything else. */
export const LAYOUT_VERSION = 2;

function whole(v: unknown, min: number): number | undefined {
	const n = number(min)(v);
	return n === undefined ? undefined : Math.round(n);
}

/** Every field must survive or the entry is dropped: a half-read rectangle would place a pane somewhere
    nobody chose. */
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
	/** While a label is typed, that pane's floor follows the text both ways but never below `base`, so an edit
	    typed long then shortened leaves the pane where it started. */
	#draft = $state<{ id: string; base: Floor; floor: Floor } | null>(null);
	/** Authored panes in priority order. Mutated live during a gesture; flushed on release. */
	#panes = $state<AuthoredPane[]>([]);

	constructor(key: string, specs: BoardLayout, env: GridEnv) {
		this.#specs = specs;
		this.#ids = Object.keys(specs);
		this.#env = env;
		this.#pref = new Pref<AuthoredPane[]>(`board-${key}-${LAYOUT_VERSION}`, [], storedPanes());
		this.#panes = this.#merge(this.#pref.value);
	}

	/** Stored panes first, in their stored (priority) order, then any pane the storage predates. Panes
	    that no longer exist are dropped rather than left reserving space nothing can fill. */
	#merge(stored: AuthoredPane[]): AuthoredPane[] {
		const known = new Map(stored.filter((p) => p.id in this.#specs).map((p) => [p.id, p]));
		return [
			...known.values(),
			...this.#ids.filter((id) => !known.has(id)).map((id) => defaultPane(id, this.#specs[id]!))
		];
	}

	/** The only floor the resolver is given: the size an open label edit is holding its pane at. */
	readonly #effectiveFloors = $derived.by<Record<string, Floor>>(() => {
		const d = this.#draft;
		return d ? { [d.id]: d.floor } : {};
	});

	readonly #placed = $derived.by<PlacedPane[]>(() => {
		const placed = resolve(
			sizePanes(this.#panes, this.#specs, this.#measured, this.#effectiveFloors)
		);
		if (DEV_TOOLS) assertNoOverlap(placed);
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

	/** Every pane as placed — for an affordance that is about a pane's NEIGHBOURS. */
	get all(): PlacedPane[] {
		return this.#placed;
	}

	mode(id: string): HeightMode {
		return effectiveMode(this.spec(id).content, this.authored(id).mode);
	}

	/** The card hugs its content, and so must be measured. Never when folded. */
	hugs(id: string): boolean {
		return !this.#env.folded && hugs(this.mode(id));
	}

	/** The body scrolls once the content overruns. Never when folded: a folded pane hugs its content. */
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

	/** Written to the authored pane: held beside it, the next gesture snapped the pane back smaller. Grows only,
	    so room is given back by hand. */
	grow(id: string, w: number, h: number): void {
		const at = this.authored(id);
		if (w <= at.w && h <= at.h) return;
		this.#update(id, (p) => ({
			...p,
			...clampRect({ ...p, w: Math.max(p.w, w), h: Math.max(p.h, h) })
		}));
		this.commit();
	}

	/** The pane whose label is being typed into, if any. Its floor is the draft's to move, not a probe's. */
	get drafting(): string | null {
		return this.#draft?.id ?? null;
	}

	/** Start following `id`'s label as it is typed. `w`/`h` are the size it may not go below. */
	startDraft(id: string, w: number, h: number): void {
		this.#draft = { id, base: { w, h }, floor: { w, h } };
	}

	/** One pane holds the draft at a time, and a measurement that arrives late must not land on whichever
	    pane has it now: label edits overlap, since opening one closes the last. */
	#drafts(id: string): boolean {
		return this.#draft?.id === id;
	}

	/** Back to the size the edit opened at, so the next measurement can discover it needs less. */
	relaxDraft(id: string): void {
		if (this.#drafts(id)) this.#draft = { ...this.#draft!, floor: this.#draft!.base };
	}

	/** The size the drafting pane's content needs now, floored at what it opened with. */
	setDraft(id: string, w: number, h: number): void {
		if (!this.#drafts(id)) return;
		const d = this.#draft!;
		const floor = { w: Math.max(d.base.w, w), h: Math.max(d.base.h, h) };
		if (d.floor.w === floor.w && d.floor.h === floor.h) return;
		this.#draft = { ...d, floor };
	}

	/** The edit is over: keep whatever it settled on, and stop following the text. */
	endDraft(id: string): void {
		if (!this.#drafts(id)) return;
		const d = this.#draft!;
		this.#draft = null;
		this.grow(d.id, d.floor.w, d.floor.h);
	}

	#update(id: string, next: (pane: AuthoredPane) => AuthoredPane): void {
		this.#panes = this.#panes.map((p) => (p.id === id ? next(p) : p));
	}

	/** Handed back to every `dragTo` rather than read off the live board, which the gesture is already
	    halfway through changing. */
	beginDrag(): DragOrigin {
		return { authored: this.snapshot(), placed: this.#placed };
	}

	/** One pointer move of a drag, in PLACED coordinates — where the pane is on screen (see `lift`). */
	dragTo(id: string, x: number, y: number, origin: DragOrigin): void {
		this.#panes = lift(id, x, y, origin);
	}

	/** Rebases `id` and panes below to their drawn tops at a resize's press: an authored top above the drawn one
	    made the growing pane jump below instead of pushing. Panes above keep transient pushes. */
	rebase(id: string): void {
		const top = this.placed(id).y;
		this.#panes = this.#panes.map((p) => {
			const at = this.placed(p.id).y;
			return p.id === id || at > top ? { ...p, y: at } : p;
		});
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

	/** Adds panes storage predates: without it, the new half of a split falls back to its default and lands on
	    the other. */
	seed(rects: Record<string, Rect>): void {
		const pending = new Map(Object.entries(rects));
		const kept = this.#panes.map((p) => {
			const rect = pending.get(p.id);
			if (!rect) return p;
			pending.delete(p.id);
			return { ...p, ...clampRect(rect) };
		});
		// Ahead of the rest, so these exact rectangles win any tie on authored top rather than being pushed
		// below a neighbour they are meant to sit beside.
		const added = [...pending].map(([id, rect]) => ({
			id,
			mode: 'fixed' as HeightMode,
			cap: rect.h,
			...clampRect(rect)
		}));

		this.#panes = [...added, ...kept];
		this.commit();
	}

	/** Leaving a fitted mode freezes the height at what the content currently needs, and entering `cap`
	    seeds the ceiling from the same figure, so the pane does not jump either way. */
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

	/** Rectangles AND priority order, so an abandoned gesture can be put back exactly — including the
	    promotion it did on the way in. */
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
		this.#draft = null;
		this.#panes = this.#merge([]);
	}

	/** `$derived.by`, not `$derived`: a field initialiser runs BEFORE the constructor body, so reading
	    `#env` directly here would read it unassigned. */
	readonly columns = $derived.by(() => (this.#env.folded ? this.#env.columns : COLS));
}
