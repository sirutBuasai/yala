// Moving within a page. Every step is its own history entry (D9), so back undoes it.

import { goto } from '$app/navigation';
import { withParams } from './focus';

/** `url` with `patch` applied to its query. `replace` is for typing, so back does not replay each
    keystroke. */
export function step(url: URL, patch: Record<string, string | null>, replace = false): void {
	void goto(withParams(url, patch), { keepFocus: true, noScroll: true, replaceState: replace });
}
