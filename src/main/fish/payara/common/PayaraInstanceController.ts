'use strict';

/*
 * Copyright (c) 2020-2021 Payara Foundation and/or its affiliates and others.
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

import * as _ from "lodash";
import * as vscode from 'vscode';
import { workspace } from 'vscode';
import { JDKVersion } from "../server/start/JDKVersion";
import { MyButton } from "../../../UI";
import * as ui from "../../../UI";
import { PayaraInstance } from "./PayaraInstance";
import { DeployOption } from "./DeployOption";

export abstract class PayaraInstanceController {

    constructor(
        public context: vscode.ExtensionContext) {
    }

    public async updateJDKHome(payaraInstance: PayaraInstance): Promise<void> {
        let validateInput: (value: string) => any = path => {
            let errorMessage = 'Invalid JDK Home path.';
            try {
                let version = JDKVersion.getJDKVersion(path.trim());
                if (!version) {
                    return errorMessage;
                }
            } catch (error) {
                console.error(error);
                return errorMessage;
            }
            return true;
        };
        let items: vscode.QuickPickItem[] = [];
        let activeItem: vscode.QuickPickItem | undefined = undefined;
        let javaHome: string | undefined = payaraInstance.getJDKHome();
        if (javaHome) {
            activeItem = { label: javaHome, detail: 'currently selected' };
            items.push(activeItem);
        }

        const config = workspace.getConfiguration();
        let javaHomeConfig = config.inspect<string>('java.home');
        if (javaHomeConfig
            && javaHomeConfig.workspaceValue
            && !_.isEmpty(javaHomeConfig.workspaceValue)) {
            let item = { label: javaHomeConfig.workspaceValue, detail: 'workspace settings > java.home' };
            items.push(item);
            if (!activeItem) {
                activeItem = item;
            }
        }
        if (javaHomeConfig
            && javaHomeConfig.globalValue
            && !_.isEmpty(javaHomeConfig.globalValue)) {
            let item = { label: javaHomeConfig.globalValue, detail: 'global settings > java.home' };
            items.push(item);
            if (!activeItem) {
                activeItem = item;
            }
        }
        if (process.env.JDK_HOME) {
            let item = { label: process.env.JDK_HOME, detail: 'JDK_HOME environment variables' };
            items.push(item);
            if (!activeItem) {
                activeItem = item;
            }
        }
        if (process.env.JAVA_HOME) {
            let item = { label: process.env.JAVA_HOME, detail: 'JAVA_HOME environment variables' };
            items.push(item);
            if (!activeItem) {
                activeItem = item;
            }
        }


        ui.MultiStepInput.run(
            async (input: ui.MultiStepInput) => {
                let browseJDKButtonLabel = 'Browse the JDK Home...';
                const browseJDKButton = new MyButton({
                    dark: vscode.Uri.file(this.context.asAbsolutePath('resources/theme/dark/add.svg')),
                    light: vscode.Uri.file(this.context.asAbsolutePath('resources/theme/light/add.svg')),
                }, browseJDKButtonLabel);
                let pick = await input.showQuickPick({
                    title: 'JDK Home',
                    step: 1,
                    totalSteps: 1,
                    items: items,
                    activeItem: activeItem,
                    placeholder: (javaHome ? javaHome : 'Enter the JDK Home'),
                    validate: validateInput,
                    buttons: [browseJDKButton],
                    shouldResume: this.shouldResume
                });
                let value;
                if (pick instanceof ui.MyButton || pick.label === browseJDKButtonLabel) {
                    let fileUris = await vscode.window.showOpenDialog({
                        defaultUri: javaHome ? vscode.Uri.file(javaHome) : (vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined),
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: 'Select JDK Home'
                    });
                    if (!fileUris) {
                        return;
                    }
                    const serverPaths: vscode.Uri[] = fileUris ? fileUris : [] as vscode.Uri[];
                    if (_.isEmpty(fileUris)
                        || !fileUris[0].fsPath
                        || !validateInput(fileUris[0].fsPath)) {
                        vscode.window.showErrorMessage("Selected JDK Home path is invalid.");
                        return;
                    }
                    value = fileUris[0].fsPath;
                } else {
                    value = pick.label;
                }
                if (value && (value = value.trim()) !== javaHome) {
                    payaraInstance.setJDKHome(value);
                    this.updateConfig();
                    vscode.window.showInformationMessage('JDK Home [' + value + '] updated successfully.');
                }
            });
    }

    public async deploySettings(payaraInstance: PayaraInstance): Promise<void> {
        let validateInput: (value: string) => any = path => {
            let errorMessage = 'Invalid JDK Home path.';
            try {
                let version = JDKVersion.getJDKVersion(path.trim());
                if (!version) {
                    return errorMessage;
                }
            } catch (error) {
                console.error(error);
                return errorMessage;
            }
            return true;
        };
        let items: vscode.QuickPickItem[] = [];
        let activeItem: vscode.QuickPickItem | undefined = undefined;
        let deployOption: string = payaraInstance.getDeployOption();

        for (var [key, value] of DeployOption.ALL_OPTIONS) {
            let item;
            if (deployOption === key.toString()) {
                item = {
                    label: this.humanize(key),
                    detail: value + ' (currently selected)',
                };
            } else {
                item = {
                    label: this.humanize(key),
                    detail: value
                };
            }
            items.push(item);
            if (!activeItem) {
                activeItem = item;
            }
        }

        ui.MultiStepInput.run(
            async (input: ui.MultiStepInput) => {
                let pick = await input.showQuickPick({
                    title: 'Deploy settings',
                    step: 1,
                    totalSteps: 1,
                    items: items,
                    activeItem: activeItem,
                    placeholder: 'Select the deployment option',
                    validate: validateInput,
                    shouldResume: this.shouldResume
                });
                let value = this.toEnum(pick.label);
                if (value && value !== deployOption?.toString()) {
                    payaraInstance.setDeployOption(value);
                    this.updateConfig();
                    vscode.window.showInformationMessage('Deployment setting [' + value + '] updated successfully.');
                }
            });
    }

    public async shouldResume(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

    public humanize(text: string) {
        let i, ags = text.split('_');
        for (i = 0; i < ags.length; i++) {
            ags[i] = ags[i].charAt(0).toUpperCase() + ags[i].slice(1).toLowerCase();
        }
        return ags.join(' ');
    }

    public toEnum(text: string) {
        return text.toUpperCase().replace(' ', '_');
    }

    abstract updateConfig(): void;
}
