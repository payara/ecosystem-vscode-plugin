'use strict';

/*
 * Copyright (c) 2020-2022 Payara Foundation and/or its affiliates and others.
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
import { WorkspaceFolder, Uri, DebugConfiguration, TaskDefinition } from "vscode";
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
import { TaskManager } from './TaskManager';
import { PayaraInstance } from '../common/PayaraInstance';
import { DeployOption } from '../common/DeployOption';

export class Gradle implements Build {

    private buildReader: GradleBuildReader | undefined;

    private microPluginReader: GradleMicroPluginReader | undefined;

    constructor(public payaraInstance: PayaraInstance | null, public workspaceFolder: WorkspaceFolder) {
        this.readBuildConfig();
    }

    public static detect(workspaceFolder: WorkspaceFolder): boolean {
        let build = path.join(workspaceFolder.uri.fsPath, 'build.gradle');
        return fs.existsSync(build);
    }

    public buildProject(remote: boolean, type: string,
        callback: (artifact: string) => any,
        silent?: boolean): ChildProcess {

        let taskManager: TaskManager = new TaskManager();
        let taskDefinition: TaskDefinition | undefined;
        taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultServerBuildConfig(remote));
        let commands = taskDefinition.command.split(/\s+/);
        return this.fireCommand(
            commands,
            () => { },
            (code) => {
                if (code === 0 && this.workspaceFolder) {
                    let buildDir = this.getBuildDir();
                    let artifacts = fs.readdirSync(buildDir);
                    let artifact: string | null = null;
                    for (var i = 0; i < artifacts.length; i++) {
                        var filename = path.join(buildDir, artifacts[i]);
                        if (remote && type !== "docker" && type !== "wsl") {
                            if (artifacts[i].endsWith('.war')
                                || artifacts[i].endsWith('.jar')
                                || artifacts[i].endsWith('.rar')) {
                                artifact = filename;
                                break;
                            }
                        } else {
                            if (artifacts[i].endsWith('.war')
                                || artifacts[i].endsWith('.jar')
                                || artifacts[i].endsWith('.rar')
                                || artifacts[i] === this.getBuildReader().getFinalName()) {
                                artifact = filename;
                                break;
                            }
                        }
                    }
                    if (artifact !== null) {
                        callback(artifact);
                    } else {
                        let errorMessage = 'Deployment artifact not found in the target.';
                        if (remote) {
                            vscode.window.showErrorMessage(errorMessage
                                + ' Make sure the deployment file ends with .jar, .rar, or .war to deploy an application to the remote instance.');
                        } else {
                            vscode.window.showErrorMessage(errorMessage);
                        }
                    }
                }
                if (code !== 0) {
                    vscode.window.showErrorMessage(`Gradle Build Failure: ${this.workspaceFolder.name}`);
                }
            },
            (error) => {
                vscode.window.showErrorMessage(`Error building project ${this.workspaceFolder.name}: ${error.message}`);
            },
            silent
        );
    }

    public fireCommand(commands: string[],
        dataCallback: (data: string) => any,
        exitCallback: (code: number) => any,
        errorCallback: (err: Error) => any,
        silent?: boolean): ChildProcess {

        if (commands.length <= 1) {
            throw new Error(`Invalid command definition ${commands.join(" ")}`);
        }

        let gradleExe = commands[0];
        let args = commands.splice(1, commands.length);

        if (gradleExe === "gradlew") {
            gradleExe = this.getWrapperFullPath();
        } else {
            gradleExe = this.getExecutableFullPath(undefined);
        }

        if (!this.workspaceFolder) {
            throw new Error("WorkSpace path not found.");
        }

        let jdkHome;
        let env: any = {};
        if (this.payaraInstance && (jdkHome = this.payaraInstance.getJDKHome())) {
            env['JAVA_HOME'] = jdkHome;
        }

        let process: ChildProcess = cp.spawn(gradleExe, args, { cwd: this.workspaceFolder.uri.fsPath, env: env });

        if (process.pid) {
            let projectOutputWindowProvider = ProjectOutputWindowProvider.getInstance();
            let outputChannel = projectOutputWindowProvider.get(this.workspaceFolder);
            if (silent !== true) {
                outputChannel.show(false);
            } else {
                projectOutputWindowProvider.updateStatusBar(`Running ${commands.join(" ")}`);
            }
            if (jdkHome) {
                outputChannel.append("Java Platform: " + jdkHome + '\n');
            }
            outputChannel.append("> " + gradleExe + ' ' + args.join(" ") + '\n');
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

    public getExecutableFullPath(gradleHome: string | undefined): string {
        if (!gradleHome) {
            gradleHome = this.getDefaultHome();
        }
        if (!gradleHome) {
            throw new Error("Gradle home path not found.");
        }
        let homeEndsWithPathSep: boolean = gradleHome.charAt(gradleHome.length - 1) === path.sep;
        let gradleExecStr;
        let executor: string = gradleHome;
        if (!homeEndsWithPathSep) {
            executor += path.sep;
        }
        executor += 'bin' + path.sep + 'gradle';
        if (JavaUtils.IS_WIN) {
            if (fs.existsSync(executor + '.bat')) {
                gradleExecStr = executor + ".bat";
            } else if (fs.existsSync(executor + '.cmd')) {
                gradleExecStr = executor + ".cmd";
            } else {
                throw new Error(`Gradle executable ${executor}.cmd not found.`);
            }
        } else if (fs.existsSync(executor)) {
            gradleExecStr = executor;
        }
        // Gradle executable should exist.
        if (!gradleExecStr || !fs.existsSync(gradleExecStr)) {
            throw new Error(`Gradle executable [${gradleExecStr}] not found`);
        }
        return gradleExecStr;
    }

    public getWrapperFullPath(): string {
        let executor;
        let gradleExecStr;

        if (this.workspaceFolder &&
            fs.existsSync(path.join(this.workspaceFolder.uri.fsPath, 'gradle', 'wrapper'))) {
            executor = this.workspaceFolder.uri.fsPath + path.sep + 'gradlew';
            if (JavaUtils.IS_WIN) {
                if (fs.existsSync(executor + '.bat')) {
                    gradleExecStr = executor + '.bat';
                } else if (fs.existsSync(executor + '.cmd')) {
                    gradleExecStr = executor + '.cmd';
                } else {
                    throw new Error(`${executor}.bat not found in the workspace.`);
                }
            } else if (fs.existsSync(executor)) {
                gradleExecStr = executor;
            }
        }
        if (!gradleExecStr || !fs.existsSync(gradleExecStr)) {
            throw new Error(`${executor} not found in the workspace.`);
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

        if (this.getMicroPluginReader().isDeployWarEnabled() === false
            && this.getMicroPluginReader().isUberJarEnabled() === false) {
            vscode.window.showWarningMessage('Please either enable the deployWar or useUberJar option in fish.payara.micro-gradle-plugin configuration to deploy the application.');
            return;
        }

        let taskManager: TaskManager = new TaskManager();
        let taskDefinition;
        if (this.getMicroPluginReader().isUberJarEnabled()) {
            taskDefinition = taskManager.getPayaraConfig(
                this.workspaceFolder,
                this.getDefaultMicroStartUberJarConfig());
        } else {
            taskDefinition = taskManager.getPayaraConfig(
                this.workspaceFolder,
                this.getDefaultMicroStartExplodedWarConfig());
        }
        let commands = taskDefinition.command.split(/\s+/);
        if(this.payaraInstance?.getDeployOption() === DeployOption.HOT_RELOAD) {
            commands.push('-DhotDeploy=true');
        }
        if (debugConfig) {
            commands.push(`-DpayaraMicro.debug=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${debugConfig.port}`);
        }
        return this.fireCommand(commands, onData, onExit, onError);
    }

    public reloadPayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any,
        metadataChanged?: boolean, 
        sourcesChanged?: Uri[]
    ): ChildProcess | undefined {

        if (this.getMicroPluginReader().isUberJarEnabled()) {
            vscode.window.showWarningMessage('The reload action not supported for UberJar artifact.');
            return;
        }
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultMicroReloadConfig());
        let commands = taskDefinition.command.split(/\s+/);
        if(this.payaraInstance?.getDeployOption() === DeployOption.HOT_RELOAD) {
            commands.push('-DhotDeploy=true');
            if (metadataChanged) {
                commands.push('-DmetadataChanged=true');
            }
            if (Array.isArray(sourcesChanged) && sourcesChanged.length > 0) {
                commands.push(`-DsourcesChanged=${sourcesChanged.join(',')}`);
            }
        }
        return this.fireCommand(commands, () => { }, onExit, onError);
    }

    public stopPayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultMicroStopConfig());
        let commands = taskDefinition.command.split(/\s+/);
        return this.fireCommand(commands, () => { }, onExit, onError);
    }

    public bundlePayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultMicroBundleConfig());
        let commands = taskDefinition.command.split(/\s+/);
        return this.fireCommand(commands, () => { }, onExit, onError);
    }

    public getDefaultServerBuildConfig(remote: boolean): TaskDefinition {
        return {
            label: "payara-server-build",
            type: "shell",
            command: "gradle clean build " + (remote ? "war" : "warExplode"),
            group: "build"
        };
    }

    private getDefaultMicroBundleConfig(): TaskDefinition {
        return {
            label: "payara-micro-bundle",
            type: "shell",
            command: `gradle ${PayaraMicroGradlePlugin.BUNDLE_GOAL}`,
            group: "build"
        };
    }

    private getDefaultMicroStartUberJarConfig(): TaskDefinition {
        return {
            label: "payara-micro-uber-jar-start",
            type: "shell",
            command: `gradle ${PayaraMicroGradlePlugin.BUNDLE_GOAL} ${PayaraMicroGradlePlugin.START_GOAL}`,
            group: "build"
        };
    }

    private getDefaultMicroStartExplodedWarConfig(): TaskDefinition {
        return {
            label: "payara-micro-exploded-war-start",
            type: "shell",
            command: `gradle -DpayaraMicro.exploded=true -DpayaraMicro.deployWar=true ${PayaraMicroGradlePlugin.WAR_EXPLODE_GOAL} ${PayaraMicroGradlePlugin.START_GOAL}`,
            group: "build"
        };
    }

    private getDefaultMicroReloadConfig(): TaskDefinition {
        return {
            label: "payara-micro-reload",
            type: "shell",
            command: `gradle ${PayaraMicroGradlePlugin.WAR_EXPLODE_GOAL} ${PayaraMicroGradlePlugin.RELOAD_GOAL}`,
            group: "build"
        };
    }

    private getDefaultMicroStopConfig(): TaskDefinition {
        return {
            label: "payara-micro-stop",
            type: "shell",
            command: `gradle ${PayaraMicroGradlePlugin.STOP_GOAL}`,
            group: "build"
        };
    }

}