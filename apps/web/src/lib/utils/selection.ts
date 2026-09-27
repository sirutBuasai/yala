// The document selection over an editable element, which `contenteditable` does not manage for itself.

/** Selects all of `el`'s contents, or places the caret after them with `toEnd`. */
export function selectContents(el: HTMLElement, toEnd = false): void {
	const range = document.createRange();
	range.selectNodeContents(el);
	if (toEnd) range.collapse(false);
	const selection = getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}
