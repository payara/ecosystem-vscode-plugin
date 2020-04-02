'use strict';

/*
 * Copyright (c) 2020 Payara Foundation and/or its affiliates and others.
 * All rights reserved.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0, which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the
 * Eclipse Public License v. 2.0 are satisfied: GNU General Public License,
 * version 2 with the GNU Classpath Exception, which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 */

import { ChildProcess } from 'child_process';
import * as _ from "lodash";
import * as open from "open";
import * as vscode from 'vscode';
import { DebugConfiguration, OutputChannel } from 'vscode';
import { BuildSupport } from '../project/BuildSupport';
import { DebugManager } from '../project/DebugManager';
import { InstanceState, PayaraMicroInstance } from './PayaraMicroInstance';
import { PayaraMicroInstanceProvider } from './PayaraMicroInstanceProvider';

export class PayaraMicroInstanceController {

    private outputChannel: OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
        private instanceProvider: PayaraMicroInstanceProvider,
        private extensionPath: string) {
        this.outputChannel = vscode.window.createOutputChannel("payara");
    }

    public async startMicro(payaraMicro: PayaraMicroInstance, debug: boolean, callback?: (status: boolean) => any): Promise<void> {
        if (!payaraMicro.isStopped()) {
            vscode.window.showErrorMessage('Payara Micro instance already running.');
            return;
        }
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(payaraMicro.getPath());
        let build = BuildSupport.getBuild(payaraMicro.getPath());

        if (build.getMicroPluginReader().isDeployWarEnabled() === false
            && build.getMicroPluginReader().isUberJarEnabled() === false) {
            vscode.window.showWarningMessage('Please either enable the deployWar or useUberJar option in payara-micro-maven-plugin configuration to deploy the application.');
        }

        let debugConfig: DebugConfiguration | undefined;
        if (debug && workspaceFolder) {
            let debugManager: DebugManager = new DebugManager();
            debugConfig = debugManager.getPayaraMicroDebugConfig(workspaceFolder);
            if (!debugConfig) {
                debugConfig = debugManager.createDebugConfiguration(
                    workspaceFolder,
                    debugManager.getDefaultMicroDebugConfig()
                );
            }
        }

        payaraMicro.setDebug(debug);
        await payaraMicro.setState(InstanceState.LODING);
        let process: ChildProcess = build.startPayaraMicro(debugConfig,
            async data => {
                if (!payaraMicro.isStarted()) {
                    if (debugConfig && data.indexOf("Listening for transport dt_socket at address:") > -1) {
                        vscode.debug.startDebugging(workspaceFolder, debugConfig);
                        debugConfig = undefined;
                    }
                    if (this.parseApplicationUrl(data, payaraMicro)) {
                        await payaraMicro.setState(InstanceState.RUNNING);
                    }
                }
            },
            async artifact => {
                await payaraMicro.setState(InstanceState.STOPPED);
            }
        );
        payaraMicro.setProcess(process);
    }

    private parseApplicationUrl(data: string, payaraMicro: PayaraMicroInstance): boolean {
        let urlIndex = data.indexOf("Payara Micro URLs:");
        if (urlIndex > -1) {
            let lines = data.substring(urlIndex).split("\n");
            if (lines.length > 1) {
                payaraMicro.setHomePage(lines[1]);
            }
            let homePage = payaraMicro.getHomePage();
            if (homePage !== undefined && !_.isEmpty(homePage)) {
                open(homePage);
            }
            return true;
        }
        return false;
    }

    public async reloadMicro(payaraMicro: PayaraMicroInstance): Promise<void> {
        if (payaraMicro.isStopped()) {
            vscode.window.showErrorMessage('Payara Micro instance not running.');
            return;
        }
        let build = BuildSupport.getBuild(payaraMicro.getPath());
        await payaraMicro.setState(InstanceState.LODING);
        build.reloadPayaraMicro(async artifact => {
            await payaraMicro.setState(InstanceState.RUNNING);
        });
    }

    public async stopMicro(payaraMicro: PayaraMicroInstance): Promise<void> {
        if (payaraMicro.isStopped()) {
            vscode.window.showErrorMessage('Payara Micro instance not running.');
            return;
        }
        let build = BuildSupport.getBuild(payaraMicro.getPath());
        build.stopPayaraMicro(async artifact => {
            payaraMicro.setDebug(false);
            await payaraMicro.setState(InstanceState.STOPPED);
        });
    }

    public async bundleMicro(payaraMicro: PayaraMicroInstance): Promise<void> {
        let build = BuildSupport.getBuild(payaraMicro.getPath());
        build.bundlePayaraMicro(artifact => {
        });
    }

    public async refreshMicroList(): Promise<void> {
        vscode.commands.executeCommand('payara.micro.refresh.all');
    }

    private async shouldResume(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

}
