'use strict';

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Uri, workspace } from 'vscode';

import * as fse from "fs-extra";
import * as path from 'path';

export class JDKVersion {

    /**
     * Major version number.
     */
    private major: number = 0;

    /**
     * Minor version number.
     */
    private minor: number | undefined;

    /**
     * Sub-minor version number.
     */
    private subminor: number | undefined;

    /**
     * Update version number.
     */
    private update: number | undefined;

    /**
     * JDK vendor
     */
    private vendor: string | undefined;

    private static MAJOR_INDEX: number = 0;

    private static MINOR_INDEX: number = 1;

    private static SUBMINOR_INDEX: number = 2;

    private static UPDATE_INDEX: number = 3;

    private static VERSION_MATCHER: string = "(\\d+(\\.\\d+)*)([_u\\-]+[\\S]+)*";

    private static DEFAULT_VALUE: number = 0;

    private static DEFAULT_JDK_VERSION: JDKVersion | undefined;

    public constructor(
        major: number,
        minor: number | undefined,
        subminor: number | undefined,
        update: number | undefined,
        vendor: string | undefined) {
        this.major = major;
        this.minor = minor;
        this.subminor = subminor;
        this.update = update;
        this.vendor = vendor;
    }

    /**
     * Get major version number.
     * 
     * @return {number} Major version number.
     */
    public getMajor(): number {
        return this.major;
    }

    /**
     * Get minor version number.
     * 
     * @return {number | undefined} Minor version number.
     */
    public getMinor(): number | undefined {
        return this.minor;
    }

    /**
     * Get sub-minor version number.
     * 
     * @return {number | undefined} Sub-Minor version number.
     */
    public getSubMinor(): number | undefined {
        return this.subminor;
    }

    /**
     * Get update version number.
     * 
     * @return {number | undefined} Update version number.
     */
    public getUpdate(): number | undefined {
        return this.update;
    }

    /**
     * Get JDK Vendor.
     * 
     * @return {string | undefined} JDK vendor.
     */
    public getVendor(): string | undefined {
        return this.vendor;
    }

