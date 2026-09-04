/**
 * The busy / error / confirmation state around one async write: clear the last outcome, mark busy,
 * await a call that resolves to an error message (or null), unmark busy, then show the error or a
 * confirmation. Hand-rolled per control this drifted, so the sequence lives here and each caller
 * supplies only the call and its messages.
 */
export class SaveState {
	busy = $state(false);
	/** Message from the last failed attempt ('' when the last attempt succeeded or none was made). */
	error = $state('');
	/** Confirmation from the last successful attempt. */
	note = $state('');

	/**
	 * Run `action`, recording its outcome. Returns whether it succeeded, so a caller can go on to
	 * clear its input only when the write actually landed.
	 */
	async run(action: () => Promise<string | null>, note = ''): Promise<boolean> {
		this.busy = true;
		this.error = '';
		this.note = '';

		try {
			const problem = await action();
			if (problem) {
				this.error = problem;
				return false;
			}
			this.note = note;
			return true;
		} finally {
			// in a finally so a thrown call can't strand the control disabled
			this.busy = false;
		}
	}

	/** Report a client-side problem without calling the API (pre-submit validation). */
	fail(message: string): false {
		this.error = message;
		this.note = '';
		return false;
	}

	/** Drop any error/confirmation, e.g. when the user starts editing again. */
	reset(): void {
		this.error = '';
		this.note = '';
	}
}
