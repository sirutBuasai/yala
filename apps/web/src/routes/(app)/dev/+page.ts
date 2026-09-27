import { error } from '@sveltejs/kit';
import { DEV_TOOLS } from '$lib/nav/devtools';

// Prerendering a page that 404s fails the build.
export const prerender = DEV_TOOLS;

export function load() {
	if (!DEV_TOOLS) error(404, 'Not found');
}
