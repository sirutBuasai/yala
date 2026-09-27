// Every navigator reads this list, so none disagree about what exists. Plain data, so browser tests can
// import it; icons pair with it in `NavLinks`.

export interface NavLink {
	href: string;
	label: string;
}

export const PAGES: readonly NavLink[] = [
	{ href: '/', label: 'Dashboard' },
	{ href: '/transactions', label: 'Transactions' },
	{ href: '/analytics', label: 'Analytics' },
	{ href: '/accounts', label: 'Accounts' },
	{ href: '/planning', label: 'Planning' },
	{ href: '/manage', label: 'Manage' }
];

/** Listed only where `DEV_TOOLS` is on (see `devtools.ts`). */
export const DEV_PAGE: NavLink = { href: '/dev', label: 'Development' };

/** The page a path belongs to, by its first segment: a page's views are paths under it. */
export function pageOf(pathname: string): string {
	const first = pathname.split('/')[1];
	return first ? `/${first}` : '/';
}
