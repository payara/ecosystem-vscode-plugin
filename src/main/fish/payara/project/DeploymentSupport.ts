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
import { Uri, DebugConfiguration } from "vscode";
import { PayaraServerInstance } from "../server/PayaraServerInstance";
import { BuildSupport } from "./BuildSupport";
import { RestEndpoints } from "../server/endpoints/RestEndpoints";
import { ApplicationInstance } from "./ApplicationInstance";
import { PayaraServerInstanceController } from "../server/PayaraServerInstanceController";
import { DebugManager } from "./DebugManager";

export class DeploymentSupport {

    constructor(
        public controller: PayaraServerInstanceController) {
    }

    public buildAndDeployApplication(uri: Uri, payaraServer: PayaraServerInstance, debug: boolean) {
        return BuildSupport
            .getBuild(payaraServer, uri)
            .buildProject(artifact => this.deployApplication(artifact, payaraServer, debug));
    }

    public deployApplication(appPath: string, payaraServer: PayaraServerInstance, debug: boolean) {
        let support = this;
        payaraServer.getOutputChannel().show(false);
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        let query: string = '?DEFAULT=' + encodeURIComponent(appPath) + '&force=true';
        endpoints.invoke("deploy" + query, async (response, report) => {
            if (response.statusCode === 200) {
                let message = report['message-part'][0];
                if (message && message.property) {
                    let property = message.property[0].$;
                    if (property.name === 'name') {
                        let appName = <string>property.value;
                        let workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(appPath));

                        if (debug && workspaceFolder) {
                            let debugConfig: DebugConfiguration | undefined;
                            let debugManager: DebugManager = new DebugManager();
                            debugConfig = debugManager.getPayaraConfig(workspaceFolder, debugManager.getDefaultServerConfig());
                            if (vscode.debug.activeDebugSession) {
                                let session = vscode.debug.activeDebugSession;
                                if (session.configuration.port !== debugConfig.port
                                    || session.configuration.type !== debugConfig.type) {
                                    vscode.debug.startDebugging(workspaceFolder, debugConfig);
                                }
                            } else {
                                vscode.debug.startDebugging(workspaceFolder, debugConfig);
                            }
                        }

                        support.controller.openApp(new ApplicationInstance(payaraServer, appName));
                        payaraServer.reloadApplications();
                        support.controller.refreshServerList();
                    }
                }
            }
        });
    }

}