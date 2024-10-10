import { Page } from 'playwright/test';
import { expect, test } from '../baseTest.js';

test.describe('Test Payara layout', () => {
	test.beforeEach('Open Payara plugin', async ({page}) =>{
		await page.getByRole('tab', { name: 'Payara' }).waitFor();
		const payaraIcon = page.getByRole('tab', { name: 'Payara' });
		await payaraIcon.click();
	})

	test('should contain Payara icon in activity bar', async ({page}) => {
		await page.getByRole('tab', { name: 'Payara' }).waitFor();
		const payaraIcon = page.getByRole('tab', { name: 'Payara' });
		expect(payaraIcon).toHaveCount(1);
	});

	test('should contain Payara in the title', async ({page}) => {
		await page.getByRole('heading', {name: 'PAYARA'}).waitFor();
		const payaraTitle = page.getByRole('heading', {name: 'PAYARA'});
		expect(payaraTitle).toHaveCount(1);
	});

	test('should have one section for Servers and one for Micro', async ({page}) => {
		const payaraServerSection = page.getByRole('button', {name: 'Servers'});
		const payaraMicroSection = page.getByRole('button', {name: 'Micro Instances'});
		expect(payaraServerSection).toHaveCount(1);
		expect(payaraMicroSection).toHaveCount(1);
	});
});