// A card's title or caption, split into the half a user may rename and the half the app derives.

/** `text` is the renameable half; `context` is rebuilt every render and never stored, so it cannot go
    stale. Either half may stand alone. */
export interface Label {
	text?: string;
	context?: string;
	/** Separator when both halves are present. Defaults to what the slot reads with; set it only to
	    override that. */
	join?: string;
}

/** The separator a caption reads with, its two halves being statements rather than one phrase. */
export const DOT = ' · ';

/** Longest a label's words may be: past this a card asked to hold it wants more of the grid than there
    is. Enforced as it is typed, not trimmed afterwards. */
export const LABEL_MAX = 120;

/** Which half of a card's header a rename applies to. */
export type Slot = 'title' | 'caption';

/** A label the app wrote in full: nothing in it is derived, so a rename replaces it outright. */
export function words(text: string): Label {
	return { text };
}

/**
 * A label built from the data. Rebuilt every render, and a rename adds to it rather than replacing it, which
 * is what keeps the value current. Reach for this whenever the string is interpolated: a rename that
 * swallowed the value would freeze it.
 */
export function live(context: string): Label {
	return { context };
}

/** `context` leads, since it says which period or slice the text is about. */
export function labelText(label: Label | undefined, slotJoin = ' '): string {
	if (!label) return '';
	const { text = '', context = '', join = slotJoin } = label;
	return context && text ? context + join + text : context || text;
}

/** What sits uneditably in front of the field while a label is renamed, separator included, so the words
    being typed land where they will read. Empty when the label has no derived half. */
export function labelGhost(label: Label, slotJoin = ' '): string {
	const { context = '', join = slotJoin } = label;
	return context ? context + join : '';
}
