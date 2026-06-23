'use strict';

/*
 * Copyright (c) 2026 Payara Foundation and/or its affiliates and others.
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
import * as vscode from 'vscode';
import { DebugConfiguration } from 'vscode';
import { PayaraInstanceController } from "../../common/PayaraInstanceController";
import { DebugManager } from '../../project/DebugManager';
import { InstanceState, PayaraServerMavenInstance } from "./PayaraServerMavenInstance";
import { PayaraServerMavenInstanceProvider } from './PayaraServerMavenInstanceProvider';

export class PayaraServerMavenInstanceController extends PayaraInstanceController {

    constructor(
        context: vscode.ExtensionContext,
        private instanceProvider: PayaraServerMavenInstanceProvider,
        private extensionPath: string) {
        super(context);
    }

    public async startServerMaven(payaraServerMaven: PayaraServerMavenInstance, debug: boolean, callback?: (status: boolean) => any): Promise<void> {
        if (!payaraServerMaven.isStopped()) {
            vscode.window.showErrorMessage('Payara Server Maven instance already running.');
            return;
        }
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(payaraServerMaven.getPath());

        let debugConfig: DebugConfiguration | undefined;
        if (debug && workspaceFolder) {
            let debugManager: DebugManager = new DebugManager();
            debugConfig = debugManager.getPayaraConfig(workspaceFolder, debugManager.getDefaultServerMavenConfig());
        }
        try {
            payaraServerMaven.setDebug(debug);
            await payaraServerMaven.setState(InstanceState.LOADING);
            let process = payaraServerMaven.getBuild()
                .startPayaraServerMaven(debugConfig,
                    async data => {
                        if (!payaraServerMaven.isStarted()) {
                            if (debugConfig && data.indexOf("Listening for transport dt_socket at address:") > -1) {
                                vscode.debug.startDebugging(workspaceFolder, debugConfig);
                                debugConfig = undefined;
                            }
                            if (data.indexOf("application deployed successfully") > -1) {
                                await payaraServerMaven.setState(InstanceState.RUNNING);
                            }
                        }
                    },
                    async (code) => {
                        await payaraServerMaven.setState(InstanceState.STOPPED);
                        if (code !== 0) {
                            console.warn(`startServerMaven task failed with exit code ${code}`);
                        }
                    },
                    async (error) => {
                        vscode.window.showErrorMessage(`Error on executing startServerMaven task: ${error.message}`);
                        await payaraServerMaven.setState(InstanceState.STOPPED);
                    }
                );
            if (process) {
                payaraServerMaven.setProcess(process);
            } else {
                await payaraServerMaven.setState(InstanceState.STOPPED);
            }
        } catch (error) {
            vscode.window.showErrorMessage("Error on executing startServerMaven task:" + ((error instanceof Error) ? error.message : error));
            await payaraServerMaven.setState(InstanceState.STOPPED);
        }
    }

    public async devServerMaven(payaraServerMaven: PayaraServerMavenInstance, debug: boolean = false, callback?: (status: boolean) => any): Promise<void> {
        if (!payaraServerMaven.isStopped()) {
            vscode.window.showErrorMessage('Payara Server Maven instance already running.');
            return;
        }
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(payaraServerMaven.getPath());

        let debugConfig: DebugConfiguration | undefined;
        if (debug && workspaceFolder) {
            let debugManager: DebugManager = new DebugManager();
            debugConfig = debugManager.getPayaraConfig(workspaceFolder, debugManager.getDefaultServerMavenConfig());
        }
        try {
            payaraServerMaven.setDebug(debug);
            await payaraServerMaven.setState(InstanceState.LOADING);
            let process = payaraServerMaven.getBuild()
                .devPayaraServerMaven(
                    debugConfig,
                    async data => {
                        if (!payaraServerMaven.isStarted()) {
                            if (debugConfig && data.indexOf("Listening for transport dt_socket at address:") > -1) {
                                vscode.debug.startDebugging(workspaceFolder, debugConfig);
                                debugConfig = undefined;
                            }
                            if (data.indexOf("application deployed successfully") > -1) {
                                await payaraServerMaven.setState(InstanceState.RUNNING);
                            }
                        }
                    },
                    async (code) => {
                        await payaraServerMaven.setState(InstanceState.STOPPED);
                        if (code !== 0) {
                            console.warn(`devServerMaven task failed with exit code ${code}`);
                        }
                    },
                    async (error) => {
                        vscode.window.showErrorMessage(`Error on executing devServerMaven task: ${error.message}`);
                        await payaraServerMaven.setState(InstanceState.STOPPED);
                    }
                );
            if (process) {
                payaraServerMaven.setProcess(process);
            } else {
                await payaraServerMaven.setState(InstanceState.STOPPED);
            }
        } catch (error) {
            vscode.window.showErrorMessage("Error on executing devServerMaven task:" + ((error instanceof Error) ? error.message : error));
            await payaraServerMaven.setState(InstanceState.STOPPED);
        }
    }

    public async stopServerMaven(payaraServerMaven: PayaraServerMavenInstance): Promise<void> {
        if (payaraServerMaven.isStopped()) {
            vscode.window.showErrorMessage('Payara Server Maven instance not running.');
            return;
        }
        const process = payaraServerMaven.getProcess();
        if (!process || !process.pid) {
            vscode.window.showErrorMessage('No running Payara Server Maven process found.');
            return;
        }
        try {
            payaraServerMaven.getBuild()
                .stopPayaraServerMaven(
                    process.pid,
                    async (code: number) => {
                        payaraServerMaven.setDebug(false);
                        await payaraServerMaven.setState(InstanceState.STOPPED);
                        if (code !== 0) {
                            vscode.window.showErrorMessage(`stopServerMaven task failed with exit code ${code}`);
                        }
                    },
                    async (error: { message: any; }) => {
                        vscode.window.showErrorMessage(`Error on executing stopServerMaven task: ${error.message}`);
                        payaraServerMaven.setDebug(false);
                        await payaraServerMaven.setState(InstanceState.STOPPED);
                    }
                );
        } catch (error) {
            vscode.window.showErrorMessage("Error on executing stopServerMaven task:" + ((error instanceof Error) ? error.message : error));
        }
    }

    public async refreshServerMavenList(): Promise<void> {
        vscode.commands.executeCommand('payara.server.maven.refresh.all');
    }

    updateConfig(): void {
    }

}
