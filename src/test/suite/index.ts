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

    // // Add test files to the Mocha instance
    // const testFiles = await getTestFiles(testsRoot);
    // testFiles.forEach((file) => {
    //     mocha.addFile(file);
    // });

    // Detect test files and add them to Mocha
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

	// return new Promise((c, e) => {
	// 	glob('**/**.test.js', { cwd: testsRoot }, (err: any, files: string[]) => {
	// 		if (err) {
	// 			return e(err);
	// 		}

	// 		// Add files to the test suite
	// 		files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

	// 		try {
	// 			// Run the mocha test
	// 			mocha.run((failures: number) => {
	// 				if (failures > 0) {
	// 					e(new Error(`${failures} tests failed.`));
	// 				} else {
	// 					c();
	// 				}
	// 			});
	// 		} catch (err) {
	// 			e(err);
	// 		}
	// 	});
	// });
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
