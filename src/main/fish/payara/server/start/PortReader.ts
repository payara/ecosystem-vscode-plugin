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

export class PortReader {

    private serverName: string;

    private httpPort: number = -1;

    private httpsPort: number = -1;

    private adminPort: number = -1;

    private serverConfigName: string = '';

    private readConfig: boolean = false;

    public constructor(public domainXmlPath: string, serverName: string) {
        this.serverName = serverName;
        this.parseDomainXML();
    }

    private parseDomainXML(): void {
        let reader: PortReader = this;
        let data = fse.readFileSync(this.domainXmlPath);
        let parser = new xml2js.Parser(
            {
                trim: true,
                explicitArray: true
            });
        parser.parseString(data,
            function (err: any, result: any) {

                if (result && result.domain
                    && result.domain.servers
                    && result.domain.configs) {
                    let servers = result.domain.servers[0].server;
                    let configs = result.domain.configs[0].config;
                    for (var server of servers) {
                        if (server.$["name"] === reader.serverName) {
                            // <server config-ref="server-config" name="server">
                            reader.serverConfigName = server.$["config-ref"];
                        }
                    }
                    for (var config of configs) {
                        // <config name="server-config">
                        if (config.$["name"] === reader.serverConfigName) {
                        //   <network-config>
                        //     <network-listeners>
                        //       <network-listener protocol="http-listener-1" port="8080" name="http-listener-1" thread-pool="http-thread-pool" transport="tcp"></network-listener>
                        //       <network-listener protocol="http-listener-2" port="8181" name="http-listener-2" thread-pool="http-thread-pool" transport="tcp"></network-listener>
                        //       <network-listener protocol="admin-listener" port="4848" name="admin-listener" thread-pool="admin-thread-pool" transport="tcp"></network-listener>
                        //     </network-listeners>
                        //   </network-config>
                            let networkConfig = config["network-config"][0];
                            let networkListeners = networkConfig["network-listeners"][0];
                            for (var networkListener of networkListeners["network-listener"]) {
                                if(networkListener.$['name'] === "http-listener-1") {
                                    reader.httpPort = parseInt(networkListener.$['port']);
                                } else if(networkListener.$['name'] === "http-listener-2") {
                                    reader.httpsPort = parseInt(networkListener.$['port']);
                                } else if(networkListener.$['name'] === "admin-listener") {
                                    reader.adminPort = parseInt(networkListener.$['port']);
                                }
                            }
                        }
                    }
                }
            }
        );
    }

    public getHttpPort(): number {
        return this.httpPort;
    }

    public getHttpsPort(): number {
        return this.httpsPort;
    }

    public getAdminPort(): number {
        return this.adminPort;
    }

}