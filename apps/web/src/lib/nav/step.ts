// Moving within a page. Every step is its own history entry (D9), so back undoes it.

import { goto } from '$app/navigation';
import { withParams } from './focus';

interface StepOptions {
	/** For typing, so back does not replay each keystroke. */
	replace?: boolean;
	/** Another view of the page: a path is kept on reload where the query is not (D27). */
	pathname?: string;
}

/** `url` with `patch` applied to its query, at `pathname` when given. */
export function step(
	url: URL,
	patch: Record<string, string | null>,
	{ replace = false, pathname }: StepOptions = {}
): void {
	void goto(withParams(url, patch, pathname), {
		keepFocus: true,
		noScroll: true,
		replaceState: replace
	});
}
