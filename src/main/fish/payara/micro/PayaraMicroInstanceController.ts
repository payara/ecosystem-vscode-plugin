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

import * as _ from "lodash";
import * as open from "open";
import * as vscode from 'vscode';
import { workspace, DebugConfiguration } from 'vscode';
import { DebugManager } from '../project/DebugManager';
import { InstanceState, PayaraMicroInstance } from './PayaraMicroInstance';
import { PayaraMicroInstanceProvider } from './PayaraMicroInstanceProvider';
import { PayaraInstanceController } from "../common/PayaraInstanceController";

export class PayaraMicroInstanceController extends PayaraInstanceController {

    constructor(
        context: vscode.ExtensionContext,
        private instanceProvider: PayaraMicroInstanceProvider,
        private extensionPath: string) {
        super(context);
    }

    public async startMicro(payaraMicro: PayaraMicroInstance, debug: boolean, callback?: (status: boolean) => any): Promise<void> {
        if (!payaraMicro.isStopped()) {
            vscode.window.showErrorMessage('Payara Micro instance already running.');
            return;
        }
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(payaraMicro.getPath());

        let debugConfig: DebugConfiguration | undefined;
        if (debug && workspaceFolder) {
            let debugManager: DebugManager = new DebugManager();
            debugConfig = debugManager.getPayaraConfig(workspaceFolder, debugManager.getDefaultMicroConfig());
        }
        try {
            payaraMicro.setDebug(debug);
            await payaraMicro.setState(InstanceState.LOADING);
            let process = payaraMicro.getBuild()
                .startPayaraMicro(debugConfig,
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
                    async (code) => {
                        await payaraMicro.setState(InstanceState.STOPPED);
                        if (code !== 0) {
                            console.warn(`startMicro task failed with exit code ${code}`);
                        }
                    },
                    async (error) => {
                        vscode.window.showErrorMessage(`Error on executing startMicro task: ${error.message}`);
                        await payaraMicro.setState(InstanceState.STOPPED);
                    }
                );
            if (process) {
                payaraMicro.setProcess(process);
            } else {
                await payaraMicro.setState(InstanceState.STOPPED);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error on executing startMicro task: ${error.message}`);
            await payaraMicro.setState(InstanceState.STOPPED);
        }
    }

    private parseApplicationUrl(data: string, payaraMicro: PayaraMicroInstance): boolean {
        let urlIndex = data.indexOf("Payara Micro URLs:");
        if (urlIndex > -1) {
            let lines = data.substring(urlIndex).split('\n');
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
        try {
            await payaraMicro.setState(InstanceState.LOADING);
            let process = payaraMicro
                .getBuild()
                .reloadPayaraMicro(
                    async (code: number) => {
                        await payaraMicro.setState(InstanceState.RUNNING);
                        if (code !== 0) {
                            vscode.window.showErrorMessage(`reloadMicro task failed with exit code ${code}`);
                        }
                    },
                    async (error: { message: any; }) => {
                        vscode.window.showErrorMessage(`Error on executing reloadMicro task: ${error.message}`);
                        await payaraMicro.setState(InstanceState.RUNNING);
                    }
                );
            if (!process) {
                await payaraMicro.setState(InstanceState.RUNNING);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error on executing reloadMicro task: ${error.message}`);
            await payaraMicro.setState(InstanceState.RUNNING);
        }
    }

    public async stopMicro(payaraMicro: PayaraMicroInstance): Promise<void> {
        if (payaraMicro.isStopped()) {
            vscode.window.showErrorMessage('Payara Micro instance not running.');
            return;
        }
        try {
            payaraMicro
                .getBuild()
                .stopPayaraMicro(
                    async (code: number) => {
                        payaraMicro.setDebug(false);
                        await payaraMicro.setState(InstanceState.STOPPED);
                        if (code !== 0) {
                            vscode.window.showErrorMessage(`stopMicro task failed with exit code ${code}`);
                        }
                    },
                    async (error: { message: any; }) => {
                        vscode.window.showErrorMessage(`Error on executing stopMicro task: ${error.message}`);
                        payaraMicro.setDebug(false);
                        await payaraMicro.setState(InstanceState.STOPPED);
                    }
                );
        } catch (error) {
            vscode.window.showErrorMessage(`Error on executing stopMicro task: ${error.message}`);
        }
    }

    public async bundleMicro(payaraMicro: PayaraMicroInstance): Promise<void> {
        try {
            payaraMicro
                .getBuild()
                .bundlePayaraMicro(
                    (code: number) => {
                        if (code !== 0) {
                            vscode.window.showErrorMessage(`bundleMicro task failed with exit code ${code}`);
                        }
                    }, (error: { message: any; }) => {
                        vscode.window.showErrorMessage(`Error on executing bundleMicro task: ${error.message}`);
                    }
                );
        } catch (error) {
            vscode.window.showErrorMessage(`Error on executing bundleMicro task: ${error.message}`);
        }
    }

    public async refreshMicroList(): Promise<void> {
        vscode.commands.executeCommand('payara.micro.refresh.all');
    }

    updateConfig(): void {
    }

}
