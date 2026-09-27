// The measured `.figurebox` a chart draws into. Four charts bound the same two dimensions and fell back
// to the same placeholder, so the fallback lived in four places and could drift.

import { UNMEASURED } from '$lib/charts/axis';

/** `UNMEASURED` until measured, so a box reporting zero never produces a degenerate viewBox. */
export class ChartBox {
	/** Raw measurements; bind these, read `w` / `h`. */
	clientWidth = $state(0);
	clientHeight = $state(0);

	get w(): number {
		return this.clientWidth || UNMEASURED.w;
	}
	get h(): number {
		return this.clientHeight || UNMEASURED.h;
	}

	/** True once the browser has reported a real height, for charts that size rows from it. */
	get measuredH(): boolean {
		return this.clientHeight > 0;
	}
}
