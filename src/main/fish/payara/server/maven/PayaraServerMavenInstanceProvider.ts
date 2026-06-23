'use strict';

/*
 * Copyright (c) 2026 Payara Foundation and/or its affiliates and others.
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
import { PayaraServerMavenInstance } from "./PayaraServerMavenInstance";
import { BuildSupport } from "../../project/BuildSupport";
import { Maven } from "../../project/Maven";

export class PayaraServerMavenInstanceProvider {

    private instances: Map<string, PayaraServerMavenInstance> = new Map<string, PayaraServerMavenInstance>();

    constructor(public context: vscode.ExtensionContext) {
    }

    public getServerMavenInstances(): PayaraServerMavenInstance[] {
        let instances: Array<PayaraServerMavenInstance> = new Array<PayaraServerMavenInstance>();
        if (vscode.workspace.workspaceFolders) {
            for (let folder of vscode.workspace.workspaceFolders) {
                try {
                    let instance = this.instances.get(folder.uri.fsPath);
                    if (!instance) {
                        let build = BuildSupport.getBuild(null, folder.uri);
                        instance = new PayaraServerMavenInstance(this.context, build.getBuildReader().getArtifactId(), folder.uri);
                        this.instances.set(folder.uri.fsPath, instance);
                    }
                    instances.push(instance);
                } catch (e) {
                    // ..skip
                }
            }
        }
        return instances;
    }

}
