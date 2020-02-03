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
import * as tmp from "tmp";
import * as fse from "fs-extra";
import * as cp from 'child_process';
import * as isPort from 'validator/lib/isPort';
import * as ui from "./../../../UI";
import { PayaraInstanceProvider } from "./PayaraInstanceProvider";
import { PayaraServerInstance, InstanceState } from './PayaraServerInstance';
import { JvmConfigReader } from './start/JvmConfigReader';
import { JDKVersion } from './start/JDKVersion';
import { QuickPickItem, CancellationToken, Uri, OutputChannel } from 'vscode';
import { JvmOption } from './start/JvmOption';
import { StringUtils } from './tooling/utils/StringUtils';
import { ServerUtils } from './tooling/utils/ServerUtils';
import { JavaUtils } from './tooling/utils/JavaUtils';
import { StartTask } from './start/StartTask';
import { ChildProcess } from 'child_process';
import { RestEndpoints } from './endpoints/RestEndpoints';
import { URL } from 'url';
import { MyButton } from './../../../UI';
import { FileResult } from 'tmp';

export class PayaraInstanceController {

    private outputChannel: OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
        private instanceProvider: PayaraInstanceProvider,
        private extensionPath: string) {
        this.init();
        this.outputChannel = vscode.window.createOutputChannel("payara");
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
        let controller = this;
        ui.MultiStepInput.run(
            input => this.selectServer(input,
                {},
                state => {
                    if (!state.name) {
                        vscode.window.showErrorMessage('server name is invalid');
                    } else if (!state.path) {
                        vscode.window.showErrorMessage('selected server path is invalid');
                    } else if (!state.domainName) {
                        vscode.window.showErrorMessage('domain name is invalid');
                    } else {
                        let serverName = state.name;
                        let serverPath = state.path;
                        let domainName = state.domainName;

                        let registerServer = () => {
                            let payaraServer = new PayaraServerInstance(serverName, serverPath, domainName);
                            this.instanceProvider.addServer(payaraServer);
                            this.refreshServerList();
                            payaraServer.checkAliveStatusUsingJPS(() => {
                                payaraServer.setStarted(true);
                                this.refreshServerList();
                                payaraServer.connectOutput();
                            });
                        };
                        if (state.newDomain) {
                            controller.createDomain(
                                registerServer,
                                serverName,
                                serverPath,
                                domainName,
                                state.adminPort,
                                state.httpPort,
                                state.username,
                                state.password
                            );
                        } else {
                            registerServer();
                        }
                    }
                })
        );
    }

    private DEFAULT_USERNAME: string = 'admin';
    private DEFAULT_PASSWORD: string = '';
    private MASTER_PASSWORD: string = 'changeit';
    private DEFAULT_ADMIN_PORT: string = '4848';
    private DEFAULT_HTTP_PORT: string = '8080';

    private async createDomain(
        callback: () => any,
        serverName: string,
        serverPath: string,
        domainName: string,
        adminPort?: string,
        instancePort?: string,
        username?: string,
        password?: string) {

        let passwordFile: FileResult;
        if (!adminPort) {
            adminPort = this.DEFAULT_ADMIN_PORT;
        }
        if (!instancePort) {
            instancePort = this.DEFAULT_HTTP_PORT;
        }
        if (!username) {
            username = this.DEFAULT_USERNAME;
        }
        if (!password) {
            password = this.DEFAULT_PASSWORD;
        }
        let javaHome: string | undefined = JDKVersion.getDefaultJDKHome();
        if (!javaHome) {
            throw new Error("Java home path not found.");
        }
        let javaVmExe: string = JavaUtils.javaVmExecutableFullPath(javaHome);
        let args: Array<string> = new Array<string>();
        args.push("-client");
        args.push("-jar");
        args.push(path.join(serverPath, "glassfish", "modules", "admin-cli.jar"));
        args.push("create-domain");
        args.push("--user");
        args.push(username);
        if (password === '') {
            args.push("--nopassword");
        } else {
            passwordFile = this.createTempPasswordFile(password);
            args.push("--passwordfile");
            args.push(passwordFile.name);
        }
        args.push("--domaindir");
        args.push(path.join(serverPath, "glassfish", "domains"));
        args.push("--adminport");
        args.push(adminPort);
        args.push("--instanceport");
        args.push(instancePort);
        args.push(domainName);
        let process: ChildProcess = cp.spawn(javaVmExe, args, { cwd: serverPath });
        if (process.pid) {
            this.outputChannel.show(false);
            this.outputChannel.append('Running the create-domain asadmin command ... \n');
            let logCallback = (data: string | Buffer): void => this.outputChannel.append(data.toString());
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
                if (code === 0) {
                    callback();
                } else {
                    vscode.window.showErrorMessage('Command create-domain execution failed.');
                }
                if (passwordFile) {
                    passwordFile.removeCallback();
                }
            });
        }
    }

    private createTempPasswordFile(password: string): FileResult {
        var tmpFile = tmp.fileSync({ prefix: 'payara-password-', postfix: '.txt' });
        console.log('File: ', tmpFile.name);
        let content = "AS_ADMIN_ADMINPASSWORD=" + password + '\n'; // to create domain
        content += "AS_ADMIN_PASSWORD=" + password + '\n'; // to start domain
        content += "AS_ADMIN_MASTERPASSWORD=" + this.MASTER_PASSWORD;
        if (fs.existsSync(tmpFile.name)) {
            fs.writeFileSync(tmpFile.name, content);
        }
        return tmpFile;
    }

    private async selectServer(input: ui.MultiStepInput, state: Partial<State>, callback: (n: Partial<State>) => any) {

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
        state.path = serverPaths[0].fsPath;
        return (input: ui.MultiStepInput) => this.serverName(input, state, callback);
    }

    private async serverName(input: ui.MultiStepInput, state: Partial<State>, callback: (n: Partial<State>) => any) {
        const title = 'Register Payara Server';
        let serverPath: string = state.path ? state.path : '';
        let defaultServerName: string = path.basename(serverPath);
        let serverName = await input.showInputBox({
            title: title,
            step: 2,
            totalSteps: 3,
            value: state.name || defaultServerName,
            prompt: 'Enter a unique name for the server',
            placeHolder: 'Payara Server name',
            validate: name => this.validateServerName(name, this.instanceProvider),
            shouldResume: this.shouldResume
        });

        state.name = serverName ? serverName : defaultServerName;
        return (input: ui.MultiStepInput) => this.selectDomain(input, state, callback);
    }

    private async selectDomain(input: ui.MultiStepInput, state: Partial<State>, callback: (n: Partial<State>) => any) {
        if (!state.path) {
            return;
        }
        let domainsDir: Array<string> = fse.readdirSync(
            path.join(state.path, 'glassfish', 'domains')
        );
        state.domains = domainsDir.map(label => ({ label }));

        const createDomainButton = new MyButton({
            dark: Uri.file(this.context.asAbsolutePath('resources/theme/dark/add.svg')),
            light: Uri.file(this.context.asAbsolutePath('resources/theme/light/add.svg')),
        }, 'Create new Payara Server Domain');
        const pick = await input.showQuickPick({
            title: 'Register Payara Server',
            step: 3,
            totalSteps: 3,
            placeholder: 'Select an existing domain.',
            items: state.domains ? state.domains : [],
            activeItem: typeof state.domainName !== 'string' ? state.domainName : undefined,
            buttons: [createDomainButton],
            shouldResume: this.shouldResume
        });
        if (pick instanceof ui.MyButton) {
            return (input: ui.MultiStepInput) => this.domainRegistration(input, state, domainsDir, callback);
        }

        state.domainName = pick.label;
        callback(state);
    }

    private async validateServerName(name: string, instanceProvider: PayaraInstanceProvider): Promise<string | undefined> {
        if (_.isEmpty(name)) {
            return 'Server name cannot be empty';
        } else if (instanceProvider.getServerByName(name)) {
            return 'Payara Server already exist with the given name, please re-enter';
        }
        return undefined;
    }

    private async validateDomainName(name: string, existingDomainsDir: Array<string>): Promise<string | undefined> {
        if (_.isEmpty(name)) {
            return 'Domain name cannot be empty.';
        } else if (!/[a-zA-Z0-9_-]+$/.test(name)) {
            return 'Please enter the valid Domain name.';
        } else if (existingDomainsDir.indexOf(name) > -1) {
            return 'Domain already exist, please enter the unique name.';
        }
        return undefined;
    }

    private async validateUserName(name: string): Promise<string | undefined> {
        if (_.isEmpty(name)) {
            return 'Username cannot be empty.';
        }
        return undefined;
    }

    private async validatePort(port: string): Promise<string | undefined> {
        if (!isPort.default(port)) {
            return 'Please enter the valid port number.';
        }
        return undefined;
    }

    private async domainRegistration(input: ui.MultiStepInput, state: Partial<State>, existingDomainsDir: Array<string>, callback: (n: Partial<State>) => any) {
        let step: number = 4;
        let totalSteps: number = 6;
        let serverPath: string = state.path ? state.path : '';
        let defaultServerName: string = path.basename(serverPath);
        let domainName = await input.showInputBox({
            title: 'Domain name',
            step: step,
            totalSteps: totalSteps,
            value: '',
            prompt: 'Enter the new domain name',
            placeHolder: 'Payara Server domain name',
            validate: value => this.validateDomainName(value, existingDomainsDir),
            shouldResume: this.shouldResume
        });

        state.domainName = domainName;
        state.newDomain = true;

        let decision = await input.showQuickPick({
            title: 'Use Default ports?',
            step: ++step,
            totalSteps: totalSteps,
            placeholder: 'Default admin port (4848) and http port (8080)',
            items: [{ label: 'Yes' }, { label: 'No' }],
            activeItem: { label: 'Yes' },
            shouldResume: this.shouldResume
        });
        if (decision.label === 'No') {
            totalSteps += 2;
            let adminPort = await input.showInputBox({
                title: 'Admin Port',
                step: ++step,
                totalSteps: totalSteps,
                value: '4848',
                prompt: 'Enter the admin port',
                placeHolder: 'Enter the admin port 4848',
                validate: value => this.validatePort(value),
                shouldResume: this.shouldResume
            });
            let httpPort = await input.showInputBox({
                title: 'Http Port',
                step: ++step,
                totalSteps: totalSteps,
                value: '8080',
                prompt: 'Enter the http port',
                placeHolder: 'Enter the http port 8080',
                validate: value => this.validatePort(value),
                shouldResume: this.shouldResume
            });
            state.adminPort = adminPort;
            state.httpPort = httpPort;
        }

        decision = await input.showQuickPick({
            title: 'Use Default credentials?',
            step: ++step,
            totalSteps: totalSteps,
            placeholder: 'Default username (admin) and password (empty)',
            items: [{ label: 'Yes' }, { label: 'No' }],
            activeItem: { label: 'Yes' },
            shouldResume: this.shouldResume
        });
        if (decision.label === 'Yes') {
            callback(state);
        } else {
            totalSteps += 2;
            state.username = await input.showInputBox({
                title: 'Username',
                step: ++step,
                totalSteps: totalSteps,
                value: 'admin',
                prompt: 'Enter the username',
                placeHolder: 'Enter the username e.g admin',
                validate: (value: string) => this.validateUserName(value),
                shouldResume: this.shouldResume
            });
            const passwordBox = vscode.window.createInputBox();
            passwordBox.title = 'Password';
            passwordBox.step = ++step;
            passwordBox.totalSteps = totalSteps;
            passwordBox.value = '';
            passwordBox.prompt = 'Enter the password';
            passwordBox.placeholder = 'Enter the password';
            passwordBox.password = true;
            passwordBox.show();
            passwordBox.onDidAccept(async () => {
                state.password = passwordBox.value;
                callback(state);
            });
        }
    }

    private isValidServerPath(serverPath: string): boolean {
        const payaraApiExists: boolean = fse.pathExistsSync(path.join(serverPath, 'glassfish', 'bin', 'asadmin'));
        const asadminFileExists: boolean = fse.pathExistsSync(path.join(serverPath, 'bin', 'asadmin'));
        return payaraApiExists && asadminFileExists;
    }

    public async startServer(payaraServer: PayaraServerInstance, debug: boolean): Promise<void> {
        if (!payaraServer.isStopped()) {
            vscode.window.showErrorMessage('Payara Server instance already running.');
            return;
        }
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
        if (payaraServer.isStopped()) {
            vscode.window.showErrorMessage('Payara Server instance not running.');
            return;
        }
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
        if (payaraServer.isStopped()) {
            vscode.window.showErrorMessage('Payara Server instance not running.');
            return;
        }
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
                validateInput: name => this.validateServerName(name, this.instanceProvider)
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
    domainName: string;
    newDomain: boolean;
    adminPort: string;
    httpPort: string;
    username: string;
    password: string;
    name: string;
}
