// The drag action. jsdom has no layout, so what is testable here is the event contract — which is
// exactly where the bugs were: cumulative deltas, and the opt-out that lets a drag surface carry its
// own controls.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { drag, type DragDetail } from '$lib/layout/grid/drag';

/**
 * Dispatch a pointer event. Built from `MouseEvent` because jsdom does not implement `PointerEvent`;
 * `dispatchEvent` honours the type string, so the listeners see what they expect.
 */
function press(target: Element, type: string, x = 0, y = 0, button = 0) {
	const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button });
	Object.defineProperty(event, 'pointerId', { value: 1 });
	target.dispatchEvent(event);
}

function surface() {
	const node = document.createElement('div');
	const control = document.createElement('button');
	control.setAttribute('data-no-drag', '');
	const inner = document.createElement('span'); // a glyph inside the control
	control.append(inner);
	node.append(control);
	document.body.append(node);

	const moves: DragDetail[] = [];
	const calls = { start: 0, end: [] as DragDetail[], cancel: 0 };
	const action = drag(node, {
		onstart: () => calls.start++,
		onmove: (d) => moves.push(d),
		onend: (d) => calls.end.push(d),
		oncancel: () => calls.cancel++
	});
	return { node, control, inner, moves, calls, action };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('drag', () => {
	it('reports deltas cumulative from the press, not incremental', () => {
		const { node, moves } = surface();

		press(node, 'pointerdown', 100, 100);
		press(node, 'pointermove', 110, 130);
		press(node, 'pointermove', 90, 100);
		press(node, 'pointermove', 160, 100);

		// Each delta is measured from the ORIGIN. Summed incrementally these would read 10/30, then
		// -20/-30, then 70/0 — and every clamp the board applied on the way would be baked in.
		expect(moves).toEqual([
			{ dx: 10, dy: 30 },
			{ dx: -10, dy: 0 },
			{ dx: 60, dy: 0 }
		]);
	});

	it('so dragging into a wall and back out again lands where the pointer is', () => {
		const { node, moves } = surface();

		press(node, 'pointerdown', 200, 0);
		press(node, 'pointermove', 0, 0); // far left, where the board will clamp
		press(node, 'pointermove', -400, 0); // leaning on the wall
		press(node, 'pointermove', 220, 0); // back out, 20px right of the press

		expect(moves.at(-1)).toEqual({ dx: 20, dy: 0 });
	});

	it('ends with the final cumulative delta', () => {
		const { node, calls } = surface();

		press(node, 'pointerdown', 0, 0);
		press(node, 'pointermove', 30, 40);
		press(node, 'pointerup', 30, 40);

		expect(calls.end).toEqual([{ dx: 30, dy: 40 }]);
		expect(calls.cancel).toBe(0);
	});

	it('does NOT start a gesture on a press inside an opted-out control', () => {
		// The regression this exists for: Svelte delegates pointer events to the document root, so a
		// `stopPropagation` on the control's own handler runs strictly AFTER this action has already
		// seen the press and called preventDefault on it — which also swallows the click. Every button
		// inside a drag surface was dead. The opt-out has to be checked here.
		const { control, calls, moves } = surface();

		press(control, 'pointerdown', 0, 0);
		press(control, 'pointermove', 50, 50);

		expect(calls.start).toBe(0);
		expect(moves).toEqual([]);
	});

	it('lets the press through so the control still gets its click', () => {
		const { control } = surface();
		const clicked = vi.fn();
		control.addEventListener('click', clicked);

		const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
		Object.defineProperty(down, 'pointerId', { value: 1 });
		control.dispatchEvent(down);
		control.click();

		expect(down.defaultPrevented).toBe(false);
		expect(clicked).toHaveBeenCalled();
	});

	it('applies the opt-out to anything inside the control, not just the control itself', () => {
		const { inner, calls } = surface();
		press(inner, 'pointerdown', 0, 0);
		expect(calls.start).toBe(0);
	});

	it('ignores a non-primary button', () => {
		const { node, calls } = surface();
		press(node, 'pointerdown', 0, 0, 2);
		expect(calls.start).toBe(0);
	});

	it('abandons the gesture on Escape, and reports no end', () => {
		const { node, calls } = surface();

		press(node, 'pointerdown', 0, 0);
		press(node, 'pointermove', 40, 0);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect(calls.cancel).toBe(1);
		expect(calls.end).toEqual([]);

		// And the abandoned gesture is over: further movement reports nothing.
		press(node, 'pointermove', 90, 0);
		expect(calls.cancel).toBe(1);
	});

	it('abandons the gesture when the browser cancels the pointer', () => {
		const { node, calls } = surface();
		press(node, 'pointerdown', 0, 0);
		press(node, 'pointercancel', 10, 10);
		expect(calls.cancel).toBe(1);
	});

	it('does nothing while disabled', () => {
		const node = document.createElement('div');
		document.body.append(node);
		const calls = { start: 0 };
		drag(node, { disabled: true, onstart: () => calls.start++, onmove: () => {}, onend: () => {} });

		press(node, 'pointerdown', 0, 0);
		expect(calls.start).toBe(0);
	});

	it('stops listening once destroyed', () => {
		const { node, action, calls } = surface();
		action.destroy();
		press(node, 'pointerdown', 0, 0);
		expect(calls.start).toBe(0);
	});
});
