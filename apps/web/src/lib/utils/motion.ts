// A `prefers-reduced-motion` media query in app.css neutralizes CSS transitions, but JS-driven
// Svelte transitions can't see that query, so their durations route through `dur()`.

const query = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
	return typeof window !== 'undefined' && window.matchMedia?.(query).matches;
}

/** A transition duration in ms, or 0 when the user asked for reduced motion. */
export function dur(ms: number): number {
	return prefersReducedMotion() ? 0 : ms;
}
