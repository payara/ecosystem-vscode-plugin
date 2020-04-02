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
import { PayaraMicroInstance } from "./PayaraMicroInstance";
import { ServerUtils } from "../server/tooling/utils/ServerUtils";
import { BuildSupport } from "../project/BuildSupport";
import { Maven } from "../project/Maven";

export class PayaraMicroInstanceProvider {

    private instances: Map<string, PayaraMicroInstance> = new Map<string, PayaraMicroInstance>();

    constructor(public context: vscode.ExtensionContext) {
    }

    public getMicroInstances(): PayaraMicroInstance[] {
        let instances: Array<PayaraMicroInstance> = new Array<PayaraMicroInstance>();
        if (vscode.workspace.workspaceFolders) {
            for (let folder of vscode.workspace.workspaceFolders) {
                let build = BuildSupport.getBuild(folder.uri);
                if (Maven.detect(build.getWorkSpaceFolder())) {
                    let key = `${folder.uri.fsPath}#${build.getArtifactId()}`;
                    let instance = this.instances.get(key);
                    if (!instance) {
                        instance = new PayaraMicroInstance(this.context, build.getArtifactId(), folder.uri);
                        this.instances.set(key, instance);
                    }
                    instance.setBuildPluginExist(build.getMicroPluginReader().isPluginFound());
                    instances.push(instance);
                }
            }
        }
        return instances;
    }

}
