import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';
import * as fs from 'fs';

export async function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');
	const testFiles = findTestFiles(testsRoot);
    testFiles.forEach((file: string) => {
        mocha.addFile(file);
    });

    // Run the tests
    try {
        await new Promise<void>((resolve, reject) => {
            mocha.run((failures) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error('Failed to run tests:', error);
        process.exit(1);
    }
}

function findTestFiles(rootDir: string): string[] {
    const testFiles: string[] = [];
    const files = fs.readdirSync(rootDir);

    files.forEach((file: string) => {
        const filePath = path.join(rootDir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            testFiles.push(...findTestFiles(filePath));
        } else if (file.endsWith('.test.js')) { // Adjust the file extension if needed
            testFiles.push(filePath);
        }
    });

    return testFiles;
}

// Run the tests when the script is executed directly
if (require.main === module) {
    run();
}
