// Svelte action turning a `<dialog>` into the app's modal: open it in the top layer, put focus where it
// belongs, and dismiss it on Esc or a press outside the panel.
//
// `showModal()` makes the rest of the document inert, restores focus to whatever opened the dialog, and gives
// the scrim a `::backdrop`. Focus PLACEMENT stays ours: the first focusable is usually the dismiss button, and
// opening a panel should not announce "close".

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalOptions {
	/** Ask the host to unmount this dialog. Called once the closing transition has run. */
	onclose: () => void;
	/**
	 * ms the closing transition needs, already through `dur()` so reduced motion collapses it. The dialog
	 * stays open for this long wearing `.closing`, which is what lets `::backdrop` fade out — a
	 * `::backdrop` belongs to an OPEN dialog, so closing first would make it vanish instantly.
	 */
	closeMs?: number;
}

/** Where focus should land: an explicit `[data-autofocus]`, else the first focusable that isn't a dismiss. */
function preferred(node: HTMLElement): HTMLElement {
	const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(el) => el.offsetParent !== null
	);
	return (
		node.querySelector<HTMLElement>('[data-autofocus]') ??
		items.find((el) => !el.closest('[data-dismiss]')) ??
		items[0] ??
		node
	);
}

export function modal(node: HTMLDialogElement, options: ModalOptions) {
	let current = options;
	let closing = false;

	function dismiss(): void {
		if (closing) return;
		closing = true;
		node.classList.add('closing');
		setTimeout(() => {
			// `close()` is what hands focus back to whatever opened the dialog, so it must happen even
			// though the host is about to unmount the element.
			if (node.open) node.close();
			current.onclose();
		}, current.closeMs ?? 0);
	}

	/** Esc, which the platform fires as `cancel` and would otherwise close without our transition. */
	function oncancel(e: Event): void {
		e.preventDefault();
		dismiss();
	}

	/** A press on the dialog's own box is a press on the backdrop: the panel fills the rest of it. */
	function onpointerdown(e: PointerEvent): void {
		if (e.target === node) dismiss();
	}

	node.showModal();
	preferred(node).focus();
	node.addEventListener('cancel', oncancel);
	node.addEventListener('pointerdown', onpointerdown);

	return {
		update(next: ModalOptions) {
			current = next;
		},
		destroy() {
			node.removeEventListener('cancel', oncancel);
			node.removeEventListener('pointerdown', onpointerdown);
			if (node.open) node.close();
		}
	};
}
