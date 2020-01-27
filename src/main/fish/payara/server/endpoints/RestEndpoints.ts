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

import * as http from 'http';
import * as syncHttp from 'sync-request';
import { PayaraServerInstance } from "../PayaraServerInstance";
import { ClientRequest, IncomingMessage } from 'http';

export class RestEndpoints {

    public constructor(public payaraServer: PayaraServerInstance) {
    }

    public invoke(command: string, callback?: (res: IncomingMessage) => void): ClientRequest {
        return http.get({
            hostname: 'localhost',
            port: this.payaraServer.getAdminPort(),
            path: '/__asadmin/' + command,
            headers: { 'Accept': 'application/xml' },
            agent: false  // Create a new agent just for this one request
        }, callback);
    }

    public invokeSync(command: string): syncHttp.Response {
        return syncHttp.default('GET',
            "http://localhost:" + this.payaraServer.getAdminPort() + '/__asadmin/' + command,
            { headers: { 'Accept': 'application/xml' } }
        );
    }


}
