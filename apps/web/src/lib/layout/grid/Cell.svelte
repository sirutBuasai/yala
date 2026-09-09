<script module lang="ts">
	import type { Edge } from './layout.svelte';
	import type { HeightMode } from './types';

	/**
	 * Which edges may be dragged, per height mode. A fitted pane's height is not the user's to set
	 * directly, so the handles that would change it are absent rather than present and inert — the
	 * handles you can see are exactly the ones that do something.
	 */
	const EDGES: Record<HeightMode, Edge[]> = {
		fixed: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'],
		cap: ['s', 'e', 'w', 'se', 'sw'],
		fit: ['e', 'w']
	};

	const MODE_ORDER: HeightMode[] = ['fixed', 'fit', 'cap'];

	const MODE_LABELS: Record<HeightMode, string> = {
		fixed: 'Set height — the list fits inside the pane and scrolls',
		fit: 'Fit to content — the pane extends as the list grows',
		cap: 'Fit to content up to a limit — drag the bottom edge to set it'
	};
</script>

<script lang="ts">
	// One pane on the board: the grid item, the arrange affordances, and the two measurements the
	// pure layer can't make for itself.
	//
	// It COMPOSES `Pane` rather than being one, so the card stays grid-agnostic and the folded layout
	// reuses it untouched.
	//
	// ── Measuring a fitted pane ───────────────────────────────────────────────────
	// Anchored on the CARD, not the cell, and the card is `flex: 0 0 auto` while fitted. Both matter:
	// `scrollHeight` never reports LESS than the box already is, and neutralising `height` alone
	// doesn't collapse a flex item — the flex algorithm outranks it — so a card left to stretch to its
	// cell feeds its own imposed height back into the next measurement, and the pane ratchets in one
	// direction and never comes back.
	//
	// ── The minimum size ─────────────────────────────────────────────────────────
	// Never predicted. During a resize the pane is already laid out at the candidate size, so the DOM
	// is asked whether the content spilled (see `probe.ts`). If it did, the preview is held at the
	// last size that fitted — so the edge sticks the way a native min-size does — and the pane wears
	// its rejected state while the pointer pushes past that limit. On release the last fitting size
	// stands: the gesture is never thrown away.
	import { tick, type Snippet } from 'svelte';
	import Pane from '$lib/ui/Pane.svelte';
	import Grip from '$lib/icons/Grip.svelte';
	import SizeMode from '$lib/icons/SizeMode.svelte';
	import { getBoard, getGridEnv } from './context';
	import { drag } from './gesture';
	import { spills } from './probe';
	import { foldSpan } from './fold';
	import { UNIT } from './units';
	import type { Intent, Rect } from './types';

	interface Props {
		/** Pane id — a key of the board's layout. */
		id: string;
		title?: string;
		count?: number;
		cap?: string;
		actions?: Snippet;
		tone?: 'default' | 'attention';
		density?: 'figure' | 'panel';
		children: Snippet;
	}
	let { id, title, count, cap, actions, tone, density, children }: Props = $props();

	const env = getGridEnv();
	const board = getBoard();

	const placed = $derived(board.placed(id));
	const mode = $derived(board.mode(id));
	const hug = $derived(board.hugs(id));
	const arranging = $derived(env.active);
	const capped = $derived(mode === 'cap');
	const span = $derived(foldSpan(placed.w, env.columns));
	const name = $derived(title ?? id);

	let cardEl = $state<HTMLElement>();
	/** True while the pointer is pushing past the size the content will fit in. */
	let invalid = $state(false);

	// Fitted panes report their card's height so the pure layer can turn it into rows. Only while
	// unfolded: a folded pane hugs its content by construction and reserves nothing.
	$effect(() => {
		const el = cardEl;
		if (!hug || !el) return;

		const report = () => board.setMeasured(id, el.offsetHeight);
		report();
		const observer = new ResizeObserver(report);
		observer.observe(el);
		return () => observer.disconnect();
	});

	// The card is inert while arranging: its own buttons and menus must not compete with the gesture
	// that covers them, and they have no business in the tab order either. An attribute rather than
	// `pointer-events: none`, because it takes the whole subtree out of focus as well.
	$effect(() => {
		cardEl?.toggleAttribute('inert', arranging);
	});

	// --- gestures ---

	/** The whole board as it was at the press, so Escape puts it back — including the promotion. */
	let before: Intent[] | null = null;
	/** The rectangle the deltas apply to. Deltas are cumulative from the press, never incremental. */
	let base: Rect | null = null;
	/** Displacement the pane carried at the press — subtracted before a drop is stored. */
	let carried = 0;
	/** The most recent candidate whose content fitted; where a rejected resize is held. */
	let fitting: Rect | null = null;
	/** Serial, so a superseded probe cannot undo a newer candidate. */
	let attempt = 0;

	const units = (px: number) => Math.round(px / UNIT);

	/** The rectangle a resize edits. On a capped pane the vertical extent IS the ceiling. */
	function editable(): Rect {
		const intent = board.intent(id);
		return { x: intent.x, y: intent.y, w: intent.w, h: capped ? intent.cap : intent.h };
	}

	function abandon(): void {
		if (before) board.restore(before);
		before = null;
		base = null;
		invalid = false;
		attempt++;
	}

	function beginMove(): void {
		before = board.snapshot();
		base = { ...placed };
		carried = placed.offset;
		// The pane the user picked up wins ties on authored top, which is what makes "drop it onto its
		// neighbour and the NEIGHBOUR goes below" hold — and hold after a reload, because the priority
		// order is stored alongside the rectangles rather than remembered for the session.
		board.promote(id);
	}

	function moveTo(dx: number, dy: number): void {
		if (!base) return;
		board.drop(id, base.x + units(dx), base.y + units(dy), carried);
	}

	function endMove(dx: number, dy: number): void {
		moveTo(dx, dy);
		board.commit();
		before = null;
		base = null;
	}

	function beginResize(): void {
		before = board.snapshot();
		base = editable();
		fitting = base;
		invalid = false;
		attempt++;
	}

	/** Apply one edge's cumulative delta to the press-time rectangle. */
	function candidate(edge: Edge, dx: number, dy: number, from: Rect): Rect {
		const [dux, duy] = [units(dx), units(dy)];
		const rect = { ...from };
		if (edge.includes('e')) rect.w = from.w + dux;
		if (edge.includes('w')) {
			rect.x = from.x + dux;
			rect.w = from.w - dux;
		}
		if (edge.includes('s')) rect.h = from.h + duy;
		if (edge.includes('n')) {
			rect.y = from.y + duy;
			rect.h = from.h - duy;
		}
		return rect;
	}

	async function previewResize(edge: Edge, dx: number, dy: number): Promise<void> {
		if (!base) return;
		const seq = ++attempt;
		board.resizeTo(id, candidate(edge, dx, dy, base));
		await tick();
		// A newer pointer move has already replaced this candidate; its probe is the one that counts.
		if (seq !== attempt || !cardEl) return;

		if (spills(cardEl)) {
			invalid = true;
			if (fitting) board.resizeTo(id, fitting);
		} else {
			invalid = false;
			fitting = editable();
		}
	}

	async function endResize(edge: Edge, dx: number, dy: number): Promise<void> {
		await previewResize(edge, dx, dy);
		// Whatever the pointer ended on, the pane keeps the last size its content fitted in.
		if (invalid && fitting) board.resizeTo(id, fitting);
		invalid = false;
		board.commit();
		before = null;
		base = null;
	}

	const STEPS: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1]
	};

	/** Keyboard equivalents on the grip: arrows move by a unit, Shift+arrows resize by one. */
	function onGripKey(e: KeyboardEvent): void {
		const delta = STEPS[e.key];
		if (!delta) return;
		e.preventDefault();
		const [dx, dy] = delta;

		if (e.shiftKey) {
			const edge: Edge = dx ? 'e' : 's';
			if (!EDGES[mode].includes(edge)) return;
			beginResize();
			void endResize(edge, dx * UNIT, dy * UNIT);
			return;
		}
		beginMove();
		endMove(dx * UNIT, dy * UNIT);
	}
