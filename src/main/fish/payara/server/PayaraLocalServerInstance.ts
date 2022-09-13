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

import * as _ from "lodash";
import * as path from "path";
import * as fs from "fs";
import * as fse from "fs-extra";
import * as cp from 'child_process';
import { PortReader } from "./start/PortReader";
import { JavaUtils } from "./tooling/utils/JavaUtils";
import { ServerUtils } from "./tooling/utils/ServerUtils";
import { ChildProcess } from "child_process";
import { PayaraServerInstance } from "./PayaraServerInstance";

export class PayaraLocalServerInstance extends PayaraServerInstance {

    private portReader: PortReader | null = null;

    private logStream: ChildProcess | null = null;

    constructor(name: string, domainName: string, private path: string) {
        super(name, domainName);
    }

    public getId(): string {
        return this.getDomainPath();
    }

    public getTooltip(): string {
        return this.getPath() + '[' + this.getDomainName() + ']';
    }

    public getPath(): string {
        return this.path;
    }

    public getServerRoot(): string {
        return this.getPath();
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
        return path.join(this.getDomainsFolder(), this.getDomainName());
    }

    public getDomainXmlPath(): string {
        return path.join(this.getDomainPath(), "config", "domain.xml");
    }

    public getServerLog(): string {
        return path.join(this.getDomainPath(), "logs", "server.log");
    }

    public isMatchingLocation(baseRoot: string, domainRoot: string): boolean {
        return _.isEmpty(path.relative(baseRoot, path.resolve(this.getPath() , 'glassfish')))
         && path.basename(domainRoot) === this.getDomainName();
    }

    public getHost(): string {
        return 'localhost';
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

    public checkAliveStatusUsingJPS(callback: () => any): void {
        let javaHome: string | undefined = this.getJDKHome();
        if (!javaHome) {
            throw new Error("Java home path not found.");
        }
        let javaProcessExe: string = JavaUtils.javaProcessExecutableFullPath(javaHome);
        // Java Process executable should exist.
        if (!fse.pathExistsSync(javaProcessExe)) {
            throw new Error("Java Process " + javaProcessExe + " executable for " + this.getName() + " was not found");
        }

        let output: string = cp.execFileSync(javaProcessExe, ['-m', '-l', '-v']).toString();
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


    public async showLog(): Promise<void> {
        let payaraServer: PayaraServerInstance = this;
        return new Promise(() => {
            fs.readFile(this.getServerLog(), 'utf8', function (err, data) {
                payaraServer.getOutputChannel().appendLine(data.toString());
            });
        });
    }

    public connectOutput(): void {
        if (this.logStream === null && fs.existsSync(this.getServerLog())) {
            if (JavaUtils.IS_WIN) {
                this.logStream = cp.spawn('powershell.exe', ['Get-Content', '-Tail', '20', '-Wait', '-literalpath', this.getServerLog()]);
            } else {
                this.logStream = cp.spawn('tail ', ['-f', '-n', '20', this.getServerLog()]);
            }
            if (this.logStream.pid) {
                this.getOutputChannel().show(false);
                let logCallback = (data: string | Buffer): void => this.getOutputChannel().append(data.toString());
                if (this.logStream.stdout !== null) {
                    this.logStream.stdout.on('data', logCallback);
                }
                if (this.logStream.stderr !== null) {
                    this.logStream.stderr.on('data', logCallback);
                }
            }
        }
    }

    public disconnectOutput(): void {
        if (this.logStream !== null) {
            this.logStream.kill();
        }
    }

    public getConfigData(): any {
        return {
            type: 'local',
            name: this.getName(),
            path: this.getPath(),
            domainName: this.getDomainName(),
            username: this.getUsername(),
            password: this.getPassword(),
            jdkHome: this.getJDKHome(),
            deployOption: this.getDeployOption()
        };
    }

}
