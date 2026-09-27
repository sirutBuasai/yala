// `PROGRESS` lives in `$lib/copy`, since Dashboard headlines it.

export const PROJECTION = 'Projected investments';
export const PROJECTION_CAPTION = 'invested balance growth and financial independence projection';

/** The assumption panes, each titling the settings it holds (by their ledger keys). */
export const GROUPS = [
	{
		id: 'timeline',
		title: 'Timeline',
		caption: 'your age, retirement, and how long the plan runs',
		keys: ['birth-year', 'retire-age', 'horizon-age']
	},
	{
		id: 'market',
		title: 'Market',
		caption: 'returns, inflation, and what you withdraw',
		keys: ['swr', 'nominal-return', 'inflation', 'volatility']
	},
	{
		id: 'money',
		title: 'Spending and saving',
		caption: 'what you spend, invest, and hold in cash',
		keys: ['planned-spending', 'out-of-pocket', 'runway-target']
	}
] as const;
