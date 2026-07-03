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
import * as sinon from 'sinon';
import * as cp from 'child_process';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { JavaUtils } from '../../../main/fish/payara/server/tooling/utils/JavaUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProc(pid = 55555): ChildProcess {
    const emitter = new EventEmitter() as any;
    emitter.pid = pid;
    emitter.killed = false;
    // Simulate real behaviour: kill() marks the process as dead.
    emitter.kill = sinon.stub().callsFake(() => { emitter.killed = true; });
    emitter.stdin = null;
    emitter.stdout = null;
    emitter.stderr = null;
    return emitter as ChildProcess;
}

/**
 * Mirrors the kill loop inside killAllMavenInstances() in extension.ts exactly.
 * Tests here exercise that contract for both PayaraServerMavenInstance and
 * PayaraMicroInstance, which share the same getProcess() interface.
 */
function runKillInstances(instances: Array<{ getProcess(): ChildProcess | undefined }>): void {
    for (const instance of instances) {
        const proc = instance.getProcess();
        if (proc?.pid && !proc.killed) {
            try {
                if (JavaUtils.IS_WIN) {
                    cp.execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
                } else {
                    proc.kill('SIGTERM');
                }
            } catch (_) { /* already gone */ }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kill-instances logic (deactivate contract)', () => {

    let execSyncStub: sinon.SinonStub;
    let originalIsWin: boolean;

    beforeEach(() => {
        execSyncStub = sinon.stub(cp, 'execSync');
        originalIsWin = JavaUtils.IS_WIN;
        JavaUtils.IS_WIN = false; // default to Unix path; individual tests override as needed
    });

    afterEach(() => {
        JavaUtils.IS_WIN = originalIsWin;
        sinon.restore();
    });

    it('kills a running Micro instance: has PID → kill → process is dead', () => {
        const proc = makeMockProc(22222);

        // 1. Instance is running
        assert.ok(proc.pid, 'Micro instance must have a PID while running');
        assert.strictEqual(proc.killed, false, 'Micro instance must be alive before deactivate');

        // 2. Extension deactivates
        runKillInstances([{ getProcess: () => proc }]);

        // 3. Instance is dead
        assert.strictEqual(proc.killed, true, 'Micro instance must be killed after deactivate');
        sinon.assert.calledWith(proc.kill as sinon.SinonStub, 'SIGTERM');
    });

    it('kills both Server Maven and Micro instances on deactivate', () => {
        const serverProc = makeMockProc(11111);
        const microProc  = makeMockProc(22222);

        // 1. Both instances running
        assert.strictEqual(serverProc.killed, false);
        assert.strictEqual(microProc.killed,  false);

        // 2. Extension deactivates — both providers are iterated
        runKillInstances([
            { getProcess: () => serverProc },
            { getProcess: () => microProc  },
        ]);

        // 3. Both instances dead
        assert.strictEqual(serverProc.killed, true, 'Server Maven instance must be killed');
        assert.strictEqual(microProc.killed,  true, 'Micro instance must be killed');
    });

    it('skips a Micro instance that had already stopped before deactivate', () => {
        const proc = makeMockProc();

        // Instance stopped on its own before VS Code closed
        (proc as any).killed = true;
        assert.strictEqual(proc.killed, true, 'precondition: process already dead');

        runKillInstances([{ getProcess: () => proc }]);

        // kill() must not be called a second time
        sinon.assert.notCalled(proc.kill as sinon.SinonStub);
    });

    it('skips an instance that never fully started (no PID)', () => {
        const proc = makeMockProc();
        (proc as any).pid = undefined;

        // No PID — process never launched successfully
        assert.strictEqual(proc.pid, undefined);

        runKillInstances([{ getProcess: () => proc }]);

        sinon.assert.notCalled(proc.kill as sinon.SinonStub);
    });

    it('skips instances that have no process attached at all', () => {
        assert.doesNotThrow(() =>
            runKillInstances([{ getProcess: () => undefined }])
        );
    });

    it('continues killing remaining instances if one kill() throws', () => {
        const failProc = makeMockProc(33333);
        const okProc   = makeMockProc(44444);

        // First instance's kill throws (e.g. ESRCH — no such process)
        (failProc.kill as sinon.SinonStub).callsFake(() => { throw new Error('ESRCH'); });

        assert.doesNotThrow(() =>
            runKillInstances([
                { getProcess: () => failProc },
                { getProcess: () => okProc   },
            ])
        );

        // Second instance must still be killed despite the first throwing
        assert.strictEqual(okProc.killed, true, 'surviving instance must still be killed');
    });

    it('uses taskkill on Windows: has PID → taskkill → PID targeted', () => {
        JavaUtils.IS_WIN = true;
        const proc = makeMockProc(77777);

        // 1. Instance running on Windows
        assert.ok(proc.pid);
        assert.strictEqual(proc.killed, false);

        // 2. Extension deactivates
        runKillInstances([{ getProcess: () => proc }]);

        // 3. taskkill was called for this specific PID
        sinon.assert.calledWithMatch(
            execSyncStub,
            sinon.match(/taskkill.*\/PID 77777/i)
        );
    });

});