</script>

<div
	class="cell"
	class:folded={env.folded}
	class:arranging
	class:hug
	class:capped
	class:invalid
	style:grid-column={env.folded ? `span ${span}` : `${placed.x + 1} / span ${placed.w}`}
	style:grid-row={env.folded ? null : `${placed.y + 1} / span ${placed.h}`}
	style:order={env.folded ? board.order[id] : null}
	style:--cap-h={capped ? `${board.capPx(id)}px` : null}
>
	<Pane
		bind:card={cardEl}
		{title}
		{count}
		{cap}
		{actions}
		{tone}
		{density}
		scroll={board.scrolls(id)}
		{children}
	/>

	{#if arranging}
		<div
			class="grab"
			use:drag={{
				onstart: beginMove,
				onmove: ({ dx, dy }) => moveTo(dx, dy),
				onend: ({ dx, dy }) => endMove(dx, dy),
				oncancel: abandon
			}}
		>
			<!-- data-no-drag: the press must not start a drag of the pane underneath (see gesture.ts —
			     stopping propagation here cannot work, because Svelte delegates the event). -->
			<div class="tools" role="toolbar" aria-label={`Arrange ${name}`} tabindex="-1" data-no-drag>
				<button
					class="grip"
					type="button"
					aria-label={`Move ${name}. Arrows move it; shift and arrows resize it.`}
					onkeydown={onGripKey}
				>
					<Grip />
				</button>
				{#if board.editableMode(id)}
					<div class="modes" role="group" aria-label={`Height of ${name}`}>
						{#each MODE_ORDER as m (m)}
							<button
								type="button"
								class="modebtn"
								class:active={mode === m}
								aria-pressed={mode === m}
								title={MODE_LABELS[m]}
								onclick={() => board.setMode(id, m)}
							>
								<SizeMode mode={m} />
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Resize strips straddling the card's edges. Not focusable and not announced: the grip is
		     the keyboard route in, and eight tab stops per pane would bury everything else. -->
		{#each EDGES[mode] as edge (edge)}
			<div
				class="handle {edge}"
				use:drag={{
					onstart: beginResize,
					onmove: ({ dx, dy }) => void previewResize(edge, dx, dy),
					onend: ({ dx, dy }) => void endResize(edge, dx, dy),
					oncancel: abandon
				}}
			></div>
		{/each}
	{/if}
</div>

<style>
	/* Each pane insets itself by half a gap — the grid itself has none. Two neighbours therefore read
	   as one full gap apart, and the unit stays exactly `content / 48`. */
	.cell {
		--pane-inset: calc(var(--gap-grid) / 2);
		position: relative;
		min-width: 0;
		padding: var(--pane-inset);
		display: flex;
		flex-direction: column;
	}
	.cell > :global(.card) {
		flex: 1 1 auto;
		min-height: 0;
	}
	/* A fitted card owns its height. `flex: 0 0 auto` is the load-bearing half: with `1 1 auto` the
	   flex algorithm stretches it to the cell, and the next measurement reads back the height the
	   cell imposed rather than the height the content needs. */
	.cell.hug > :global(.card) {
		flex: 0 0 auto;
	}
	.cell.capped > :global(.card) {
		max-height: var(--cap-h);
	}
	/* Folded: no coordinates, no reserved height, no ceiling — every pane hugs its content. */
	.cell.folded > :global(.card) {
		flex: 0 0 auto;
		max-height: none;
	}

	/* --- charts inside a pane ---------------------------------------------------
	   The figure box's own min/max height exist to stop one tall figure dragging the panes beside it
	   out of alignment on a flow layout. On the grid the pane's height IS the answer to that, so the
	   ceiling and the comfortable minimum are both lifted and a measured chart scales to whatever it
	   was given — down to `--figure-h-floor`, which is NOT lifted.
	   That floor is doing two jobs (see app.css). The one that is easy to lose: a chart with a
	   DETACHED legend keeps the legend beside the plot in this same flex column, so with no floor the
	   plot shrinks to nothing, the legend always fits, and the pane has no data-dependent minimum at
	   all. With the floor, the pane's minimum is `floor + the legend's height` — which rises with the
	   number of keys and with how many rows they wrap onto. */
	.cell:not(.folded) :global(.figurebox),
	.cell:not(.folded) :global(.sizebox) {
		min-height: var(--figure-h-floor);
		max-height: none;
	}
	/* Folded, the card hugs its content — so a size container inside it has no height to take, and
	   size containment would collapse it to zero and spill the figure out of the card. The figure
	   sizes itself here instead; its `@container` rules simply stop matching, which is the layout a
	   single-column card wants anyway. */
	.cell.folded :global(.sizebox) {
		container-type: normal;
	}
	/* A FIXED-viewBox chart (sankey, heatmap) takes its height from its WIDTH, so widening a pane
	   made it taller and it spilled out of the card. Given the full height it letterboxes inside the
	   pane through its own preserveAspectRatio instead. */
	.cell:not(.folded) :global(.body > svg.chart) {
		height: 100%;
	}

	/* --- arrange affordances --------------------------------------------------- */
	.cell.arranging > :global(.card) {
		user-select: none;
	}
	/* The pane's own controls read as out of play while the board is being rearranged. */
	.cell.arranging :global(.card .actions) {
		opacity: 0.4;
	}
	/* Covers the card exactly (the cell minus its own inset), so it also outlines the region a capped
	   pane is holding open. */
	.grab {
		position: absolute;
		inset: var(--pane-inset);
		border-radius: var(--radius-xl);
		cursor: grab;
		touch-action: none;
		outline: 1px solid color-mix(in srgb, var(--lav) 40%, transparent);
		outline-offset: -1px;
	}
	.grab:active {
		cursor: grabbing;
	}
	/* The ceiling a capped pane holds open — dashed, and only while arranging, so nothing gets placed
	   in the room the list will grow into. */
	.cell.capped .grab {
		outline-style: dashed;
		outline-width: 1.5px;
	}
	.cell.invalid .grab {
		outline: 2px solid var(--crit);
		background: color-mix(in srgb, var(--crit) 10%, transparent);
	}
	.tools {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
	.grip,
	.modebtn {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--ink-3);
		cursor: pointer;
	}
	.grip {
		cursor: grab;
	}
	.grip:hover,
	.modebtn:hover {
		color: var(--ink);
		background: var(--inset);
	}
	.modebtn.active {
		background: color-mix(in srgb, var(--lav) 24%, transparent);
		color: var(--ink);
	}
	.modes {
		display: flex;
		gap: 1px;
		padding-left: var(--space-2);
		border-left: 1px solid var(--border);
	}

	/* Each strip is centred on the card's boundary, so the grab zone reaches a few pixels either
	   side of the visible edge. Corners come first in the box model (they are placed at the ends of
	   the edges), so the edges inset by a whole reach to leave them clear. */
	.handle {
		--reach: 12px;
		--edge: calc(var(--pane-inset) - var(--reach) / 2);
		--clear: calc(var(--pane-inset) + var(--reach) / 2);
		position: absolute;
		touch-action: none;
		border-radius: var(--radius-sm);
	}
	.handle:hover {
		background: color-mix(in srgb, var(--lav) 35%, transparent);
	}
	.handle.n,
	.handle.s {
		left: var(--clear);
		right: var(--clear);
		height: var(--reach);
		cursor: ns-resize;
	}
	.handle.e,
	.handle.w {
		top: var(--clear);
		bottom: var(--clear);
		width: var(--reach);
		cursor: ew-resize;
	}
	.handle.n {
		top: var(--edge);
	}
	.handle.s {
		bottom: var(--edge);
	}
	.handle.e {
		right: var(--edge);
	}
	.handle.w {
		left: var(--edge);
	}
	.handle.ne,
	.handle.nw,
	.handle.se,
	.handle.sw {
		width: var(--reach);
		height: var(--reach);
	}
	.handle.ne {
		top: var(--edge);
		right: var(--edge);
		cursor: nesw-resize;
	}
	.handle.nw {
		top: var(--edge);
		left: var(--edge);
		cursor: nwse-resize;
	}
	.handle.se {
		bottom: var(--edge);
		right: var(--edge);
		cursor: nwse-resize;
	}
	.handle.sw {
		bottom: var(--edge);
		left: var(--edge);
		cursor: nesw-resize;
	}
</style>
