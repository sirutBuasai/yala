<script module lang="ts">
	import type { HeightMode } from './types';

	const MODE_ORDER: HeightMode[] = ['fixed', 'fit', 'cap'];

	const MODE_LABELS: Record<HeightMode, string> = {
		fixed: 'Set fixed height',
		fit: 'Grows with content',
		cap: 'Grows to the bottom edge'
	};
</script>

<script lang="ts">
	// Composes `Card` rather than being one, so the card stays grid-agnostic and the folded layout reuses it.
	import { tick, type Snippet } from 'svelte';
	import Card from '$lib/ui/Card.svelte';
	import { labelText, type Label } from '$lib/ui/label';
	import { DEV_TOOLS } from '$lib/nav/devtools';
	import SizeMode from '$lib/icons/SizeMode.svelte';
	import { getArrangement, getGridEnv, getLabels } from './context';
	import { drag, type DragParams } from './drag';
	import { overrun, spillReport } from './spill';
	import { foldSpan } from './fold';
	import { EDGES, type Edge } from './resize';
	import { PaneGesture } from './gesture.svelte';
	import { COLS, pxForRows, UNIT } from './units';

	interface Props {
		/** Pane id — a key of the board's layout. */
		id: string;
		title?: Label;
		count?: number;
		caption?: Label;
		captionAfter?: Snippet;
		actions?: Snippet;
		tone?: 'default' | 'attention';
		density?: 'figure' | 'panel';
		/** Drawn over the card, which is `inert` while arranging. Anything over an edge must carry `data-no-drag`,
		    or the strip beneath reads a press as a resize. */
		affordances?: Snippet;
		/** Where the title opens; see `Card`. */
		open?: string;
		children: Snippet;
	}
	let {
		id,
		title,
		count,
		caption,
		captionAfter,
		actions,
		tone,
		density,
		affordances,
		open,
		children
	}: Props = $props();

	const env = getGridEnv();
	const arrangement = getArrangement();
	const labels = getLabels();

	const placed = $derived(arrangement.placed(id));
	const mode = $derived(arrangement.mode(id));
	const hug = $derived(arrangement.hugs(id));
	const arranging = $derived(env.arranging);
	const capped = $derived(mode === 'cap');
	/** How far a capped pane's ceiling reaches below the room it takes, in px: drawn while arranging, where
	    its bottom edge is dragged, but never reserved (see `reservedRows`). */
	const ceilingBelow = $derived(
		capped ? Math.max(0, arrangement.capPx(id) - pxForRows(placed.h)) : 0
	);
	const span = $derived(foldSpan(placed.w, env.columns));
	// Only a declared title gets a stored rename. A KPI pane id is also its leader section's id, so looking it
	// up regardless put a section's rename on the card around it.
	const shownTitle = $derived(title && labels.label(id, 'title', title));
	const shownCaption = $derived(title ? labels.label(id, 'caption', caption) : caption);
	// What the arrange controls announce: the card's rendered heading, so a pane the user renamed is
	// named the same way in both places.
	const name = $derived(labelText(shownTitle) || id);
	let cardEl = $state<HTMLElement>();
	let bodyEl = $state<HTMLElement>();

	// Fitted panes report their CARD's height — never the cell's — so the pure layer can turn it into
	// rows. Only while unfolded: a folded pane hugs its content and reserves nothing.
	$effect(() => {
		const el = cardEl;
		if (!hug || !el) return;

		const report = () => arrangement.setMeasured(id, el.offsetHeight);
		report();
		const observer = new ResizeObserver(report);
		observer.observe(el);
		return () => observer.disconnect();
	});

	// One rule for gestures and the label editor, labels included: a resize that clipped a caption left it
	// unrecoverable by rename.
	const gesture = new PaneGesture(() => id, arrangement, {
		spills: () => {
			if (!cardEl) return false;
			const fits = everythingFits(cardEl);
			if (!fits && DEV_TOOLS) {
				console.debug(`[grid] ${id} refused:`, [
					...spillReport(cardEl, bodyEl),
					...clippedLabels(cardEl)
				]);
			}
			return !fits;
		},
		settle: tick
	});

	/** Repeats until the content fits or the pane can't grow: room changes wrapping, and a merged section gets
	    only its weighted share. Bounded by the grid, since a pass budget left some sections short. */
	async function growUntilItFits(apply: (w: number, h: number) => void): Promise<void> {
		for (let pass = 0; pass < COLS; pass++) {
			if (!cardEl) return;
			const over = overrun(cardEl, bodyEl);
			if (!over.x && !over.y) return;
			const [was, wasTall] = [placed.w, placed.h];
			apply(was + Math.ceil(over.x / UNIT), wasTall + Math.ceil(over.y / UNIT));
			await tick();
			if (placed.w === was && placed.h === wasTall) return;
		}
	}

	// Nothing here grows a pane to fit its content: that stored whichever period's figures ran longest for
	// every period. Only an arrange gesture or a rename changes the rectangle.

	/** The field a label edit opens (see `ui/LabelLine`), whose own events say when one is in progress. */
	const isLabelField = (t: EventTarget | null) =>
		t instanceof HTMLElement && t.isContentEditable && t.classList.contains('name');

	/** A label past its line budget, or a figure (`data-clip`) its box cuts off. Asked separately because their
	    own `overflow: hidden` hides them from the spill probe. */
	const clippedLabels = (el: HTMLElement) =>
		[...el.querySelectorAll('[data-label-line], [data-clip]')]
			.filter((l) => l.scrollHeight > l.clientHeight + 1 || l.scrollWidth > l.clientWidth + 1)
			.map((l) => `label "${l.textContent?.trim().slice(0, 20)}"`);

	const labelClipped = (el: HTMLElement) => clippedLabels(el).length > 0;

	/** Everything this pane holds fits the room it is allowed. */
	function everythingFits(el: HTMLElement): boolean {
		const over = overrun(el, bodyEl);
		return !over.x && !over.y && !labelClipped(el);
	}

	/** The last words this label held that the card could fit, and a guard against the revert below being
	    read as one more edit. */
	let fitting = '';
	let reverting = false;
	/** Which run of `trackLabel` owns the measurement: keystrokes can arrive inside the frames a previous
	    run is awaiting, and only the latest may decide what fitted. */
	let tracking = 0;

	function caretToEnd(el: HTMLElement): void {
		const range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
		const selection = getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	/** Grows as a label is typed and gives room back down to the size the edit opened at, which it drops to
	    first, or it never learns it could shrink. Words that can't fit are put back. */
	async function trackLabel(field: HTMLElement): Promise<void> {
		if (!cardEl || reverting) return;
		const run = ++tracking;
		arrangement.relaxDraft(id);
		await tick();
		await growUntilItFits((w, h) => arrangement.setDraft(id, w, h));
		if (!cardEl || run !== tracking) return;

		if (everythingFits(cardEl)) {
			fitting = field.textContent ?? '';
			return;
		}
		// Not a loop: a loop here spun forever when the restored words didn't fit either.
		reverting = true;
		field.textContent = fitting;
		field.dispatchEvent(new Event('input', { bubbles: true }));
		caretToEnd(field);
		arrangement.relaxDraft(id);
		await tick();
		await growUntilItFits((w, h) => arrangement.setDraft(id, w, h));
		reverting = false;
	}

	/** One edge's resize wiring. Shared by the strips and by anything the view lays over them. */
	function resizeOn(edge: Edge): DragParams {
		return {
			onstart: () => gesture.beginResize(),
			onmove: ({ dx, dy }) => void gesture.previewResize(edge, dx, dy),
			onend: ({ dx, dy }) => void gesture.endResize(edge, dx, dy),
			oncancel: () => gesture.abandon()
		};
	}

	const STEPS: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1]
	};

	/** Keyboard equivalents on the card: arrows move by a unit, Shift+arrows resize by one. */
	function onArrangeKey(e: KeyboardEvent): void {
		const delta = STEPS[e.key];
		if (!delta) return;
		e.preventDefault();
		gesture.step(delta[0], delta[1], e.shiftKey);
	}
