import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Select from '$lib/forms/fields/Select.svelte';

const opts = ['Liabilities:CC:CardA', 'Assets:Cash:BankA'];
const label = (a: string) => a.split(':').pop() ?? a;

describe('Select', () => {
	it('shows the placeholder when there is no value, and the label when there is', () => {
		const { unmount } = render(Select, {
			props: { value: '', options: opts, ariaLabel: 'Account', placeholder: 'Pick...' }
		});
		expect(screen.getByLabelText('Account')).toHaveTextContent('Pick...');
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
		expect(screen.queryByRole('option')).not.toBeInTheDocument();

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
		expect(screen.queryByRole('option')).not.toBeInTheDocument();
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

	describe('typeahead', () => {
		const accounts = [
			'Assets:Cash:Wallet',
			'Assets:Bank:Checking',
			'Liabilities:CC:Card',
			'Assets:Bank:Savings'
		];
		const setup = (value = '') => {
			const onchange = vi.fn();
			render(Select, {
				props: { value, options: accounts, ariaLabel: 'Account', optionLabel: label, onchange }
			});
			return { trigger: screen.getByLabelText('Account'), onchange };
		};
		const highlighted = () => document.querySelector('[role="option"].hl');

		it('opens on a typed letter and highlights the first match, ignoring case', async () => {
			const { trigger } = setup();
			await fireEvent.keyDown(trigger, { key: 's' });
			expect(highlighted()).toHaveTextContent('Savings');
			expect(trigger).toHaveAttribute('aria-activedescendant', highlighted()?.id);
		});

		it('can land on the first option when nothing is chosen', async () => {
			const { trigger } = setup();
			await fireEvent.keyDown(trigger, { key: 'W' });
			expect(highlighted()).toHaveTextContent('Wallet');
		});

		it('narrows by a typed prefix, then Enter selects it', async () => {
			const { trigger, onchange } = setup();
			await fireEvent.keyDown(trigger, { key: 'c' });
			expect(highlighted()).toHaveTextContent('Checking');
			await fireEvent.keyDown(trigger, { key: 'a' });
			expect(highlighted()).toHaveTextContent('Card');
			await fireEvent.keyDown(trigger, { key: 'Enter' });
			expect(onchange).toHaveBeenCalledWith('Liabilities:CC:Card');
		});

		it('moves past the chosen option when its first letter is typed again', async () => {
			const { trigger } = setup('Assets:Bank:Checking');
			await fireEvent.keyDown(trigger, { key: 'Enter' });
			await fireEvent.keyDown(trigger, { key: 'c' });
			expect(highlighted()).toHaveTextContent('Card');
		});

		it('keeps Space as a commit key when no query is being typed', async () => {
			const { trigger, onchange } = setup();
			await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
			await fireEvent.keyDown(trigger, { key: ' ' });
			expect(onchange).toHaveBeenCalledWith('Assets:Cash:Wallet');
		});
	});
});
