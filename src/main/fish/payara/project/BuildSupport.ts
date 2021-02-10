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
import { Uri } from "vscode";
import { Build } from './Build';
import { Maven } from './Maven';
import { Gradle } from './Gradle';
import { PayaraInstance } from '../common/PayaraInstance';

export class BuildSupport {

    public static getBuild(payaraInstance: PayaraInstance | null, uri: Uri): Build {
        let workspace = vscode.workspace.getWorkspaceFolder(uri);
        if(!workspace) {
            throw new Error("workspace not found for [" + uri.fsPath + "].");
        }
        if(Maven.detect(workspace)){
            return new Maven(payaraInstance, workspace);
        } else if(Gradle.detect(workspace)){
            return new Gradle(payaraInstance, workspace);
        } else {
            throw new Error("Project build not supported for [" + uri.fsPath + "].");
        }
    }
}