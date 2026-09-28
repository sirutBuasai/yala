// Board layouts live in the user's settings file, so an arrangement travels with the data rather than
// staying in one browser. A change shows at once and reaches the file shortly after; without the API,
// this browser keeps it instead.

import { get } from 'svelte/store';
import { live, postJson } from '$lib/data/load';
import { browserStore, type PrefStore } from '$lib/utils/persist.svelte';

/** Typing a label writes on every key, so a layout waits this long for the edits to settle. */
const SETTLE_MS = 500;

/** What the settings file held at load, updated by every change made here. `null` marks one removed. */
const saved = new Map<string, unknown>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Once per load, from the document: a later refresh would drop a change still settling. */
export function seedLayouts(layouts: Record<string, unknown> | null | undefined): void {
	for (const timer of pending.values()) clearTimeout(timer);
	pending.clear();
	saved.clear();
	for (const [key, value] of Object.entries(layouts ?? {})) saved.set(key, value);
}

function send(key: string, value: unknown, keepalive = false): void {
	pending.delete(key);
	void postJson('/api/layout', { key, value }, { keepalive }).then(({ ok }) => {
		// The file has it now, so this browser's copy would only go stale.
		if (ok) browserStore.remove(key);
	});
}

/** `null` removes the layout from the file. */
function schedule(key: string, value: unknown): void {
	clearTimeout(pending.get(key));
	pending.set(
		key,
		setTimeout(() => send(key, saved.get(key)), SETTLE_MS)
	);
	saved.set(key, value);
}

export const layoutStore: PrefStore = {
	read(key) {
		if (!get(live)) return browserStore.read(key) ?? saved.get(key);
		if (saved.has(key)) return saved.get(key) ?? undefined;
		// Arranged in this browser before layouts moved to the settings file: adopt it there.
		const local = browserStore.read(key);
		if (local !== undefined) schedule(key, local);
		return local;
	},
	write(key, value) {
		if (get(live)) schedule(key, value);
		else browserStore.write(key, value);
	},
	remove(key) {
		if (get(live)) schedule(key, null);
		else browserStore.remove(key);
	}
};

if (typeof window !== 'undefined') {
	window.addEventListener('pagehide', () => {
		// A page closing mid-settle still lands its last change.
		for (const key of [...pending.keys()]) {
			clearTimeout(pending.get(key));
			send(key, saved.get(key), true);
		}
	});
}
