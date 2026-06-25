'use strict';

/*
 * Copyright (c) 2020-2026 Payara Foundation and/or its affiliates and others.
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
import * as cp from 'child_process';
import { PayaraInstanceProvider } from "./fish/payara/server/PayaraInstanceProvider";
import { PayaraServerInstanceController } from "./fish/payara/server/PayaraServerInstanceController";
import { PayaraServerTreeDataProvider } from "./fish/payara/server/PayaraServerTreeDataProvider";
import { PayaraMicroProjectGenerator } from './fish/payara/micro/PayaraMicroProjectGenerator';
import { PayaraMicroTreeDataProvider } from './fish/payara/micro/PayaraMicroTreeDataProvider';
import { PayaraMicroInstanceProvider } from './fish/payara/micro/PayaraMicroInstanceProvider';
import { PayaraMicroInstanceController } from './fish/payara/micro/PayaraMicroInstanceController';
import { PayaraServerMavenInstanceProvider } from './fish/payara/server/maven/PayaraServerMavenInstanceProvider';
import { PayaraServerMavenTreeDataProvider } from './fish/payara/server/maven/PayaraServerMavenTreeDataProvider';
import { PayaraServerMavenInstanceController } from './fish/payara/server/maven/PayaraServerMavenInstanceController';
import * as path from 'path';
import { PayaraRemoteServerInstance } from './fish/payara/server/PayaraRemoteServerInstance';
import { DeployOption } from './fish/payara/common/DeployOption';
import { Uri, WorkspaceFolder } from 'vscode';
import { selectAIModel } from './fish/payara/ai/AIModelFetcher';
import { PayaraAIChatViewProvider } from './fish/payara/ai/PayaraAIChatViewProvider';

let _mavenInstanceProvider: PayaraServerMavenInstanceProvider | undefined;

export function deactivate(): void {
    killAllMavenInstances();
}

function killAllMavenInstances(): void {
    if (!_mavenInstanceProvider) { return; }
    for (const instance of _mavenInstanceProvider.getAllInstances()) {
        const proc = instance.getProcess();
        if (proc?.pid && !proc.killed) {
            try {
                if (process.platform === 'win32') {
                    cp.execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
                } else {
                    proc.kill('SIGTERM');
                }
            } catch (_) { /* already gone */ }
        }
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {

	const payaraServerInstanceProvider: PayaraInstanceProvider = new PayaraInstanceProvider(context);
	const payaraServerTree: PayaraServerTreeDataProvider = new PayaraServerTreeDataProvider(context, payaraServerInstanceProvider);
	const payaraServerInstanceController: PayaraServerInstanceController = new PayaraServerInstanceController(context, payaraServerInstanceProvider, context.extensionPath);

	const payaraMicroInstanceProvider: PayaraMicroInstanceProvider = new PayaraMicroInstanceProvider(context);
	const payaraMicroTree: PayaraMicroTreeDataProvider = new PayaraMicroTreeDataProvider(context, payaraMicroInstanceProvider);
	const payaraMicroInstanceController: PayaraMicroInstanceController = new PayaraMicroInstanceController(context, payaraMicroInstanceProvider, context.extensionPath);
	const payaraMicroProjectGenerator: PayaraMicroProjectGenerator = new PayaraMicroProjectGenerator(payaraMicroInstanceController);

	const payaraServerMavenInstanceProvider: PayaraServerMavenInstanceProvider = new PayaraServerMavenInstanceProvider(context);
	_mavenInstanceProvider = payaraServerMavenInstanceProvider;
	const payaraServerMavenTree: PayaraServerMavenTreeDataProvider = new PayaraServerMavenTreeDataProvider(context, payaraServerMavenInstanceProvider);
	const payaraAiChatProvider: PayaraAIChatViewProvider = new PayaraAIChatViewProvider(context.extensionUri);
	const payaraServerMavenInstanceController: PayaraServerMavenInstanceController = new PayaraServerMavenInstanceController(context, payaraServerMavenInstanceProvider, context.extensionPath, payaraAiChatProvider);

	// Kill any still-running Payara Server Maven process trees when VS Code shuts down.
	context.subscriptions.push({ dispose: killAllMavenInstances });

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
		vscode.window.registerTreeDataProvider(
			'payaraServerMavenExplorer', payaraServerMavenTree
		)
	);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			'payaraServerMaven', payaraServerMavenTree
		)
	);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			PayaraAIChatViewProvider.viewType,
			payaraAiChatProvider,
			{ webviewOptions: { retainContextWhenHidden: true } }
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
					if (payaraServer instanceof PayaraRemoteServerInstance && !payaraServer.isConnectionAllowed()) {
						continue;
					}
					payaraServer.checkAliveStatusUsingRest(2,
						async () => {
							payaraServer.setStarted(true);
							payaraServer.connectOutput();
							vscode.commands.executeCommand('payara.server.refresh');
							payaraServer.reloadApplications();
						},
						async (message?: string) => {
							payaraServer.setStarted(false);
							vscode.commands.executeCommand('payara.server.refresh');
						}
					);
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
			'payara.server.remote.connect',
			payaraServer => payaraServerInstanceController.connectServer(payaraServer, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.remote.disconnect',
			payaraServer => payaraServerInstanceController.disconnectServer(payaraServer, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.start',
			payaraServer => payaraServerInstanceController.startServer(payaraServer, false, '')
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.start.debug',
			payaraServer => {
				const activeEditor = vscode.window.activeTextEditor;
				var debugPort = activeEditor ? payaraServerInstanceController.readDebugPortFromWorkspace(activeEditor.document.uri) : undefined;
				payaraServerInstanceController.startServer(payaraServer, true, debugPort);
		}
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
			'payara.server.deploy.settings',
			payaraServer => payaraServerInstanceController.deploySettings(payaraServer)
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
			'payara.server.domain.open',
			payaraServer => payaraServerInstanceController.openDomainDirectory(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.home.open',
			payaraServer => payaraServerInstanceController.openServerHomeDirectory(payaraServer)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.deploy',
			uri => payaraServerInstanceController.deployApp(vscode.Uri.parse(uri), false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.debug',
			uri => payaraServerInstanceController.deployApp(vscode.Uri.parse(uri), true)
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
			'payara.server.app.rest.endpoint',
			restEndpoint => payaraServerInstanceController.openRestEndpoint(restEndpoint)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.app.migrate',
			uri => payaraServerInstanceController.migrateToJakarta10(uri)
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
			'payara.micro.start.dev',
			payaraMicro => payaraMicroInstanceController.devMicro(payaraMicro, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.start.dev.debug',
			payaraMicro => payaraMicroInstanceController.devMicro(payaraMicro, true)
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
			'payara.micro.jdk.home',
			payaraMicro => payaraMicroInstanceController.updateJDKHome(payaraMicro)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.deploy.settings',
			payaraMicro => payaraMicroInstanceController.deploySettings(payaraMicro)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.micro.create.project',
			() => payaraMicroProjectGenerator.createProject()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.refresh.all',
			() => {
				for (let payaraServerMaven of payaraServerMavenInstanceProvider.getServerMavenInstances()) {
					payaraServerMavenTree.refresh(payaraServerMaven);
				}
			}
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.refresh',
			payaraServerMaven => {
				payaraServerMavenTree.refresh(payaraServerMaven);
			}
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.start',
			payaraServerMaven => payaraServerMavenInstanceController.startServerMaven(payaraServerMaven, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.start.debug',
			payaraServerMaven => payaraServerMavenInstanceController.startServerMaven(payaraServerMaven, true)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.start.dev',
			payaraServerMaven => payaraServerMavenInstanceController.devServerMaven(payaraServerMaven, false)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.start.dev.debug',
			payaraServerMaven => payaraServerMavenInstanceController.devServerMaven(payaraServerMaven, true)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.stop',
			payaraServerMaven => payaraServerMavenInstanceController.stopServerMaven(payaraServerMaven)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.jdk.home',
			payaraServerMaven => payaraServerMavenInstanceController.updateJDKHome(payaraServerMaven)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.maven.deploy.settings',
			payaraServerMaven => payaraServerMavenInstanceController.deploySettings(payaraServerMaven)
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.ai.selectModel',
			() => selectAIModel()
		)
	);
	vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		let metadataChanged = true;
		let extName = path.extname(document.uri.fsPath);
		if (extName === ".java"
			|| extName === ".html"
			|| extName === ".js") {
			metadataChanged = false;
		}
		if (workspaceFolder) {
			if (!reloadServerInstance(workspaceFolder, document.uri, metadataChanged)) {
				reloadMicroInstance(workspaceFolder, document.uri, metadataChanged);
			}
		}
	});

	function reloadServerInstance(
		workspaceFolder: WorkspaceFolder,
		sourceChanged: Uri, metadataChanged?: boolean): boolean {

		let instance = payaraServerInstanceController.getPayaraServerInstance(workspaceFolder);
		// if(!instance) {
		// 	let instances:PayaraServerInstance[] = payaraServerInstanceProvider.getServers();
		// 	if(instances.length == 1) {
		// 		instance = instances[0];
		// 	}
		// }
		if (instance 
			&& instance.isStarted() 
			&& instance.getDeployOption() !== DeployOption.DEFAULT) {
			payaraServerInstanceController.deployApp(
				workspaceFolder.uri, false, true,
				instance, metadataChanged, [sourceChanged]
			);
			return true;
		}
		return false;

	}

	function reloadMicroInstance(
		workspaceFolder: WorkspaceFolder,
		sourceChanged: Uri, metadataChanged?: boolean) {

		for (let payaraMicro of payaraMicroInstanceProvider.getMicroInstances()) {
			let fileName = path.basename(sourceChanged.fsPath);
			if (fileName === "pom.xml"
				|| fileName === "build.gradle"
				|| fileName === "settings.gradle") {
				payaraMicro.getBuild().readBuildConfig();
			}

			if (payaraMicro.isStarted()
				&& payaraMicro.getDeployOption() !== DeployOption.DEFAULT
				&& workspaceFolder
				&& workspaceFolder.uri === payaraMicro.getPath()
				&& path.relative(payaraMicro.getPath().fsPath, sourceChanged.fsPath).startsWith("src")) {
				payaraMicroInstanceController.reloadMicro(payaraMicro, metadataChanged, [sourceChanged]);
			}
		}

	}

	vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		if (workspaceFolder) {
			let fileName = path.basename(document.uri.fsPath);
			if (fileName === "pom.xml") {
				for (let payaraServerMaven of payaraServerMavenInstanceProvider.getServerMavenInstances()) {
					if (workspaceFolder.uri === payaraServerMaven.getPath()) {
						payaraServerMaven.getBuild().readBuildConfig();
					}
				}
			}
		}
	});
}

