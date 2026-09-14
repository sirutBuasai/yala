// What the app CALLS each kind of account, and what it says about one. Capabilities — which fields a
// kind carries — come from the API's kind table; only wording lives here, so a kind gains a control
// server-side and gains a heading here.

/** The order kinds read in, broadest first, payroll last. */
export const KIND_ORDER = ['bank', 'card', 'investment', 'category', 'employer', 'deduction'];

interface KindCopy {
	/** The index's group heading. */
	plural: string;
	/** One of them, as a title reads. */
	singular: string;
	/** What this kind is FOR, in half a sentence — what someone picking between six of them needs. */
	why: string;
	/** What the product half is called on this kind, where "account name" is the wrong word. */
	productLabel?: string;
	/** Placeholders, for the box that asks for each part. */
	placeholders?: {
		institution?: string;
		product?: string;
		name?: string;
		institutionAlias?: string;
		productAlias?: string;
	};
	/** What the product half's short form is called; the product label with "alias" after it. */
	productAliasLabel?: string;
}

const COPY: Record<string, KindCopy> = {
	bank: {
		plural: 'Banks',
		singular: 'Bank',
		why: 'Bank accounts: checking, savings, a cash app.',
		placeholders: { institution: 'Bank Name', institutionAlias: 'Bank' }
	},
	card: {
		plural: 'Cards',
		singular: 'Card',
		why: 'Credit card accounts: credit card products.',
		productLabel: 'Card product',
		productAliasLabel: 'Card product alias',
		placeholders: {
			institution: 'Bank Name',
			institutionAlias: 'Bank',
			product: 'Premier Rewards',
			productAlias: 'Rewards'
		}
	},
	investment: {
		plural: 'Investments',
		singular: 'Investment',
		why: 'Investment accounts: a brokerage, IRA, 401k, HSA, etc.',
		placeholders: {
			institution: 'Brokerage Name',
			institutionAlias: 'Brokerage',
			product: 'Roth IRA',
			productAlias: 'Roth'
		}
	},
	category: {
		plural: 'Categories',
		singular: 'Category',
		why: 'Spending categories.',
		placeholders: { name: 'Grocery' }
	},
	employer: {
		plural: 'Employers',
		singular: 'Employer',
		why: 'Your employer.',
		placeholders: { name: 'Company' }
	},
	deduction: {
		plural: 'Deductions',
		singular: 'Deduction',
		why: 'Payroll deduction options.',
		placeholders: { name: 'Dental' }
	}
};

/** The tiers an investment may sit in, keyed by the value the API stores — which is a path segment,
    so it is spelled its way, not ours. */
const TIER_LABELS: Record<string, string> = {
	Taxable: 'Taxable',
	TaxAdvantaged: 'Tax-advantaged'
};

export const TIERS = Object.keys(TIER_LABELS);
export const tierLabel = (tier: string): string => TIER_LABELS[tier] ?? tier;

export const kindPlural = (kind: string): string => COPY[kind]?.plural ?? kind;
export const kindSingular = (kind: string): string => COPY[kind]?.singular ?? kind;
export const kindWhy = (kind: string): string => COPY[kind]?.why ?? '';
/** What the product half is called here: "Card product" on a card, "Account name" everywhere else. */
export const productLabel = (kind: string): string => COPY[kind]?.productLabel ?? 'Account name';
/** The short form's label, so the add flow and the edit pane cannot name it differently. */
export const productAliasLabel = (kind: string): string =>
	COPY[kind]?.productAliasLabel ?? 'Account alias';
export type NamePart = 'institution' | 'product' | 'name' | 'institutionAlias' | 'productAlias';
export const placeholder = (kind: string, part: NamePart): string =>
	COPY[kind]?.placeholders?.[part] ?? '';
