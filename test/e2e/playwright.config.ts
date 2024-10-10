import { defineConfig } from '@playwright/test';
import type { TestOptions } from './baseTest.js';

// eslint-disable-next-line import-x/no-default-export
export default defineConfig<TestOptions>({
	use: {
		headless: true, // Ensure headless mode is enabled - Electron does not have a headless mode
		viewport: { width: 1920, height: 1080 },
	},
	reporter: 'list', // process.env.CI ? 'html' : 'list',
	timeout: 60000, // 1 minute
	workers: 1,
	expect: {
		timeout: 60000, // 1 minute
	},
	globalSetup: './setup',
	outputDir: '../../out/test-results',
	projects: [
		{
			name: 'VSCode stable',
			use: {
				vscodeVersion: 'stable',
			},
		},
		{
			name: 'VSCode insiders',
			use: {
				vscodeVersion: 'insiders',
			},
		},
	],
	testMatch: 'specs/*.test.ts'
});