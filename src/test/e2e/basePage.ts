import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { _electron, test as base } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron/out/download';

export { expect } from '@playwright/test';

export type TestOptions = {
	vscodeVersion: string;
};

type TestFixtures = TestOptions & {
	page: Page;
	createTmpDir: () => Promise<string>;
};

export const MaxTimeout = 10000;

let testProjectPath: string;
export const test = base.extend<TestFixtures>({
	vscodeVersion: ['insiders', { option: true }],
	page: async ({ vscodeVersion, createTmpDir }, use) => {
		const defaultCachePath = await createTmpDir();
		const vscodePath = await downloadAndUnzipVSCode(vscodeVersion);
		testProjectPath = path.join(__dirname, '..', '..', '..');

		const electronApp = await _electron.launch({
			executablePath: vscodePath,
			// Got it from https://github.com/gitkraken/vscode-gitlens/blob/main/tests/e2e/specs/baseTest.ts
			args: [
				'--no-sandbox', 
				'--disable-gpu-sandbox', 
				'--disable-updates', 
				'--skip-welcome',
				'--skip-release-notes',
				'--disable-workspace-trust',
				`--extensionDevelopmentPath=${path.join(__dirname, '..', '..', '..')}`,
				`--extensions-dir=${path.join(defaultCachePath, 'extensions')}`,
				`--user-data-dir=${path.join(defaultCachePath, 'user-data')}`,
				testProjectPath,
			],
		});

		const page = await electronApp.firstWindow();

		await use(page);

		await electronApp.close();

		const logPath = path.join(defaultCachePath, 'user-data');
		if (fs.existsSync(logPath)) {
			const logOutputPath = test.info().outputPath('vscode-logs');
			await fs.promises.cp(logPath, logOutputPath, { recursive: true });
		}
	},

	// eslint-disable-next-line no-empty-pattern
	createTmpDir: async ({}, use) => {
		const tempDirs: string[] = [];
		await use(async () => {
			const tempDir = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gltest-')));
			tempDirs.push(tempDir);
			return tempDir;
		});
		for (const tempDir of tempDirs) {
			await fs.promises.rm(tempDir, { recursive: true });
		}
	},
});