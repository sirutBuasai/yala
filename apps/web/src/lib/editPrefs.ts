// Sticky edit-form preferences: the last-used account carries over to the next add within
// the session, so a user entering several transactions/paychecks in a row doesn't re-pick the
// same payment/deposit account each time. Only the account persists — every other field resets
// when the add form is reopened. In-memory (session-scoped); cleared on a full page reload.

import { writable } from 'svelte/store';

/** Last funding account chosen in "Add transaction" (e.g. "Liabilities:CC:AmexGold"). */
export const lastFundingAccount = writable<string>('');

/** Last deposit account chosen in "Add paycheck" (e.g. "Assets:Cash:BankA"). */
export const lastDepositAccount = writable<string>('');
