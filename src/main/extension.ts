'use strict';

/*
 *
 * Copyright (c) 2020 Payara Foundation and/or its affiliates. All rights reserved.
 *
 * The contents of this file are subject to the terms of either the GNU
 * General Public License Version 2 only ("GPL") or the Common Development
 * and Distribution License("CDDL") (collectively, the "License").  You
 * may not use this file except in compliance with the License.  You can
 * obtain a copy of the License at
 * https://github.com/payara/Payara/blob/master/LICENSE.txt
 * See the License for the specific
 * language governing permissions and limitations under the License.
 *
 * When distributing the software, include this License Header Notice in each
 * file and include the License file at glassfish/legal/LICENSE.txt.
 *
 * GPL Classpath Exception:
 * The Payara Foundation designates this particular file as subject to the "Classpath"
 * exception as provided by the Payara Foundation in the GPL Version 2 section of the License
 * file that accompanied this code.
 *
 * Modifications:
 * If applicable, add the following below the License Header, with the fields
 * enclosed by brackets [] replaced by your own identifying information:
 * "Portions Copyright [year] [name of copyright owner]"
 *
 * Contributor(s):
 * If you wish your version of this file to be governed by only the CDDL or
 * only the GPL Version 2, indicate your decision by adding "[Contributor]
 * elects to include this software in this distribution under the [CDDL or GPL
 * Version 2] license."  If you don't indicate a single choice of license, a
 * recipient has the option to distribute your version of this file under
 * either the CDDL, the GPL Version 2 or to extend the choice of license to
 * its licensees as provided above.  However, if you add GPL Version 2 code
 * and therefore, elected the GPL Version 2 license, then the option applies
 * only if the new code is made subject to such option by the copyright
 * holder.
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
			'payara.server.remove',
			payaraServer => payaraInstanceController.removeServer(payaraServer)
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
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'payara.server.rename.context',
			payaraServer => payaraInstanceController.renameServer(payaraServer)
		)
	);
}



// this method is called when your extension is deactivated
export function deactivate() { }
