// Driving the app's own listbox from a component test. Shared because the two clicks are one act, and
// a test that opened without picking (or picked without opening) would pass for the wrong reason.

import { fireEvent } from '@testing-library/dom';
import { screen } from '@testing-library/svelte';

/** Open `trigger`, then click the option named `option`. */
export async function pick(trigger: HTMLElement, option: string): Promise<void> {
	await fireEvent.click(trigger);
	await fireEvent.click(screen.getByRole('option', { name: option }));
}
