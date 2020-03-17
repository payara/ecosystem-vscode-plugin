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

export class MicroPluginReader {

    private pluginFound: boolean = false;

    public constructor(public pom: string) {
        this.parsePom();
    }

    private parsePom(): void {
        let reader: MicroPluginReader = this;
        let data = fse.readFileSync(this.pom);
        let parser = new xml2js.Parser(
            {
                trim: true,
                explicitArray: true
            });
        parser.parseString(data,
            function (err: any, result: any) {
                if (result.project) {
                    reader.pluginFound = reader.parseBuild(result.project.build);
                    if (result.project.profiles) {
                        for (let profile of result.project.profiles[0].profile) {
                            if (reader.pluginFound) {
                                break;
                            }
                            reader.pluginFound = reader.parseBuild(profile.build);
                        }
                    }
                }
            }
        );
    }

    private parseBuild(build: any): boolean {
        if (build
            && build[0]
            && build[0].plugins[0]) {
            for (let plugin of build[0].plugins[0].plugin) {
                let groupId = plugin.groupId[0];
                let artifactId = plugin.artifactId[0];
                if (groupId === 'fish.payara.maven.plugins'
                    && artifactId === 'payara-micro-maven-plugin') {
                    return true;
                }
            }
        }
        return false;
    }

    public isPluginFound(): boolean {
        return this.pluginFound;
    }

}