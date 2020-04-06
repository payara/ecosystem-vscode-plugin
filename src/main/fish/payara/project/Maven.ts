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
import * as fse from 'fs-extra';
import { WorkspaceFolder, Uri, DebugConfiguration } from "vscode";
import { Build } from './Build';
import { ChildProcess } from 'child_process';
import { JavaUtils } from '../server/tooling/utils/JavaUtils';
import { PayaraMicroProject } from '../micro/PayaraMicroProject';
import { MicroPluginReader } from '../micro/MicroPluginReader';
import { PomReader } from './PomReader';
import { PayaraMicroPlugin } from '../micro/PayaraMicroPlugin';
import { ProjectOutputWindowProvider } from './ProjectOutputWindowProvider';

export class Maven implements Build {

    private pomReader: PomReader | undefined;

    private microPluginReader: MicroPluginReader | undefined;

    constructor(public workspaceFolder: WorkspaceFolder) {
    }

    public static detect(workspaceFolder: WorkspaceFolder): boolean {
        let pom = path.join(workspaceFolder.uri.fsPath, 'pom.xml');
        return fs.existsSync(pom);
    }

    public buildProject(callback: (artifact: string) => any): void {
        this.fireCommand(["clean", "install"], () => { }, callback);
    }

    public fireCommand(command: string[], dataCallback: (data: string) => any, exitcallback: (artifact: string) => any): ChildProcess {
        let mavenHome: string | undefined = this.getDefaultHome();
        if (!mavenHome) {
            throw new Error("Maven home path not found.");
        }
        let mavenExe: string = this.getExecutableFullPath(mavenHome);
        // Maven executable should exist.
        if (!fse.pathExistsSync(mavenExe)) {
            throw new Error("Maven executable [" + mavenExe + "] not found");
        }
        if (!this.workspaceFolder) {
            throw new Error("WorkSpace path not found.");
        }
        let pom = path.join(this.workspaceFolder.uri.fsPath, 'pom.xml');
        let process: ChildProcess = cp.spawn(mavenExe, command, { cwd: this.workspaceFolder.uri.fsPath });

        if (process.pid) {
            let outputChannel = ProjectOutputWindowProvider.getInstance().get(this.workspaceFolder);
            outputChannel.show(false);
            outputChannel.append("> " + mavenExe + ' ' + command.join(" ") + '\n');
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
            process.on('error', (err: Error) => {
                console.log('error: ' + err.message);
            });
            process.on('exit', (code: number) => {
                if (code === 0 && this.workspaceFolder) {
                    let targetDir = this.getBuildDir();
                    let artifacts = fs.readdirSync(targetDir);
                    let artifact: string | null = null;
                    for (var i = 0; i < artifacts.length; i++) {
                        var filename = path.join(targetDir, artifacts[i]);
                        if (artifacts[i].endsWith('.war')
                            || artifacts[i].endsWith('.jar')
                            || artifacts[i] === this.getFinalName()) {
                            artifact = filename;
                        }
                    }
                    if (artifact !== null) {
                        exitcallback(artifact);
                    } else {
                        vscode.window.showErrorMessage(artifact + ' not found.');
                    }
                }
            });
        }
        return process;
    }

    public getDefaultHome(): string | undefined {
        const config = vscode.workspace.getConfiguration();
        let mavenHome: string | undefined = config.get<string>('maven.home');
        if (!mavenHome) {
            mavenHome = process.env.M2_HOME;
            if (!mavenHome) {
                mavenHome = process.env.MAVEN_HOME;
            }
        }
        return mavenHome;
    }

    public getExecutableFullPath(mavenHome: string): string {
        let mavenHomeEndsWithPathSep: boolean = mavenHome.charAt(mavenHome.length - 1) === path.sep;
        // Build string.
        let mavenExecStr: string = mavenHome;
        if (!mavenHomeEndsWithPathSep) {
            mavenExecStr += path.sep;
        }
        mavenExecStr += 'bin' + path.sep + 'mvn';
        if (JavaUtils.IS_WIN) {
            if (fs.existsSync(mavenExecStr + '.bat')) {
                mavenExecStr += ".bat";
            } else if (fs.existsSync(mavenExecStr + '.cmd')) {
                mavenExecStr += ".cmd";
            }
        }
        return mavenExecStr;
    }

