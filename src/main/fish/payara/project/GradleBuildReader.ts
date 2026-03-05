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

import * as fs from "fs";
import * as path from "path";
import { WorkspaceFolder } from "vscode";
import { BuildReader } from "./BuildReader";

export class GradleBuildReader implements BuildReader {

    private groupId: string = '';
    private artifactId: string = '';
    private version: string = '';
    private finalName: string = '';
    private buildDirectory: string = '';

    public constructor(public workspaceFolder: WorkspaceFolder) {
        this.parseBuild();
    }

    private async parseBuild(): Promise<void> {
        let reader: GradleBuildReader = this;
        reader.artifactId = this.workspaceFolder.name.toLowerCase();

        let buildPath = path.join(this.workspaceFolder.uri.fsPath, 'build.gradle');
        let settingsPath = path.join(this.workspaceFolder.uri.fsPath, 'settings.gradle');
        let g2js = require('gradle-to-js/lib/parser');

        if (fs.existsSync(buildPath)) {
            let build: any = await g2js.parseFile(buildPath);
            reader.groupId = build.group;
            reader.version = build.version;
            reader.buildDirectory = reader.parseBuildDirectory(buildPath);
        }

        let buildKtsPath = path.join(this.workspaceFolder.uri.fsPath, 'build.gradle.kts');
        if (reader.buildDirectory.length < 1 && fs.existsSync(buildKtsPath)) {
            reader.buildDirectory = reader.parseBuildDirectory(buildKtsPath);
        }

        if (fs.existsSync(settingsPath)) {
            let settings: any = await g2js.parseFile(settingsPath);
            reader.artifactId = settings['rootProject.name'];
        } 

        if (reader.artifactId && reader.version) {
            reader.finalName = reader.artifactId + '-' + reader.version;
        }
    }

    private parseBuildDirectory(gradleFilePath: string): string {
        try {
            const content = fs.readFileSync(gradleFilePath, 'utf8');
            const fileMatch = content.match(/buildDir\s*=\s*file\(\s*["']([^"']+)["']\s*\)/);
            if (fileMatch) {
                return fileMatch[1];
            }
            const stringMatch = content.match(/buildDir\s*=\s*["']([^"']+)["']/);
            if (stringMatch) {
                return stringMatch[1];
            }
        } catch (e) {
            // ignore read errors and fall back to default
        }
        return '';
    }

    public getGroupId(): string {
        return this.groupId;
    }

    public getArtifactId(): string {
        return this.artifactId;
    }

    public getVersion(): string {
        return this.version;
    }

    public getFinalName(): string {
        return this.finalName;
    }

    public getBuildDirectory(): string {
        return this.buildDirectory;
    }

}