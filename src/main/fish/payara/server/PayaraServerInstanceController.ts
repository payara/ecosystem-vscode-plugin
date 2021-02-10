'use strict';

/*
 * Copyright (c) 2020-2021 Payara Foundation and/or its affiliates and others.
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

import * as cp from 'child_process';
import { ChildProcess } from 'child_process';
import * as fs from "fs";
import * as fse from "fs-extra";
import * as _ from "lodash";
import * as open from "open";
import * as path from "path";
import * as tmp from "tmp";
import { FileResult } from 'tmp';
import { URL } from 'url';
import * as isPort from 'validator/lib/isPort';
import * as vscode from 'vscode';
import { OpenDialogOptions, OutputChannel, QuickPickItem, Uri, DebugConfiguration } from 'vscode';
import { ApplicationInstance } from '../project/ApplicationInstance';
import { DeploymentSupport } from '../project/DeploymentSupport';
import * as ui from "../../../UI";
import { MyButton } from '../../../UI';
import { RestEndpoints } from './endpoints/RestEndpoints';
import { PayaraInstanceProvider } from "./PayaraInstanceProvider";
import { InstanceState, PayaraServerInstance } from './PayaraServerInstance';
import { JDKVersion } from './start/JDKVersion';
import { StartTask } from './start/StartTask';
import { JavaUtils } from './tooling/utils/JavaUtils';
import { ServerUtils } from './tooling/utils/ServerUtils';
import { ProjectOutputWindowProvider } from '../project/ProjectOutputWindowProvider';
import { RestEndpoint } from '../project/RestEndpoint';
import { PayaraInstanceController } from '../common/PayaraInstanceController';
import { PayaraRemoteServerInstance } from './PayaraRemoteServerInstance';
import { PayaraLocalServerInstance } from './PayaraLocalServerInstance';

export class PayaraServerInstanceController extends PayaraInstanceController {

    private deployments: Map<vscode.WorkspaceFolder, PayaraServerInstance> = new Map<vscode.WorkspaceFolder, PayaraServerInstance>();

    constructor(
        context: vscode.ExtensionContext,
        private instanceProvider: PayaraInstanceProvider,
        private extensionPath: string) {
        super(context);
        this.init();
    }

    public getPayaraServerInstance(workspace: vscode.WorkspaceFolder): PayaraServerInstance | undefined {
        return this.deployments.get(workspace);
    }

    private async init(): Promise<void> {
        this.instanceProvider.loadServerConfigs();
        this.refreshServerList();
    }

    public async addServer(): Promise<void> {
        let controller = this;
        let step = 0;
        let totalStep = 4;
        ui.MultiStepInput.run(
            input => this.selectServerType(step, totalStep, input,
                {},
                state => {
                    if (!state.name) {
                        vscode.window.showErrorMessage('server name is invalid');
                    } else if (!state.path && state.type === 'local') {
                        vscode.window.showErrorMessage('selected server path is invalid');
                    } else if (!state.domainName) {
                        vscode.window.showErrorMessage('domain name is invalid');
                    } else {
                        let serverName = state.name;
                        let serverPath = state.path ? state.path : '';
                        let domainName = state.domainName;

                        let registerServer = () => {
                            let payaraServer: PayaraServerInstance = state.type === 'local' ?
                                new PayaraLocalServerInstance(
                                    serverName, domainName, serverPath
                                ) :
                                new PayaraRemoteServerInstance(
                                    serverName, domainName
                                );
                            payaraServer.setUsername(state.username ? state.username.trim() : ServerUtils.DEFAULT_USERNAME);
                            payaraServer.setPassword(state.password ? state.password.trim() : ServerUtils.DEFAULT_PASSWORD);
                            this.refreshServerList();

                            if (payaraServer instanceof PayaraLocalServerInstance) {
                                payaraServer.checkAliveStatusUsingJPS(() => {
                                    payaraServer.connectOutput();
                                    payaraServer.setStarted(true);
                                    this.refreshServerList();
                                });
                            } else if (payaraServer instanceof PayaraRemoteServerInstance) {
                                payaraServer.setHost(state.host ? state.host.trim() : ServerUtils.DEFAULT_HOST);
                                payaraServer.setAdminPort(state.adminPort ? state.adminPort : ServerUtils.DEFAULT_ADMIN_PORT);
                                payaraServer.setHttpPort(state.httpPort ? state.httpPort : ServerUtils.DEFAULT_HTTP_PORT);
                                if (payaraServer.isConnectionAllowed()) {
                                    payaraServer.checkAliveStatusUsingRest(ServerUtils.DEFAULT_RETRY_COUNT,
                                        async () => {
                                            payaraServer.setStarted(true);
                                            payaraServer.connectOutput();
                                            this.refreshServerList();
                                            payaraServer.reloadApplications();
                                        },
                                        async (message?: string) => {
                                            payaraServer.setStarted(false);
                                            this.refreshServerList();
                                        }
                                    );
                                }
                            }
                            this.instanceProvider.addServer(payaraServer);
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

    private async createDomain(
        callback: () => any,
        serverName: string,
        serverPath: string,
        domainName: string,
        adminPort?: number,
        instancePort?: number,
        username?: string,
        password?: string) {

        let passwordFile: FileResult;
        if (!adminPort) {
            adminPort = ServerUtils.DEFAULT_ADMIN_PORT;
        }
        if (!instancePort) {
            instancePort = ServerUtils.DEFAULT_HTTP_PORT;
        }
        if (!username) {
            username = ServerUtils.DEFAULT_USERNAME;
        }
        if (!password) {
            password = ServerUtils.DEFAULT_PASSWORD;
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
        args.push("--user");
        args.push(username);
        if (password !== '') {
            passwordFile = this.createTempPasswordFile(password);
            args.push("--passwordfile");
            args.push(passwordFile.name);
        }
        args.push("create-domain");
        if (password === '') {
            args.push("--nopassword");
        }
        args.push("--domaindir");
        args.push(path.join(serverPath, "glassfish", "domains"));
        args.push("--adminport");
        args.push(String(adminPort));
        args.push("--instanceport");
        args.push(String(instancePort));
        args.push(domainName);
        let process: ChildProcess = cp.spawn(javaVmExe, args, { cwd: serverPath });
        if (process.pid) {
            let outputChannel = ProjectOutputWindowProvider.getInstance().get(serverName);
            outputChannel.show(false);
            outputChannel.append('Running the create-domain asadmin command ... \n');
            let logCallback = (data: string | Buffer): void => outputChannel.append(data.toString());
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
        content += "AS_ADMIN_MASTERPASSWORD=" + ServerUtils.MASTER_PASSWORD;
        if (fs.existsSync(tmpFile.name)) {
            fs.writeFileSync(tmpFile.name, content);
        }
        return tmpFile;
    }

    private async selectServerType(step: number, totalSteps: number, input: ui.MultiStepInput, state: Partial<State>, callback: (n: Partial<State>) => any) {
        let local = { label: 'Local Domain' };
        let remote = { label: 'Remote Domain' };
        const pick = await input.showQuickPick({
            title: 'Register Payara Server',
            step: ++step,
            totalSteps: totalSteps,
            placeholder: 'Select server instance type.',
            items: [local, remote],
            activeItem: local,
            shouldResume: this.shouldResume
        });

        if (pick === local) {
            state.type = 'local';
            return (input: ui.MultiStepInput) => this.selectServer(step, totalSteps, input, state, callback);
        } else {
            state.type = 'remote';
            totalSteps = 6;
            return (input: ui.MultiStepInput) => this.serverName(step, totalSteps, input, state, callback);
        }

    }

    private async selectServer(step: number, totalSteps: number, input: ui.MultiStepInput, state: Partial<State>, callback: (n: Partial<State>) => any) {
        ++step;
        let serverPath: string;
        let dialogOptions: OpenDialogOptions = ({
            defaultUri: vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined,
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Payara Server'
        });
        let getServerPaths = (serverPaths: vscode.Uri[]): string => {
            if (_.isEmpty(serverPaths)
                || !serverPaths[0].fsPath
                || !ServerUtils.isValidServerPath(serverPaths[0].fsPath)) {
                vscode.window.showErrorMessage("Selected Payara Server path is invalid.");
            }
            return serverPaths[0].fsPath;
        };
        const unlistedServers = this.instanceProvider
            .getUnlistedServers()
            .map(server => ({ label: server.getPath() }));

        if (unlistedServers.length > 0) {
            let browseServerButtonLabel = 'Browse the Payara Server...';
            const browseServerButton = new MyButton({
                dark: Uri.file(this.context.asAbsolutePath('resources/theme/dark/add.svg')),
                light: Uri.file(this.context.asAbsolutePath('resources/theme/light/add.svg')),
            }, browseServerButtonLabel);
            unlistedServers.push(({ label: browseServerButtonLabel }));
            let pick = await input.showQuickPick({
                title: 'Register Payara Server',
                step: step,
                totalSteps: totalSteps,
                placeholder: 'Select the Payara Server location',
                items: unlistedServers,
                buttons: [browseServerButton],
                shouldResume: this.shouldResume
            });

            if (pick instanceof ui.MyButton || pick.label === browseServerButtonLabel) {
                let fileUris = await vscode.window.showOpenDialog(dialogOptions);
                if (!fileUris) {
                    return;
                }
                serverPath = getServerPaths(fileUris);
            } else {
                serverPath = pick.label;
            }
        } else {
            let fileUris = await vscode.window.showOpenDialog(dialogOptions);
            if (!fileUris) {
                return;
            }
            serverPath = getServerPaths(fileUris);
        }

        state.path = serverPath;
        return (input: ui.MultiStepInput) => this.serverName(step, totalSteps, input, state, callback);
    }

    private async serverName(step: number, totalSteps: number, input: ui.MultiStepInput, state: Partial<State>, callback: (n: Partial<State>) => any) {
        const title = 'Register Payara Server';
        let serverPath: string = state.path ? state.path : '';
        let defaultServerName: string = path.basename(serverPath);
        let serverName = await input.showInputBox({
            title: title,
            step: ++step,
            totalSteps: totalSteps,
            value: state.name || defaultServerName,
            prompt: 'Enter a unique name for the server',
            placeHolder: 'Payara Server name',
            validate: name => this.validateServerName(name, this.instanceProvider),
            shouldResume: this.shouldResume
        });

        state.name = serverName ? serverName : defaultServerName;
        if (state.type === 'local') {
            return (input: ui.MultiStepInput) => this.selectDomain(step, totalSteps, input, state, callback);
        } else {
            return (input: ui.MultiStepInput) => this.domainRegistration(step, totalSteps, input, state, [], callback);
        }
    }

    private async selectDomain(step: number, totalSteps: number, input: ui.MultiStepInput, state: Partial<State>, callback: (n: Partial<State>) => any) {
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
            step: ++step,
            totalSteps: totalSteps,
            placeholder: 'Select an existing domain.',
            items: state.domains ? state.domains : [],
            activeItem: typeof state.domainName !== 'string' ? state.domainName : undefined,
            buttons: [createDomainButton],
            shouldResume: this.shouldResume
        });
        if (pick instanceof ui.MyButton) {
            return (input: ui.MultiStepInput) => this.domainRegistration(step, totalSteps, input, state, domainsDir, callback);
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
            return 'Domain already exist, please enter a unique name.';
        }
        return undefined;
    }

    private async validateUserName(name: string): Promise<string | undefined> {
        if (_.isEmpty(name.trim())) {
            return 'Username cannot be empty.';
        }
        return undefined;
    }

    private async validateHost(host: string): Promise<string | undefined> {
        if (_.isEmpty(host)) {
            return 'Please enter a valid host name.';
        }
        return undefined;
    }

    private async validatePort(port: string): Promise<string | undefined> {
        if (!isPort.default(port)) {
            return 'Please enter a valid port number.';
        }
        return undefined;
    }

    private async domainRegistration(step: number, totalSteps: number, input: ui.MultiStepInput, state: Partial<State>, existingDomainsDir: Array<string>, callback: (n: Partial<State>) => any) {
        totalSteps = state.type === 'local' ? 7 : totalSteps;
        let domainName = await input.showInputBox({
            title: 'Domain name',
            step: ++step,
            totalSteps: totalSteps,
            value: '',
            prompt: state.type === 'local' ? 'Enter the new domain name' : 'Enter the domain name',
            placeHolder: 'Payara Server domain name',
            validate: value => this.validateDomainName(value, existingDomainsDir),
            shouldResume: this.shouldResume
        });

        state.domainName = domainName;

        if (state.type === 'local') {
            state.newDomain = true;
        } else {
            state.newDomain = false;
            let host = await input.showInputBox({
                title: 'Host',
                step: ++step,
                totalSteps: totalSteps,
                value: ServerUtils.DEFAULT_HOST,
                prompt: 'Enter the host name',
                placeHolder: 'Enter the host name',
                validate: value => this.validateHost(value),
                shouldResume: this.shouldResume
            });
            state.host = host;
        }

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
            state.adminPort = parseInt(adminPort);
            state.httpPort = parseInt(httpPort);
        }
        return (input: ui.MultiStepInput) => this.addCredentials(step, totalSteps, true, input, state, callback);
    }

    private async addCredentials(step: number, totalSteps: number, showDefault: boolean,
        input: ui.MultiStepInput, state: Partial<State>, callback: (n: Partial<State>) => any) {

        let decision: QuickPickItem | undefined = undefined;
        if (showDefault) {
            decision = await input.showQuickPick({
                title: 'Default credentials?',
                step: ++step,
                totalSteps: totalSteps,
                placeholder: 'Default username (admin) and password (empty)',
                items: [{ label: 'Yes' }, { label: 'No' }],
                activeItem: { label: 'Yes' },
                shouldResume: this.shouldResume
            });
        }
        if (decision && decision.label === 'Yes') {
            callback(state);
        } else {
            totalSteps += 2;
            state.username = await input.showInputBox({
                title: 'Username',
                step: ++step,
                totalSteps: totalSteps,
                value: state.username ? state.username : ServerUtils.DEFAULT_USERNAME,
                prompt: 'Enter the username',
                placeHolder: 'Enter the username e.g admin',
                validate: (value: string) => this.validateUserName(value),
                shouldResume: this.shouldResume
            });
            const passwordBox = vscode.window.createInputBox();
            passwordBox.title = 'Password';
            passwordBox.step = ++step;
            passwordBox.totalSteps = totalSteps;
            passwordBox.value = state.password ? state.password : ServerUtils.DEFAULT_PASSWORD;
            passwordBox.prompt = 'Enter the password';
            passwordBox.placeholder = 'Enter the password';
            passwordBox.password = true;
            passwordBox.show();
            passwordBox.onDidAccept(async () => {
                passwordBox.hide();
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

    public async connectServer(payaraServer: PayaraRemoteServerInstance, debug: boolean, callback?: (status: boolean) => any): Promise<void> {
        payaraServer.setConnectionAllowed(true);
        payaraServer.checkAliveStatusUsingRest(0,
            async () => {
                payaraServer.setStarted(true);
                payaraServer.connectOutput();
                vscode.commands.executeCommand('payara.server.refresh');
                payaraServer.reloadApplications();
            },
            async (message?: string) => {
                payaraServer.setStarted(false);
                vscode.commands.executeCommand('payara.server.refresh');
            },
            true
        );
    }

    public async disconnectServer(payaraServer: PayaraRemoteServerInstance, debug: boolean, callback?: (status: boolean) => any): Promise<void> {
        payaraServer.setConnectionAllowed(false);
        payaraServer.setStarted(false);
        payaraServer.disconnectOutput();
        payaraServer.getOutputChannel().appendLine(`Disconnecting from ${payaraServer.getName()}[${payaraServer.getHost()}:${payaraServer.getAdminPort()}]`);
        vscode.commands.executeCommand('payara.server.refresh');
    }


    public async startServer(payaraServer: PayaraLocalServerInstance, debug: boolean, callback?: (status: boolean) => any): Promise<void> {
        if (!payaraServer.isStopped()) {
            vscode.window.showErrorMessage('Payara Server instance already running.');
            return;
        }

        let process: ChildProcess = new StartTask().startServer(payaraServer, debug);
        if (process.pid) {
            payaraServer.setDebug(debug);
            payaraServer.setState(InstanceState.LOADING);
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
            payaraServer.checkAliveStatusUsingRest(ServerUtils.DEFAULT_RETRY_COUNT,
                async () => {
                    payaraServer.setStarted(true);
                    this.refreshServerList();
                    payaraServer.reloadApplications();
                    if (callback) {
                        callback(true);
                    }
                },
                async (message?: string) => {
                    payaraServer.setStarted(false);
                    this.refreshServerList();
                    if (callback) {
                        callback(false);
                    }
                    vscode.window.showErrorMessage('Unable to start the Payara Server. ' + message);
                }
            );
        }
    }

    public async restartServer(payaraServer: PayaraServerInstance, debug: boolean, callback?: (status: boolean) => any): Promise<void> {
        if (payaraServer.isStopped()) {
            vscode.window.showErrorMessage('Payara Server instance not running.');
            return;
        }
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        let query: string = '?debug=' + debug;
        endpoints.invoke("restart-domain", async (res) => {
            payaraServer.connectOutput();
            payaraServer.setDebug(debug);
            payaraServer.setState(InstanceState.RESTARTING);
            this.refreshServerList();
            payaraServer.getOutputChannel().show(false);
            payaraServer.checkAliveStatusUsingRest(ServerUtils.DEFAULT_RETRY_COUNT,
                async () => {
                    payaraServer.setStarted(true);
                    payaraServer.connectOutput();
                    this.refreshServerList();
                    if (callback) {
                        callback(true);
                    }
                },
                async (message?: string) => {
                    payaraServer.setStarted(false);
                    payaraServer.disconnectOutput();
                    this.refreshServerList();
                    if (callback) {
                        callback(false);
                    }
                    vscode.window.showErrorMessage('Unable to restart the Payara Server. ' + message);
                }
            );
            if (payaraServer instanceof PayaraLocalServerInstance) {
                payaraServer.checkAliveStatusUsingJPS(
                    async () => {
                        payaraServer.connectOutput();
                    }
                );
            }
        },
            (res, message) => vscode.window.showErrorMessage('Unable to restart the Payara Server. ' + message)
        );
    }

    public async stopServer(payaraServer: PayaraLocalServerInstance): Promise<void> {
        if (payaraServer.isStopped()) {
            vscode.window.showErrorMessage('Payara Server instance not running.');
            return;
        }
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        endpoints.invoke("stop-domain", async res => {
            if (res.statusCode === 200) {
                payaraServer.setState(InstanceState.STOPPED);
                payaraServer.setDebug(false);
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

    public async updateCredentials(payaraServer: PayaraServerInstance): Promise<void> {
        let state: Partial<State> = {
            username: payaraServer.getUsername(),
            password: payaraServer.getPassword()
        };
        ui.MultiStepInput.run(
            input => this.addCredentials(
                0, 0, false, input, state,
                () => {
                    payaraServer.setUsername(state.username ? state.username.trim() : ServerUtils.DEFAULT_USERNAME);
                    payaraServer.setPassword(state.password ? state.password.trim() : ServerUtils.DEFAULT_PASSWORD);
                    this.instanceProvider.updateServerConfig();
                    vscode.window.showInformationMessage('Credentials updated successfully.');
                }
            )
        );
    }

    public async openConsole(payaraServer: PayaraServerInstance): Promise<void> {
        open(new URL(`http://${payaraServer.getHost()}:${payaraServer.getAdminPort()}`).toString());
    }

    public async openLog(payaraServer: PayaraServerInstance): Promise<void> {
        payaraServer.getOutputChannel().show(false);
        payaraServer.showLog();
        payaraServer.connectOutput();
    }

    public async openConfig(payaraServer: PayaraLocalServerInstance): Promise<void> {
        let domainXml = Uri.parse("file:" + payaraServer.getDomainXmlPath());
        vscode.workspace.openTextDocument(domainXml)
            .then(doc => vscode.window.showTextDocument(doc));
    }

    public async refreshServerList(): Promise<void> {
        vscode.commands.executeCommand('payara.server.refresh');
    }

    public deployApp(uri: Uri, debug: boolean, autoDeploy?: boolean, selectedServer?: PayaraServerInstance | undefined) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        ProjectOutputWindowProvider.getInstance().updateStatusBar(`Deploying ${workspaceFolder?.name}`);
        let support = new DeploymentSupport(this);
        let callback = (server: PayaraServerInstance) => {
            let deploy = async (status: boolean) => {
                if (status) {
                    if (uri.fsPath.endsWith('.war') || uri.fsPath.endsWith('.jar')) {
                        support.deployApplication(uri.fsPath, server, debug, autoDeploy);
                    } else {
                        try {
                            support.buildAndDeployApplication(uri, server, debug, autoDeploy);
                        } catch (error) {
                            vscode.window.showErrorMessage(error.message);
                        }
                    }
                    if (workspaceFolder) {
                        this.deployments.set(workspaceFolder, server);
                    }
                } else {
                    vscode.window.showErrorMessage('Unable to deploy the application as Payara Server instance not running.');
                }
            };
            if (autoDeploy && server.isStarted()) {
                deploy(true);
            } else {
                if (server instanceof PayaraLocalServerInstance && !server.isStarted()) {
                    this.startServer(server, debug, deploy);
                } else if (server instanceof PayaraLocalServerInstance && debug && !server.isDebug()) {
                    this.restartServer(server, debug, deploy);
                } else {
                    deploy(true);
                }
            }
        };
        if (selectedServer) {
            callback(selectedServer);
        } else {
            this.selectListedServer(callback);
        }
    }

    private selectListedServer(callback: (server: PayaraServerInstance) => any) {
        let servers: PayaraServerInstance[] = this.instanceProvider.getServers();
        if (servers.length === 0) {
            vscode.window.showErrorMessage('Please register the Payara Server.');
        } else if (servers.length === 1) {
            callback(servers[0]);
        } else {
            vscode.window.showQuickPick(servers, {
                placeHolder: 'Select the Payara Server',
                canPickMany: false
            }).then(value => {
                if (value instanceof PayaraServerInstance) {
                    callback(value);
                } else {
                    vscode.window.showErrorMessage('Please select the Payara Server.');
                }
            });
        }
    }

    public undeployApp(application: ApplicationInstance) {
        let controller = this;
        let payaraServer = application.payaraServer;
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        let query: string = '?name=' + encodeURIComponent(application.name);
        endpoints.invoke("undeploy" + query, async response => {
            if (response.statusCode === 200) {
                payaraServer.removeApplication(application);
                controller.refreshServerList();
            }
        });
    }

    public enableApp(application: ApplicationInstance) {
        let controller = this;
        let payaraServer = application.payaraServer;
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        let query: string = '?DEFAULT=' + encodeURIComponent(application.name);
        endpoints.invoke("enable" + query, async response => {
            if (response.statusCode === 200) {
                application.setEnabled(true);
                controller.refreshServerList();
            }
        });
    }

    public disableApp(application: ApplicationInstance) {
        let controller = this;
        let payaraServer = application.payaraServer;
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        let query: string = '?DEFAULT=' + encodeURIComponent(application.name);
        endpoints.invoke("disable" + query, async response => {
            if (response.statusCode === 200) {
                application.setEnabled(false);
                controller.refreshServerList();
            }
        });
    }

    public openApp(application: ApplicationInstance) {
        if (application.getContextPath() === null) {
            vscode.window.showInformationMessage('Context path not found for the application: ' + application.name);
        } else if (application.getContextPath() === undefined) {
            application.fetchContextPath(() => open(new URL(
                `http://${application.payaraServer.getHost()}:${application.payaraServer.getHttpPort()}`
                + application.getContextPath()).toString()
            ));
        } else {
            open(new URL(
                `http://${application.payaraServer.getHost()}:${application.payaraServer.getHttpPort()}`
                + application.getContextPath()).toString()
            );
        }
    }

    public openRestEndpoint(restEndpoint: RestEndpoint) {
        open(new URL(
            `http://${restEndpoint.application.payaraServer.getHost()}:${restEndpoint.application.payaraServer.getHttpPort()}`
            + restEndpoint.endpoint).toString()
        );
    }

    updateConfig(): void {
        this.instanceProvider.updateServerConfig();
    }

}

interface State {
    type: string;
    title: string;
    step: number;
    totalSteps: number;
    path: string;
    domains: QuickPickItem[];
    domainName: string;
    newDomain: boolean;
    host: string;
    adminPort: number;
    httpPort: number;
    username: string;
    password: string;
    name: string;
}