    public gt(version: JDKVersion): boolean {
        if (this.major > version.getMajor()) {
            return true;
        } else if (this.major === version.getMajor()) {
            if (this.gtNumber(this.minor, version.getMinor())) {
                return true;
            } else if (this.eq(this.minor, version.getMinor())) {
                if (this.gtNumber(this.subminor, version.getSubMinor())) {
                    return true;
                } else if (this.eq(this.subminor, version.getSubMinor())) {
                    if (this.gtNumber(this.update, version.getUpdate())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public lt(version: JDKVersion): boolean {
        if (this.major < version.getMajor()) {
            return true;
        } else if (this.major === version.getMajor()) {
            if (this.ltNumber(this.minor, version.getMinor())) {
                return true;
            } else if (this.eq(this.minor, version.getMinor())) {
                if (this.ltNumber(this.subminor, version.getSubMinor())) {
                    return true;
                } else if (this.eq(this.subminor, version.getSubMinor())) {
                    if (this.ltNumber(this.update, version.getUpdate())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public ge(version: JDKVersion): boolean {
        return this.gt(version) || this.equals(version);
    }

    public le(version: JDKVersion): boolean {
        return this.lt(version) || this.equals(version);
    }

    public gtNumber(v1: number | undefined, v2: number | undefined): boolean {
        if (v1 === undefined) {
            v1 = JDKVersion.DEFAULT_VALUE;
        }
        if (v2 === undefined) {
            v2 = JDKVersion.DEFAULT_VALUE;
        }
        return v1 > v2;
    }

    public ltNumber(v1: number | undefined, v2: number | undefined): boolean {
        if (v1 === undefined) {
            v1 = JDKVersion.DEFAULT_VALUE;
        }
        if (v2 === undefined) {
            v2 = JDKVersion.DEFAULT_VALUE;
        }
        return v1 < v2;
    }

    private eq(v1: number | undefined, v2: number | undefined): boolean {
        if (v1 === undefined) {
            v1 = JDKVersion.DEFAULT_VALUE;
        }
        if (v2 === undefined) {
            v2 = JDKVersion.DEFAULT_VALUE;
        }
        return v1 === v2;
    }

    public equals(other: JDKVersion): boolean {
        if (other === null) {
            return false;
        }
        if (this !== other) {
            return false;
        }
        if (this.major !== other.getMajor()) {
            return false;
        }
        if (!this.eq(this.minor, other.getMinor())) {
            return false;
        }
        if (!this.eq(this.subminor, other.getSubMinor())) {
            return false;
        }
        return this.eq(this.update, other.getUpdate());
    }

    public toString(): string {
        let value: string = this.major.toString();
        if (this.minor !== undefined) {
            value.concat(this.minor.toString());
        }
        if (this.subminor !== undefined) {
            value.concat(this.subminor.toString());
        }
        if (this.update !== undefined) {
            value.concat(this.update.toString());
        }
        return value;
    }

    public static toValue(version: string, vendor: string | undefined): JDKVersion | undefined {
        if (version !== null && version.length > 0) {
            let versions: number[] = this.parseVersions(version);
            let major: number = versions[JDKVersion.MAJOR_INDEX];
            let minor: number | undefined = versions[JDKVersion.MINOR_INDEX];
            let subminor: number | undefined = versions[JDKVersion.SUBMINOR_INDEX];
            let update: number | undefined = versions[JDKVersion.UPDATE_INDEX];
            return new JDKVersion(major, minor, subminor, update, vendor);
        } else {
            return undefined;
        }
    }

    public static getDefaultJDKHome(): string | undefined {
        const config = workspace.getConfiguration();
        let javaHome: string | undefined = config.get<string>('java.home');
        if (!javaHome) {
            javaHome = process.env.JDK_HOME;
            if (!javaHome) {
                javaHome = process.env.JAVA_HOME;
            }
        }
        return javaHome;
    }

    public static getDefaultJDKVersion(): JDKVersion | undefined {
        if(JDKVersion.DEFAULT_JDK_VERSION) {
            return JDKVersion.DEFAULT_JDK_VERSION;
        }
        let javaHome: string | undefined = this.getDefaultJDKHome();
        let javaVersion: string = '';
        let implementor: string | undefined;
        if (javaHome) {
            const release = path.resolve(javaHome, 'release');
            let lines = fse.readFileSync(release)
                .toString()
                .split('\n')
                .filter(Boolean);
            for (var line of lines) {
                // JAVA_VERSION="1.8.0_172"
                if (line.startsWith("JAVA_VERSION=")) {
                    javaVersion = line.split('=')[1];
                    javaVersion = javaVersion.substring(javaVersion.indexOf("\"") + 1, javaVersion.lastIndexOf("\""));
                } else if (line.startsWith("IMPLEMENTOR=")) {
                    implementor = line.split('=')[1];
                    implementor = implementor.substring(implementor.indexOf("\"") + 1, implementor.lastIndexOf("\""));
                }
            }
            if (javaVersion.length > 0) {
                JDKVersion.DEFAULT_JDK_VERSION = JDKVersion.toValue(javaVersion, implementor);
                return JDKVersion.DEFAULT_JDK_VERSION;
            }
        }
        return undefined;
    }

    public static isCorrectJDK(jdkVersion: JDKVersion, 
        vendor: string | undefined, 
        minVersion: JDKVersion | undefined, 
        maxVersion: JDKVersion | undefined): boolean {
        let correctJDK: boolean = true;
        if (vendor !== undefined) {
            let jdkVendor: string | undefined = jdkVersion.getVendor();
            if (jdkVendor) {
                correctJDK = jdkVendor.indexOf(vendor) !== -1;
            } else {
                correctJDK = false;
            }
        }
        if (correctJDK && minVersion) {
            correctJDK = jdkVersion.ge(minVersion);
        }
        if (correctJDK && maxVersion) {
            correctJDK = jdkVersion.le(maxVersion);
        }
        return correctJDK;
    }

    /**
     * Parses the java version text
     * 
     * @param {string} javaVersion the Java Version e.g 1.8.0u222,
     * 1.8.0_232-ea-8u232-b09-0ubuntu1-b09, 11.0.5
     * @return
     * @return {Array}
     */
    static parseVersions(javaVersion: string): number[] {
        let versions: number[] = [1, 0, 0, 0];
        if (javaVersion === null || javaVersion.length <= 0) {
            return versions;
        }
        let javaVersionSplit: string[] = javaVersion.split("-");
        let split: string[] = javaVersionSplit[0].split(".");
        if (split.length > 0) {

            versions[JDKVersion.MAJOR_INDEX] = parseInt(split[0]);

            if (split.length > 1) {
                versions[JDKVersion.MINOR_INDEX] = parseInt(split[1]);
            }

            if (split.length > 2) {
                split = split[2].split(/[_u]+/);
                versions[JDKVersion.SUBMINOR_INDEX] = parseInt(split[0]);
                if (split.length > 1) {
                    versions[JDKVersion.UPDATE_INDEX] = parseInt(split[1]);
                }
            }
        }
        return versions;
    }
}