</script>

<div
	class="cell"
	data-pane={id}
	class:folded={env.folded}
	class:arranging
	class:hug
	class:capped
	class:invalid={gesture.invalid}
	style:grid-column={env.folded ? `span ${span}` : `${placed.x + 1} / span ${placed.w}`}
	style:grid-row={env.folded ? null : `${placed.y + 1} / span ${placed.h}`}
	style:order={env.folded ? arrangement.order[id] : null}
	style:--cap-h={capped ? `${arrangement.capPx(id)}px` : null}
	style:--ceiling-below={`${ceilingBelow}px`}
	onfocusin={(e) => {
		if (!isLabelField(e.target)) return;
		fitting = (e.target as HTMLElement).textContent ?? '';
		arrangement.startDraft(id, placed.w, placed.h);
	}}
	oninput={(e) => isLabelField(e.target) && void trackLabel(e.target as HTMLElement)}
	onfocusout={(e) =>
		isLabelField(e.target) &&
		void trackLabel(e.target as HTMLElement).then(() => arrangement.endDraft(id))}
>
	<Card
		bind:card={cardEl}
		bind:body={bodyEl}
		title={shownTitle}
		{count}
		caption={shownCaption}
		{captionAfter}
		frozen={arranging}
		nameable={!!title}
		rename={arranging && title ? (slot, text) => labels.set(id, slot, text) : undefined}
		shipped={{ title, caption }}
		{actions}
		{tone}
		{density}
		scroll={arrangement.scrolls(id)}
		{open}
		{children}
	/>

	{#if arranging}
		<div
			class="grab"
			role="button"
			tabindex="0"
			aria-label={`Move ${name}. Arrows move it; shift and arrows resize it.`}
			onkeydown={onArrangeKey}
			use:drag={{
				autoscroll: true,
				onstart: () => gesture.beginMove(),
				onmove: ({ dx, dy }) => gesture.moveTo(dx, dy),
				onend: ({ dx, dy }) => gesture.endMove(dx, dy),
				oncancel: () => gesture.abandon()
			}}
		></div>

		<!-- A sibling of the drag surface: inside `.grab`, itself a button, these were nested interactive controls.
		     Rendered only where there is a height mode to choose. -->
		{#if arrangement.canSetHeight(id)}
			<div class="tools modes" role="group" aria-label={`Height of ${name}`}>
				{#each MODE_ORDER as m (m)}
					<button
						type="button"
						class="modebtn"
						class:active={mode === m}
						aria-pressed={mode === m}
						title={MODE_LABELS[m]}
						onclick={() => arrangement.setMode(id, m)}
					>
						<SizeMode mode={m} />
					</button>
				{/each}
			</div>
		{/if}

		{#if capped}
			<!-- The ceiling the list may grow to, drawn over whatever sits below rather than reserved. -->
			<div class="ceiling" aria-hidden="true"></div>
		{/if}

		<!-- Resize strips straddling the card's edges. Not focusable and not announced: the card itself is the
		     keyboard route in, and eight tab stops per pane would bury everything else. -->
		{#each EDGES[mode] as edge (edge)}
			<div class="handle {edge}" use:drag={resizeOn(edge)}></div>
		{/each}

		<!-- After the strips, so a control laid over an edge sits on top of the one that resizes it. -->
		{@render affordances?.()}
	{/if}
</div>

{#if arranging && !env.folded && gesture.aim}
	<!-- A sibling of the cell rather than a child: it takes its own place on the grid, which is the only
	     way it can sit anywhere but where the pane already is. -->
	<div
		class="aim"
		aria-hidden="true"
		style:grid-column="{gesture.aim.x + 1} / span {gesture.aim.w}"
		style:grid-row="{gesture.aim.y + 1} / span {gesture.aim.h}"
	></div>
{/if}

<style>
	/* Each pane insets itself by half a gap; the grid itself has none (see `units.ts`). */
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
	/* `flex: 0 0 auto`: with `1 1 auto` the cell stretches the card, the next measurement reads that height
	   back, and the pane ratchets. */
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

	/* On the grid the pane's height aligns neighbours, so the figure box's own clamps are lifted. */
	.cell:not(.folded) :global(.figurebox),
	.cell:not(.folded) :global(.sizebox) {
		min-height: 0;
		max-height: none;
	}
	/* The width content that scales or clamps has stated it cannot go under (see `ui/fit`). Grid only: a folded
	   card has no resize to refuse, so a floor there would only bleed. */
	.cell:not(.folded) :global([data-floor]) {
		min-width: var(--content-floor, 0);
	}
	/* Let out while arranging, where the overrun makes a resize refuse; elsewhere it scrolls. */
	.cell.arranging:not(.folded) :global(.scroller-x) {
		overflow-x: visible;
	}
	/* Folded, the card hugs its content, so a size container would collapse to zero; the figure sizes itself. */
	.cell.folded :global(.sizebox) {
		container-type: normal;
		max-height: none;
	}
	/* A fixed-viewBox chart (sankey, heatmap) takes its height from its width, so widening a pane made
	   it taller and it spilled out of the card. Given the full height it letterboxes instead. */
	.cell:not(.folded) :global(.body > svg.chart) {
		height: 100%;
	}

	/* --- arrange affordances --------------------------------------------------- */
	.cell.arranging > :global(.card) {
		user-select: none;
	}
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
		outline: 1px solid color-mix(in srgb, var(--arrange-line) 40%, transparent);
		outline-offset: -1px;
	}
	.grab:active {
		cursor: grabbing;
	}
	/* The ceiling a capped pane may grow to: the card's footprint carried down to it, dashed. */
	.ceiling {
		position: absolute;
		z-index: 2;
		top: var(--pane-inset);
		left: var(--pane-inset);
		right: var(--pane-inset);
		height: var(--cap-h);
		border-radius: var(--radius-xl);
		outline: 1.5px dashed var(--arrange-line);
		outline-offset: -1px;
		pointer-events: none;
	}
	.cell.invalid .grab {
		outline: 2px solid var(--crit);
		background: color-mix(in srgb, var(--crit-wash) calc(10% * var(--wash-scale)), transparent);
	}
	/* The pointer's target. Inset and rounded like a card so it reads as the pane's own footprint, and
	   above the panes it crosses, since where it is going is what the user is looking at. */
	.aim {
		position: relative;
		z-index: 3;
		margin: calc(var(--gap-grid) / 2);
		border-radius: var(--radius-xl);
		border: 2px dashed var(--arrange-line);
		background: color-mix(in srgb, var(--arrange-line) 18%, transparent);
		pointer-events: none;
	}
	/* Positioned from the CELL, so the offsets carry the pane's own inset: these sit over the card but are
	   a sibling of the drag surface, not a child of it (see the markup). */
	.tools {
		position: absolute;
		z-index: 2;
		top: calc(var(--pane-inset) + var(--space-3));
		right: calc(var(--pane-inset) + var(--space-3));
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
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
	.modebtn:hover {
		color: var(--ink);
		background: var(--inset);
	}
	.modebtn.active {
		background: color-mix(in srgb, var(--arrange-line) 24%, transparent);
		color: var(--ink);
	}
	.modes {
		display: flex;
		gap: 1px;
	}

	/* Centred on the edge so the grab zone reaches both sides; edges inset by a reach to clear the corners. */
	.handle {
		--reach: 12px;
		--edge: calc(var(--pane-inset) - var(--reach) / 2);
		--clear: calc(var(--pane-inset) + var(--reach) / 2);
		position: absolute;
		touch-action: none;
		border-radius: var(--radius-sm);
	}
	.handle:hover {
		background: color-mix(in srgb, var(--arrange-line) 35%, transparent);
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
	/* A capped pane's bottom edge is its ceiling, wherever that is drawn. */
	.handle.s {
		bottom: calc(var(--edge) - var(--ceiling-below));
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
		bottom: calc(var(--edge) - var(--ceiling-below));
		right: var(--edge);
		cursor: nwse-resize;
	}
	.handle.sw {
		bottom: calc(var(--edge) - var(--ceiling-below));
		left: var(--edge);
		cursor: nesw-resize;
	}
</style>
