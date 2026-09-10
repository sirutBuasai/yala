// One pointer-drag action, shared by moving and resizing. It knows about the DOM and nothing about
// the board: it reports how far the pointer has travelled, and the pane decides what that means.
//
// Deltas are CUMULATIVE from the press, never incremental. An incremental delta accumulates every
// clamp the board applies, so dragging a pane into a wall and back out again leaves it short by
// however long you leaned on the wall. Cumulative deltas replay from a fixed origin, so the board's
// clamping is re-derived rather than remembered.
//
// A drag surface usually has to carry its own controls, and `[data-no-drag]` is how they opt out. It
// is checked HERE rather than left to a `stopPropagation` on the control's own handler, and that is
// not a stylistic choice: Svelte DELEGATES pointer events to the document root, so a component's
// handler runs strictly after this action's direct listener has already seen the press and called
// `preventDefault()` on it — which also swallows the click that was supposed to follow. Every button
// inside a drag surface was dead until this check existed.

/** Marks a subtree inside a drag surface as not draggable — its own controls. */
const OPT_OUT = '[data-no-drag]';

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
	let pointer = -1;

	const detail = (e: PointerEvent): DragDetail => ({
		dx: e.clientX - (origin?.x ?? e.clientX),
		dy: e.clientY - (origin?.y ?? e.clientY)
	});

	/** Pointer capture is best-effort: it is what keeps the gesture alive once the pointer leaves the
	    handle, but a stale or synthetic pointer id makes the call throw, and losing capture is far
	    better than losing the gesture. */
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
		origin = null;
		capture(false);
		removeEventListener('keydown', onkeydown, true);
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
		e.preventDefault();
		e.stopPropagation();
		origin = { x: e.clientX, y: e.clientY };
		pointer = e.pointerId;
		capture(true);
		addEventListener('keydown', onkeydown, true);
		current.onstart?.();
	}

	function onpointermove(e: PointerEvent): void {
		if (!origin) return;
		current.onmove(detail(e));
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
