// The app's pages in sidebar order. The sidebar, its icon rail and the hamburger sheet all read this list,
// so they cannot disagree about what exists.

import type { PageGlyph } from '$lib/icons/PageIcon.svelte';

export interface NavLink {
	href: string;
	label: string;
	glyph: PageGlyph;
}

export const PAGES: readonly NavLink[] = [
	{ href: '/', label: 'Dashboard', glyph: 'dashboard' },
	{ href: '/transactions', label: 'Transactions', glyph: 'transactions' },
	{ href: '/cash-flow', label: 'Cash flow', glyph: 'cashflow' },
	{ href: '/accounts', label: 'Accounts', glyph: 'accounts' },
	{ href: '/planning', label: 'Planning', glyph: 'planning' },
	{ href: '/manage', label: 'Manage', glyph: 'manage' }
];

export const DEV_PAGE: NavLink = { href: '/dev', label: 'Development', glyph: 'development' };
