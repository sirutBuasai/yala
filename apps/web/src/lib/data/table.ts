// Table primitive: tabular rows with typed columns (paycheck breakdowns). Numeric
// columns carry a unit so the renderer formats them consistently.

import type { DashboardData } from '$lib/data/types';
import type { PaycheckOut } from '$lib/data/types';
import type { Table } from './primitives';
import { MONEY } from './primitives';
import { sumValues } from '$lib/utils/num';

/** Recent paychecks, optionally scoped to a year (`YYYY`) or month (`YYYY-MM`) prefix. */
export function paychecks(data: DashboardData, prefix?: string): Table {
	let rows: PaycheckOut[] = data.income.recent_paychecks;

	if (prefix) {
		const monthly = data.months[prefix]?.paychecks;
		rows = monthly ?? rows.filter((p) => p.date.startsWith(prefix));
	}

	const money = MONEY(data.currency);

	return {
		kind: 'table',
		columns: [
			{ label: 'Date' },
			{ label: 'Gross', unit: money },
			{ label: 'Deductions', unit: money },
			{ label: 'Contributions', unit: money },
			{ label: 'Net', unit: money },
			{ label: 'Take-home', unit: money }
		],
		rows: rows.map((p) => [
			p.date,
			p.gross,
			sumValues(p.deductions),
			sumValues(p.contributions),
			p.net,
			p.take_home
		])
	};
}
