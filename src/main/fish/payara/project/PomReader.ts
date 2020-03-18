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
import * as xml2js from "xml2js";

export class PomReader {

    private groupId: string = '';
    private artifactId: string = '';
    private version: string = '';
    private finalName: string = '';

    public constructor(public pom: string) {
        this.parsePom();
    }

    private parsePom(): void {
        let reader: PomReader = this;
        let data = fse.readFileSync(this.pom);
        let parser = new xml2js.Parser(
            {
                trim: true,
                explicitArray: true
            });
        parser.parseString(data,
            function (err: any, result: any) {
                if (result.project) {
                    reader.groupId = result.project.groupId[0];
                    reader.artifactId = result.project.artifactId[0];
                    reader.version = result.project.version[0];
                    reader.finalName = reader.parseBuild(result.project.build);
                    if (result.project.profiles) {
                        for (let profile of result.project.profiles[0].profile) {
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

    private parseBuild(build: any): string {
        if (build
            && build[0]
            && build[0].finalName) {
            return build[0].finalName;
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