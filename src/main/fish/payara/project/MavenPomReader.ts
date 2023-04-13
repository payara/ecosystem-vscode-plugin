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

import * as fse from "fs-extra";
import * as path from "path";
import * as xml2js from "xml2js";
import { WorkspaceFolder } from "vscode";
import { BuildReader } from "./BuildReader";

export class MavenPomReader implements BuildReader {

    private groupId: string = '';
    private artifactId: string = '';
    private version: string = '';
    private finalName: string = '';

    public constructor(public workspaceFolder: WorkspaceFolder) {
        this.parsePom();
    }

    private parsePom(): void {
        let reader: MavenPomReader = this;
        let pomPath = path.join(this.workspaceFolder.uri.fsPath, 'pom.xml');
        if (fse.existsSync(pomPath)) {
            let data = fse.readFileSync(pomPath);
            let parser = new xml2js.Parser(
                {
                    trim: true,
                    explicitArray: true
                });
            parser.parseString(data,
                function (err: any, result: any) {
                    if(err) {
                        throw new Error(`Unable to parse file ${pomPath} : ${err.message}`);
                    }
                    if (result.project) {
                        let project = result.project;
                        reader.groupId = project.groupId[0];
                        reader.artifactId = project.artifactId[0];
                        reader.version = project.version[0];
                        reader.finalName = reader.parseBuild(project.build);
                        if (project.profiles
                            && project.profiles[0].profile) {
                            for (let profile of project.profiles[0].profile) {
                                if (reader.finalName.length > 0) {
                                    break;
                                }
                                reader.finalName = reader.parseBuild(profile.build);
                            }
                        }
                        if (reader.finalName.length < 1) {
                            reader.finalName = `${reader.artifactId}-${reader.version}`;
                        }
                    }
                }
            );
        }
    }

    private parseBuild(build: any): string {
        if (build
            && build[0]
            && build[0].finalName) {
            return build[0].finalName.toString();
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

}