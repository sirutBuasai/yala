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
	// One pane on the board: the grid item, the arrange affordances, and the two measurements the pure
	// layer cannot make for itself. It COMPOSES `Card` rather than being one, so the card stays
	// grid-agnostic and the folded layout reuses it untouched.
	import { tick, type Snippet } from 'svelte';
	import Card from '$lib/ui/Card.svelte';
	import { labelText, type Label } from '$lib/ui/label';
	import SizeMode from '$lib/icons/SizeMode.svelte';
	import { getArrangement, getGridEnv, getLabels } from './context';
	import { drag, type DragParams } from './drag';
	import { overrun } from './spill';
	import { foldSpan } from './fold';
	import { EDGES, type Edge } from './resize';
	import { PaneGesture } from './gesture.svelte';
	import { UNIT } from './units';

	/** How many times a pane re-measures itself before accepting that its content will not fit. */
	const FIT_PASSES = 4;

	interface Props {
		/** Pane id — a key of the board's layout. */
		id: string;
		title?: Label;
		count?: number;
		caption?: Label;
		actions?: Snippet;
		tone?: 'default' | 'attention';
		density?: 'figure' | 'panel';
		/** Extra arrange-mode controls, drawn over the card alongside the height modes and resize strips.
		    Outside the card because the card is `inert` while arranging. Anything laid over an edge must
		    carry `data-no-drag`, or the strip beneath reads a press on it as the start of a resize. */
		affordances?: Snippet;
		children: Snippet;
	}
	let { id, title, count, caption, actions, tone, density, affordances, children }: Props =
		$props();

	const env = getGridEnv();
	const arrangement = getArrangement();
	const labels = getLabels();

	const placed = $derived(arrangement.placed(id));
	const mode = $derived(arrangement.mode(id));
	const hug = $derived(arrangement.hugs(id));
	const arranging = $derived(env.arranging);
	const capped = $derived(mode === 'cap');
	const span = $derived(foldSpan(placed.w, env.columns));
	// A declared title is what makes a card one we name; its caption may then be added where the view wrote
	// none. A KPI card declares neither, and its pane id is also its leader section's id — look the store
	// up regardless and a renamed section came back as a heading on the card around it, one it never had.
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

	// One rule for both gestures and the label editor (`everythingFits`), labels included: a resize that
	// clipped a card's own caption left it in a state no rename could recover from. `tick` is what makes a
	// candidate size real before it is measured.
	const gesture = new PaneGesture(() => id, arrangement, {
		spills: () => !!cardEl && !everythingFits(cardEl),
		settle: tick
	});

	/**
	 * Measure, apply, and measure again until the content fits. One pass is not enough: the room a card is
	 * given changes how its own text wraps, so a title that wanted two more rows can want a third once it
	 * has them — which is how a pane grew and left its title still hanging out of the card. Bounded,
	 * because content that will not fit at any size must not spin here.
	 */
	async function growUntilItFits(apply: (w: number, h: number) => void): Promise<void> {
		for (let pass = 0; pass < FIT_PASSES; pass++) {
			if (!cardEl) return;
			const over = overrun(cardEl, bodyEl);
			if (!over.x && !over.y) return;
			apply(placed.w + Math.ceil(over.x / UNIT), placed.h + Math.ceil(over.y / UNIT));
			await tick();
		}
	}

	// A pane grows to fit content it was not sized for — a renamed title, a longer figure, a wider column.
	// Edit-mode affordances are deliberately free of layout (see `ui/LabelLine`), so this measures the same
	// in either mode and switching modes moves nothing.
	//
	// Two observers, because they see different things: a resize catches the box moving (this pane, the
	// window, a header that wrapped), a mutation catches the content changing inside a box that did not.
	// Both are coalesced to one measurement per frame, since either can fire repeatedly for one change.
	$effect(() => {
		const el = cardEl;
		if (env.folded || !el) return;

		let queued = 0;
		const measure = () => {
			queued = 0;
			// A label being typed into drives its own pane from `oninput` below, which is the only path that
			// can also make it smaller again.
			if (gesture.busy || arrangement.drafting === id) return;
			void growUntilItFits((w, h) => arrangement.grow(id, w, h));
		};
		const schedule = () => {
			queued ||= requestAnimationFrame(measure);
		};

		schedule();
		const resize = new ResizeObserver(schedule);
		resize.observe(el);
		if (bodyEl) resize.observe(bodyEl);
		const mutation = new MutationObserver(schedule);
		mutation.observe(el, { subtree: true, childList: true, characterData: true });

		return () => {
			if (queued) cancelAnimationFrame(queued);
			resize.disconnect();
			mutation.disconnect();
		};
	});

	/** The field a label edit opens (see `ui/LabelLine`), whose own events say when one is in progress. */
	const isLabelField = (t: EventTarget | null) =>
		t instanceof HTMLElement && t.isContentEditable && t.classList.contains('name');

	/**
	 * A label with more words than its line budget allows. Its own `overflow: hidden` is what bounds the
	 * card (see `--label-lines` in app.css), and that same hidden overflow is why the card's spill probe
	 * cannot see it — so it is asked for separately.
	 *
	 * Both axes: a wrapping label runs out of LINES, one that cannot wrap runs out of WIDTH.
	 */
	const labelClipped = (el: HTMLElement) =>
		[...el.querySelectorAll('[data-label-line]')].some(
			(l) => l.scrollHeight > l.clientHeight + 1 || l.scrollWidth > l.clientWidth + 1
		);

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

	/**
	 * Follow a label as it is typed: the pane grows the moment the words stop fitting and gives the room
	 * back as they are deleted, down to the size it had when the edit opened. Dropping to that size first is
	 * what makes shrinking possible at all — a pane measured at its grown size reports no overflow and would
	 * never learn it could be smaller.
	 *
	 * Once the pane has taken all the room it may, words that still do not fit are put back. The limit is
	 * the card's, never a count of characters: a wide card holds a longer title than a narrow one, and a
	 * nowrap KPI label runs out of grid where a wrapping one runs out of lines.
	 */
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
		// Put the words back and re-fit once. Deliberately not a loop: if the restored words do not fit
		// either, the pane is already as large as it may get and there is nothing further to try — and a
		// loop here spun for ever the first time that happened.
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
	class:folded={env.folded}
	class:arranging
	class:hug
	class:capped
	class:invalid={gesture.invalid}
	style:grid-column={env.folded ? `span ${span}` : `${placed.x + 1} / span ${placed.w}`}
	style:grid-row={env.folded ? null : `${placed.y + 1} / span ${placed.h}`}
	style:order={env.folded ? arrangement.order[id] : null}
	style:--cap-h={capped ? `${arrangement.capPx(id)}px` : null}
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
		frozen={arranging}
		nameable={!!title}
		rename={arranging && title ? (slot, text) => labels.set(id, slot, text) : undefined}
		shipped={{ title, caption }}
		{actions}
		{tone}
		{density}
		scroll={arrangement.scrolls(id)}
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
				onstart: () => gesture.beginMove(),
				onmove: ({ dx, dy }) => gesture.moveTo(dx, dy),
				onend: ({ dx, dy }) => gesture.endMove(dx, dy),
				oncancel: () => gesture.abandon()
			}}
		></div>

		<!-- A SIBLING of the drag surface, not a child: `.grab` is itself a `role="button"`, and buttons
		     inside it made every pane a nested interactive control. Being no longer a descendant is also what
		     lets `data-no-drag` go — a press here can no longer reach the drag listener at all.

		     Rendered only where there is something to choose: with the grip gone, a chart pane has no height
		     mode and the bar would be an empty pill sitting on the card. -->
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
	/* A fitted card owns its height, and `flex: 0 0 auto` is the load-bearing half: with `1 1 auto` the
	   flex algorithm stretches it to the cell, so the next measurement reads back the height the cell
	   imposed rather than the height the content needs, and the pane ratchets one way and never comes
	   back. */
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

	/* The figure box's own min/max height stop one tall figure dragging its neighbours out of alignment
	   on a flow layout; on the grid the pane's height already answers that, so both are lifted — except
	   `--figure-h-floor` (see app.css). Without that floor a figure with a DETACHED legend has no
	   data-dependent minimum at all: the plot shrinks to nothing and the legend always fits. With it,
	   the pane's minimum is the floor plus however many rows the legend wraps onto. */
	.cell:not(.folded) :global(.figurebox),
	.cell:not(.folded) :global(.sizebox) {
		min-height: var(--figure-h-floor);
		max-height: none;
	}
	/* Folded, the card hugs its content, so a size container inside it has no height to take and would
	   collapse to zero, spilling the figure. The figure sizes itself here instead, and the ceiling goes
	   with the containment: a figure whose contents REFLOW can need more height than `--figure-h-max`,
	   and nothing here is aligned against a neighbour for that ceiling to protect. */
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
	/* The ceiling a capped pane holds open, so nothing gets placed in the room the list will grow into. */
	.cell.capped .grab {
		outline-style: dashed;
		outline-width: 1.5px;
	}
	.cell.invalid .grab {
		outline: 2px solid var(--crit);
		background: color-mix(in srgb, var(--crit) 10%, transparent);
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

	/* Each strip is centred on the card's boundary, so the grab zone reaches either side of the visible
	   edge. Corners are placed at the ends of the edges, so the edges inset by a whole reach to clear
	   them. */
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
