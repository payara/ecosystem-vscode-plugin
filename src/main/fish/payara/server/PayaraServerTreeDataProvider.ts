'use strict';

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