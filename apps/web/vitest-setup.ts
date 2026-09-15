// Global test setup: jest-dom matchers + DOM cleanup between tests.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { live } from './src/lib/data/load';

// jsdom has no ResizeObserver, which `bind:clientWidth` and the grid's fitted-pane measurement both
// need. A no-op stub: nothing in jsdom has a layout to observe anyway, so the grid renders folded —
// which is the right thing for a component test, and the geometry rules have their own pure tests.
class NoopResizeObserver implements ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver;

// Likewise absent, and Floating UI's `autoUpdate` watches for layout shift with one.
class NoopIntersectionObserver implements IntersectionObserver {
	readonly root = null;
	readonly rootMargin = '';
	readonly thresholds: readonly number[] = [];
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
}
globalThis.IntersectionObserver ??= NoopIntersectionObserver;

// jsdom parses `<dialog>` but implements none of its methods. Only what a component test can observe is
// stubbed: the top layer, the backdrop and focus restoration have nothing in jsdom to act on.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
	this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
	this.open = false;
	this.dispatchEvent(new Event('close'));
};

// jsdom implements no Web Animations API, and Svelte drives every transition through
// `element.animate` — without this, rendering anything that transitions in (an overlay) throws. The
// stub reports itself already finished: a test asserts what a panel shows, never how it arrived.
Element.prototype.animate ??= () =>
	({
		cancel() {},
		play() {},
		pause() {},
		finish() {},
		reverse() {},
		currentTime: 0,
		startTime: 0,
		playbackRate: 1,
		playState: 'finished',
		finished: Promise.resolve(),
		onfinish: null,
		effect: { getComputedTiming: () => ({}), updateTiming() {} },
		addEventListener() {},
		removeEventListener() {}
	}) as unknown as Animation;

// Mark the API as reachable. Without this the SINGLE write guard in `load.ts` refuses every POST
// before it is made, and any test that asserts on a request body sees no request at all.
beforeEach(() => {
	live.set(true);
});

// Node ≥22 exposes an experimental `localStorage` global that warns unless `--localstorage-file`
// is passed. App code (theme, view-mode persistence) reads localStorage during tests, so install
// a simple in-memory store up front — this both satisfies that code and stops the access from
// falling through to the noisy Node global.
class MemoryStorage implements Storage {
	#m = new Map<string, string>();
	get length() {
		return this.#m.size;
	}
	getItem(key: string) {
		return this.#m.has(key) ? this.#m.get(key)! : null;
	}
	setItem(key: string, value: string) {
		this.#m.set(key, String(value));
	}
	removeItem(key: string) {
		this.#m.delete(key);
	}
	clear() {
		this.#m.clear();
	}
	key(i: number) {
		return [...this.#m.keys()][i] ?? null;
	}
}
Object.defineProperty(globalThis, 'localStorage', {
	value: new MemoryStorage(),
	configurable: true,
	writable: true
});

afterEach(() => {
	cleanup();
});
