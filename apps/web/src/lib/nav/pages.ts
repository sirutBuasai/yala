// The app's pages in sidebar order. The docked sidebar and the hamburger sheet both read this list, so
// they cannot disagree about what exists.

export interface NavLink {
	href: string;
	label: string;
}

export const PAGES: readonly NavLink[] = [
	{ href: '/', label: 'Dashboard' },
	{ href: '/transactions', label: 'Transactions' },
	{ href: '/cash-flow', label: 'Cash flow' },
	{ href: '/accounts', label: 'Accounts' },
	{ href: '/planning', label: 'Planning' },
	{ href: '/manage', label: 'Manage' }
];

export const DEV_PAGE: NavLink = { href: '/dev', label: 'Development' };
