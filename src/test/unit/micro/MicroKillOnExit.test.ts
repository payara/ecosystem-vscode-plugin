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
import * as os from 'os';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { Maven } from '../../../main/fish/payara/project/Maven';
import { JavaUtils } from '../../../main/fish/payara/server/tooling/utils/JavaUtils';
import { WorkspaceFolder } from 'vscode';

function makeFakeWorkspaceFolder(): WorkspaceFolder {
    // os.tmpdir() has no pom.xml so Maven.detect() → false and readBuildConfig() is a no-op.
    return { uri: { fsPath: os.tmpdir() } as any, name: 'test', index: 0 };
}

function makeMockProc(pid = 99999): ChildProcess {
    const emitter = new EventEmitter() as any;
    emitter.pid = pid;
    emitter.killed = false;
    // Simulate the real behaviour: kill() marks the process as killed.
    emitter.kill = sinon.stub().callsFake(() => { emitter.killed = true; });
    emitter.stdin = null;
    emitter.stdout = null;
    emitter.stderr = null;
    return emitter as ChildProcess;
}

/** Returns the last listener registered on process 'exit' (the one just added by registerKillOnExit). */
function getLastExitListener(): Function {
    const listeners = process.listeners('exit') as Function[];
    return listeners[listeners.length - 1];
}

describe('Maven.registerKillOnExit — process listener lifecycle', () => {

    let maven: Maven;
    let execSyncStub: sinon.SinonStub;
    let originalIsWin: boolean;

    beforeEach(() => {
        maven = new Maven(null, makeFakeWorkspaceFolder());
        execSyncStub = sinon.stub(cp, 'execSync');
        originalIsWin = JavaUtils.IS_WIN;
    });

    afterEach(() => {
        JavaUtils.IS_WIN = originalIsWin;
        sinon.restore();
    });

    it('adds exactly one process exit listener when an instance starts', () => {
        const proc = makeMockProc();
        const before = process.listenerCount('exit');

        // Instance starts → register kill guard
        maven.registerKillOnExit(proc);

        assert.strictEqual(process.listenerCount('exit'), before + 1);

        // Cleanup: let the proc exit normally so the listener is removed.
        proc.emit('exit', 0);
    });

    it('removes the listener after the instance stops normally', () => {
        const proc = makeMockProc();
        const before = process.listenerCount('exit');

        // Instance starts
        maven.registerKillOnExit(proc);
        assert.strictEqual(process.listenerCount('exit'), before + 1);

        // Instance stops on its own (clean exit)
        proc.emit('exit', 0);

        assert.strictEqual(process.listenerCount('exit'), before, 'listener must be cleaned up after normal exit');
    });

    it('kills the instance (Unix) when VS Code host exits mid-run', () => {
        JavaUtils.IS_WIN = false;
        const proc = makeMockProc(12345);

        // 1. Instance is running — has PID, not yet killed
        assert.ok(proc.pid, 'instance should have a PID while running');
        assert.strictEqual(proc.killed, false, 'instance should be alive before kill');

        // 2. Register kill guard when instance starts
        maven.registerKillOnExit(proc);

        // 3. VS Code host exits → kill guard fires
        getLastExitListener()();

        // 4. Instance is now dead
        assert.strictEqual(proc.killed, true, 'instance should be killed after host exit');
        sinon.assert.calledWith(proc.kill as sinon.SinonStub, 'SIGTERM');

        proc.emit('exit', 0);
    });

    it('calls taskkill on Windows when VS Code host exits mid-run', () => {
        JavaUtils.IS_WIN = true;
        const proc = makeMockProc(12345);

        // 1. Instance is running
        assert.ok(proc.pid);
        assert.strictEqual(proc.killed, false);

        // 2. Register kill guard
        maven.registerKillOnExit(proc);

        // 3. Host exits
        getLastExitListener()();

        // 4. taskkill was invoked for this PID
        sinon.assert.calledWithMatch(
            execSyncStub,
            sinon.match(/taskkill.*\/PID 12345/i)
        );

        proc.emit('exit', 0);
    });

    it('does not kill an instance that already stopped before the host exits', () => {
        JavaUtils.IS_WIN = false;
        const proc = makeMockProc();

        maven.registerKillOnExit(proc);

        // Instance stops normally before the host exits
        (proc as any).killed = true;

        getLastExitListener()();

        sinon.assert.notCalled(proc.kill as sinon.SinonStub);

        proc.emit('exit', 0);
    });

    it('does not kill an instance that never fully started (no PID)', () => {
        JavaUtils.IS_WIN = false;
        const proc = makeMockProc();
        (proc as any).pid = undefined;

        // 1. No PID — instance never got off the ground
        assert.strictEqual(proc.pid, undefined);

        maven.registerKillOnExit(proc);

        getLastExitListener()();

        sinon.assert.notCalled(proc.kill as sinon.SinonStub);

        proc.emit('exit', 0);
    });

    it('tracks two concurrent Micro instances independently', () => {
        JavaUtils.IS_WIN = false;
        const proc1 = makeMockProc(11111);
        const proc2 = makeMockProc(22222);
        const before = process.listenerCount('exit');

        // Both instances start
        assert.strictEqual(proc1.killed, false);
        assert.strictEqual(proc2.killed, false);

        maven.registerKillOnExit(proc1);
        maven.registerKillOnExit(proc2);
        assert.strictEqual(process.listenerCount('exit'), before + 2);

        // proc1 stops normally — only its listener is removed
        proc1.emit('exit', 0);
        assert.strictEqual(proc1.killed, false, 'proc1 exited on its own, not force-killed');
        assert.strictEqual(process.listenerCount('exit'), before + 1);

        // VS Code host then exits — proc2 is still running, should be killed
        getLastExitListener()();
        assert.strictEqual(proc2.killed, true, 'proc2 should be killed on host exit');

        proc2.emit('exit', 0);
        assert.strictEqual(process.listenerCount('exit'), before);
    });

});
