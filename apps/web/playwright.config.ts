import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level tests, which is the only place the layout rules can be checked at all: every defect they
 * cover — a card its content bleeds out of, a label clipped mid-glyph, a dropdown off the bottom of the
 * viewport — needs real measurement, and jsdom has none, so `vitest` structurally cannot see them.
 *
 * Runs against the PRODUCTION build rather than the dev server: that is the artifact `make serve` puts in
 * front of the user, and a stale build was once mistaken for code that had not changed.
 */
const PORT = 4183;

export default defineConfig({
	testDir: './e2e',
	// The board's gestures are stateful and the suite drives one shared localStorage per worker; parallel
	// files would arrange the same boards against each other.
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? 'github' : [['list']],
	use: {
		...devices['Desktop Chrome'],
		baseURL: `http://localhost:${PORT}`,
		// AFTER the device preset, which carries its own 1280px viewport: the board only offers arranging at
		// the full 48-column content width (see grid/units), and 1280 folds it, so the Edit toggle — which is
		// absent rather than disabled when folded — never rendered.
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure'
	},
	webServer: {
		command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
