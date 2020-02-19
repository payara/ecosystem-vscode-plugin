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
import * as fs from "fs";
import * as fse from "fs-extra";
import * as cp from 'child_process';
import * as xml2js from "xml2js";
import { PortReader } from "./start/PortReader";
import { JDKVersion } from "./start/JDKVersion";
import { JavaUtils } from "./tooling/utils/JavaUtils";
import { ServerUtils } from "./tooling/utils/ServerUtils";
import { Tail } from "tail";
import { ApplicationInstance } from "../project/ApplicationInstance";
import { RestEndpoints } from "./endpoints/RestEndpoints";

export class PayaraServerInstance extends vscode.TreeItem implements vscode.QuickPickItem {

    public label: string;

    public description: string | undefined;

    private outputChannel: vscode.OutputChannel;

    private state: InstanceState = InstanceState.STOPPED;

    private debug: boolean = false;

    private portReader: PortReader | null = null;

    private logStream: Tail | null = null;

    private applicationInstances: Array<ApplicationInstance> = new Array<ApplicationInstance>();

    constructor(private name: string, private path: string, private domainName: string) {
        super(name);
        this.label = name;
        this.outputChannel = vscode.window.createOutputChannel(name);
    }

    public getName(): string {
        return this.name;
    }

    public setName(name: string) {
        this.name = name;
    }

    public getPath(): string {
        return this.path;
    }

    public getDomainName(): string {
        return this.domainName;
    }

    public getServerRoot(): string {
        return this.path;
    }

    public getServerHome(): string {
        return path.join(this.getServerRoot(), 'glassfish');
    }

    public getServerModules(): string {
        return path.join(this.getServerHome(), 'modules');
    }

    public getDomainsFolder(): string {
        return path.join(this.getServerHome(), 'domains');
    }

    public getDomainPath(): string {
        return path.join(this.getDomainsFolder(), this.domainName);
    }

    public getDomainXmlPath(): string {
        return path.join(this.getDomainPath(), "config", "domain.xml");
    }

    public getServerLog(): string {
        return path.join(this.getDomainPath(), "logs", "server.log");
    }

    public isLoading(): boolean {
        return this.state === InstanceState.LODING;
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

    public getHttpPort(): number {
        if (!this.portReader) {
            this.portReader = this.createPortReader();
        }
        return this.portReader.getHttpPort();
    }

    public getHttpsPort(): number {
        if (!this.portReader) {
            this.portReader = this.createPortReader();
        }
        return this.portReader.getHttpsPort();
    }

    public getAdminPort(): number {
        if (!this.portReader) {
            this.portReader = this.createPortReader();
        }
        return this.portReader.getAdminPort();
    }

    private createPortReader(): PortReader {
        return new PortReader(this.getDomainXmlPath(), ServerUtils.DAS_NAME);
    }

    public async checkAliveStatusUsingRest(
        successCallback: () => any,
        failureCallback: () => any): Promise<void> {
        await new Promise(res => setTimeout(res, 3000));
        let max = 30;
        let p = Promise.reject<number>();
        for (var i = 0; i < max; i++) {
            p = p.catch(() => {
                let endpoints: RestEndpoints = new RestEndpoints(this);
                let response = endpoints.invokeSync("list-virtual-servers");
                if (response.statusCode === 200) {
                    return response.statusCode;
                } else {
                    throw response.statusCode;
                }
            }).catch(reason =>
                new Promise((resolve, reject) => setTimeout(reject.bind(null, reason), 3000))
            );
        }
        p.then(statusCode => {
            if (statusCode === 200) {
                successCallback();
            } else {
                failureCallback();
            }
        }).catch(err => {
            failureCallback();
        });
    }

    public checkAliveStatusUsingJPS(callback: () => any): void {
        let javaHome: string | undefined = JDKVersion.getDefaultJDKHome();
        if (!javaHome) {
            throw new Error("Java home path not found.");
        }
        let javaProcessExe: string = JavaUtils.javaProcessExecutableFullPath(javaHome);
        // Java Process executable should exist.
        if (!fse.pathExistsSync(javaProcessExe)) {
            throw new Error("Java Process " + javaProcessExe + " executable for " + this.getName() + " was not found");
        }

        let output: Buffer = cp.execSync(javaProcessExe + ' -mlv');
        let lines: string[] = output.toString().split(/(?:\r\n|\r|\n)/g);
        for (let line of lines) {
            let result: string[] = line.split(" ");
            if (result.length >= 6
                && result[1] === ServerUtils.PF_MAIN_CLASS
                && result[3] === this.getDomainName()
                && result[5] === this.getDomainPath()) {
                callback();
                break;
            }
        }
    }

    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    public async showLog(): Promise<void> {
        let payaraServer: PayaraServerInstance = this;
        return new Promise((resolve, reject) => {
            fs.readFile(this.getServerLog(), 'utf8', function (err, data) {
                payaraServer.outputChannel.appendLine(data.toString());
            });
        });
    }

    public createLogStream(): void {
        if (fs.existsSync(this.getServerLog())) {
            let logCallback = (data: string | Buffer): void => {
                this.outputChannel.appendLine(
                    this.getName() && !_.isEmpty(data.toString()) ? `[${this.getName()}]: ${data.toString()}` : data.toString()
                );
            };
            this.logStream = new Tail(this.getServerLog());
            this.logStream.on("line", logCallback);
            this.logStream.on('error', (err) => console.log(err));
        }
    }

    public connectOutput(): void {
        if (this.logStream === null) {
            this.createLogStream();
        }
        if (this.logStream !== null) {
            this.logStream.watch();
        }
    }

    public disconnectOutput(): void {
        if (this.logStream !== null) {
            this.logStream.unwatch();
        }
    }

    public dispose() {
        this.disconnectOutput();
        this.outputChannel.dispose();
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
        payaraServer.applicationInstances = new Array<ApplicationInstance>();
        let endpoints: RestEndpoints = new RestEndpoints(this);
        endpoints.invoke("list-applications", async response => {
            if (response.statusCode === 200) {
                response.on('data', function (data) {
                    new xml2js.Parser().parseString(data.toString(),
                        function (err: any, result: any) {
                            let message = result['action-report']['message-part'][0];
                            for (let property of message.property) {
                                payaraServer.addApplication(
                                    new ApplicationInstance(payaraServer, property.$.name, property.$.value)
                                );
                            }
                        });
                });
            }
        });
    }



}

export enum InstanceState {
    RUNNING = "runningPayara",
    LODING = "loadingPayara",
    RESTARTING = "restartingPayara",
    STOPPED = "stoppedPayara"
}
