import { beforeEach, describe, expect, it } from 'vitest';
import { leftAt, rememberScroll, scrollAt, viewAt } from './left';

const KEY = 'yala-page-state';

beforeEach(() => sessionStorage.clear());

describe('where a page was left', () => {
	it('reads back what was remembered', () => {
		rememberScroll('/transactions', 240);
		expect(scrollAt('/transactions')).toBe(240);
	});

	it('ignores stored entries of the wrong shape, keeping the rest', () => {
		sessionStorage.setItem(
			KEY,
			JSON.stringify({
				views: { '/analytics': '/analytics/month', '/accounts': 7 },
				searches: { '/analytics/month': '?month=2026-09', '/accounts/year': 'span=10' },
				scrolls: { '/analytics/month': 120, '/accounts/year': '300', '/manage': -5 }
			})
		);

		expect(viewAt('/analytics')).toBe('/analytics/month');
		expect(viewAt('/accounts')).toBe('/accounts');
		expect(leftAt('/analytics/month')).toBe('/analytics/month?month=2026-09');
		expect(leftAt('/accounts/year')).toBe('/accounts/year');
		expect(scrollAt('/analytics/month')).toBe(120);
		expect(scrollAt('/accounts/year')).toBe(0);
		expect(scrollAt('/manage')).toBe(0);
	});

	it('starts fresh from a record that is not an object', () => {
		sessionStorage.setItem(KEY, '[1, 2]');
		expect(scrollAt('/transactions')).toBe(0);
		rememberScroll('/transactions', 40);
		expect(scrollAt('/transactions')).toBe(40);
	});
});
