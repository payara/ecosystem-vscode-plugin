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
import { PayaraMicroProjectGenerator } from './fish/payara/micro/PayaraMicroProjectGenerator';
import { PayaraMicroTreeDataProvider } from './fish/payara/micro/PayaraMicroTreeDataProvider';
import { PayaraMicroInstanceProvider } from './fish/payara/micro/PayaraMicroInstanceProvider';
import { PayaraMicroInstanceController } from './fish/payara/micro/PayaraMicroInstanceController';
import * as path from 'path';
import { exec } from 'child_process';

export async function activate(context: vscode.ExtensionContext): Promise<void> {

	const payaraServerInstanceProvider: PayaraInstanceProvider = new PayaraInstanceProvider(context);
	const payaraServerTree: PayaraServerTreeDataProvider = new PayaraServerTreeDataProvider(context, payaraServerInstanceProvider);
	const payaraServerInstanceController: PayaraInstanceController = new PayaraInstanceController(context, payaraServerInstanceProvider, context.extensionPath);

	const payaraMicroInstanceProvider: PayaraMicroInstanceProvider = new PayaraMicroInstanceProvider(context);
	const payaraMicroTree: PayaraMicroTreeDataProvider = new PayaraMicroTreeDataProvider(context, payaraMicroInstanceProvider);
	const payaraMicroInstanceController: PayaraMicroInstanceController = new PayaraMicroInstanceController(context, payaraMicroInstanceProvider, context.extensionPath);
	const payaraMicroProjectGenerator: PayaraMicroProjectGenerator = new PayaraMicroProjectGenerator(context, context.extensionPath);

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
		vscode.window.registerTreeDataProvider(
			'payaraMicroExplorer', payaraMicroTree
		)
	);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			'payaraMicro', payaraMicroTree
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.add',
			() => payaraServerInstanceController.addServer()
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.refresh.all',
			() => {
				for (let payaraServer of payaraServerInstanceProvider.getServers()) {
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
			payaraServer => payaraServerInstanceController.startServer(payaraServer, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.start.debug',
			payaraServer => payaraServerInstanceController.startServer(payaraServer, true)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.restart',
			payaraServer => payaraServerInstanceController.restartServer(payaraServer, payaraServer.isDebug())
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.stop',
			payaraServer => payaraServerInstanceController.stopServer(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.rename',
			payaraServer => payaraServerInstanceController.renameServer(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.remove',
			payaraServer => payaraServerInstanceController.removeServer(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.credentials',
			payaraServer => payaraServerInstanceController.updateCredentials(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.jdk.home',
			payaraServer => payaraServerInstanceController.updateJDKHome(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.console.open',
			payaraServer => payaraServerInstanceController.openConsole(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.log.open',
			payaraServer => payaraServerInstanceController.openLog(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.config.open',
			payaraServer => payaraServerInstanceController.openConfig(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.deploy',
			uri => payaraServerInstanceController.deployApp(uri, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.debug',
			uri => payaraServerInstanceController.deployApp(uri, true)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.undeploy',
			application => payaraServerInstanceController.undeployApp(application)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.enable',
			application => payaraServerInstanceController.enableApp(application)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.disable',
			application => payaraServerInstanceController.disableApp(application)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.home',
			application => payaraServerInstanceController.openApp(application)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.refresh.all',
			() => {
				for (let payaraMicro of payaraMicroInstanceProvider.getMicroInstances()) {
					payaraMicroTree.refresh(payaraMicro);
				}
			}
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.refresh',
			payaraMicro => {
				payaraMicroTree.refresh(payaraMicro);
			}
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.start',
			payaraMicro => payaraMicroInstanceController.startMicro(payaraMicro, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.start.debug',
			payaraMicro => payaraMicroInstanceController.startMicro(payaraMicro, true)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.reload',
			payaraMicro => payaraMicroInstanceController.reloadMicro(payaraMicro)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.stop',
			payaraMicro => payaraMicroInstanceController.stopMicro(payaraMicro)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.bundle',
			payaraMicro => payaraMicroInstanceController.bundleMicro(payaraMicro)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.create.project',
			() => payaraMicroProjectGenerator.createProject()
		)
	);

	vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		for (let payaraMicro of payaraMicroInstanceProvider.getMicroInstances()) {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
			if (payaraMicro.isStarted()
				&& workspaceFolder
				&& workspaceFolder.uri === payaraMicro.getPath()) {
				payaraMicroInstanceController.reloadMicro(payaraMicro);
			}
		}
	});

}

// this method is called when your extension is deactivated
export function deactivate() { }
