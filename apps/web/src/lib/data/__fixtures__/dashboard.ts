// A small, valid DashboardData factory for unit tests. Returns a fresh object
// each call so tests can mutate freely.
import type { DashboardData, MonthMatrixRow } from '$lib/data/types';

function matrix(byMonth: Record<number, { spent: Record<string, number>; income: number }>) {
	const rows: MonthMatrixRow[] = [];
	for (let m = 1; m <= 12; m++) {
		const cell = byMonth[m];
		rows.push({ month: m, spent: cell?.spent ?? {}, income: cell?.income ?? 0 });
	}
	return rows;
}

export function makeData(): DashboardData {
	return {
		schema_version: 1,
		generated_at: '2025-02-01T00:00:00Z',
		currency: 'USD',
		meta: {
			years: [2024, 2025],
			month_keys: ['2024-12', '2025-01'],
			transaction_count: 4,
			date_range: { start: '2024-12-05', end: '2025-01-20' },
			categories: ['Grocery', 'Takeouts'],
			domains: {
				spending: true,
				income: true,
				networth: false,
				investments: false,
				cards: false
			}
		},
		overview: {
			by_year: [
				{ year: 2024, spent: 120, income: 2300, saved: 2180 },
				{ year: 2025, spent: 45.5, income: 2300, saved: 2254.5 }
			],
			all_time_by_category: [
				{ category: 'Grocery', amount: 100 },
				{ category: 'Takeouts', amount: 65.5 }
			]
		},
		years: {
			'2024': {
				total_spent: 120,
				total_income: 2300,
				matrix: matrix({ 12: { spent: { Grocery: 70, Takeouts: 50 }, income: 2300 } })
			},
			'2025': {
				total_spent: 45.5,
				total_income: 2300,
				matrix: matrix({ 1: { spent: { Grocery: 30, Takeouts: 15.5 }, income: 2300 } })
			}
		},
		months: {
			'2024-12': {
				total_spent: 120,
				total_income: 2300,
				by_category: [
					{ category: 'Grocery', amount: 70 },
					{ category: 'Takeouts', amount: 50 }
				],
				transactions: [
					{
						date: '2024-12-05',
						payee: 'Store',
						amount: 70,
						category: 'Grocery',
						source: 'Liabilities:CC:CardA',
						pending: false,
						locator: 'id:tx-1',
						bill: null
					}
				],
				paychecks: []
			},
			'2025-01': {
				total_spent: 45.5,
				total_income: 2300,
				by_category: [
					{ category: 'Grocery', amount: 30 },
					{ category: 'Takeouts', amount: 15.5 }
				],
				transactions: [],
				paychecks: [
					{
						date: '2025-01-15',
						payee: 'paycheck',
						gross: 3000,
						deductions: { Tax: 600, Benefits: 100 },
						contributions: { HSA: 150, Roth401k: 600 },
						net: 2300,
						take_home: 1550,
						locator: 'id:pc-1'
					}
				]
			}
		},
		income: {
			by_year: [
				{
					year: 2024,
					gross: 3000,
					net: 2300,
					take_home: 1550,
					deductions: 700,
					contributions: 750
				},
				{ year: 2025, gross: 3000, net: 2300, take_home: 1550, deductions: 700, contributions: 750 }
			],
			by_month: { '2025': [2300, ...new Array(11).fill(0)] },
			recent_paychecks: [
				{
					date: '2025-01-15',
					payee: 'paycheck',
					gross: 3000,
					deductions: { Tax: 600, Benefits: 100 },
					contributions: { HSA: 150, Roth401k: 600 },
					net: 2300,
					take_home: 1550,
					locator: 'id:pc-1'
				}
			]
		},
		networth: null,
		investments: null,
		cards: []
	};
}
