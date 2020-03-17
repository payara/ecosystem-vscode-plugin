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
import * as _ from "lodash";
import * as path from "path";
import * as open from "open";
import * as xml2js from "xml2js";
import * as fs from "fs";
import * as tmp from "tmp";
import * as fse from "fs-extra";
import * as cp from 'child_process';
import * as isPort from 'validator/lib/isPort';
import * as ui from "../../../UI";
import { QuickPickItem, CancellationToken, Uri, OutputChannel, QuickPick, QuickInputButton, OpenDialogOptions, workspace, InputBox } from 'vscode';
import { ChildProcess } from 'child_process';
import { URL } from 'url';
import { ApplicationInstance } from '../project/ApplicationInstance';
import { IncomingMessage } from 'http';
import { Build } from '../project/Build';
import { BuildSupport } from '../project/BuildSupport';
import { DeploymentSupport } from '../project/DeploymentSupport';
import { MyButton } from '../../../UI';
import { FileResult } from 'tmp';
import { userInfo } from 'os';
import { PayaraMicroInstance, InstanceState } from './PayaraMicroInstance';
import { PayaraMicroInstanceProvider } from './PayaraMicroInstanceProvider';

export class PayaraMicroInstanceController {

    private outputChannel: OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
        private instanceProvider: PayaraMicroInstanceProvider,
        private extensionPath: string) {
        this.outputChannel = vscode.window.createOutputChannel("payara");
        this.init();
    }

    private async init(): Promise<void> {
        this.refreshMicroList();
    }

    public async startMicro(payaraMicro: PayaraMicroInstance, debug: boolean, callback?: (status: boolean) => any): Promise<void> {
        if (!payaraMicro.isStopped()) {
            vscode.window.showErrorMessage('Payara Micro instance already running.');
            return;
        }
        let build = BuildSupport.getBuild(payaraMicro.getPath());
        payaraMicro.setState(InstanceState.LODING);
        this.refreshMicroList();
        let process: ChildProcess = build.startPayaraMicro(
            data => {
                if (!payaraMicro.isStarted()) {
                    if (data.indexOf("Payara Micro URLs:") > 0) {
                        payaraMicro.setState(InstanceState.RUNNING);
                        this.refreshMicroList();
                        let lines = data.substring(data.indexOf("Payara Micro URLs:")).split("\n");
                        if (lines.length > 1) {
                            payaraMicro.setHomePage(lines[1]);
                        }
                        let homePage = payaraMicro.getHomePage();
                        if (homePage !== undefined) {
                            open(homePage);
                        }
                    }
                }
            },
            artifact => {
                payaraMicro.setState(InstanceState.STOPPED);
            }
        );
        payaraMicro.setProcess(process);
    }


    public async reloadMicro(payaraMicro: PayaraMicroInstance): Promise<void> {
        if (payaraMicro.isStopped()) {
            vscode.window.showErrorMessage('Payara Micro instance not running.');
            return;
        }
        let build = BuildSupport.getBuild(payaraMicro.getPath());
        payaraMicro.setState(InstanceState.LODING);
        this.refreshMicroList();
        build.reloadPayaraMicro(artifact => {
            let explodedDir = path.join(build.getBuildDir(), build.getFinalName());
            if (!fs.existsSync(explodedDir)) {
                throw new Error(`${explodedDir} not found`);
            }
            let reloadFile = path.join(explodedDir, '.reload');
            fs.writeFileSync(reloadFile, "");
            payaraMicro.setState(InstanceState.RUNNING);
            this.refreshMicroList();
        });
    }

    public async stopMicro(payaraMicro: PayaraMicroInstance): Promise<void> {
        if (payaraMicro.isStopped()) {
            vscode.window.showErrorMessage('Payara Micro instance not running.');
            return;
        }
        let build = BuildSupport.getBuild(payaraMicro.getPath());
        build.stopPayaraMicro(artifact => {
            payaraMicro.setState(InstanceState.STOPPED);
            this.refreshMicroList();
        });
    }

    public async bundleMicro(payaraMicro: PayaraMicroInstance): Promise<void> {
        let build = BuildSupport.getBuild(payaraMicro.getPath());
        build.bundlePayaraMicro(artifact => {
        });
    }

    public async refreshMicroList(): Promise<void> {
        vscode.commands.executeCommand('payara.micro.refresh.all');
    }

    private async shouldResume(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

}
