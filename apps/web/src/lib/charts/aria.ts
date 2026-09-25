// Accessible names for charts. An unlabelled `role="img"` announces only "image".

/** `<kind>: <names, joined><suffix>` — what a chart's `aria-label` reads as. */
export function chartLabel(kind: string, names: string[], suffix = ''): string {
	return `${kind}: ${names.join(', ')}${suffix}`;
}

/** Runs `act` for the keys that press a button, since an SVG mark given `role="button"` gets none of a
    button's keyboard handling. */
export function onPress(e: KeyboardEvent, act: () => void): void {
	if (e.key !== 'Enter' && e.key !== ' ') return;
	e.preventDefault();
	act();
}
