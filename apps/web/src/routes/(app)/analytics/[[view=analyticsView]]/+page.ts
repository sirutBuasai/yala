import type { EntryGenerator } from './$types';
import { ANALYTICS_VIEWS } from '$lib/views/analytics/views';

// Prerendered like every page: the default view, then one file per named view.
export const entries: EntryGenerator = () => [{}, ...ANALYTICS_VIEWS.map((view) => ({ view }))];
