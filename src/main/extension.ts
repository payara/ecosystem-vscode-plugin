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
		vscode.window.registerTreeDataProvider(
			'payaraServer', payaraServerTree
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
			'payara.server.refresh.all',
			() => {
				for (let payaraServer of payaraInstanceProvider.getServers()) {
					if (payaraServer.isStarted()) {
						payaraServer.reloadApplications();
					}
					payaraServerTree.refresh(payaraServer);
				}
			}
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.refresh',
			payaraServer => {
				payaraServerTree.refresh(payaraServer);
			}
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.start',
			payaraServer => payaraInstanceController.startServer(payaraServer, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.start.debug',
			payaraServer => payaraInstanceController.startServer(payaraServer, true)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.restart',
			payaraServer => payaraInstanceController.restartServer(payaraServer, payaraServer.isDebug())
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.stop',
			payaraServer => payaraInstanceController.stopServer(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.rename',
			payaraServer => payaraInstanceController.renameServer(payaraServer)
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
			'payara.server.console.open',
			payaraServer => payaraInstanceController.openConsole(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.log.open',
			payaraServer => payaraInstanceController.openLog(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.config.open',
			payaraServer => payaraInstanceController.openConfig(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.deploy',
			uri => payaraInstanceController.deployApp(uri, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.debug',
			uri => payaraInstanceController.deployApp(uri, true)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.undeploy',
			application => payaraInstanceController.undeployApp(application)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.enable',
			application => payaraInstanceController.enableApp(application)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.disable',
			application => payaraInstanceController.disableApp(application)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.home',
			application => payaraInstanceController.openApp(application)
		)
	);
}



// this method is called when your extension is deactivated
export function deactivate() { }
