// Shared chart tooltip singleton. Chart components call showTip/hideTip from
// pointer handlers; Tooltip.svelte (mounted once at the app root) renders the
// current content near the cursor.

import { writable } from 'svelte/store';

export interface TipState {
	html: string;
	x: number;
	y: number;
	visible: boolean;
}

export const tip = writable<TipState>({ html: '', x: 0, y: 0, visible: false });

export function showTip(html: string, e: MouseEvent): void {
	tip.set({ html, x: e.clientX, y: e.clientY, visible: true });
}

export function moveTip(e: MouseEvent): void {
	tip.update((t) => ({ ...t, x: e.clientX, y: e.clientY }));
}

export function hideTip(): void {
	tip.update((t) => ({ ...t, visible: false }));
}
