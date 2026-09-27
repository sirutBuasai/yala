// The app's pages in sidebar order. The sidebar, its icon rail and the hamburger sheet all read this list,
// so they cannot disagree about what exists. Plain data, with no components, so the browser tests can
// import it too; each page's icon is paired with it in `NavLinks`.

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

export const DEV_PAGE: NavLink = { href: '/dev', label: 'Development' };

/** The page a path belongs to, by its first segment: a page's views are paths under it. */
export function pageOf(pathname: string): string {
	const first = pathname.split('/')[1];
	return first ? `/${first}` : '/';
}
