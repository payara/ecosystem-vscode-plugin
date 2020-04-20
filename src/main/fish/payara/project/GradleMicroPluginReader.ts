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
import { MicroPluginReader } from "./MicroPluginReader";
import { WorkspaceFolder } from "vscode";
import { PayaraMicroGradlePlugin } from '../micro/PayaraMicroGradlePlugin';

export class GradleMicroPluginReader implements MicroPluginReader {

    private pluginFound: boolean = false;

    private deployWar: boolean | undefined;

    private useUberJar: boolean | undefined;

    private exploded: boolean | undefined;

    public constructor(public workspaceFolder: WorkspaceFolder) {
        this.parseBuild();
    }

    private async parseBuild(): Promise<void> {
        let reader: GradleMicroPluginReader = this;
        let buildPath = path.join(this.workspaceFolder.uri.fsPath, 'build.gradle');
        if (fse.existsSync(buildPath)) {
            reader.pluginFound = fse.readFileSync(buildPath).includes(PayaraMicroGradlePlugin.ID);
            let g2js = require('gradle-to-js/lib/parser');
            let build: any = await g2js.parseFile(buildPath);
            if (build.payaraMicro) {
                let config = build.payaraMicro;
                reader.deployWar = config.deployWar ? JSON.parse(config.deployWar) : undefined;
                reader.exploded = config.exploded ? JSON.parse(config.exploded) : undefined;
                reader.useUberJar = config.useUberJar ? JSON.parse(config.useUberJar) : undefined;
            }
        }
    }

    public isPluginFound(): boolean {
        return this.pluginFound;
    }

    public isDeployWarEnabled(): boolean | undefined {
        return this.deployWar;
    }

    public isUberJarEnabled(): boolean | undefined {
        return this.useUberJar;
    }

    public isExplodedEnabled(): boolean | undefined {
        return this.exploded;
    }

}