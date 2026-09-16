// Keyboard dispatch for the popup controls. Anything the map does not name is left alone, so typing still
// reaches the page.

/** Run the handler bound to `e.key` and keep the browser from acting on the key too. */
export function onKey(e: KeyboardEvent, handlers: Record<string, () => void>): boolean {
	const run = handlers[e.key];
	if (!run) return false;

	e.preventDefault();
	run();

	return true;
}
