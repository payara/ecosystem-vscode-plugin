'use strict';

import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as _ from "lodash";
import * as fse from "fs-extra";
import { PayaraServerInstance } from "./PayaraServerInstance";

export class PayaraInstanceProvider {

    private servers: PayaraServerInstance[] = [];
    private serversConfig: string;

    constructor(public context: vscode.ExtensionContext) {
        this.serversConfig = this.getserversConfig(context);
    }

    getServers(): PayaraServerInstance[] {
        return this.servers;
    }

    getserversConfig(context: vscode.ExtensionContext): string {
        let storagePath: string;
        if (!context.storagePath) {
            storagePath = path.resolve(os.tmpdir(), `payara_vscode`);
        } else {
            storagePath = context.storagePath;
        }
        return path.join(storagePath, 'servers.json');
    }

    public addServer(payaraServer: PayaraServerInstance): void {
        this.removeServerFromList(payaraServer);
        this.servers.push(payaraServer);
        this.updateServerConfig();
    }

    public removeServer(payaraServer: PayaraServerInstance): boolean {
        if(this.removeServerFromList(payaraServer)) {
            this.updateServerConfig();
            return true;
        }
        return false;
    }

    private removeServerFromList(payaraServer: PayaraServerInstance): boolean {
        const index: number = this.servers.findIndex(
            server => server.getName() === payaraServer.getName()
        );
        if (index > -1) {
            this.servers.splice(index, 1);
            return true;
        }
        return false;
    }

    private async updateServerConfig(): Promise<void> {
        try {
            await fse.outputJson(
                this.serversConfig,
                this.servers.map(instance => {
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


}