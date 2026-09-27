// Apart from `pages.ts`, which browser tests import and so can't reach `$app/environment`.
import { dev } from '$app/environment';
import { DEV_PAGE, type NavLink } from '$lib/nav/pages';

/** On under `vite dev`, or in a build made with `VITE_YALA_DEV=1` (`make serve DEV=1`). */
export const DEV_TOOLS = dev || import.meta.env.VITE_YALA_DEV === '1';

export const TOOL_PAGES: readonly NavLink[] = DEV_TOOLS ? [DEV_PAGE] : [];
