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
import { TreeItem } from "vscode";
import { PayaraInstanceProvider } from './PayaraInstanceProvider';
import { PayaraServerInstance } from "./PayaraServerInstance";

export class PayaraServerTreeDataProvider implements vscode.TreeDataProvider<PayaraServerInstance> {

    onDidChangeTreeDataListener: vscode.EventEmitter<PayaraServerInstance> = new vscode.EventEmitter<PayaraServerInstance>();

    onDidChangeTreeData: vscode.Event<PayaraServerInstance> = this.onDidChangeTreeDataListener.event;

    constructor(private context: vscode.ExtensionContext, private instanceProvider: PayaraInstanceProvider) {
        this.onDidChangeTreeDataListener.fire();
    }

    public refresh(element: PayaraServerInstance): void {
        this.onDidChangeTreeDataListener.fire(element);
    }

    public async getTreeItem(server: PayaraServerInstance): Promise<PayaraServerInstance> {
        return server;
    }

    public async getChildren(server?: PayaraServerInstance): Promise<PayaraServerInstance[]> {
        if (!server) {
            return this.instanceProvider.getServers().map((server: PayaraServerInstance) => {
                server.iconPath = this.context.asAbsolutePath(path.join('resources', `payara.svg`));
                server.contextValue = "";
                server.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                server.label = server.getName();
                return server;
            });
        } else {
            server.iconPath = this.context.asAbsolutePath(path.join('resources', `payara.svg`));
            server.contextValue = "";
            server.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            server.label = server.getName();
            return [];
        }
    }

}