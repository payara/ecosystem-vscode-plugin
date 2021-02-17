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

import { Uri } from "vscode";
import { PayaraMicroProject } from "../micro/PayaraMicroProject";
import { WorkspaceFolder, DebugConfiguration } from "vscode";
import { ChildProcess } from "child_process";
import { MicroPluginReader } from "./MicroPluginReader";
import { BuildReader } from "./BuildReader";

export interface Build {

    buildProject(remote: boolean, callback: (artifact: string) => any, silent?: boolean): void;

    getDefaultHome(): string | undefined;

    getExecutableFullPath(buildHome: string): string;

    getBuildDir(): string;

    getWorkSpaceFolder(): WorkspaceFolder;

    getBuildReader(): BuildReader;

    getMicroPluginReader(): MicroPluginReader;

    readBuildConfig(): void;

    generateMicroProject(project: Partial<PayaraMicroProject>, callback: (projectPath: Uri) => any): ChildProcess | undefined;

    startPayaraMicro(
        debugConfig: DebugConfiguration | undefined,
        onData: (data: string) => any,
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined;

    reloadPayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined;

    stopPayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined;

    bundlePayaraMicro(
        onExit: (code: number) => any,
        onError: (err: Error) => any
    ): ChildProcess | undefined;

}