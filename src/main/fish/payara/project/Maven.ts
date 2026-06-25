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
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { WorkspaceFolder, Uri, DebugConfiguration, TaskDefinition } from "vscode";
import { Build } from './Build';
import { ChildProcess } from 'child_process';
import { JavaUtils } from '../server/tooling/utils/JavaUtils';
import { PayaraMicroProject } from '../micro/PayaraMicroProject';
import { MicroPluginReader } from './MicroPluginReader';
import { MavenPomReader } from './MavenPomReader';
import { PayaraMicroMavenPlugin } from '../micro/PayaraMicroMavenPlugin';
import { PayaraServerTransformPlugin } from '../server/PayaraServerTransformPlugin';
import { ProjectOutputWindowProvider } from './ProjectOutputWindowProvider';
import { MavenMicroPluginReader } from './MavenMicroPluginReader';
import { BuildReader } from './BuildReader';
import { PayaraServerMavenPlugin } from '../server/maven/PayaraServerMavenPlugin';
import { TaskManager } from './TaskManager';
import { PayaraInstance } from '../common/PayaraInstance';
import { DeployOption } from '../common/DeployOption';

export class Maven implements Build {

    private pomReader: BuildReader | undefined;

    private microPluginReader: MicroPluginReader | undefined;

    constructor(public payaraInstance: PayaraInstance | null, public workspaceFolder: WorkspaceFolder) {
        this.readBuildConfig();
    }

    public static detect(workspaceFolder: WorkspaceFolder): boolean {
        let pom = path.join(workspaceFolder.uri.fsPath, 'pom.xml');
        return fs.existsSync(pom);
    }

