import type { EntryGenerator } from './$types';
import { VIEWS } from '$lib/nav/views';

// Prerendered like every page: the default view, then one file per named view.
export const entries: EntryGenerator = () => [{}, ...VIEWS.map((view) => ({ view }))];
