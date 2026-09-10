// ARIA APG tablist keyboard model, shared by every roving-tabindex group. Anything the model does
// not own is left alone, so typing still reaches the page.

/**
 * Returns the newly selected index, or null when the key isn't one we own. Focus moves to the
 * matching `[role="tab"]` inside the event's current target, keeping selection and focus in step.
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
