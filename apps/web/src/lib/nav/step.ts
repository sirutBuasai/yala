// Moving within a view. Every step is its own history entry (D9), so back undoes it.

import { goto } from '$app/navigation';
import { withParams } from './focus';

interface StepOptions {
	/** For typing, so back does not replay each keystroke. */
	replace?: boolean;
}

/** `url` with `patch` applied to its query. */
export function step(
	url: URL,
	patch: Record<string, string | null>,
	{ replace = false }: StepOptions = {}
): void {
	void goto(withParams(url, patch), {
		keepFocus: true,
		noScroll: true,
		replaceState: replace
	});
}