    public buildProject(remote: boolean, type: string,
        callback: (artifact: string) => any,
        silent?: boolean): ChildProcess {
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultServerBuildConfig(remote));
        let commands = taskDefinition.command.split(/\s+/);
        return this.fireCommand(
            commands,
            () => { },
            (code) => {
                if (code === 0 && this.workspaceFolder) {
                    let targetDir = this.getBuildDir();
                    let artifacts = fs.readdirSync(targetDir);
                    let artifact: string | null = null;
                    for (var i = 0; i < artifacts.length; i++) {
                        var filename = path.join(targetDir, artifacts[i]);
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
                                || artifacts[i] === this.getBuildReader().getFinalName().toString()) {
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
                    vscode.window.showErrorMessage(`Maven Build Failure: ${this.workspaceFolder.name}`);
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

        let mavenExe = commands[0];
        let args = commands.splice(1, commands.length);

        if (mavenExe === "mvnw") {
            mavenExe = this.getWrapperFullPath();
        } else {
            mavenExe = this.getExecutableFullPath(undefined);
        }

        if (!this.workspaceFolder) {
            throw new Error("WorkSpace path not found.");
        }

        let jdkHome;
        let env = { ...process.env };
        if (this.payaraInstance && (jdkHome = this.payaraInstance.getJDKHome())) {
            env['JAVA_HOME'] = jdkHome;
        }

        let mvnProcess: ChildProcess = cp.spawn(mavenExe, args, { cwd: this.workspaceFolder.uri.fsPath, shell: true, env: env});

        if (mvnProcess.pid) {
            let outputChannel = ProjectOutputWindowProvider.getInstance().get(this.workspaceFolder);
            if (silent !== true) {
                outputChannel.show(false);
            }
            if (jdkHome) {
                outputChannel.append("Java Platform: " + jdkHome + '\n');
            }
            outputChannel.append("> " + mavenExe + ' ' + args.join(" ") + '\n');
            let logCallback = (data: string | Buffer): void => {
                outputChannel.append(data.toString());
                dataCallback(data.toString());
            };
            if (mvnProcess.stdout !== null) {
                mvnProcess.stdout.on('data', logCallback);
            }
            if (mvnProcess.stderr !== null) {
                mvnProcess.stderr.on('data', logCallback);
            }
            mvnProcess.on('error', errorCallback);
            mvnProcess.on('exit', exitCallback);
        }
        return mvnProcess;
    }

    public fireCommandInteractive(
        commands: string[],
        terminalName: string,
        dataCallback: (data: string) => any,
        exitCallback: (code: number) => any,
        errorCallback: (err: Error) => any,
        extraEnv?: Record<string, string>
    ): ChildProcess {
        if (commands.length <= 1) {
            throw new Error(`Invalid command definition ${commands.join(" ")}`);
        }

        let mavenExe = commands[0];
        let args = commands.splice(1, commands.length);

        if (mavenExe === "mvnw") {
            mavenExe = this.getWrapperFullPath();
        } else {
            mavenExe = this.getExecutableFullPath(undefined);
        }

        if (!this.workspaceFolder) {
            throw new Error("WorkSpace path not found.");
        }

        let jdkHome: string | undefined;
        let env = { ...process.env, ...extraEnv };
        if (this.payaraInstance && (jdkHome = this.payaraInstance.getJDKHome())) {
            env['JAVA_HOME'] = jdkHome;
        }

        const writeEmitter = new vscode.EventEmitter<string>();
        const outputBuffer: string[] = [];
        let terminalOpen = false;

        const mvnProcess: ChildProcess = cp.spawn(mavenExe, args, {
            cwd: this.workspaceFolder.uri.fsPath,
            shell: true,
            env: env
        });

        const handleData = (data: string | Buffer): void => {
            const text = data.toString().replace(/\r?\n/g, '\r\n');
            if (terminalOpen) {
                writeEmitter.fire(text);
            } else {
                outputBuffer.push(text);
            }
            dataCallback(data.toString());
        };

        if (mvnProcess.stdout !== null) {
            mvnProcess.stdout.on('data', handleData);
        }
        if (mvnProcess.stderr !== null) {
            mvnProcess.stderr.on('data', handleData);
        }
        mvnProcess.on('error', errorCallback);
        mvnProcess.on('exit', (code: number) => {
            writeEmitter.fire(`\r\nProcess exited with code ${code}\r\n`);
            exitCallback(code);
        });

        // Kill the entire process tree (cmd.exe + Maven JVM + Payara JVM) when
        // the Node.js extension host exits, so no orphaned server is left behind.
        const killTree = () => {
            if (mvnProcess.pid && !mvnProcess.killed) {
                try {
                    if (JavaUtils.IS_WIN) {
                        cp.execSync(`taskkill /F /T /PID ${mvnProcess.pid}`, { stdio: 'ignore' });
                    } else {
                        mvnProcess.kill('SIGTERM');
                    }
                } catch (_) { /* already gone */ }
            }
        };
        process.on('exit', killTree);
        // Remove the listener once Maven exits normally to avoid accumulating stale listeners.
        mvnProcess.once('exit', () => process.removeListener('exit', killTree));

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            open: () => {
                terminalOpen = true;
                if (jdkHome) {
                    writeEmitter.fire(`Java Platform: ${jdkHome}\r\n`);
                }
                writeEmitter.fire(`> ${mavenExe} ${args.join(' ')}\r\n`);
                for (const chunk of outputBuffer) {
                    writeEmitter.fire(chunk);
                }
                outputBuffer.length = 0;
            },
            handleInput: (data: string) => {
                if (mvnProcess.stdin) {
                    if (data === '\r') {
                        mvnProcess.stdin.write('\n');
                        writeEmitter.fire('\r\n');
                    } else {
                        mvnProcess.stdin.write(data);
                        writeEmitter.fire(data);
                    }
                }
            },
            close: () => {
                if (mvnProcess.pid && !mvnProcess.killed) {
                    try {
                        if (JavaUtils.IS_WIN) {
                            cp.execSync(`taskkill /F /T /PID ${mvnProcess.pid}`, { stdio: 'ignore' });
                        } else {
                            mvnProcess.kill('SIGTERM');
                        }
                    } catch (_) { /* already gone */ }
                }
                writeEmitter.dispose();
            }
        };

        vscode.window.createTerminal({ name: terminalName, pty }).show(false);

        return mvnProcess;
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

    public getExecutableFullPath(mavenHome: string | undefined): string {
        if (!mavenHome) {
            mavenHome = this.getDefaultHome();
        }
        if (!mavenHome) {
            throw new Error("Maven home path not found.");
        }
        let mavenHomeEndsWithPathSep: boolean = mavenHome.charAt(mavenHome.length - 1) === path.sep;
        let mavenExecStr;
        let executor: string = mavenHome;
        if (!mavenHomeEndsWithPathSep) {
            executor += path.sep;
        }
        executor += 'bin' + path.sep + 'mvn';
        if (JavaUtils.IS_WIN) {
            if (fs.existsSync(executor + '.bat')) {
                mavenExecStr = executor + ".bat";
            } else if (fs.existsSync(executor + '.cmd')) {
                mavenExecStr = executor + ".cmd";
            } else {
                throw new Error(`Maven executable ${executor}.cmd not found.`);
            }
        } else if (fs.existsSync(executor)) {
            mavenExecStr = executor;
        }
        // Maven executable should exist.
        if (!mavenExecStr || !fs.existsSync(mavenExecStr)) {
            throw new Error(`Maven executable [${mavenExecStr}] not found`);
        }
        return mavenExecStr;
    }

    public getWrapperFullPath(): string {

        let executor;
        let mavenExecStr;

        if (this.workspaceFolder &&
            fs.existsSync(path.join(this.workspaceFolder.uri.fsPath, '.mvn', 'wrapper'))) {
            executor = this.workspaceFolder.uri.fsPath + path.sep + 'mvnw';
            if (JavaUtils.IS_WIN) {
                if (fs.existsSync(executor + '.bat')) {
                    mavenExecStr = executor + '.bat';
                } else if (fs.existsSync(executor + '.cmd')) {
                    mavenExecStr = executor + '.cmd';
                } else {
                    throw new Error(`${executor}.cmd not found in the workspace.`);
                }
            } else if (fs.existsSync(executor)) {
                mavenExecStr = executor;
            }
        }
        if (!mavenExecStr || !fs.existsSync(mavenExecStr)) {
            throw new Error(`${executor} not found in the workspace.`);
        }
        return mavenExecStr;
    }

    public getBuildDir(): string {
        let buildDirValue = 'target';
        if (this.pomReader instanceof MavenPomReader) {
            let customDir = this.pomReader.getBuildDirectory();
            if (customDir.length > 0) {
                buildDirValue = customDir;
            }
        }
        let targetDir = path.resolve(this.workspaceFolder.uri.fsPath, buildDirValue);
        if (!fs.existsSync(targetDir)) {
            throw Error("no target dir found: " + targetDir);
        }
        return targetDir;
    }

    public getWorkSpaceFolder(): WorkspaceFolder {
        return this.workspaceFolder;
    }

    public getBuildReader(): BuildReader {
        if (!this.pomReader) {
            throw Error("Pom reader not initilized yet");
        }
        return this.pomReader;
    }

    public getMicroPluginReader(): MicroPluginReader {
        if (!this.microPluginReader) {
            throw Error("Pom reader not initilized yet");
        }
        return this.microPluginReader;
    }

    public readBuildConfig() {
        if (Maven.detect(this.workspaceFolder)) {
            this.microPluginReader = new MavenMicroPluginReader(this.workspaceFolder);
            this.pomReader = new MavenPomReader(this.workspaceFolder);
        }
    }

    public generateMicroProject(project: Partial<PayaraMicroProject>, callback: (projectPath: Uri) => any): ChildProcess | undefined {
        let mavenHome: string | undefined = this.getDefaultHome();
        if (!mavenHome) {
            throw new Error("Maven home path not found.");
        }
        let mavenExe: string = this.getExecutableFullPath(mavenHome);
        // Maven executable should exist.
        if (!fs.existsSync(mavenExe)) {
            throw new Error("Maven executable [" + mavenExe + "] not found");
        }
        const cmdArgs: string[] = [
            "org.apache.maven.plugins:maven-archetype-plugin:3.2.1:generate",
            `-DarchetypeArtifactId=payara-starter-archetype`,
            `-DarchetypeGroupId=fish.payara.starter`,
            `-DarchetypeVersion=1.0-beta9`,
            `-DgroupId=${project.groupId}`,
            `-DartifactId=${project.artifactId}`,
            `-Dversion=${project.version}`,
            `-Dpackage=${project.package}`,
            `-DpayaraMicroVersion=${project.payaraMicroVersion}`,
            '-DaddPayaraApi=true',
            '-DinteractiveMode=false',
            '-DjakartaEEVersion='+ (project.payaraMicroVersion.split('.')[0] === '5' ? '8' : '10'),
            '-Dplatform=micro'
        ];

        let jdkHome;
        let env = { ...process.env };
        if (this.payaraInstance && (jdkHome = this.payaraInstance.getJDKHome())) {
            env['JAVA_HOME'] = jdkHome;
        }

        let childProcess: ChildProcess = cp.spawn(mavenExe, cmdArgs, { cwd: project.targetFolder?.fsPath,  shell: true, env: env });

        if (childProcess.pid) {
            let outputChannel = ProjectOutputWindowProvider.getInstance().get(`${project.artifactId}`);
            outputChannel.show(false);
            let logCallback = (data: string | Buffer): void => outputChannel.append(data.toString());
            if (childProcess.stdout !== null) {
                childProcess.stdout.on('data', logCallback);
            }
            if (childProcess.stderr !== null) {
                childProcess.stderr.on('data', logCallback);
            }
            childProcess.on('error', (err: Error) => {
                console.log('error: ' + err.message);
            });
            childProcess.on('exit', (code: number) => {
                if (code === 0 && project.targetFolder && project.artifactId) {
                    callback(vscode.Uri.file(path.join(project.targetFolder.fsPath, project.artifactId)));
                }
            });
        }
        return childProcess;
    }

    public startPayaraMicro(
        debugConfig: DebugConfiguration | undefined,
        onData: (data: string) => any,
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {

        if (this.getMicroPluginReader().isDeployWarEnabled() === false
            && this.getMicroPluginReader().isUberJarEnabled() === false) {
            vscode.window.showWarningMessage('Please either enable the deployWar or useUberJar option in payara-micro-maven-plugin configuration to deploy the application.');
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
        if (this.payaraInstance?.getDeployOption() === DeployOption.HOT_RELOAD) {
            commands.push('-DhotDeploy=true');
        }
        if (debugConfig) {
            commands.push(`-Ddebug=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${debugConfig.port}`);
        }
        return this.fireCommand(commands, onData, onExit, onError);

    }

    public devPayaraMicro(
        debugConfig: DebugConfiguration | undefined,
        onData: (data: string) => any,
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultMicroDevConfig());
        let commands = taskDefinition.command.split(/\s+/);
        if (debugConfig) {
            commands.push(`-Ddebug=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${debugConfig.port}`);
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
        if (this.payaraInstance?.getDeployOption() === DeployOption.HOT_RELOAD) {
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

    public migrateToJakarta10(
        onExit: (code: number) => any,
        onError: (err: Error) => any, source: String, target: String
    ): ChildProcess | undefined {
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getTranformExecutionConfig());
        let commands = taskDefinition.command.split(/\s+/);
        if (source && target) {
            commands.push('-DselectedSource=' + source);
            commands.push('-DselectedTarget=' + target);
        }
        return this.fireCommand(commands, () => { }, onExit, onError);
    }

    private getDefaultServerBuildConfig(remote: boolean): TaskDefinition {
        return {
            label: "payara-server-build",
            type: "shell",
            command: "mvn resources:resources compiler:compile " + (remote ? "war:war" : "war:exploded"),
            group: "build"
        };
    }

    private getDefaultMicroDevConfig(): TaskDefinition {
        return {
            label: "payara-micro-dev",
            type: "shell",
            command: `mvn ${PayaraMicroMavenPlugin.GROUP_ID}:${PayaraMicroMavenPlugin.ARTIFACT_ID}:${PayaraMicroMavenPlugin.DEV_GOAL}`,
            group: "build"
        };
    }

    private getDefaultMicroBundleConfig(): TaskDefinition {
        return {
            label: "payara-micro-bundle",
            type: "shell",
            command: `mvn install ${PayaraMicroMavenPlugin.GROUP_ID}:${PayaraMicroMavenPlugin.ARTIFACT_ID}:${PayaraMicroMavenPlugin.BUNDLE_GOAL}`,
            group: "build"
        };
    }

    private getDefaultMicroStartUberJarConfig(): TaskDefinition {
        return {
            label: "payara-micro-uber-jar-start",
            type: "shell",
            command: `mvn install ${PayaraMicroMavenPlugin.GROUP_ID}:${PayaraMicroMavenPlugin.ARTIFACT_ID}:${PayaraMicroMavenPlugin.BUNDLE_GOAL} ${PayaraMicroMavenPlugin.GROUP_ID}:${PayaraMicroMavenPlugin.ARTIFACT_ID}:${PayaraMicroMavenPlugin.START_GOAL}`,
            group: "build"
        };
    }

    private getDefaultMicroStartExplodedWarConfig(): TaskDefinition {
        return {
            label: "payara-micro-exploded-war-start",
            type: "shell",
            command: `mvn resources:resources compiler:compile war:exploded -Dexploded=true -DdeployWar=true ${PayaraMicroMavenPlugin.GROUP_ID}:${PayaraMicroMavenPlugin.ARTIFACT_ID}:${PayaraMicroMavenPlugin.START_GOAL}`,
            group: "build"
        };
    }


    private getDefaultMicroReloadConfig(): TaskDefinition {
        return {
            label: "payara-micro-reload",
            type: "shell",
            command: `mvn resources:resources compiler:compile war:exploded ${PayaraMicroMavenPlugin.GROUP_ID}:${PayaraMicroMavenPlugin.ARTIFACT_ID}:${PayaraMicroMavenPlugin.RELOAD_GOAL}`,
            group: "build"
        };
    }

    private getDefaultMicroStopConfig(): TaskDefinition {
        return {
            label: "payara-micro-stop",
            type: "shell",
            command: `mvn ${PayaraMicroMavenPlugin.GROUP_ID}:${PayaraMicroMavenPlugin.ARTIFACT_ID}:${PayaraMicroMavenPlugin.STOP_GOAL}`,
            group: "build"
        };
    }

    private getTranformExecutionConfig(): TaskDefinition {
        return {
            label: "payara-tranform",
            type: "shell",
            command: `mvn package ${PayaraServerTransformPlugin.GROUP_ID}:${PayaraServerTransformPlugin.ARTIFACT_ID}:${PayaraServerTransformPlugin.VERSION}:${PayaraServerTransformPlugin.RUN_GOAL}`,
            group: "build"
        };
    }

    private getAIAgentEnv(): Record<string, string> {
        const config = vscode.workspace.getConfiguration();
        if (config.get<boolean>('payara.ai.agent') !== true) { return {}; }
        const env: Record<string, string> = {};
        const apiKey = config.get<string>('payara.ai.apiKey');
        if (apiKey) { env['PAYARA_AI_API_KEY'] = apiKey; }
        return env;
    }

    private getAIAgentFlags(): string[] {
        const config = vscode.workspace.getConfiguration();
        if (config.get<boolean>('payara.ai.agent') !== true) { return []; }

        const flags: string[] = ['-Dpayara.ai.agent=true', '-Dpayara.ai.chat.markers=true'];

        const str = (key: string, prop: string) => {
            const v = config.get<string>(key);
            if (v) { flags.push(`-D${prop}=${v}`); }
        };
        const num = (key: string, prop: string) => {
            const v = config.get<number | null>(key);
            if (v !== undefined && v !== null) { flags.push(`-D${prop}=${v}`); }
        };
        const bool = (key: string, prop: string) => {
            if (config.get<boolean>(key) === true) { flags.push(`-D${prop}=true`); }
        };

        str('payara.ai.provider',         'payara.ai.provider');
        str('payara.ai.model',            'payara.ai.model');
        str('payara.ai.providerLocation', 'payara.ai.provider.location');
        str('payara.ai.organizationId',   'payara.ai.organizationId');
        str('payara.ai.customHeaders',    'payara.ai.customHeaders');

        num('payara.ai.temperature',           'payara.ai.temperature');
        num('payara.ai.topP',                  'payara.ai.topP');
        num('payara.ai.topK',                  'payara.ai.topK');
        num('payara.ai.maxTokens',             'payara.ai.maxTokens');
        num('payara.ai.maxCompletionTokens',   'payara.ai.maxCompletionTokens');
        num('payara.ai.maxOutputTokens',       'payara.ai.maxOutputTokens');
        num('payara.ai.presencePenalty',       'payara.ai.presencePenalty');
        num('payara.ai.frequencyPenalty',      'payara.ai.frequencyPenalty');
        num('payara.ai.repeatPenalty',         'payara.ai.repeatPenalty');
        num('payara.ai.seed',                  'payara.ai.seed');
        num('payara.ai.timeout',               'payara.ai.timeout');
        num('payara.ai.maxRetries',            'payara.ai.maxRetries');
        num('payara.ai.chatHistoryLimit',      'payara.ai.chat.history.limit');

        bool('payara.ai.stream',                    'payara.ai.stream');
        bool('payara.ai.logRequests',               'payara.ai.log.requests');
        bool('payara.ai.logResponses',              'payara.ai.log.responses');
        bool('payara.ai.allowCodeExecution',        'payara.ai.allowCodeExecution');
        bool('payara.ai.includeCodeExecutionOutput','payara.ai.includeCodeExecutionOutput');
        bool('payara.ai.chatHistory',               'payara.ai.chat.history');

        return flags;
    }

    public startPayaraServerMaven(
        debugConfig: DebugConfiguration | undefined,
        onData: (data: string) => any,
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultServerMavenStartConfig());
        let commands = taskDefinition.command.split(/\s+/);
        if (debugConfig) {
            commands.push(`-Ddebug=true`);
            commands.push(`-DdebugPort=${debugConfig.port}`);
        }
        commands.push(...this.getAIAgentFlags());
        return this.fireCommandInteractive(
            commands,
            `Payara Server Maven - ${this.workspaceFolder.name}`,
            onData, onExit, onError,
            this.getAIAgentEnv()
        );
    }

    public devPayaraServerMaven(
        debugConfig: DebugConfiguration | undefined,
        onData: (data: string) => any,
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultServerMavenDevConfig());
        let commands = taskDefinition.command.split(/\s+/);
        if (debugConfig) {
            commands.push(`-Dpayara.debug=true`);
            commands.push(`-Dpayara.debug.port=${debugConfig.port}`);
        }
        commands.push(...this.getAIAgentFlags());
        return this.fireCommandInteractive(
            commands,
            `Payara Server Maven - ${this.workspaceFolder.name}`,
            onData, onExit, onError,
            this.getAIAgentEnv()
        );
    }

    public stopPayaraServerMaven(
        processId: number,
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined {
        let taskManager: TaskManager = new TaskManager();
        let taskDefinition = taskManager.getPayaraConfig(this.workspaceFolder, this.getDefaultServerMavenStopConfig());
        let commands = taskDefinition.command.split(/\s+/);
        commands.push(`-DprocessId=${processId}`);
        return this.fireCommand(commands, () => { }, onExit, onError);
    }

    private getDefaultServerMavenStartConfig(): TaskDefinition {
        return {
            label: "payara-server-maven-start",
            type: "shell",
            command: `mvn package ${PayaraServerMavenPlugin.GROUP_ID}:${PayaraServerMavenPlugin.ARTIFACT_ID}:${PayaraServerMavenPlugin.START_GOAL}`,
            group: "build"
        };
    }

    private getDefaultServerMavenDevConfig(): TaskDefinition {
        return {
            label: "payara-server-maven-dev",
            type: "shell",
            command: `mvn package ${PayaraServerMavenPlugin.GROUP_ID}:${PayaraServerMavenPlugin.ARTIFACT_ID}:${PayaraServerMavenPlugin.DEV_GOAL}`,
            group: "build"
        };
    }

    private getDefaultServerMavenStopConfig(): TaskDefinition {
        return {
            label: "payara-server-maven-stop",
            type: "shell",
            command: `mvn ${PayaraServerMavenPlugin.GROUP_ID}:${PayaraServerMavenPlugin.ARTIFACT_ID}:${PayaraServerMavenPlugin.STOP_GOAL}`,
            group: "build"
        };
    }


}
