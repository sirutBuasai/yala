// ARIA APG tablist keyboard model, shared by every roving-tabindex group (the top-level view
// tabs, the segmented range switches). Arrows move selection AND focus; Home/End jump to the ends.
// Anything else is left alone so typing still reaches the page.

/**
 * Handle a tablist keydown. Returns the newly selected index, or null when the key wasn't one we
 * own. `select` is called with that index, then focus is moved to the matching `[role="tab"]`
 * inside the event's current target — keeping selection and focus in step, as the APG requires.
 */
export function tablistKeydown(
	e: KeyboardEvent,
	count: number,
	current: number,
	select: (index: number) => void
): number | null {
	if (count === 0) return null;

	let next = current;
	if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % count;
	else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + count) % count;
	else if (e.key === 'Home') next = 0;
	else if (e.key === 'End') next = count - 1;
	else return null;

	e.preventDefault();
	select(next);

	const tabs = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]');
	tabs[next]?.focus();

	return next;
}
