// One polite live region for the whole app, so a screen reader hears what a keyboard gesture did to
// something that has no text of its own to change.

let region: HTMLElement | undefined;

export function announce(message: string): void {
	if (!region) {
		region = document.createElement('div');
		region.className = 'vh';
		region.setAttribute('aria-live', 'polite');
		region.setAttribute('aria-atomic', 'true');
		document.body.append(region);
	}
	const target = region;
	// Cleared first, or the same words twice in a row are not read again.
	target.textContent = '';
	requestAnimationFrame(() => (target.textContent = message));
}
