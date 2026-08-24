/**
 * Wrap a value in `$state` so a component's prop-member bindings (e.g. `bind:value={rows[i].x}`)
 * are reactive. In the app these arrays already live in `$state`; tests that render a component
 * directly must pass reactive fixtures or Svelte warns `binding_property_non_reactive`.
 */
export function reactive<T>(value: T): T {
	const state = $state(value);
	return state;
}
