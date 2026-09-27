// Single-key page shortcuts, as mail clients and issue trackers use them: taken only when nothing is being
// typed into, no modifier is held and no dialog is open, so one never steals a keystroke.

const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Whether `e` is free to act as a page shortcut. */
export function isShortcut(e: KeyboardEvent): boolean {
	if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
	if (e.target instanceof Element && e.target.closest(TYPING)) return false;
	return !document.querySelector('dialog[open]');
}
