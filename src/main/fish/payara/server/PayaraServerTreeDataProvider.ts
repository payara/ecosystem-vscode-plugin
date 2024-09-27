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
import { ApplicationInstance } from '../project/ApplicationInstance';
import { RestEndpoint } from "../project/RestEndpoint";
import { PayaraLocalServerInstance } from './PayaraLocalServerInstance';

export class PayaraServerTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {

    onDidChangeTreeDataListener: vscode.EventEmitter<TreeItem> = new vscode.EventEmitter<TreeItem>();

    onDidChangeTreeData: vscode.Event<TreeItem> = this.onDidChangeTreeDataListener.event;

    constructor(private context: vscode.ExtensionContext, private instanceProvider: PayaraInstanceProvider) {
    }

    public refresh(item: TreeItem): void {
        this.onDidChangeTreeDataListener.fire(item);
    }

    public async getTreeItem(item: TreeItem): Promise<TreeItem> {
        return item;
    }

    public async getChildren(item?: TreeItem): Promise<TreeItem[]> {
        if (!item) {
            return this.instanceProvider.getServers().map((server: PayaraServerInstance) => {
                server.iconPath = vscode.Uri.file(this.context.asAbsolutePath(path.join('resources', server.getIcon())));
                server.contextValue = server.getState() + (server instanceof PayaraLocalServerInstance ? "Local" : "Remote");
                server.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                server.label = server.getName();
                server.tooltip = server.getTooltip();
                return server;
            });
        } else if (item instanceof PayaraServerInstance && item.isStarted()) {
            return item.getApplications().map((application: ApplicationInstance) => {
                application.iconPath = vscode.Uri.file(this.context.asAbsolutePath(path.join('resources', application.getIcon())));
                application.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                application.label = application.name;
                application.contextValue = "payara-application";
                return application;
            });
        } else if (item instanceof ApplicationInstance) {
            return item.getRestEndpoints().map((endpoint: RestEndpoint) => {
                endpoint.iconPath = vscode.Uri.file(this.context.asAbsolutePath(path.join('resources', 'rest-endpoint.svg')));
                endpoint.label = endpoint.httpMethod + " " + endpoint.endpoint;
                endpoint.contextValue = "application-rest-endpoint";
                return endpoint;
            });
        }
        return [];
    }

}