    public generateProject(project: Partial<PayaraMicroProject>, callback: (projectPath: Uri) => any): void {
        let mavenHome: string | undefined = this.getDefaultHome();
        if (!mavenHome) {
            throw new Error("Maven home path not found.");
        }
        let mavenExe: string = this.getExecutableFullPath(mavenHome);
        // Maven executable should exist.
        if (!fse.pathExistsSync(mavenExe)) {
            throw new Error("Maven executable [" + mavenExe + "] not found");
        }
        const cmdArgs: string[] = [
            "archetype:generate",
            `-DarchetypeArtifactId=payara-micro-maven-archetype`,
            `-DarchetypeGroupId=fish.payara.maven.archetypes`,
            `-DarchetypeVersion=1.0.5`,
            `-DgroupId=${project.groupId}`,
            `-DartifactId=${project.artifactId}`,
            `-Dversion=${project.version}`,
            `-Dpackage=${project.package}`,
            `-DpayaraMicroVersion=${project.payaraMicroVersion}`,
            '-DaddPayaraApi=true',
            '-DinteractiveMode=false'
        ];
        let process: ChildProcess = cp.spawn(mavenExe, cmdArgs, { cwd: project.targetFolder?.fsPath });

        if (process.pid) {
            let outputChannel = ProjectOutputWindowProvider.getInstance().get(`${project.artifactId}`);
            outputChannel.show(false);
            let logCallback = (data: string | Buffer): void => outputChannel.append(data.toString());
            if (process.stdout !== null) {
                process.stdout.on('data', logCallback);
            }
            if (process.stderr !== null) {
                process.stderr.on('data', logCallback);
            }
            process.on('error', (err: Error) => {
                console.log('error: ' + err.message);
            });
            process.on('exit', (code: number) => {
                if (code === 0 && project.targetFolder && project.artifactId) {
                    callback(vscode.Uri.file(path.join(project.targetFolder.fsPath, project.artifactId)));
                }
            });
        }
    }

    public startPayaraMicro(debugConfig: DebugConfiguration | undefined, onData: (data: string) => any, onExit: (artifact: string) => any): ChildProcess {
        let cmds: string[] = [];
        if(this.getMicroPluginReader().isUberJarEnabled()) {
            cmds = [
                "install",
                `${PayaraMicroPlugin.GROUP_ID}:${PayaraMicroPlugin.ARTIFACT_ID}:${PayaraMicroPlugin.BUNDLE_GOAL}`,
                `${PayaraMicroPlugin.GROUP_ID}:${PayaraMicroPlugin.ARTIFACT_ID}:${PayaraMicroPlugin.START_GOAL}`
            ];
        } else {
            cmds = [
                "resources:resources",
                "compiler:compile",
                "war:exploded",
                `${PayaraMicroPlugin.GROUP_ID}:${PayaraMicroPlugin.ARTIFACT_ID}:${PayaraMicroPlugin.START_GOAL}`,
                "-Dexploded=true",
                "-DdeployWar=true"
            ];
        }
        if (debugConfig) {
            cmds.push("-Ddebug=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=" + debugConfig.port);
        }
        return this.fireCommand(cmds, onData, onExit);

    }

    public reloadPayaraMicro(onExit: (artifact: string) => any) {
        if(this.getMicroPluginReader().isUberJarEnabled()) {
            vscode.window.showWarningMessage('The reload action not supported for UberJar artifact.');
            return;
        }
        this.fireCommand([
            "resources:resources",
            "compiler:compile",
            "war:exploded",
            `${PayaraMicroPlugin.GROUP_ID}:${PayaraMicroPlugin.ARTIFACT_ID}:${PayaraMicroPlugin.RELOAD_GOAL}`
        ], () => { }, onExit);
    }

    public stopPayaraMicro(onExit: (artifact: string) => any) {
        this.fireCommand([
            `${PayaraMicroPlugin.GROUP_ID}:${PayaraMicroPlugin.ARTIFACT_ID}:${PayaraMicroPlugin.STOP_GOAL}`
        ], () => { }, onExit);
    }

    public bundlePayaraMicro(onExit: (artifact: string) => any) {
        let cmds = [
            "install",
            `${PayaraMicroPlugin.GROUP_ID}:${PayaraMicroPlugin.ARTIFACT_ID}:${PayaraMicroPlugin.BUNDLE_GOAL}`
        ];
        this.fireCommand(cmds, () => { }, onExit);
    }

    public getGroupId(): string {
        return this.getPomReader().getGroupId();
    }

    public getArtifactId(): string {
        return this.getPomReader().getArtifactId();
    }

    public getVersion(): string {
        return this.getPomReader().getVersion();
    }

    public getFinalName(): string {
        return this.getPomReader().getFinalName();
    }

    public getBuildDir(): string {
        let targetDir = path.join(this.workspaceFolder.uri.fsPath, 'target');
        if (!fs.existsSync(targetDir)) {
            throw Error("no target dir found: " + targetDir);
        }
        return targetDir;
    }

    public getPomReader(): PomReader {
        if (!this.pomReader) {
            this.initializePomReader();
        }
        if (!this.pomReader) {
            throw Error("Pom reader not initilized yet");
        }
        return this.pomReader;
    }

    private initializePomReader() {
        if (Maven.detect(this.workspaceFolder)) {
            let pom = path.join(this.workspaceFolder.uri.fsPath, 'pom.xml');
            this.pomReader = new PomReader(pom);
        }
    }

    public getMicroPluginReader(): MicroPluginReader {
        if (!this.microPluginReader) {
            this.initializeMicroPluginReader();
        }
        if (!this.microPluginReader) {
            throw Error("Pom reader not initilized yet");
        }
        return this.microPluginReader;
    }

    private initializeMicroPluginReader() {
        if (Maven.detect(this.workspaceFolder)) {
            let pom = path.join(this.workspaceFolder.uri.fsPath, 'pom.xml');
            this.microPluginReader = new MicroPluginReader(pom);
        }
    }

    public getWorkSpaceFolder(): WorkspaceFolder {
        return this.workspaceFolder;
    }

}