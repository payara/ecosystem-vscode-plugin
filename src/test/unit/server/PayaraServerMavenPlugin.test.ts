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
import { PayaraServerMavenPlugin } from '../../../main/fish/payara/server/maven/PayaraServerMavenPlugin';

describe('PayaraServerMavenPlugin — plugin coordinates', () => {

    it('should use the correct Maven GROUP_ID', () => {
        assert.strictEqual(PayaraServerMavenPlugin.GROUP_ID, 'fish.payara.maven.plugins');
    });

    it('should use the correct ARTIFACT_ID', () => {
        assert.strictEqual(PayaraServerMavenPlugin.ARTIFACT_ID, 'payara-server-maven-plugin');
    });

    it('should expose start, dev, stop, deploy and undeploy goals', () => {
        assert.strictEqual(PayaraServerMavenPlugin.START_GOAL,   'start');
        assert.strictEqual(PayaraServerMavenPlugin.DEV_GOAL,     'dev');
        assert.strictEqual(PayaraServerMavenPlugin.STOP_GOAL,    'stop');
        assert.strictEqual(PayaraServerMavenPlugin.DEPLOY_GOAL,  'deploy');
        assert.strictEqual(PayaraServerMavenPlugin.UNDEPLOY_GOAL,'undeploy');
    });

});

describe('PayaraServerMavenPlugin — Maven command format', () => {

    const G = PayaraServerMavenPlugin.GROUP_ID;
    const A = PayaraServerMavenPlugin.ARTIFACT_ID;

    it('start command includes "mvn package" and the start goal', () => {
        const cmd = `mvn package ${G}:${A}:${PayaraServerMavenPlugin.START_GOAL}`;
        assert.ok(cmd.startsWith('mvn package'), 'should begin with mvn package');
        assert.ok(cmd.includes(':start'), 'should contain :start goal');
        assert.strictEqual(cmd, 'mvn package fish.payara.maven.plugins:payara-server-maven-plugin:start');
    });

    it('dev command includes "mvn package" and the dev goal', () => {
        const cmd = `mvn package ${G}:${A}:${PayaraServerMavenPlugin.DEV_GOAL}`;
        assert.ok(cmd.includes(':dev'), 'should contain :dev goal');
        assert.strictEqual(cmd, 'mvn package fish.payara.maven.plugins:payara-server-maven-plugin:dev');
    });

    it('stop command does NOT include "mvn package"', () => {
        const cmd = `mvn ${G}:${A}:${PayaraServerMavenPlugin.STOP_GOAL}`;
        assert.ok(!cmd.includes('package'), 'stop should not run the package phase');
        assert.strictEqual(cmd, 'mvn fish.payara.maven.plugins:payara-server-maven-plugin:stop');
    });

    it('debug start appends -Ddebug=true and -DdebugPort', () => {
        const port = 9009;
        const base = `mvn package ${G}:${A}:${PayaraServerMavenPlugin.START_GOAL}`;
        const cmd = `${base} -Ddebug=true -DdebugPort=${port}`;
        assert.ok(cmd.includes('-Ddebug=true'));
        assert.ok(cmd.includes(`-DdebugPort=${port}`));
    });

    it('debug dev appends -Dpayara.debug=true and -Dpayara.debug.port', () => {
        const port = 9009;
        const base = `mvn package ${G}:${A}:${PayaraServerMavenPlugin.DEV_GOAL}`;
        const cmd = `${base} -Dpayara.debug=true -Dpayara.debug.port=${port}`;
        assert.ok(cmd.includes('-Dpayara.debug=true'));
        assert.ok(cmd.includes(`-Dpayara.debug.port=${port}`));
    });

    it('stop command appends -DprocessId', () => {
        const pid = 12345;
        const base = `mvn ${G}:${A}:${PayaraServerMavenPlugin.STOP_GOAL}`;
        const cmd = `${base} -DprocessId=${pid}`;
        assert.ok(cmd.includes(`-DprocessId=${pid}`));
    });

});
