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
import { PayaraMicroMavenPlugin } from '../../../main/fish/payara/micro/PayaraMicroMavenPlugin';

describe('PayaraMicroMavenPlugin — plugin coordinates', () => {

    it('should use the correct Maven GROUP_ID', () => {
        assert.strictEqual(PayaraMicroMavenPlugin.GROUP_ID, 'fish.payara.maven.plugins');
    });

    it('should use the correct ARTIFACT_ID', () => {
        assert.strictEqual(PayaraMicroMavenPlugin.ARTIFACT_ID, 'payara-micro-maven-plugin');
    });

    it('should expose start, dev, stop, bundle and reload goals', () => {
        assert.strictEqual(PayaraMicroMavenPlugin.START_GOAL,  'start');
        assert.strictEqual(PayaraMicroMavenPlugin.DEV_GOAL,    'dev');
        assert.strictEqual(PayaraMicroMavenPlugin.STOP_GOAL,   'stop');
        assert.strictEqual(PayaraMicroMavenPlugin.BUNDLE_GOAL, 'bundle');
        assert.strictEqual(PayaraMicroMavenPlugin.RELOAD_GOAL, 'reload');
    });

});

describe('PayaraMicroMavenPlugin — Maven command format', () => {

    const G = PayaraMicroMavenPlugin.GROUP_ID;
    const A = PayaraMicroMavenPlugin.ARTIFACT_ID;

    it('dev command is a single plugin goal (no package phase)', () => {
        const cmd = `mvn ${G}:${A}:${PayaraMicroMavenPlugin.DEV_GOAL}`;
        assert.strictEqual(cmd, 'mvn fish.payara.maven.plugins:payara-micro-maven-plugin:dev');
        assert.ok(!cmd.includes('package'));
    });

    it('stop command is a single plugin goal', () => {
        const cmd = `mvn ${G}:${A}:${PayaraMicroMavenPlugin.STOP_GOAL}`;
        assert.strictEqual(cmd, 'mvn fish.payara.maven.plugins:payara-micro-maven-plugin:stop');
    });

    it('bundle command includes "mvn install" before the bundle goal', () => {
        const cmd = `mvn install ${G}:${A}:${PayaraMicroMavenPlugin.BUNDLE_GOAL}`;
        assert.ok(cmd.startsWith('mvn install'));
        assert.ok(cmd.includes(':bundle'));
        assert.strictEqual(cmd, 'mvn install fish.payara.maven.plugins:payara-micro-maven-plugin:bundle');
    });

    it('start (uber-jar) command runs install + bundle + start goals', () => {
        const cmd = `mvn install ${G}:${A}:${PayaraMicroMavenPlugin.BUNDLE_GOAL} ${G}:${A}:${PayaraMicroMavenPlugin.START_GOAL}`;
        assert.ok(cmd.includes(':bundle'));
        assert.ok(cmd.includes(':start'));
        assert.strictEqual(cmd, 'mvn install fish.payara.maven.plugins:payara-micro-maven-plugin:bundle fish.payara.maven.plugins:payara-micro-maven-plugin:start');
    });

    it('start (exploded-war) command compiles and deploys WAR before starting', () => {
        const cmd = `mvn resources:resources compiler:compile war:exploded -Dexploded=true -DdeployWar=true ${G}:${A}:${PayaraMicroMavenPlugin.START_GOAL}`;
        assert.ok(cmd.includes('war:exploded'));
        assert.ok(cmd.includes('-DdeployWar=true'));
        assert.ok(cmd.includes(':start'));
    });

    it('reload command recompiles before running the reload goal', () => {
        const cmd = `mvn resources:resources compiler:compile war:exploded ${G}:${A}:${PayaraMicroMavenPlugin.RELOAD_GOAL}`;
        assert.ok(cmd.includes('compiler:compile'));
        assert.ok(cmd.includes(':reload'));
    });

    it('debug start appends -Ddebug JVM agent string', () => {
        const port = 5005;
        const base = `mvn ${G}:${A}:${PayaraMicroMavenPlugin.START_GOAL}`;
        const cmd = `${base} -Ddebug=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${port}`;
        assert.ok(cmd.includes('-Ddebug='));
        assert.ok(cmd.includes(`address=${port}`));
        assert.ok(cmd.includes('dt_socket'));
    });

    it('hot-deploy start appends -DhotDeploy=true', () => {
        const base = `mvn resources:resources compiler:compile war:exploded -Dexploded=true -DdeployWar=true ${G}:${A}:${PayaraMicroMavenPlugin.START_GOAL}`;
        const cmd = `${base} -DhotDeploy=true`;
        assert.ok(cmd.includes('-DhotDeploy=true'));
    });

    it('hot-reload with metadata change appends -DmetadataChanged=true', () => {
        const base = `mvn resources:resources compiler:compile war:exploded ${G}:${A}:${PayaraMicroMavenPlugin.RELOAD_GOAL}`;
        const cmd = `${base} -DhotDeploy=true -DmetadataChanged=true`;
        assert.ok(cmd.includes('-DmetadataChanged=true'));
    });

});
