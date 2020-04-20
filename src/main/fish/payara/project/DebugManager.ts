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

import * as fs from "fs";
import { WorkspaceFolder, DebugConfiguration, workspace, WorkspaceConfiguration, Uri } from "vscode";

export class DebugManager {

    public getPayaraMicroDebugConfig(workspaceFolder: WorkspaceFolder): DebugConfiguration | undefined {

        for (const config of this.getDebugConfigurations(workspaceFolder.uri)) {
            if (config.name && config.name.startsWith('Payara Micro')) {
                return config;
            }
        }
        return undefined;
    }

    public getPayaraServerDebugConfig(workspaceFolder: WorkspaceFolder): DebugConfiguration | undefined {

        for (const config of this.getDebugConfigurations(workspaceFolder.uri)) {
            if (config.name && config.name.startsWith('Payara Server')) {
                return config;
            }
        }
        return undefined;
    }

    public getDebugConfigurations(target: Uri): DebugConfiguration[] {
        let workspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('launch', target);
        let configurations: DebugConfiguration[] | undefined = workspaceConfiguration.get<DebugConfiguration[]>('configurations');
        return configurations ? configurations : [];
    }

    public createDebugConfiguration(workspaceFolder: WorkspaceFolder, defaultConfig: DebugConfiguration): DebugConfiguration {
        let vscodeDir = this.getVSCodeDir(workspaceFolder);
        let launchFile = vscodeDir + '/launch.json';
        let configurations: DebugConfiguration[] = [];
        let launch = workspace.getConfiguration('launch', workspaceFolder.uri);
        if (!fs.existsSync(launchFile)) {
            launch.update('version', "0.2.0");
        } else {
            let config = launch.get<DebugConfiguration[]>('configurations');
            if (config) {
                configurations = config;
            }
        }
        configurations.push(defaultConfig);
        launch.update('configurations', configurations, false);
        return defaultConfig;
    }

    private async getVSCodeDir(workspaceFolder: WorkspaceFolder) {
        let vscodeDir = workspaceFolder.uri.fsPath + '/.vscode';
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir);
        }
        return vscodeDir;
    }

    public getDefaultMicroDebugConfig(): DebugConfiguration {
        return {
            type: "java",
            request: "attach",
            hostName: "localhost",
            name: "Payara Micro application",
            port: 5005
        };
    }

    public getDefaultServerDebugConfig(): DebugConfiguration {
        return {
            type: "java",
            request: "attach",
            hostName: "localhost",
            name: "Payara Server application",
            port: 9006
        };
    }

}