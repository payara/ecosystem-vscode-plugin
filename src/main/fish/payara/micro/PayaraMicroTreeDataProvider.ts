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
import * as _ from "lodash";
import { TreeItem } from "vscode";
import { ApplicationInstance } from '../project/ApplicationInstance';
import { PayaraMicroInstance } from "./PayaraMicroInstance";
import { PayaraInstanceProvider } from "../server/PayaraInstanceProvider";
import { PayaraMicroInstanceProvider } from "./PayaraMicroInstanceProvider";
import { BuildSupport } from '../project/BuildSupport';

export class PayaraMicroTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {

    onDidChangeTreeDataListener: vscode.EventEmitter<TreeItem> = new vscode.EventEmitter<TreeItem>();

    onDidChangeTreeData: vscode.Event<TreeItem> = this.onDidChangeTreeDataListener.event;

    constructor(private context: vscode.ExtensionContext, private instanceProvider: PayaraMicroInstanceProvider) {
        this.onDidChangeTreeDataListener.fire();
    }

    public refresh(item: TreeItem): void {
        this.onDidChangeTreeDataListener.fire(item);
    }

    public async getTreeItem(item: TreeItem): Promise<TreeItem> {
        return item;
    }

    public async getChildren(item?: TreeItem): Promise<TreeItem[]> {
        let instances: Array<TreeItem> = new Array<TreeItem>();
        if (!item) {
            instances = this.instanceProvider.getMicroInstances();
        }
        return instances;
    }

}
