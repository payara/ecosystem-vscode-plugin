'use strict';


import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceFolder, OutputChannel, StatusBarItem } from 'vscode';

/*
 * Copyright (c) 2020-2021 Payara Foundation and/or its affiliates and others.
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

export class ProjectOutputWindowProvider {

    private static instance: ProjectOutputWindowProvider;

    private outputWindows = new Map<string, OutputChannel>();

    private statusBar: StatusBarItem;

    private constructor() {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    }

    public updateStatusBar(text: string) {
        this.statusBar.text = text;
        this.statusBar.show();
    }

    public hideStatusBar() {
        this.statusBar.hide();
    }

    public static getInstance() {
        if (!ProjectOutputWindowProvider.instance) {
            ProjectOutputWindowProvider.instance = new ProjectOutputWindowProvider();
        }
        return ProjectOutputWindowProvider.instance;
    }

    public get(key: WorkspaceFolder | string): OutputChannel {
        let windowName = typeof key === 'string' ? key : path.basename(key.uri.fsPath);
        let instance = this.outputWindows.get(windowName);
        if (!instance) {
            instance = vscode.window.createOutputChannel(windowName);
            this.outputWindows.set(windowName, instance);
        }
        return instance;
    }

}