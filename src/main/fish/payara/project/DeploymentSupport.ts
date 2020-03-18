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

import { Uri } from "vscode";
import { PayaraServerInstance } from "../server/PayaraServerInstance";
import { BuildSupport } from "./BuildSupport";
import { RestEndpoints } from "../server/endpoints/RestEndpoints";
import { ApplicationInstance } from "./ApplicationInstance";
import { PayaraInstanceController } from "../server/PayaraInstanceController";

export class DeploymentSupport {

    constructor(
        public controller: PayaraInstanceController) {
    }

    public buildAndDeployApplication(uri: Uri, payaraServer: PayaraServerInstance) {
        return BuildSupport
            .getBuild(uri)
            .buildProject(artifact => this.deployApplication(artifact, payaraServer));
    }

    public deployApplication(appPath: string, payaraServer: PayaraServerInstance) {
        let support = this;
        payaraServer.getOutputChannel().show(false);
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        let query: string = '?DEFAULT=' + encodeURIComponent(appPath) + '&force=true';
        endpoints.invoke("deploy" + query, async (response, report) => {
            if (response.statusCode === 200) {
                let message = report['message-part'][0];
                let property = message.property[0].$;
                if (property.name === 'name') {
                    let appName = <string>property.value;
                    support.controller.openApp(new ApplicationInstance(payaraServer, appName));
                    payaraServer.reloadApplications();
                    support.controller.refreshServerList();
                }
            }
        });
    }

}