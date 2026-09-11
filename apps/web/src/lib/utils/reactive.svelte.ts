/** Wrap a value in `$state` so prop-member bindings are reactive. App arrays already live in `$state`;
    a test rendering a component directly must pass a reactive fixture or Svelte warns. */
export function reactive<T>(value: T): T {
	const state = $state(value);
	return state;
}
