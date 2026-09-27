// The target pane rides in history state, not the URL, so a view's remembered URL never carries it.

import { goto } from '$app/navigation';

export interface Drill {
	/** The pane to open at, by its board id. */
	pane: string;
	/** Something in that pane to open at, which the pane itself finds. */
	focus?: string;
}

/** Opens `href` at `drill`'s pane, once the board has laid it out. */
export async function drillTo(href: string, drill: Drill): Promise<void> {
	await goto(href, { state: { drill } });
	revealPane(drill.pane);
}

/** Scroll a pane to the top of the window once it exists; the board lays panes out over a few frames. */
function revealPane(id: string, frames = 60): void {
	const el = document.querySelector(`[data-pane="${CSS.escape(id)}"]`);
	if (el) el.scrollIntoView({ block: 'start' });
	else if (frames > 0) requestAnimationFrame(() => revealPane(id, frames - 1));
}
