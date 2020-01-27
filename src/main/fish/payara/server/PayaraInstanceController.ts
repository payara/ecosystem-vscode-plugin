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

import * as vscode from 'vscode';
import * as _ from "lodash";
import * as path from "path";
import * as open from "open";
import * as fs from "fs";
import * as fse from "fs-extra";
import * as cp from 'child_process';
import * as ui from "./../../../UI";
import { PayaraInstanceProvider } from "./PayaraInstanceProvider";
import { PayaraServerInstance, InstanceState } from './PayaraServerInstance';
import { JvmConfigReader } from './start/JvmConfigReader';
import { JDKVersion } from './start/JDKVersion';
import { QuickPickItem, CancellationToken, Uri } from 'vscode';
import { JvmOption } from './start/JvmOption';
import { StringUtils } from './tooling/utils/StringUtils';
import { ServerUtils } from './tooling/utils/ServerUtils';
import { JavaUtils } from './tooling/utils/JavaUtils';
import { StartTask } from './start/StartTask';
import { ChildProcess } from 'child_process';
import { RestEndpoints } from './endpoints/RestEndpoints';
import { URL } from 'url';

export class PayaraInstanceController {

    constructor(private instanceProvider: PayaraInstanceProvider, private extensionPath: string) {
        this.init();
    }

    private async init(): Promise<void> {
        let instances: any = this.instanceProvider.readServerConfig();
        instances.forEach((instance: any) => {
            let payaraServer: PayaraServerInstance = new PayaraServerInstance(
                instance.name, instance.path, instance.domainName
            );
            this.instanceProvider.addServer(payaraServer);
            payaraServer.checkAliveStatusUsingJPS(() => {
                payaraServer.getOutputChannel().show(false);
                payaraServer.connectOutput();
                payaraServer.setStarted(true);
                this.refreshServerList();
            });
        });
        this.refreshServerList();
    }

    public async addServer(): Promise<void> {
        ui.MultiStepInput.run(
            input => this.selectServer(input,
                {},
                payaraServer => {
                    this.instanceProvider.addServer(payaraServer);
                    this.refreshServerList();
                    payaraServer.checkAliveStatusUsingJPS(() => {
                        payaraServer.setStarted(true);
                        this.refreshServerList();
                        payaraServer.connectOutput();
                    });
                })
        );
    }

    public async startServer(payaraServer: PayaraServerInstance, debug: boolean): Promise<void> {
        let process: ChildProcess = new StartTask().startServer(payaraServer, debug);
        if (process.pid) {
            payaraServer.setDebug(debug);
            payaraServer.setState(InstanceState.LODING);
            this.refreshServerList();
            payaraServer.getOutputChannel().show(false);
            let logCallback = (data: string | Buffer): void => payaraServer.getOutputChannel().append(data.toString());
            if (process.stdout !== null) {
                process.stdout.on('data', logCallback);
            }
            if (process.stderr !== null) {
                process.stderr.on('data', logCallback);
            }
            process.on('error', (err: Error) => {
                console.log('error: ' + err.message);
            });
            process.on('exit', (code: number) => {
                if (!payaraServer.isRestarting()) {
                    payaraServer.setStarted(false);
                    this.refreshServerList();
                }
            });
            payaraServer.checkAliveStatusUsingRest(
                async () => {
                    payaraServer.setStarted(true);
                    this.refreshServerList();
                },
                async () => {
                    payaraServer.setStarted(false);
                    this.refreshServerList();
                    vscode.window.showErrorMessage('Unable to start the Payara Server.');
                });
        }
    }

    public async restartServer(payaraServer: PayaraServerInstance): Promise<void> {
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        endpoints.invoke("restart-domain", async (res) => {
            if (res.statusCode === 200) {
                payaraServer.connectOutput();
                payaraServer.setState(InstanceState.RESTARTING);
                this.refreshServerList();
                payaraServer.getOutputChannel().show(false);
                payaraServer.checkAliveStatusUsingRest(
                    async () => {
                        payaraServer.setStarted(true);
                        this.refreshServerList();
                        payaraServer.connectOutput();
                    },
                    async () => {
                        payaraServer.setStarted(false);
                        this.refreshServerList();
                        vscode.window.showErrorMessage('Unable to restart the Payara Server.');
                    }
                );
                payaraServer.checkAliveStatusUsingJPS(
                    async () => {
                        payaraServer.connectOutput();
                    }
                );
            } else {
                vscode.window.showErrorMessage('Unable to restart the Payara Server.');
            }
        });
    }

    public async stopServer(payaraServer: PayaraServerInstance): Promise<void> {
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        endpoints.invoke("stop-domain", async res => {
            if (res.statusCode === 200) {
                payaraServer.setStarted(false);
                await new Promise(res => setTimeout(res, 2000));
                this.refreshServerList();
                payaraServer.disconnectOutput();
            }
        });
    }


