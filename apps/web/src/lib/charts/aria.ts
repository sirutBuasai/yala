// Accessible names for charts. An unlabelled `role="img"` announces only "image".

/** `<kind>: <names, joined><suffix>` — what a chart's `aria-label` reads as. */
export function chartLabel(kind: string, names: string[], suffix = ''): string {
	return `${kind}: ${names.join(', ')}${suffix}`;
}
