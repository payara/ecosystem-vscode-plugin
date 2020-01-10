'use strict';

import * as vscode from 'vscode';
import { PayaraInstanceProvider } from "./fish/payara/server/PayaraInstanceProvider";
import { PayaraInstanceController } from "./fish/payara/server/PayaraInstanceController";
import { PayaraServerTreeDataProvider } from "./fish/payara/server/PayaraServerTreeDataProvider";
import { PayaraServerInstance } from './fish/payara/server/PayaraServerInstance';

export async function activate(context: vscode.ExtensionContext): Promise<void> {

	const payaraInstanceProvider: PayaraInstanceProvider = new PayaraInstanceProvider(context);
	const payaraServerTree: PayaraServerTreeDataProvider = new PayaraServerTreeDataProvider(context, payaraInstanceProvider);
	const payaraInstanceController: PayaraInstanceController = new PayaraInstanceController(payaraInstanceProvider, context.extensionPath);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			'payaraServerExplorer', payaraServerTree
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.add',
			() => payaraInstanceController.addServer()
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.remove',
			payaraServer => payaraInstanceController.removeServer(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.refresh',
			payaraServer => payaraServerTree.refresh(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.remove.context', 
			payaraServer => payaraInstanceController.removeServer(payaraServer)
		)
	);


}



// this method is called when your extension is deactivated
export function deactivate() { }
