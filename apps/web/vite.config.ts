import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	// Svelte 5's client runtime ships under the "browser" condition, which @testing-library/svelte needs to
	// mount in jsdom. Floating UI is stubbed here too; the stub says why.
	resolve:
		mode === 'test'
			? {
					conditions: ['browser'],
					alias: {
						'@floating-ui/dom': fileURLToPath(
							new URL('./src/lib/overlay/__stubs__/floating-ui.ts', import.meta.url)
						)
					}
				}
			: undefined,
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./vitest-setup.ts'],
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://127.0.0.1:8000',
				changeOrigin: true
			}
		}
	}
}));
