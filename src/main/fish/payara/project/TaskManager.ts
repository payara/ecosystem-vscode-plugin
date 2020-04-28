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
import { WorkspaceFolder, DebugConfiguration, workspace, WorkspaceConfiguration, Uri, TaskDefinition } from "vscode";

export class TaskManager {

    public getPayaraConfig(workspaceFolder: WorkspaceFolder, defaultDefinition: TaskDefinition): TaskDefinition {
        let definition: TaskDefinition | undefined = undefined;
        for (const def of this.getDefinitions(workspaceFolder.uri)) {
            if (def.label && def.label === defaultDefinition.label) {
                definition = def;
            }
        }
        if (!definition) {
            definition = this.createDefinition(workspaceFolder, defaultDefinition);
        }
        return definition;
    }

    public getDefinitions(target: Uri): TaskDefinition[] {
        let workspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('tasks', target);
        let configurations: TaskDefinition[] | undefined = workspaceConfiguration.get<TaskDefinition[]>('tasks');
        return configurations ? configurations : [];
    }

    private createDefinition(workspaceFolder: WorkspaceFolder, defaultConfig: TaskDefinition): TaskDefinition {
        let vscodeDir = this.getVSCodeDir(workspaceFolder);
        let tasksFile = vscodeDir + '/tasks.json';
        let definitions: TaskDefinition[] = [];
        let tasks = workspace.getConfiguration('tasks', workspaceFolder.uri);
        if (!fs.existsSync(tasksFile)) {
            tasks.update('version', "2.0.0");
            tasks.update('tasks', []);
        } else {
            let definition = tasks.get<TaskDefinition[]>('tasks');
            if (definition) {
                definitions = definition;
            }
        }
        definitions.push(defaultConfig);
        tasks.update('tasks', definitions, false);
        return defaultConfig;
    }

    private getVSCodeDir(workspaceFolder: WorkspaceFolder) {
        let vscodeDir = workspaceFolder.uri.fsPath + '/.vscode';
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir);
        }
        return vscodeDir;
    }


}