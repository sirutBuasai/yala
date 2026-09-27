// Replaces `@floating-ui/dom` under vitest: with no layout, collision middleware tries every fallback and
// times tests out. Placement is asserted in `e2e/overlay.spec.ts`.

interface Placed {
	x: number;
	y: number;
}

export function computePosition(): Promise<Placed> {
	return Promise.resolve({ x: 0, y: 0 });
}

/** Positions once and watches nothing; the returned cleanup is what callers store. */
export function autoUpdate(_anchor: Element, _panel: Element, update: () => void): () => void {
	update();
	return () => {};
}

const middleware = (name: string) => () => ({ name });

export const offset = middleware('offset');
export const flip = middleware('flip');
export const shift = middleware('shift');
export const size = middleware('size');
