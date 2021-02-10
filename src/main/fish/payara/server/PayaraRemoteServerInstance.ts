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
import * as path from "path";
import { CronJob } from "cron";
import { ServerUtils } from "./tooling/utils/ServerUtils";
import { RestEndpoints } from "./endpoints/RestEndpoints";
import { IncomingMessage } from "http";
import { PayaraServerInstance } from "./PayaraServerInstance";

export class PayaraRemoteServerInstance extends PayaraServerInstance {

    private host: string = ServerUtils.DEFAULT_HOST;
    private adminPort: number = ServerUtils.DEFAULT_ADMIN_PORT;
    private httpPort: number = ServerUtils.DEFAULT_HTTP_PORT;
    private logSequence: number = 0;
    private target: string = 'server';
    private job = new CronJob('*/3 * * * * *', () => this.showLog());
    private connectionAllowed: boolean = false;

    constructor(name: string, domainName: string) {
        super(name, domainName);
    }

    public getId(): string {
        return this.host + ':' + this.adminPort;
    }

    public getTooltip(): string {
        return this.host + ':' + this.adminPort;
    }

    public isMatchingLocation(baseRoot: string, domainRoot: string): boolean {
        return path.basename(domainRoot) === this.getDomainName();
    }

    public isConnectionAllowed(): boolean {
        return this.connectionAllowed;
    }

    public setConnectionAllowed(connectionAllowed: boolean) {
        this.connectionAllowed = connectionAllowed;
        if(this.connectionAllowed) {
            this.logSequence = 0;
            this.getOutputChannel().show(false);
        }
    }

    public getHost(): string {
        return this.host;
    }

    public setHost(host: string) {
        this.host = host;
    }

    public getAdminPort(): number {
        return this.adminPort;
    }

    public setAdminPort(adminPort: number) {
        this.adminPort = adminPort;
    }

    public getHttpPort(): number {
        return this.httpPort;
    }

    public setHttpPort(httpPort: number) {
        this.httpPort = httpPort;
    }

    public async showLog(): Promise<void> {
        let payaraServer: PayaraRemoteServerInstance = this;
        return new Promise(() => {
            let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
            endpoints.invoke(`/management/domain/view-log?start=${payaraServer.logSequence}&instanceName=${payaraServer.target}`, async (res: IncomingMessage, report?: any) => {
                if (res.statusCode === 200) {
                    payaraServer.getOutputChannel().appendLine(report);
                    let nextLogHeader: string = <string>res.headers['x-text-append-next'];
                    if (nextLogHeader) {
                        let start = new URLSearchParams(new URL(nextLogHeader).search).get("start");
                        payaraServer.logSequence = start ? parseInt(start) : 0;
                    }
                }
            }, async (res: IncomingMessage, message?: string) => {
                console.log("Remote Payara Instance `/management/domain/view-log : " + message);
            }, 'text/plain;charset=UTF-8');
        });
    }

    public connectOutput(): void {
        if (!this.job.running) {
            this.job.start();
        }
    }

    public disconnectOutput(): void {
        if (this.job.running) {
            this.job.stop();
        }
    }

    public getConfigData(): any {
        return {
            type: 'remote',
            name: this.getName(),
            host: this.getHost(),
            httpPort: this.getHttpPort(),
            adminPort: this.getAdminPort(),
            domainName: this.getDomainName(),
            username: this.getUsername(),
            password: this.getPassword()
        };
    }

}