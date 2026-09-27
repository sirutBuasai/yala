// One pointer-drag action, shared by moving and resizing. It knows the DOM and nothing about the board.
// Deltas are cumulative from the press, so clamping re-derives from a fixed origin: dragging a pane into a
// wall and back out again is exact.
//
// A press is not yet a drag — the gesture stays pending until the pointer has travelled `THRESHOLD`, which is
// what keeps a control on a drag surface clickable, since `preventDefault` on the press would swallow the
// click with it. `[data-no-drag]` opts a control out of starting a gesture at all.

const OPT_OUT = '[data-no-drag]';

/** Pixels of travel before a press becomes a drag, absorbing the wobble in a click. */
const THRESHOLD = 4;

/** How close to the window's top or bottom edge the pointer scrolls the page, and how fast at the edge, in
    px and px per frame. */
const EDGE = 56;
const SPEED = 18;

export interface DragDetail {
	/** Pixels travelled since the press, on each axis, counting any the page scrolled under the pointer. */
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
	/** Scroll the page when the pointer nears the window's top or bottom edge. For carrying something
	    across the page; a resize keeps the page still, so its measured floor holds. */
	autoscroll?: boolean;
}

export function drag(node: HTMLElement, params: DragParams) {
	let current = params;
	let origin: { x: number; y: number } | null = null;
	/** True once the travel passed the threshold and the gesture actually began. */
	let dragging = false;
	let pointer = -1;
	/** Where the pointer last was, in the window, and where the page was scrolled at the press. */
	let last = { x: 0, y: 0 };
	let scrolled = { x: 0, y: 0 };
	let frame = 0;
	/** The page's height at the press, which autoscroll stays within. */
	let held = 0;

	/** In page terms, so a pane dragged while the page scrolls stays under the pointer. */
	const detail = (at: { x: number; y: number }): DragDetail => ({
		dx: at.x - (origin?.x ?? at.x) + (window.scrollX - scrolled.x),
		dy: at.y - (origin?.y ?? at.y) + (window.scrollY - scrolled.y)
	});

	/**
	 * Held at its height for the whole gesture: a resize measures its floor by laying the pane out smaller,
	 * and a shrinking pane at the foot of the page shortens it, and either way the browser clamped the scroll
	 * and jumped the page up, taking the edge being dragged out from under the pointer.
	 */
	function holdPage(hold: boolean): void {
		held = document.documentElement.scrollHeight;
		document.body.style.minHeight = hold ? `${held}px` : '';
		// Anchoring off too: a pane carried down lengthens the page, and the browser scrolled to keep its
		// anchor in view, racing the page away under the pointer.
		document.documentElement.style.overflowAnchor = hold ? 'none' : '';
	}

	/** Scroll the page while the pointer rests near the window's top or bottom edge, and follow it. */
	function autoscroll(): void {
		const near = (distance: number) => Math.max(0, (EDGE - distance) / EDGE);
		const push = near(last.y) > 0 ? -near(last.y) : near(window.innerHeight - last.y);
		// Only over the page as it was: past its foot a carried pane would drag the page on for ever.
		const room = held - window.innerHeight - window.scrollY;
		if (push < 0 || (push > 0 && room > 0)) {
			const before = window.scrollY;
			window.scrollBy(0, Math.round(push * SPEED));
			if (window.scrollY !== before) current.onmove(detail(last));
		}
		frame = requestAnimationFrame(autoscroll);
	}

	/** Best-effort: capture keeps the gesture alive once the pointer leaves the handle, but a stale or
	    synthetic pointer id makes the call throw, and losing capture beats losing the gesture. */
	function capture(take: boolean): void {
		try {
			if (take) node.setPointerCapture(pointer);
			else node.releasePointerCapture(pointer);
		} catch {
			/* no such pointer — carry on without capture */
		}
	}

	function finish(ended: boolean): void {
		if (!origin) return;
		const began = dragging;
		dragging = false;
		cancelAnimationFrame(frame);
		capture(false);
		removeEventListener('keydown', onkeydown, true);
		// Measured before the origin is dropped, so the last delta still counts the scroll.
		const final = began ? detail(last) : undefined;
		origin = null;
		// A press that never passed the threshold was a click: nothing began, so nothing to end or put back.
		if (!began) return;
		if (ended && final) current.onend(final);
		else current.oncancel?.();
		holdPage(false);
	}

	function onkeydown(e: KeyboardEvent): void {
		// Listened for in the capture phase, so a focused control inside the pane cannot eat it.
		if (e.key !== 'Escape') return;
		e.preventDefault();
		finish(false);
	}

	function onpointerdown(e: PointerEvent): void {
		// Primary button only: a right-click or a two-finger scroll is not a drag.
		if (current.disabled || origin || e.button !== 0) return;
		if ((e.target as Element | null)?.closest(OPT_OUT)) return;
		// No `preventDefault` yet (see the threshold note above), but capture IS taken now: the listeners
		// are on this node, so without it the moves stop arriving the moment the pointer leaves it.
		origin = { x: e.clientX, y: e.clientY };
		last = { ...origin };
		scrolled = { x: window.scrollX, y: window.scrollY };
		pointer = e.pointerId;
		capture(true);
	}

	function onpointermove(e: PointerEvent): void {
		if (!origin) return;
		last = { x: e.clientX, y: e.clientY };
		const travel = detail(last);

		if (!dragging) {
			if (Math.abs(travel.dx) < THRESHOLD && Math.abs(travel.dy) < THRESHOLD) return;
			dragging = true;
			e.preventDefault();
			e.stopPropagation();
			addEventListener('keydown', onkeydown, true);
			holdPage(true);
			current.onstart?.();
			if (current.autoscroll) frame = requestAnimationFrame(autoscroll);
		}

		current.onmove(travel);
	}

	function onpointerup(e: PointerEvent): void {
		last = { x: e.clientX, y: e.clientY };
		finish(true);
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
