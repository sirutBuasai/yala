import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import ColorPicker from '$lib/ui/color/ColorPicker.svelte';

function open(value = '#ff0000', current = '#00ff00') {
	const props = $state({ value, current });
	render(ColorPicker, { props });
	return { props, trigger: screen.getByRole('combobox', { name: 'Open color picker' }) };
}

describe('ColorPicker', () => {
	it('moves the hue with the arrow keys and follows it in the value', async () => {
		const { props, trigger } = open('#ff0000');
		await fireEvent.click(trigger);

		await fireEvent.keyDown(screen.getByRole('slider', { name: 'Hue' }), { key: 'ArrowRight' });

		expect(props.value).not.toBe('#ff0000');
		expect(screen.getByLabelText('Hex color')).toHaveValue(props.value);
	});

	it('takes a theme colour and goes back to the current one', async () => {
		const { props, trigger } = open('#ff0000', '#00ff00');
		await fireEvent.click(trigger);

		await fireEvent.click(screen.getByRole('button', { name: '#bb9af7' }));
		expect(props.value).toBe('#bb9af7');

		await fireEvent.click(screen.getByRole('button', { name: 'Back to current' }));
		expect(props.value).toBe('#00ff00');
	});

	it('closes on Esc, returning focus to the swatch', async () => {
		const { trigger } = open();
		await fireEvent.click(trigger);

		await fireEvent.keyDown(screen.getByRole('slider', { name: 'Shade' }), { key: 'Escape' });

		expect(screen.queryByRole('dialog', { name: 'Choose color' })).toBeNull();
		expect(trigger).toHaveFocus();
	});
});
