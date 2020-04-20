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
import { PayaraServerInstance } from '../server/PayaraServerInstance';
import { RestEndpoints } from "../server/endpoints/RestEndpoints";
import { ProjectOutputWindowProvider } from "./ProjectOutputWindowProvider";

export class ApplicationInstance extends vscode.TreeItem {

    private enabled: boolean = true;

    private contextPath: string | null | undefined = undefined;

    private outputChannel: vscode.OutputChannel;

    constructor(
        public payaraServer: PayaraServerInstance,
        public name: string,
        public appType?: string | null) {
        super(name);
        this.outputChannel = ProjectOutputWindowProvider.getInstance().get(name);
    }

    public setEnabled(status: boolean): void {
        this.enabled = status;
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public setContextPath(contextPath: string | null): void {
        this.contextPath = contextPath;
    }

    public getContextPath(): string | null | undefined {
        return this.contextPath;
    }

    public fetchContextPath(callback: (contextPath: string) => any) {
        let application = this;
        let payaraServer = this.payaraServer;
        let query = '?appname=' + encodeURIComponent(this.name) + '&modulename=' + encodeURIComponent(this.name);
        let endpoints: RestEndpoints = new RestEndpoints(payaraServer);
        endpoints.invoke("_get-context-root" + query, async (response, report) => {
            if (response.statusCode === 200) {
                let message = report['message-part'][0];
                if (message.property) {
                    let property = message.property[0].$;
                    if (property.name === 'contextRoot') {
                        let contextRoot = <string>property.value;
                        application.setContextPath(contextRoot);
                        if (contextRoot) {
                            callback(contextRoot);
                        } else {
                            vscode.window.showInformationMessage('Context path not found for the application: ' + application.name);
                        }
                    }
                }
            }
        });
    }

    public getIcon(): string {
        let icon: string;
        if (this.appType === 'web') {
            if (this.isEnabled()) {
                icon = `webapp.svg`;
            } else {
                icon = `webapp-disabled.svg`;
            }
        } else if (this.appType === 'ejb') {
            if (this.isEnabled()) {
                icon = `ejbapp.svg`;
            } else {
                icon = `ejbapp-disabled.svg`;
            }
        } else {
            if (this.isEnabled()) {
                icon = `app.svg`;
            } else {
                icon = `app-disabled.svg`;
            }
        }
        return icon;
    }

    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }
}