import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Select from './Select.svelte';

const opts = ['Liabilities:CC:CardA', 'Assets:Cash:BankA'];
const label = (a: string) => a.split(':').pop() ?? a;

describe('Select', () => {
	it('shows the placeholder when there is no value, and the label when there is', () => {
		const { unmount } = render(Select, {
			props: { value: '', options: opts, ariaLabel: 'Account', placeholder: 'Pick…' }
		});
		expect(screen.getByLabelText('Account')).toHaveTextContent('Pick…');
		unmount();

		render(Select, {
			props: { value: 'Assets:Cash:BankA', options: opts, ariaLabel: 'Account', optionLabel: label }
		});
		expect(screen.getByLabelText('Account')).toHaveTextContent('BankA');
	});

	it('opens on click and lists the options', async () => {
		render(Select, {
			props: { value: '', options: opts, ariaLabel: 'Account', optionLabel: label }
		});
		expect(screen.queryByRole('option')).not.toBeInTheDocument(); // closed initially

		await fireEvent.click(screen.getByLabelText('Account'));
		expect(screen.getAllByRole('option')).toHaveLength(2);
		expect(screen.getByRole('option', { name: 'CardA' })).toBeInTheDocument();
	});

	it('selecting an option fires onchange, updates the trigger, and closes', async () => {
		const onchange = vi.fn();
		render(Select, {
			props: { value: '', options: opts, ariaLabel: 'Account', optionLabel: label, onchange }
		});
		await fireEvent.click(screen.getByLabelText('Account'));
		await fireEvent.click(screen.getByRole('option', { name: 'BankA' }));

		expect(onchange).toHaveBeenCalledWith('Assets:Cash:BankA');
		expect(screen.getByLabelText('Account')).toHaveTextContent('BankA');
		expect(screen.queryByRole('option')).not.toBeInTheDocument(); // closed after choosing
	});

	it('is keyboard operable: ArrowDown then Enter selects', async () => {
		const onchange = vi.fn();
		render(Select, {
			props: { value: '', options: opts, ariaLabel: 'Account', optionLabel: label, onchange }
		});
		const trigger = screen.getByLabelText('Account');
		await fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // open, active=0
		await fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // active=1
		await fireEvent.keyDown(trigger, { key: 'Enter' });
		expect(onchange).toHaveBeenCalledWith('Assets:Cash:BankA');
	});
});
