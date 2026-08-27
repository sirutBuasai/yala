// Sticky edit-form preferences: only the last-used account carries over to the next add, so
// entering several transactions/paychecks in a row doesn't re-pick the same account each time.
// In-memory (session-scoped); every other field resets when the form reopens.

import { writable } from 'svelte/store';

/** Last funding account chosen in "Add transaction" (e.g. "Liabilities:CC:CardA"). */
export const lastFundingAccount = writable<string>('');

/** Last spending category chosen in "Add transaction" (e.g. "Takeout"). */
export const lastCategory = writable<string>('');

/** Last deposit account chosen in "Add paycheck" (e.g. "Assets:Cash:BankA"). */
export const lastDepositAccount = writable<string>('');
