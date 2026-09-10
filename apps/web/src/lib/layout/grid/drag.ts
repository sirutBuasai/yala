// One pointer-drag action, shared by moving and resizing. It knows about the DOM and nothing about
// the board: it reports how far the pointer has travelled, and the pane decides what that means.
// Deltas are CUMULATIVE from the press, so the board's clamping is re-derived from a fixed origin
// rather than accumulated — dragging a pane into a wall and back out again is exact.
//
// A press is not yet a drag. The gesture stays PENDING until the pointer has travelled `THRESHOLD`,
// and only then is `preventDefault` called and `onstart` fired. That is what lets a control sit on a
// drag surface and still be clickable: Svelte DELEGATES pointer events to the document root, so a
// component's click handler runs strictly after this action's direct listener — and a `preventDefault`
// on the press swallows the click with it. Waiting for movement means a press that never moves stays
// a click, and the same spot still drags.
//
// `[data-no-drag]` remains for a control that must never begin a gesture at all, whatever the pointer
// does afterwards.

const OPT_OUT = '[data-no-drag]';

/** Pixels of travel before a press becomes a drag. Enough to absorb the wobble in a click. */
const THRESHOLD = 4;

export interface DragDetail {
	/** Pixels travelled since the press, on each axis. */
	dx: number;
	dy: number;
}

export interface DragParams {
	onstart?: () => void;
	onmove: (detail: DragDetail) => void;
	/** The gesture completed. Fires with the final cumulative delta. */
	onend: (detail: DragDetail) => void;
	/** The gesture was abandoned (Escape, or the browser cancelled the pointer). */
	oncancel?: () => void;
	disabled?: boolean;
}

export function drag(node: HTMLElement, params: DragParams) {
	let current = params;
	let origin: { x: number; y: number } | null = null;
	/** True once the travel passed the threshold and the gesture actually began. */
	let dragging = false;
	let pointer = -1;

	const detail = (e: PointerEvent): DragDetail => ({
		dx: e.clientX - (origin?.x ?? e.clientX),
		dy: e.clientY - (origin?.y ?? e.clientY)
	});

	/** Pointer capture is best-effort: it keeps the gesture alive once the pointer leaves the handle,
	    but a stale or synthetic pointer id makes the call throw, and losing capture beats losing the
	    gesture. */
	function capture(take: boolean): void {
		try {
			if (take) node.setPointerCapture(pointer);
			else node.releasePointerCapture(pointer);
		} catch {
			/* no such pointer — carry on without capture */
		}
	}

	function finish(ended: boolean, last?: DragDetail): void {
		if (!origin) return;
		const began = dragging;
		origin = null;
		dragging = false;
		capture(false);
		removeEventListener('keydown', onkeydown, true);
		// A press that never passed the threshold was a click, not an abandoned gesture: nothing began,
		// so there is nothing to end or to put back.
		if (!began) return;
		if (ended && last) current.onend(last);
		else current.oncancel?.();
	}

	function onkeydown(e: KeyboardEvent): void {
		// Escape abandons the gesture. Captured, so a focused control inside the pane can't eat it.
		if (e.key !== 'Escape') return;
		e.preventDefault();
		finish(false);
	}

	function onpointerdown(e: PointerEvent): void {
		// Primary button only: a right-click or a two-finger scroll is not a drag.
		if (current.disabled || origin || e.button !== 0) return;
		if ((e.target as Element | null)?.closest(OPT_OUT)) return;
		// Deliberately no `preventDefault` yet — see the threshold note at the top of this file. Capture
		// IS taken now, though: the listeners are on this node, so without it the moves stop arriving the
		// moment the pointer leaves it, and a control small enough to click is left in a few pixels.
		origin = { x: e.clientX, y: e.clientY };
		pointer = e.pointerId;
		capture(true);
	}

	function onpointermove(e: PointerEvent): void {
		if (!origin) return;
		const travel = detail(e);

		if (!dragging) {
			if (Math.abs(travel.dx) < THRESHOLD && Math.abs(travel.dy) < THRESHOLD) return;
			dragging = true;
			e.preventDefault();
			e.stopPropagation();
			addEventListener('keydown', onkeydown, true);
			current.onstart?.();
		}

		current.onmove(travel);
	}

	function onpointerup(e: PointerEvent): void {
		finish(true, detail(e));
	}

	function onpointercancel(): void {
		finish(false);
	}

	const listeners = {
		pointerdown: onpointerdown,
		pointermove: onpointermove,
		pointerup: onpointerup,
		pointercancel: onpointercancel
	} as const;

	for (const [type, fn] of Object.entries(listeners)) {
		node.addEventListener(type, fn as EventListener);
	}

	return {
		update(next: DragParams) {
			current = next;
		},
		destroy() {
			finish(false);
			for (const [type, fn] of Object.entries(listeners)) {
				node.removeEventListener(type, fn as EventListener);
			}
		}
	};
}
