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

import * as path from "path";
import * as fs from "fs";

import { PayaraServerInstance } from '../../PayaraServerInstance';

export class ServerUtils {

    /** 
     * Payara server Java VM root property name.
     */
    public static PF_JAVA_ROOT_PROPERTY: string = "com.sun.aas.javaRoot";

    /** 
     * Payara server home property name.
     *
     *  It's value says it is server installation root but in reality it is just
     *  <code>payara</code> subdirectory under server installation root which
     *  we usually call server home.
     */
    public static PF_HOME_PROPERTY: string = "com.sun.aas.installRoot";

    /** 
     * Payara server domain root property name.
     *
     *  It's value says it is server instance root which is the same. 
     */
    public static PF_DOMAIN_ROOT_PROPERTY: string = "com.sun.aas.instanceRoot";

    /** 
     * Payara server Derby root property name.
     */
    public static PF_DERBY_ROOT_PROPERTY: string = "com.sun.aas.derbyRoot";

    /** 
     * Payara server domain name command line argument.
     */
    public static PF_DOMAIN_ARG: string = "--domain";

    /** 
     * Payara server domain directory command line argument.
     */
    public static PF_DOMAIN_DIR_ARG: string = "--domaindir";

    /** Payara main class to be started when using classpath. */
    public static PF_MAIN_CLASS: string = "com.sun.enterprise.glassfish.bootstrap.ASMain";

    /**
     * Builds command line argument containing argument identifier, space
     * and argument value, e.g. <code>--name value</code>.
     *
     * @param name      Command line argument name including dashes at
     *                  the beginning.
     * @param value     Value to be appended prefixed with single space.
     * @return Command line argument concatenated together.
     */
    public static cmdLineArgument(name: string, value: string): string {
        return name + ' ' + value;
    }

    public static isValidServerPath(serverPath: string): boolean {
        return fs.existsSync(path.join(serverPath, 'glassfish', 'bin', 'asadmin')) 
        && fs.existsSync(path.join(serverPath, 'bin', 'asadmin'));
    }

}