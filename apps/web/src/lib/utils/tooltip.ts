// Shared chart tooltip singleton; Tooltip.svelte, mounted once at the app root, renders the content.

import { writable } from 'svelte/store';
import { formatUnitExact, type Unit } from '$lib/data/primitives';

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

/** One figure with the same figure restated in a second unit, where the data carries one. Exact on both
    sides: a tooltip is where the reader comes for the number itself. */
export function withAlt(shown: string, alt: number | null | undefined, unit?: Unit): string {
	if (alt == null || !unit) return shown;

	return `${shown}<span class="alt">${formatUnitExact(alt, unit)}</span>`;
}
