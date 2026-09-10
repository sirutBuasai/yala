/**
 * Wrap a value in `$state` so a component's prop-member bindings are reactive. App arrays already
 * live in `$state`; a test rendering a component directly must pass a reactive fixture or Svelte
 * warns `binding_property_non_reactive`.
 */
export function reactive<T>(value: T): T {
	const state = $state(value);
	return state;
}
