// A small, valid DashboardData factory for unit tests. Returns a fresh object
// each call so tests can mutate freely.
import type {
	AccountInfo,
	AccountLists,
	DashboardData,
	MonthMatrixRow,
	NetWorthSnapshot
} from '$lib/data/types';
import { setAccountDirectory } from '$lib/data/directory.svelte';

/** Every capability flag on a kind, so adding one to the contract is a single-line change here. */
const KIND_FLAGS = [
	'tiered',
	'named',
	'product',
	'scopable',
	'labelled',
	'plugged',
	'drains',
	'splits',
	'sweeps',
	'sweep_target'
] as const;

type KindName = AccountLists['kinds'][number]['name'];

/** Each kind's account prefix and the flags it has on, mirroring `yala.ledger.accounts.KINDS`. */
const KIND_TABLE: Record<KindName, { prefix: string; on: (typeof KIND_FLAGS)[number][] }> = {
	category: { prefix: 'Expenses:', on: [] },
	bank: {
		prefix: 'Assets:Cash:',
		on: ['named', 'plugged', 'drains', 'splits', 'sweeps', 'sweep_target']
	},
	card: { prefix: 'Liabilities:CC:', on: ['named', 'product'] },
	investment: {
		prefix: 'Assets:Investments:',
		on: ['tiered', 'named', 'product', 'scopable', 'labelled', 'plugged', 'splits', 'sweep_target']
	},
	employer: { prefix: 'Income:Salary:', on: [] },
	deduction: { prefix: 'Expenses:Deductions:', on: ['scopable'] }
};

// Built without a cast, so a capability added to the contract fails here until the table names it.
const KINDS: AccountLists['kinds'] = Object.entries(KIND_TABLE).map(([name, { prefix, on }]) => ({
	name: name as KindName,
	prefix,
	...(Object.fromEntries(KIND_FLAGS.map((flag) => [flag, on.includes(flag)])) as Record<
		(typeof KIND_FLAGS)[number],
		boolean
	>)
}));

/** Publish an account directory for a component test, each entry's display name defaulting to its
    leaf. Shared, so a field added to `AccountInfo` is filled in one place. */
export function setDirectory(entries: Record<string, Partial<AccountInfo>>): void {
	setAccountDirectory(
		Object.fromEntries(
			Object.entries(entries).map(([account, info]) => [
				account,
				{ name: account.split(':').pop()!, ...info } as AccountInfo
			])
		)
	);
}

/** The pickable account sets, as the API sends them — a factory so the shape is declared once. */
export function makeAccounts(over: Partial<AccountLists> = {}): AccountLists {
	return {
		kinds: KINDS,
		spending_categories: [],
		funding_accounts: [],
		cash_accounts: [],
		card_accounts: [],
		investment_accounts: [],
		employers: [],
		deduction_accounts: [],
		payroll_options: [],
		balance_accounts: [],
		liability_accounts: [],
		sweeps: {},
		...over
	};
}

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
			accounts: {
				'Assets:Cash:BankA': { name: 'Bank A', institution_name: 'Bank of Example' },
				'Liabilities:CC:CardA': { name: 'Card A', institution_name: 'Bank of Example' }
			},
			domains: {
				spending: true,
				income: true
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
		}
	};
}

/**
 * The base fixture plus a net-worth section and settings. Its figures are chosen so the growth
 * decomposition is checkable by hand against the base fixture's `saved` rows.
 */
export function makeNetWorthData(): DashboardData {
	const snapshot = (
		date: string,
		nw: number,
		liquid: number,
		taxable: number,
		advantaged: number,
		liabilities = 0
	): NetWorthSnapshot => ({
		date,
		assets: nw + liabilities,
		liabilities,
		net_worth: nw,
		breakdown: { Liquid: liquid, Taxable: taxable, 'Tax-advantaged': advantaged }
	});

	const series = [
		snapshot('2024-01-01', 1000, 600, 400, 0),
		snapshot('2024-12-01', 3000, 1000, 1200, 800),
		snapshot('2025-06-01', 6000, 1300, 2600, 2600, 500)
	];

	const data = makeData();
	data.meta.domains.networth = true;
	data.networth = {
		current: series[2]!,
		series,
		accounts: [
			{
				account: 'Assets:Investments:Taxable:BrokerageA',
				label: 'BrokerageA',
				group: 'investment',
				bucket: 'Taxable',
				value: 3000
			},
			{
				account: 'Assets:Cash:BankA',
				label: 'BankA',
				group: 'cash',
				bucket: 'Liquid',
				value: 2000
			},
			{
				account: 'Assets:Investments:TaxAdvantaged:PlanA',
				label: 'PlanA',
				group: 'investment',
				bucket: 'Tax-advantaged',
				value: 1500
			},
			{
				account: 'Liabilities:CC:CardA',
				label: 'CardA',
				group: 'liability',
				bucket: 'liability',
				value: -500
			}
		],
		adjustments: []
	};
	data.settings = {
		swr: 4,
		nominal_return: 8,
		inflation: 3,
		retire_age: 60,
		runway_target: 6,
		horizon_age: 95,
		birth_year: null
	};
	return data;
}
