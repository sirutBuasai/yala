import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	// Svelte 5's client component runtime is published under the "browser" export
	// condition; resolve it during tests so @testing-library/svelte can mount
	// components in jsdom. Vitest resolves this config with mode "test".
	//
	// Floating UI is aliased to a stub in the same breath; that file says why.
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
