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

import * as vscode from "vscode";
import * as _ from "lodash";
import * as path from "path";
import { JDKVersion } from "./start/JDKVersion";
import { ServerUtils } from "./tooling/utils/ServerUtils";
import { ApplicationInstance } from "../project/ApplicationInstance";
import { RestEndpoints } from "./endpoints/RestEndpoints";
import { IncomingMessage } from "http";
import { ProjectOutputWindowProvider } from "../project/ProjectOutputWindowProvider";

export abstract class PayaraServerInstance extends vscode.TreeItem implements vscode.QuickPickItem, PayaraInstance {

    public label: string;

    public description: string | undefined;

    private state: InstanceState = InstanceState.STOPPED;

    private debug: boolean = false;

    private username: string = ServerUtils.DEFAULT_USERNAME;

    private password: string = ServerUtils.DEFAULT_PASSWORD;

    private securityEnabled: boolean = false;

    private jdkHome: string | null = null;

    private outputChannel: vscode.OutputChannel;

    private applicationInstances: Array<ApplicationInstance> = new Array<ApplicationInstance>();

    private versionLabel: string | undefined;

    constructor(private name: string, private domainName: string) {
        super(name);
        this.label = name;
        this.outputChannel = ProjectOutputWindowProvider.getInstance().get(name);
    }

    abstract getConfigData(): any;

    abstract getTooltip(): string;

    abstract async showLog(): Promise<void>;

    abstract connectOutput(): void;

    abstract disconnectOutput(): void;

    abstract getHost(): string;

    abstract getHttpPort(): number;

    abstract getAdminPort(): number;

    abstract isMatchingLocation(baseRoot: string, domainRoot: string): boolean;

    public getName(): string {
        return this.name;
    }

    public setName(name: string) {
        this.name = name;
    }

    public getVersionLabel(): string | undefined {
        return this.versionLabel;
    }

    public setVersionLabel(versionLabel: string) {
        this.versionLabel = versionLabel;
    }

    public getDomainName(): string {
        return this.domainName;
    }

    public getUsername(): string {
        return this.username;
    }

    public setUsername(username: string) {
        this.username = username;
    }

    public getPassword(): string {
        return this.password;
    }

    public setPassword(password: string) {
        this.password = password;
    }

    public getJDKHome(): string | undefined {
        if (this.jdkHome !== null) {
            return this.jdkHome;
        }
        return JDKVersion.getDefaultJDKHome();
    }

    public setJDKHome(jdkHome: string) {
        this.jdkHome = jdkHome;
    }

    public isSecurityEnabled(): boolean {
        return this.securityEnabled;
    }

    public setSecurityEnabled(securityEnabled: boolean) {
        this.securityEnabled = securityEnabled;
    }

    public isLoading(): boolean {
        return this.state === InstanceState.LOADING;
    }

    public isRestarting(): boolean {
        return this.state === InstanceState.RESTARTING;
    }

    public isStarted(): boolean {
        return this.state === InstanceState.RUNNING;
    }

    public isStopped(): boolean {
        return this.state === InstanceState.STOPPED;
    }

    public setState(state: InstanceState): void {
        this.state = state;
    }

    public getState(): InstanceState {
        return this.state;
    }

    public setStarted(started: boolean): void {
        this.state = started ? InstanceState.RUNNING : InstanceState.STOPPED;
    }

    public setDebug(debug: boolean): void {
        this.debug = debug;
    }

    public isDebug(): boolean {
        return this.debug;
    }

