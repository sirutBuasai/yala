import { ANALYTICS_VIEWS } from '$lib/views/analytics/views';

export function match(param: string): param is (typeof ANALYTICS_VIEWS)[number] {
	return (ANALYTICS_VIEWS as readonly string[]).includes(param);
}
