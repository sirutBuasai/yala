// The words that appear in more than one view, so the views cannot word them differently. Copy used by
// a single area lives in that area's own `copy.ts`; per-kind wording lives in `views/manage/kinds.ts`.

/** An input nobody has filled in. Distinct from NONE, which is a chosen empty option. */
export const NOT_SET = 'Not set';
/** A picker's empty option: no sweep account, no employer. */
export const NONE = 'None';

export const SAVED = 'Saved.';
export const SAVE_CHANGES = 'Save changes';
export const DISCARD = 'Discard';

export const PICK_ACCOUNT = 'Pick an account';
export const EDIT_ENTRY = 'Edit entry';
export const CLOSE_MENU = 'Close menu';

/** Stands in for a figure there is none of, in a cell that must keep its width. */
export const NO_VALUE = '—';
