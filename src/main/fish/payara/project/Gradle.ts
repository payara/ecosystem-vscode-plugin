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
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { WorkspaceFolder, Uri, DebugConfiguration } from "vscode";
import { Build } from './Build';
import { ChildProcess } from 'child_process';
import { JavaUtils } from '../server/tooling/utils/JavaUtils';
import { PayaraMicroProject } from '../micro/PayaraMicroProject';
import { MicroPluginReader } from './MicroPluginReader';
import { ProjectOutputWindowProvider } from './ProjectOutputWindowProvider';
import { GradleBuildReader } from './GradleBuildReader';
import { GradleMicroPluginReader } from './GradleMicroPluginReader';
import { PayaraMicroGradlePlugin } from '../micro/PayaraMicroGradlePlugin';
import { BuildReader } from './BuildReader';

export class Gradle implements Build {

    private buildReader: GradleBuildReader | undefined;

    private microPluginReader: GradleMicroPluginReader | undefined;

    constructor(public workspaceFolder: WorkspaceFolder) {
        this.readBuildConfig();
    }

    public static detect(workspaceFolder: WorkspaceFolder): boolean {
        let build = path.join(workspaceFolder.uri.fsPath, 'build.gradle');
        return fs.existsSync(build);
    }

    public buildProject(callback: (artifact: string) => any): ChildProcess {
        return this.fireCommand(["clean", "build"],
            () => { },
            (code) => {
                if (code === 0 && this.workspaceFolder) {
                    let buildDir = this.getBuildDir();
                    let artifacts = fs.readdirSync(buildDir);
                    let artifact: string | null = null;
                    for (var i = 0; i < artifacts.length; i++) {
                        var filename = path.join(buildDir, artifacts[i]);
                        if (artifacts[i].endsWith('.war')
                            || artifacts[i].endsWith('.jar')
                            || artifacts[i] === this.getBuildReader().getFinalName()) {
                            artifact = filename;
                            break;
                        }
                    }
                    if (artifact !== null) {
                        callback(artifact);
                    } else {
                        vscode.window.showErrorMessage(artifact + ' not found.');
                    }
                }
                if (code !== 0) {
                    console.warn(`buildProject task failed with exit code ${code}`);
                }
            },
            (error) => {
                console.error(`Error on executing buildProject task: ${error.message}`);
            });
    }

    public fireCommand(command: string[],
        dataCallback: (data: string) => any,
        exitCallback: (code: number) => any,
        errorCallback: (err: Error) => any): ChildProcess {
        let gradleHome: string | undefined = this.getDefaultHome();
        if (!gradleHome) {
            throw new Error("Gradle home path not found.");
        }
        let gradleExe: string = this.getExecutableFullPath(gradleHome);
        // Gradle executable should exist.
        if (!fs.existsSync(gradleExe)) {
            throw new Error("Gradle executable [" + gradleExe + "] not found");
        }
        if (!this.workspaceFolder) {
            throw new Error("WorkSpace path not found.");
        }
        let process: ChildProcess = cp.spawn(gradleExe, command, { cwd: this.workspaceFolder.uri.fsPath });

        if (process.pid) {
            let outputChannel = ProjectOutputWindowProvider.getInstance().get(this.workspaceFolder);
            outputChannel.show(false);
            outputChannel.append("> " + gradleExe + ' ' + command.join(" ") + '\n');
            let logCallback = (data: string | Buffer): void => {
                outputChannel.append(data.toString());
                dataCallback(data.toString());
            };
            if (process.stdout !== null) {
                process.stdout.on('data', logCallback);
            }
            if (process.stderr !== null) {
                process.stderr.on('data', logCallback);
            }
            process.on('error', errorCallback);
            process.on('exit', exitCallback);
        }
        return process;
    }

    public getDefaultHome(): string | undefined {
        const config = vscode.workspace.getConfiguration();
        let gradleHome: string | undefined = config.get<string>('gradle.home');
        if (!gradleHome) {
            gradleHome = process.env.GRADLE_HOME;
        }
        return gradleHome;
    }

