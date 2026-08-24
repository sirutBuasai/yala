// Global test setup: jest-dom matchers + DOM cleanup between tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

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