    public async renameServer(payaraServer: PayaraServerInstance): Promise<void> {
        if (payaraServer) {
            await vscode.window.showInputBox({
                value: payaraServer.getName(),
                prompt: 'Enter a unique name for the server',
                placeHolder: 'Payara Server name',
                validateInput: name => this.validateName(name, this.instanceProvider)
            }).then(newName => {
                if (newName) {
                    payaraServer.setName(newName);
                    this.instanceProvider.updateServerConfig();
                    this.refreshServerList();
                }
            });
        }
    }

    public async removeServer(payaraServer: PayaraServerInstance): Promise<void> {
        this.instanceProvider.removeServer(payaraServer);
        this.refreshServerList();
        payaraServer.dispose();
    }

    public async openConsole(payaraServer: PayaraServerInstance): Promise<void> {
        open(new URL("http://localhost:" + payaraServer.getAdminPort()).toString());
    }

    public async openLog(payaraServer: PayaraServerInstance): Promise<void> {
        payaraServer.getOutputChannel().show(false);
        payaraServer.showLog();
        payaraServer.connectOutput();
    }

    public async openConfig(payaraServer: PayaraServerInstance): Promise<void> {
        let domainXml = Uri.parse("file:" + payaraServer.getDomainXmlPath());
        vscode.workspace.openTextDocument(domainXml)
            .then(doc => vscode.window.showTextDocument(doc));
    }

    public async refreshServerList(): Promise<void> {
        vscode.commands.executeCommand('payara.server.refresh');
    }

    private async selectServer(input: ui.MultiStepInput, state: Partial<State>, callback: (n: PayaraServerInstance) => any) {

        const fileUris = await vscode.window.showOpenDialog({
            defaultUri: vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined,
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Payara Server'
        });
        const serverPaths: vscode.Uri[] = fileUris ? fileUris : [] as vscode.Uri[];
        if (_.isEmpty(serverPaths)
            || !serverPaths[0].fsPath
            || !this.isValidServerPath(serverPaths[0].fsPath)) {
            vscode.window.showErrorMessage("Selected Payara Server path is invalid.");
        }
        let serverPath: string = serverPaths[0].fsPath;
        let domainsDir: string = path.join(serverPath, 'glassfish', 'domains');
        const domains: QuickPickItem[] = fse.readdirSync(domainsDir).map(label => ({ label }));

        state.path = serverPath;
        state.domains = domains;
        return (input: ui.MultiStepInput) => this.selectDomain(input, state, callback);
    }

    async selectDomain(input: ui.MultiStepInput, state: Partial<State>, callback: (n: PayaraServerInstance) => any) {
        const title = 'Register Payara Server';
        const pick = await input.showQuickPick({
            title,
            step: 2,
            totalSteps: 3,
            placeholder: 'Select an existing domain.',
            items: state.domains ? state.domains : [],
            activeItem: typeof state.domain !== 'string' ? state.domain : undefined,
            // buttons: [createDomainButton],
            shouldResume: this.shouldResume
        });
        if (pick instanceof ui.MyButton) {
            return (input: ui.MultiStepInput) => this.createDomain(input, state, callback);
        }

        state.domain = pick.label;
        return (input: ui.MultiStepInput) => this.serverName(input, state, callback);
    }

    async serverName(input: ui.MultiStepInput, state: Partial<State>, callback: (n: PayaraServerInstance) => any) {
        const title = 'Register Payara Server';
        let serverPath: string = state.path ? state.path : '';
        let defaultServerName: string = path.basename(serverPath);
        state.name = await input.showInputBox({
            title: title,
            step: 3,
            totalSteps: 3,
            value: state.name || defaultServerName,
            prompt: 'Enter a unique name for the server',
            placeHolder: 'Payara Server name',
            validate: name => this.validateName(name, this.instanceProvider),
            shouldResume: this.shouldResume
        });

        let serverName: string = state.name ? state.name : defaultServerName;
        let domainName: string = state.domain ? state.domain : 'domain1';
        let payaraServerInstance: PayaraServerInstance = new PayaraServerInstance(serverName, serverPath, domainName);
        callback(payaraServerInstance);
    }

    async validateName(name: string, instanceProvider: PayaraInstanceProvider): Promise<string | undefined> {
        if (_.isEmpty(name)) {
            return 'Server name cannot be empty';
        } else if (instanceProvider.getServerByName(name)) {
            return 'Payar Server already exist with the given name, please re-enter';
        }
        return undefined;
    }

    async createDomain(input: ui.MultiStepInput, state: Partial<State>, callback: (n: PayaraServerInstance) => any) {
        const title = 'Register Payara Server';
        // state.domain = await input.showInputBox({  });
        return (input: ui.MultiStepInput) => this.serverName(input, state, callback);
    }

    isValidServerPath(serverPath: string): boolean {
        const payaraApiExists: boolean = fse.pathExistsSync(path.join(serverPath, 'glassfish', 'bin', 'asadmin'));
        const asadminFileExists: boolean = fse.pathExistsSync(path.join(serverPath, 'bin', 'asadmin'));
        return payaraApiExists && asadminFileExists;
    }

    async shouldResume(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

}

interface State {
    title: string;
    step: number;
    totalSteps: number;
    path: string;
    domains: QuickPickItem[];
    domain: string;
    name: string;
}
