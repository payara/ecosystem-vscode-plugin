"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const baseTest_js_1 = require("../baseTest.js");
baseTest_js_1.test.describe('Test Payara layout', () => {
    baseTest_js_1.test.beforeEach('Open Payara plugin', (_a) => __awaiter(void 0, [_a], void 0, function* ({ page }) {
        yield page.getByRole('tab', { name: 'Payara' }).waitFor();
        const payaraIcon = page.getByRole('tab', { name: 'Payara' });
        yield payaraIcon.click();
    }));
    (0, baseTest_js_1.test)('should contain Payara icon in activity bar', (_a) => __awaiter(void 0, [_a], void 0, function* ({ page }) {
        yield page.getByRole('tab', { name: 'Payara' }).waitFor();
        const payaraIcon = page.getByRole('tab', { name: 'Payara' });
        (0, baseTest_js_1.expect)(payaraIcon).toHaveCount(1);
    }));
    (0, baseTest_js_1.test)('should contain Payara in the title', (_a) => __awaiter(void 0, [_a], void 0, function* ({ page }) {
        yield page.getByRole('heading', { name: 'PAYARA' }).waitFor();
        const payaraTitle = page.getByRole('heading', { name: 'PAYARA' });
        (0, baseTest_js_1.expect)(payaraTitle).toHaveCount(1);
    }));
    (0, baseTest_js_1.test)('should have one section for Servers and one for Micro', (_a) => __awaiter(void 0, [_a], void 0, function* ({ page }) {
        const payaraServerSection = page.getByRole('button', { name: 'Servers' });
        const payaraMicroSection = page.getByRole('button', { name: 'Micro Instances' });
        (0, baseTest_js_1.expect)(payaraServerSection).toHaveCount(1);
        (0, baseTest_js_1.expect)(payaraMicroSection).toHaveCount(1);
    }));
});
//# sourceMappingURL=payara_layout.test.js.map