    public getIcon(): string {
        let icon: string = `payara.svg`;
        if (this.isLoading() || this.isRestarting()) {
            icon = `payara-loading.svg`;
        } else if (this.isStarted()) {
            if (this.isDebug()) {
                icon = `payara-started-debug.svg`;
            } else {
                icon = `payara-started.svg`;
            }
        }
        return icon;
    }

    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    public async checkAliveStatusUsingRest(maxRetryCount: number,
        successCallback: () => any,
        failureCallback: (message?: string) => any,
        log?: boolean): Promise<void> {

        let trycount = 0;
        let endpoints: RestEndpoints = new RestEndpoints(this);
        let successHttpCallback: (res: IncomingMessage, report?: any) => any;
        let failureHttpCallback: (res: IncomingMessage, message?: string) => any;
        let invoke = () => {
            ++trycount;
            if (log) {
                this.getOutputChannel().appendLine(`Connecting to ${this.getName()}[${this.getHost()}:${this.getAdminPort()}] ...`);
            }
            let req = endpoints.invoke("__locations", successHttpCallback, failureHttpCallback);
            req.on('error', async (err: any) => {
                if (log) {
                    let errorMessage = `Connection failure ${this.getName()}[${this.getHost()}:${this.getAdminPort()}]: ${err["code"]} [${err.message}]. Please check your network connectivity or firewall settings.`;
                    this.getOutputChannel().appendLine(errorMessage);
                    vscode.window.showErrorMessage(errorMessage);
                }
                if (err["code"] === 'ECONNREFUSED' || err["code"] === 'ECONNRESET') {
                    await new Promise(res => setTimeout(res, ServerUtils.DEFAULT_WAIT));
                    if (trycount < maxRetryCount) {
                        invoke(); // try again
                    } else {
                        failureCallback(err.message);
                    }
                } else {
                    failureCallback(err.message);
                }
            });
        };
        successHttpCallback = async (res: IncomingMessage, report?: any) => {

            if (report['message-part']
                && report['message-part'][0]?.property) {
                let prop = report['message-part'][0].property;
                let baseRoot;
                let domainRoot;
                for (const key in prop) {
                    if (prop.hasOwnProperty(key)) {
                        const element = prop[key];
                        if (element.$.name === 'Base-Root') {
                            baseRoot = element.$.value;
                        } else if (element.$.name === 'Domain-Root') {
                            domainRoot = element.$.value;
                        }
                    }
                }
                if (log) {
                    this.getOutputChannel().appendLine(`Reply from ${this.getName()}[${this.getHost()}:${this.getAdminPort()}]`);
                    this.getOutputChannel().appendLine(`${this.getName()}[${this.getHost()}] Base-Root: ${baseRoot}`);
                    this.getOutputChannel().appendLine(`${this.getName()}[${this.getHost()}] Domain-Root: ${domainRoot}`);
                }
                if (this.isMatchingLocation(baseRoot, domainRoot)) {
                    if(!this.getVersionLabel() && res.headers['server']) {
                        this.setVersionLabel(<string>res.headers['server']);
                    }
                    if (!this.getVersionLabel()) {
                        endpoints.invoke("version",
                            (res, report) => {
                                if (report['message-part']
                                    && report['message-part'][0]?.$?.message) {
                                    this.setVersionLabel(report['message-part'][0].$.message);
                                    if (log) {
                                        let message = `Successfully connected to ${this.getName()}[${this.getHost()}:${this.getAdminPort()}] ${this.getVersionLabel()}`;
                                        this.getOutputChannel().appendLine(message);
                                        vscode.window.showInformationMessage(message);
                                    }
                                }
                            },
                            (res, message) => {
                                console.log(`Unable to fetch the version detail from ${this.getName()}[${this.getHost()}]`);
                            }
                        );
                    } else if (log) {
                        let message = `Successfully connected to ${this.getName()}[${this.getHost()}:${this.getAdminPort()}] ${this.getVersionLabel()}`;
                        this.getOutputChannel().appendLine(message);
                        vscode.window.showInformationMessage(message);
                    }
                    successCallback();
                } else if (log) {
                    this.getOutputChannel().appendLine(`Connection terminated as domain name [${this.getDomainName()}] not matched with ${this.getName()}[${path.basename(domainRoot)}]`);
                }
            }
        };
        failureHttpCallback = async (res: IncomingMessage, message?: string) => {
            if (res.statusCode === 200) { // https://payara.atlassian.net/browse/APPSERV-52
                successCallback();
            } else {
                await new Promise(res => setTimeout(res, ServerUtils.DEFAULT_WAIT));
                if (trycount < maxRetryCount) {
                    invoke(); // try again
                } else {
                    failureCallback(message);
                }
            }
        };
        if (maxRetryCount >= ServerUtils.DEFAULT_RETRY_COUNT) {
            await new Promise(res => setTimeout(res, ServerUtils.DEFAULT_WAIT));
        }
        invoke();
    }

    public addApplication(application: ApplicationInstance): void {
        this.applicationInstances.push(application);
    }

    public removeApplication(application: ApplicationInstance): void {
        let index = this.applicationInstances.indexOf(application, 0);
        if (index > -1) {
            this.applicationInstances.splice(index, 1);
        }
    }

    public getApplications(): Array<ApplicationInstance> {
        return this.applicationInstances;
    }

    public reloadApplications() {
        let payaraServer = this;
        let applicationInstances = new Array<ApplicationInstance>();
        let endpoints: RestEndpoints = new RestEndpoints(this);
        endpoints.invoke("list-applications", async (response, report) => {
            if (response.statusCode === 200) {
                let message = report['message-part'][0];
                if (message && message.property) {
                    for (let property of message.property) {
                        applicationInstances.push(
                            new ApplicationInstance(payaraServer, property.$.name, property.$.value)
                        );
                    }
                    payaraServer.applicationInstances = applicationInstances;
                    vscode.commands.executeCommand('payara.server.refresh');
                }
            }
        });
    }

    public dispose() {
        this.disconnectOutput();
        this.getOutputChannel().dispose();
    }
}

export enum InstanceState {
    RUNNING = "runningPayara",
    LOADING = "loadingPayara",
    RESTARTING = "restartingPayara",
    STOPPED = "stoppedPayara"
}
