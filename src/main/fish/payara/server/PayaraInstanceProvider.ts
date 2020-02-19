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
import * as path from "path";
import * as os from "os";
import * as _ from "lodash";
import * as fs from "fs";
import * as fse from "fs-extra";
import { PayaraServerInstance } from "./PayaraServerInstance";
import { ServerUtils } from "./tooling/utils/ServerUtils";

export class PayaraInstanceProvider {

    private servers: PayaraServerInstance[] = [];
    private unlistedServers: PayaraServerInstance[] = [];
    private serversConfig: string;
    private unlistedServersConfig: string;

    constructor(public context: vscode.ExtensionContext) {
        this.serversConfig = this.getServersConfig(context);
        this.unlistedServersConfig = this.getUnlistedServersConfig(context);
    }

    async loadServerConfigs(): Promise<void> {
        this
            .readServerConfig()
            .forEach((instance: any) => {
                let payaraServer: PayaraServerInstance = new PayaraServerInstance(
                    instance.name, instance.path, instance.domainName
                );
                if (instance.jdkHome) {
                    payaraServer.setJDKHome(instance.jdkHome);
                }
                this.addServer(payaraServer);
                payaraServer.checkAliveStatusUsingJPS(() => {
                    payaraServer.connectOutput();
                    payaraServer.setStarted(true);
                });
            });

        this.readUnlistedServerConfig()
            .forEach((instance: any) => {
                let payaraServer: PayaraServerInstance = new PayaraServerInstance(
                    instance.name, instance.path, instance.domainName
                );
                this.unlistedServers.push(payaraServer);
            });
    }

    public getServers(): PayaraServerInstance[] {
        return this.servers;
    }

    public getUnlistedServers(): PayaraServerInstance[] {
        let oldUnlistedServers: PayaraServerInstance[] = this.unlistedServers;
        this.unlistedServers = this.unlistedServers
        .filter(server => fs.existsSync(server.getPath()))
        .filter(server => ServerUtils.isValidServerPath(server.getPath()));
        if(oldUnlistedServers.length !== this.unlistedServers.length) {
            this.updateUnlistedServerConfig();
        }
        return this.unlistedServers;
    }

    public getServerByName(name: string): PayaraServerInstance | undefined {
        return this.servers.find(
            item => item.getName() === name
        );
    }

    private getServersConfig(context: vscode.ExtensionContext): string {
        let storagePath: string;
        if (context.storagePath) {
            if (!fs.existsSync(context.storagePath)) {
                fs.mkdirSync(context.storagePath);
            }
            storagePath = context.storagePath;
        } else if (context.globalStoragePath) {
            if (!fs.existsSync(context.globalStoragePath)) {
                fs.mkdirSync(context.globalStoragePath);
            }
            storagePath = context.globalStoragePath;
        } else {
            storagePath = path.resolve(os.tmpdir(), `payara_vscode`);
        }

        let serversConfig: string = path.join(storagePath, 'servers.json');
        if (!fs.existsSync(serversConfig)) {
            fs.writeFileSync(serversConfig, "[]");
        }
        return serversConfig;
    }

    private getUnlistedServersConfig(context: vscode.ExtensionContext): string {
        let storagePath: string;
        if (context.globalStoragePath) {
            if (!fs.existsSync(context.globalStoragePath)) {
                fs.mkdirSync(context.globalStoragePath);
            }
            storagePath = context.globalStoragePath;
        } else {
            storagePath = path.resolve(os.tmpdir(), `payara_vscode`);
        }

        let unlistedServersConfig: string = path.join(storagePath, 'unlisted_servers.json');
        if (!fs.existsSync(unlistedServersConfig)) {
            fs.writeFileSync(unlistedServersConfig, "[]");
        }
        return unlistedServersConfig;
    }

    public addServer(payaraServer: PayaraServerInstance): void {
        this.removeServerFromListed(payaraServer);
        this.removeServerFromUnlisted(payaraServer);
        this.servers.push(payaraServer);
        this.updateServerConfig();
        this.updateUnlistedServerConfig();
    }

    public removeServer(payaraServer: PayaraServerInstance): boolean {
        if (this.removeServerFromListed(payaraServer)) {
            this.removeServerFromUnlisted(payaraServer);
            this.unlistedServers.push(payaraServer);
            this.updateServerConfig();
            this.updateUnlistedServerConfig();
            return true;
        }
        return false;
    }

    private removeServerFromListed(payaraServer: PayaraServerInstance): boolean {
        const index: number = this.servers.findIndex(
            server => server.getName() === payaraServer.getName()
        );
        if (index > -1) {
            this.servers.splice(index, 1);
            return true;
        }
        return false;
    }

    private removeServerFromUnlisted(payaraServer: PayaraServerInstance): boolean {
        const index: number = this.unlistedServers.findIndex(
            server => server.getPath() === payaraServer.getPath()
        );
        if (index > -1) {
            this.unlistedServers.splice(index, 1);
            return true;
        }
        return false;
    }

    public async updateServerConfig(): Promise<void> {
        try {
            await fse.outputJson(
                this.serversConfig,
                this.servers.map(instance => {
                    return {
                        name: instance.getName(),
                        path: instance.getPath(),
                        domainName: instance.getDomainName(),
                        jdkHome: instance.getJDKHome()
                    };
                })
            );
        } catch (error) {
            console.error(error.toString());
        }
    }

    public async updateUnlistedServerConfig(): Promise<void> {
        try {
            await fse.outputJson(
                this.unlistedServersConfig,
                this.unlistedServers.map(instance => {
                    return {
                        name: instance.getName(),
                        path: instance.getPath(),
                        domainName: instance.getDomainName()
                    };
                })
            );
        } catch (error) {
            console.error(error.toString());
        }
    }

    public readServerConfig(): any {
        let data = fse.readFileSync(this.serversConfig);
        return JSON.parse(data.toString());
    }

    public readUnlistedServerConfig(): any {
        let data = fse.readFileSync(this.unlistedServersConfig);
        return JSON.parse(data.toString());
    }

}
