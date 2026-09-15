// Stands in for `@floating-ui/dom` under vitest (aliased in vite.config.ts, test mode only). With no
// layout every rect is zero, so the collision middleware finds nothing fits anywhere and works through
// every fallback — seconds per call, enough to time a test out — and a coordinate derived from zero-sized
// boxes would be meaningless anyway. Placement is asserted in `e2e/overlay.spec.ts`.
//
// The shape only has to satisfy `overlay/Popup`: a stub that grows features is a second implementation.

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
