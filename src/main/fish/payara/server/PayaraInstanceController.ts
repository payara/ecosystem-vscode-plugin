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
import * as fse from "fs-extra";
import * as ui from "./../../../UI";
import { PayaraInstanceProvider } from "./PayaraInstanceProvider";
import { PayaraServerInstance } from './PayaraServerInstance';
import { QuickPickItem, CancellationToken } from 'vscode';

export class PayaraInstanceController {

    private outputChannel: vscode.OutputChannel;

    constructor(private instanceProvider: PayaraInstanceProvider, private extensionPath: string) {
        this.outputChannel = vscode.window.createOutputChannel('payara');
        this.init();
    }

    private async init(): Promise<void> {
        let instances = this.instanceProvider.readServerConfig();
        instances.forEach((instance: any) => {
            let payaraServerInstance: PayaraServerInstance = new PayaraServerInstance(
                instance.name, instance.path, instance.domainName
            );
            this.instanceProvider.addServer(payaraServerInstance);
        });
        this.refreshServerList();
    }

    public async addServer(): Promise<void> {
        ui.MultiStepInput.run(
            input => this.selectServer(input, {
            })
        );
    }

    public async removeServer(payaraServer: PayaraServerInstance): Promise<void> {
        this.instanceProvider.removeServer(payaraServer);
        this.refreshServerList();
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

    public async refreshServerList(): Promise<void> {
        vscode.commands.executeCommand('payara.server.refresh');
    }

    private async selectServer(input: ui.MultiStepInput, state: Partial<State>) {

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
        return (input: ui.MultiStepInput) => this.selectDomain(input, state);
    }

    async selectDomain(input: ui.MultiStepInput, state: Partial<State>) {
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
            return (input: ui.MultiStepInput) => this.createDomain(input, state);
        }

        state.domain = pick.label;
        return (input: ui.MultiStepInput) => this.serverName(input, state);
    }

    async serverName(input: ui.MultiStepInput, state: Partial<State>) {
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
        this.instanceProvider.addServer(payaraServerInstance);
        this.refreshServerList();
    }

    async validateName(name: string, instanceProvider: PayaraInstanceProvider): Promise<string | undefined> {
        if (_.isEmpty(name)) {
            return 'Server name cannot be empty';
        } else if (instanceProvider.getServerByName(name)) {
            return 'Payar Server already exist with the given name, please re-enter';
        }
        return undefined;
    }

    async createDomain(input: ui.MultiStepInput, state: Partial<State>) {
        const title = 'Register Payara Server';
        // state.domain = await input.showInputBox({  });
        return (input: ui.MultiStepInput) => this.serverName(input, state);
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