    public getExecutableFullPath(gradleHome: string): string {
        if (this.workspaceFolder &&
            fs.existsSync(path.join(this.workspaceFolder.uri.fsPath, 'gradle', 'wrapper'))) {
            let executor = this.workspaceFolder.uri.fsPath + path.sep + 'gradlew';
            if (JavaUtils.IS_WIN && fs.existsSync(executor + '.bat')) {
                return executor + '.bat';
            } else if (fs.existsSync(executor)) {
                return executor + '.bat';
            }
        }

        let homeEndsWithPathSep: boolean = gradleHome.charAt(gradleHome.length - 1) === path.sep;
        // Build string.
        let gradleExecStr: string = gradleHome;
        if (!homeEndsWithPathSep) {
            gradleExecStr += path.sep;
        }
        gradleExecStr += 'bin' + path.sep + 'gradle';
        if (JavaUtils.IS_WIN) {
            if (fs.existsSync(gradleExecStr + '.bat')) {
                gradleExecStr += ".bat";
            } else if (fs.existsSync(gradleExecStr + '.cmd')) {
                gradleExecStr += ".cmd";
            }
        }
        return gradleExecStr;
    }

    public getBuildDir(): string {
        let buildDir = path.join(this.workspaceFolder.uri.fsPath, 'build', 'libs');
        if (!fs.existsSync(buildDir)) {
            throw Error("no build dir found: " + buildDir);
        }
        return buildDir;
    }

    public getWorkSpaceFolder(): WorkspaceFolder {
        return this.workspaceFolder;
    }

    public getBuildReader(): BuildReader {
        if (!this.buildReader) {
            throw Error("Build reader not initilized yet");
        }
        return this.buildReader;
    }

    public getMicroPluginReader(): MicroPluginReader {
        if (!this.microPluginReader) {
            throw Error("Build reader not initilized yet");
        }
        return this.microPluginReader;
    }

    public async readBuildConfig() {
        if (Gradle.detect(this.workspaceFolder)) {
            this.microPluginReader = new GradleMicroPluginReader(this.workspaceFolder);
            this.buildReader = new GradleBuildReader(this.workspaceFolder);
        }
    }

    public generateMicroProject(project: Partial<PayaraMicroProject>, callback: (projectPath: Uri) => any): ChildProcess {
        throw new Error("Gradle project generator not supported yet.");
    }

    public startPayaraMicro(
        debugConfig: DebugConfiguration | undefined,
        onData: (data: string) => any,
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {

        let cmds: string[] = [];

        if (this.getMicroPluginReader().isDeployWarEnabled() === false
            && this.getMicroPluginReader().isUberJarEnabled() === false) {
            vscode.window.showWarningMessage('Please either enable the deployWar or useUberJar option in fish.payara.micro-gradle-plugin configuration to deploy the application.');
            return;
        }

        if (this.getMicroPluginReader().isUberJarEnabled()) {
            cmds = [
                PayaraMicroGradlePlugin.BUNDLE_GOAL,
                PayaraMicroGradlePlugin.START_GOAL
            ];
        } else {
            cmds = [
                PayaraMicroGradlePlugin.WAR_EXPLODE_GOAL,
                PayaraMicroGradlePlugin.START_GOAL,
                '-DpayaraMicro.exploded=true',
                '-DpayaraMicro.deployWar=true'
            ];
        }
        if (debugConfig) {
            cmds.push("-DpayaraMicro.debug=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=" + debugConfig.port);
        }
        return this.fireCommand(cmds, onData, onExit, onError);
    }

    public reloadPayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {

        if (this.getMicroPluginReader().isUberJarEnabled()) {
            vscode.window.showWarningMessage('The reload action not supported for UberJar artifact.');
            return;
        }
        let cmds: string[] = [
            PayaraMicroGradlePlugin.WAR_EXPLODE_GOAL,
            PayaraMicroGradlePlugin.RELOAD_GOAL,
        ];
        return this.fireCommand(cmds, () => { }, onExit, onError);
    }

    public stopPayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {
        return this.fireCommand([PayaraMicroGradlePlugin.STOP_GOAL], () => { }, onExit, onError);
    }

    public bundlePayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {
        return this.fireCommand([PayaraMicroGradlePlugin.BUNDLE_GOAL], () => { }, onExit, onError);
    }

}