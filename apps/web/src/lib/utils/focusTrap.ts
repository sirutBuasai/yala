// Svelte action: trap Tab focus within a node, focus into it on mount, and restore focus on destroy.
//
// Where focus LANDS matters as much as trapping it. Taking the first focusable blindly landed on the
// dismiss button, which sits first in the DOM because it belongs in the header, so opening a form
// announced "close". Hence the `[data-autofocus]` / not-`[data-dismiss]` order below.

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

	const items = focusable();
	const preferred =
		node.querySelector<HTMLElement>('[data-autofocus]') ??
		items.find((el) => !el.closest('[data-dismiss]')) ??
		items[0] ??
		node;
	preferred.focus();

	node.addEventListener('keydown', onKeydown);

	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			previouslyFocused?.focus?.();
		}
	};
}
