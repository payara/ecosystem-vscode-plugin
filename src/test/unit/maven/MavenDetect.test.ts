/*
 * Copyright (c) 2026 Payara Foundation and/or its affiliates and others.
 * All rights reserved.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0, which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 */

'use strict';

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceFolder } from 'vscode';
import { Maven } from '../../../main/fish/payara/project/Maven';

function makeWorkspaceFolder(fsPath: string): WorkspaceFolder {
    return { uri: { fsPath } as any, name: 'test', index: 0 };
}

describe('Maven.detect()', () => {

    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payara-maven-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns true when pom.xml exists in the workspace root', () => {
        fs.writeFileSync(path.join(tempDir, 'pom.xml'), '<project/>');
        assert.strictEqual(Maven.detect(makeWorkspaceFolder(tempDir)), true);
    });

    it('returns false when pom.xml does not exist', () => {
        assert.strictEqual(Maven.detect(makeWorkspaceFolder(tempDir)), false);
    });

    it('returns false when only build.gradle exists (Gradle project)', () => {
        fs.writeFileSync(path.join(tempDir, 'build.gradle'), '');
        assert.strictEqual(Maven.detect(makeWorkspaceFolder(tempDir)), false);
    });

    it('returns false for a non-existent directory', () => {
        const noSuchDir = path.join(tempDir, 'does-not-exist');
        assert.strictEqual(Maven.detect(makeWorkspaceFolder(noSuchDir)), false);
    });

});
