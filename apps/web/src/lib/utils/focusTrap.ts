// Svelte action: trap Tab focus within a node while it's mounted, focus the first
// focusable element (or the node itself) on mount, and restore focus to the previously
// focused element on destroy. Used by modal/drawer overlays.

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusTrap(node: HTMLElement) {
	const previouslyFocused = document.activeElement as HTMLElement | null;

	const focusable = (): HTMLElement[] =>
		Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		const items = focusable();
		if (!items.length) {
			// Nothing to tab to — keep focus on the container.
			e.preventDefault();
			node.focus();
			return;
		}
		const first = items[0];
		const last = items[items.length - 1];
		if (!first || !last) return;
		const activeInside = node.contains(document.activeElement);

		if (e.shiftKey && (document.activeElement === first || !activeInside)) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && (document.activeElement === last || !activeInside)) {
			e.preventDefault();
			first.focus();
		}
	}

	// Initial focus: first focusable element, else the container (which is tabindex="-1").
	const items = focusable();
	(items[0] ?? node).focus();

	node.addEventListener('keydown', onKeydown);

	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			previouslyFocused?.focus?.();
		}
	};
}
