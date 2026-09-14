import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import DatePicker from '$lib/forms/fields/DatePicker.svelte';

describe('DatePicker', () => {
	it('shows the placeholder when empty and a friendly date when set', () => {
		const { unmount } = render(DatePicker, {
			props: { value: '', ariaLabel: 'Date', placeholder: 'pick a date' }
		});
		expect(screen.getByLabelText('Date')).toHaveTextContent('pick a date');
		unmount();

		render(DatePicker, { props: { value: '2025-01-15', ariaLabel: 'Date' } });
		expect(screen.getByLabelText('Date')).toHaveTextContent('Jan 15, 2025');
	});

	// Blank means today everywhere this is used — every route dates an entry today when none is sent —
	// so the empty state says today's date rather than spelling out a format nobody types in here.
	it('reads as today when empty and given no placeholder', () => {
		const now = new Date();
		const MONTHS = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec'
		];
		const today = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

		render(DatePicker, { props: { value: '', ariaLabel: 'Date' } });

		expect(screen.getByLabelText('Date')).toHaveTextContent(today);
	});

	it('opens a calendar on the value’s month and navigates months', async () => {
		render(DatePicker, { props: { value: '2025-01-15', ariaLabel: 'Date' } });
		await fireEvent.click(screen.getByLabelText('Date'));

		const dialog = screen.getByRole('dialog', { name: 'Choose date' });
		expect(dialog).toHaveTextContent('Jan 2025');

		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		expect(dialog).toHaveTextContent('Feb 2025');
		await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
		expect(dialog).toHaveTextContent('Jan 2025');
	});

	it('picking a day sets the ISO value (shown formatted) and closes', async () => {
		render(DatePicker, { props: { value: '2025-01-15', ariaLabel: 'Date' } });
		await fireEvent.click(screen.getByLabelText('Date'));
		await fireEvent.click(screen.getByRole('button', { name: '20' }));

		expect(screen.getByLabelText('Date')).toHaveTextContent('Jan 20, 2025');
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('Clear resets the value', async () => {
		render(DatePicker, { props: { value: '2025-01-15', ariaLabel: 'Date', placeholder: 'none' } });
		await fireEvent.click(screen.getByLabelText('Date'));
		await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
		expect(screen.getByLabelText('Date')).toHaveTextContent('none');
	});
});
