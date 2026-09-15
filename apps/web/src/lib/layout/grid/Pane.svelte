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
	import Grip from '$lib/icons/Grip.svelte';
	import SizeMode from '$lib/icons/SizeMode.svelte';
	import { getArrangement, getGridEnv, getLabels } from './context';
	import { drag, type DragParams } from './drag';
	import { overrun, spills } from './spill';
	import { foldSpan } from './fold';
	import { EDGES, type Edge } from './resize';
	import { PaneGesture } from './gesture.svelte';
	import { UNIT } from './units';

	interface Props {
		/** Pane id — a key of the board's layout. */
		id: string;
		title?: Label;
		count?: number;
		caption?: Label;
		actions?: Snippet;
		tone?: 'default' | 'attention';
		density?: 'figure' | 'panel';
		/** Extra arrange-mode controls, drawn over the card alongside the grip and the resize strips.
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

	// The spill check is asked for the card and its body by reference (see `spill.ts`), and `tick` is what
	// makes a candidate size real before it is measured.
	const gesture = new PaneGesture(() => id, arrangement, {
		spills: () => !!cardEl && spills(cardEl, bodyEl),
		settle: tick
	});

	/** The units this pane's content wants, given the size it currently has. */
	function wanted(el: HTMLElement): { w: number; h: number } {
		const over = overrun(el, bodyEl);
		return {
			w: placed.w + Math.ceil(over.x / UNIT),
			h: placed.h + Math.ceil(over.y / UNIT)
		};
	}

	// A pane grows to fit content it was not sized for — a renamed title, a longer figure, a wider column.
	// The floor is the size the content needs rather than the deficit, so it is measured against what the
	// pane currently has and one pass converges. Edit-mode affordances are deliberately free of layout (see
	// `ui/LabelLine`), so this measures the same in either mode and switching modes moves nothing.
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
			const { w, h } = wanted(el);
			arrangement.setFloor(id, w, h);
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
	 * Follow a label as it is typed: the pane grows the moment the words stop fitting and gives the room
	 * back as they are deleted, down to the size it had when the edit opened. Dropping to that size first is
	 * what makes shrinking possible at all — a pane measured at its grown size reports no overflow and would
	 * never learn it could be smaller.
	 */
	async function trackLabel(): Promise<void> {
		const el = cardEl;
		if (!el) return;
		arrangement.relaxDraft();
		await tick();
		const { w, h } = wanted(el);
		arrangement.setDraft(w, h);
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

	/** Keyboard equivalents on the grip: arrows move by a unit, Shift+arrows resize by one. */
	function onGripKey(e: KeyboardEvent): void {
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
	onfocusin={(e) => isLabelField(e.target) && arrangement.startDraft(id, placed.w, placed.h)}
	oninput={(e) => isLabelField(e.target) && void trackLabel()}
	onfocusout={(e) => isLabelField(e.target) && void trackLabel().then(() => arrangement.endDraft())}
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
			use:drag={{
				onstart: () => gesture.beginMove(),
				onmove: ({ dx, dy }) => gesture.moveTo(dx, dy),
				onend: ({ dx, dy }) => gesture.endMove(dx, dy),
				oncancel: () => gesture.abandon()
			}}
		>
			<!-- data-no-drag: stopping propagation here cannot work, because Svelte delegates the event
			     (see drag.ts). -->
			<div class="tools" role="toolbar" aria-label={`Edit ${name}`} tabindex="-1" data-no-drag>
				<button
					class="grip"
					type="button"
					aria-label={`Move ${name}. Arrows move it; shift and arrows resize it.`}
					onkeydown={onGripKey}
				>
					<Grip />
				</button>
				{#if arrangement.canSetHeight(id)}
					<div class="modes" role="group" aria-label={`Height of ${name}`}>
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
			</div>
		</div>

		<!-- Resize strips straddling the card's edges. Not focusable and not announced: the grip is the
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
	/* Folded, the card hugs its content, so a size container inside it has no height to take and size
	   containment would collapse it to zero and spill the figure out of the card. The figure sizes
	   itself here instead. */
	.cell.folded :global(.sizebox) {
		container-type: normal;
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
		background: color-mix(in srgb, var(--arrange-line) 24%, transparent);
		color: var(--ink);
	}
	.modes {
		display: flex;
		gap: 1px;
		padding-left: var(--space-2);
		border-left: 1px solid var(--border);
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
