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
const baseTest_ts_1 = require("./baseTest.ts");
baseTest_ts_1.test.describe('Test GitLens installation', () => {
    (0, baseTest_ts_1.test)('should display GitLens Welcome page after installation', (_a) => __awaiter(void 0, [_a], void 0, function* ({ page }) {
        const title = yield page.textContent('.tab a');
        (0, baseTest_ts_1.expect)(title).toBe('Welcome to GitLens');
    }));
    (0, baseTest_ts_1.test)('should contain GitLens & GitLens Inspect icons in activity bar', (_a) => __awaiter(void 0, [_a], void 0, function* ({ page }) {
        yield page.getByRole('tab', { name: 'GitLens Inspect' }).waitFor();
        const gitlensIcons = page.getByRole('tab', { name: 'GitLens' });
        void (0, baseTest_ts_1.expect)(gitlensIcons).toHaveCount(2);
        (0, baseTest_ts_1.expect)(yield page.title()).toContain('[Extension Development Host]');
    }));
});
//# sourceMappingURL=payara_install.test.js.map