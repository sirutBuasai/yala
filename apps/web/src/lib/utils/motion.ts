// Reduced-motion helper for Svelte transitions. CSS transitions are neutralized globally by a
// `prefers-reduced-motion` media query in app.css; JS-driven Svelte transitions (fly/fade) can't
// see that query, so they route their durations through `dur()` to collapse to an instant swap.

const query = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
	return typeof window !== 'undefined' && window.matchMedia?.(query).matches;
}

/** A transition duration in ms, or 0 when the user asked for reduced motion. */
export function dur(ms: number): number {
	return prefersReducedMotion() ? 0 : ms;
}
