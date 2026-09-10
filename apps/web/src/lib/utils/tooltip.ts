// Shared chart tooltip singleton; Tooltip.svelte, mounted once at the app root, renders the content.

import { writable } from 'svelte/store';

interface TipState {
	html: string;
	x: number;
	y: number;
	visible: boolean;
}

export const tip = writable<TipState>({ html: '', x: 0, y: 0, visible: false });

export function showTip(html: string, e: MouseEvent): void {
	tip.set({ html, x: e.clientX, y: e.clientY, visible: true });
}

export function hideTip(): void {
	tip.update((t) => ({ ...t, visible: false }));
}
