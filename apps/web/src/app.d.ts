// See https://svelte.dev/docs/kit/types#app
import type { Drill } from '$lib/nav/drill';

declare global {
	namespace App {
		interface PageState {
			/** Where a drill-in lands; history state rather than the URL, so no view keeps it (D34). */
			drill?: Drill;
		}
	}
}

export {};
