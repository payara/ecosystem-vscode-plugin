'use strict';

/*
 *
 * Copyright (c) 2020 Payara Foundation and/or its affiliates. All rights reserved.
 *
 * The contents of this file are subject to the terms of either the GNU
 * General Public License Version 2 only ("GPL") or the Common Development
 * and Distribution License("CDDL") (collectively, the "License").  You
 * may not use this file except in compliance with the License.  You can
 * obtain a copy of the License at
 * https://github.com/payara/Payara/blob/master/LICENSE.txt
 * See the License for the specific
 * language governing permissions and limitations under the License.
 *
 * When distributing the software, include this License Header Notice in each
 * file and include the License file at glassfish/legal/LICENSE.txt.
 *
 * GPL Classpath Exception:
 * The Payara Foundation designates this particular file as subject to the "Classpath"
 * exception as provided by the Payara Foundation in the GPL Version 2 section of the License
 * file that accompanied this code.
 *
 * Modifications:
 * If applicable, add the following below the License Header, with the fields
 * enclosed by brackets [] replaced by your own identifying information:
 * "Portions Copyright [year] [name of copyright owner]"
 *
 * Contributor(s):
 * If you wish your version of this file to be governed by only the CDDL or
 * only the GPL Version 2, indicate your decision by adding "[Contributor]
 * elects to include this software in this distribution under the [CDDL or GPL
 * Version 2] license."  If you don't indicate a single choice of license, a
 * recipient has the option to distribute your version of this file under
 * either the CDDL, the GPL Version 2 or to extend the choice of license to
 * its licensees as provided above.  However, if you add GPL Version 2 code
 * and therefore, elected the GPL Version 2 license, then the option applies
 * only if the new code is made subject to such option by the copyright
 * holder.
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
            placeholder: 'Select a exisitng domain',
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