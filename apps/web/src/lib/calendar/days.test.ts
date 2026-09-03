// The calendar's arithmetic. Everything here is a month-boundary question — where a month starts,
// how many days it has, how a keypress behaves at an edge — which is exactly the class of thing that
// is easy to get subtly wrong and invisible until a particular month rolls around.

import { describe, expect, it } from 'vitest';
import { makeData } from '$lib/data/__fixtures__/dashboard';
import {
	dayCells,
	dayForKey,
	dayOf,
	daysInMonthOf,
	firstWeekdayOf,
	latestActivityDay,
	weekRows
} from '$lib/calendar/days';

describe('dayOf', () => {
	it('reads the day out of an ISO date', () => {
		expect(dayOf('2026-07-09')).toBe(9);
		expect(dayOf('2026-07-31')).toBe(31);
	});
});

describe('daysInMonthOf', () => {
	it('handles 31-, 30- and 28-day months', () => {
		expect(daysInMonthOf('2026-01')).toBe(31);
		expect(daysInMonthOf('2026-04')).toBe(30);
		expect(daysInMonthOf('2026-02')).toBe(28);
	});

	it('handles a leap February', () => {
		expect(daysInMonthOf('2024-02')).toBe(29);
	});

	it('handles December without rolling into the wrong year', () => {
		expect(daysInMonthOf('2026-12')).toBe(31);
	});
});

describe('firstWeekdayOf', () => {
	it('is 0 for a month starting on a Sunday', () => {
		// 1 Feb 2026 is a Sunday.
		expect(firstWeekdayOf('2026-02')).toBe(0);
	});

	it('is 3 for a month starting on a Wednesday', () => {
		// 1 Jul 2026 is a Wednesday.
		expect(firstWeekdayOf('2026-07')).toBe(3);
	});
});

describe('dayCells', () => {
	it('produces one cell per day of the month', () => {
		expect(dayCells(makeData(), '2024-12')).toHaveLength(31);
	});

	it('files a transaction under its own day and leaves the others empty', () => {
		const cells = dayCells(makeData(), '2024-12'); // fixture has one txn on the 5th
		expect(cells[4]!.txns).toHaveLength(1);
		expect(cells[4]!.spent).toBe(70);
		expect(cells[0]!.txns).toEqual([]);
		expect(cells[0]!.spent).toBe(0);
	});

	it('sums a day with several transactions and ranks its categories by spend', () => {
		const d = makeData();
		const base = d.months['2024-12']!.transactions[0]!;
		d.months['2024-12']!.transactions = [
			{ ...base, date: '2024-12-05', category: 'Grocery', amount: 10, locator: 'a' },
			{ ...base, date: '2024-12-05', category: 'Takeouts', amount: 90, locator: 'b' }
		];
		const cell = dayCells(d, '2024-12')[4]!;
		expect(cell.spent).toBe(100);
		// Takeouts is the bigger spend, so it leads the dots.
		expect(cell.cats).toEqual(['Takeouts', 'Grocery']);
		expect(cell.more).toBe(false);
	});

	it('caps the dots at three and flags that more were dropped', () => {
		const d = makeData();
		const base = d.months['2024-12']!.transactions[0]!;
		d.months['2024-12']!.transactions = ['A', 'B', 'C', 'D'].map((c, i) => ({
			...base,
			date: '2024-12-05',
			category: c,
			amount: 10 - i,
			locator: `x${i}`
		}));
		const cell = dayCells(d, '2024-12')[4]!;
		expect(cell.cats).toEqual(['A', 'B', 'C']);
		expect(cell.more).toBe(true);
	});

	it('marks a day pending when any of its entries is', () => {
		const d = makeData();
		d.months['2024-12']!.transactions[0]!.pending = true;
		expect(dayCells(d, '2024-12')[4]!.pending).toBe(true);
	});

	it('returns empty cells for a month with no data at all', () => {
		const cells = dayCells(makeData(), '2025-06');
		expect(cells).toHaveLength(30);
		expect(cells.every((c) => c.spent === 0 && c.txns.length === 0)).toBe(true);
	});

	it('gives each cell its own ISO date', () => {
		expect(dayCells(makeData(), '2024-12')[0]!.iso).toBe('2024-12-01');
	});
});

describe('weekRows', () => {
	it('pads the leading blanks so the 1st lands on its weekday', () => {
		const cells = dayCells(makeData(), '2024-12');
		const rows = weekRows(cells, 0); // starts on a Sunday
		expect(rows[0]!.cells[0]?.day).toBe(1);

		const shifted = weekRows(cells, 3); // starts on a Wednesday
		expect(shifted[0]!.cells.slice(0, 3)).toEqual([null, null, null]);
		expect(shifted[0]!.cells[3]?.day).toBe(1);
	});

	it('always fills the final row to seven slots', () => {
		const rows = weekRows(dayCells(makeData(), '2024-12'), 3);
		expect(rows.every((r) => r.cells.length === 7)).toBe(true);
	});

	it('needs six rows when a long month starts late in the week', () => {
		// 31 days + 5 leading blanks = 36 slots, which cannot fit in five rows.
		expect(weekRows(dayCells(makeData(), '2024-12'), 5)).toHaveLength(6);
	});

	it('totals each row from its own days only', () => {
		const rows = weekRows(dayCells(makeData(), '2024-12'), 0); // txn of 70 on the 5th
		expect(rows[0]!.total).toBe(70);
		expect(rows[1]!.total).toBe(0);
	});
});

describe('latestActivityDay', () => {
	it('is the last day carrying any entry', () => {
		expect(latestActivityDay(dayCells(makeData(), '2024-12'))).toBe(5);
	});

	it('is 0 for a month with nothing logged', () => {
		expect(latestActivityDay(dayCells(makeData(), '2025-06'))).toBe(0);
	});

	it('counts a paycheck, not just spending', () => {
		// The fixture's only January entry is a paycheck on the 15th.
		expect(latestActivityDay(dayCells(makeData(), '2025-01'))).toBe(15);
	});
});

describe('dayForKey', () => {
	// July 2026 starts on a Wednesday (weekday 3) and has 31 days.
	const jul = (key: string, day: number) => dayForKey(key, day, '2026-07', 3);

	it('steps a day sideways and a week vertically', () => {
		expect(jul('ArrowRight', 10)).toBe(11);
		expect(jul('ArrowLeft', 10)).toBe(9);
		expect(jul('ArrowDown', 10)).toBe(17);
		expect(jul('ArrowUp', 10)).toBe(3);
	});

	it('clamps at the month edges instead of wrapping', () => {
		expect(jul('ArrowLeft', 1)).toBe(1);
		expect(jul('ArrowUp', 3)).toBe(1);
		expect(jul('ArrowRight', 31)).toBe(31);
		expect(jul('ArrowDown', 28)).toBe(31);
	});

	it('Home and End go to the ends of the WEEK', () => {
		// The 1st is a Wednesday, so its week runs from the (clamped) 1st to Saturday the 4th.
		expect(jul('End', 1)).toBe(4);
		expect(jul('Home', 4)).toBe(1);
		// A whole week later: Sunday the 5th through Saturday the 11th.
		expect(jul('Home', 8)).toBe(5);
		expect(jul('End', 8)).toBe(11);
	});

	it('ignores keys the grid does not own, so typing still reaches the page', () => {
		expect(jul('a', 10)).toBeNull();
		expect(jul('Enter', 10)).toBeNull();
		expect(jul('PageDown', 10)).toBeNull();
	});
});
