// `showModal()` handles inertness, focus restoration and the `::backdrop`. Focus placement stays ours, since
// the first focusable is usually the dismiss button.

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalOptions {
	/** Ask the host to unmount this dialog. Called once the closing transition has run. */
	onclose: () => void;
	/** ms, through `dur()`. The dialog stays open wearing `.closing` this long, since `::backdrop` vanishes with
	    an open dialog. */
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
