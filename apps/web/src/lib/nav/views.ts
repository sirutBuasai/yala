// A page's views beyond its default, Month. A view is a path, so a reload keeps it (D27); each page's
// param matcher in `src/params` accepts only these.

export const VIEWS = ['year'] as const;
export type View = 'month' | (typeof VIEWS)[number];

export function isView(param: string): param is (typeof VIEWS)[number] {
	return (VIEWS as readonly string[]).includes(param);
}

/** The view a path parameter names; absent is the default, Month. */
export const viewOf = (param: string | undefined): View =>
	param && isView(param) ? param : 'month';
