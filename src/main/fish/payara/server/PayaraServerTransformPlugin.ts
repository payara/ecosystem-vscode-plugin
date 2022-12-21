'use strict';

/*
 * Copyright (c) 2022 Payara Foundation and/or its affiliates and others.
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

export namespace  PayaraServerTransformPlugin {

    export const ARTIFACT_ID = 'fish.payara.transformer.maven';
    export const GROUP_ID = 'fish.payara.transformer';
    export const VERSION = '0.2.11';
    export const RUN_GOAL = 'run';
    export const JAKARTA_10_DEPENDENCY_EE_API = ` \
    \n <dependency> \
    \n \t \t <groupId>jakarta.platform</groupId> \
    \n \t \t <artifactId>jakarta.jakartaee-api</artifactId> \
    \n \t \t <version>10.0.0</version> \
    \n \t \t <scope>provided</scope> \
    \n</dependency> \
    \n `;
    export const JAKARTA_10_DEPENDENCY_WEB_API = ` \
    \n <dependency> \
    \n \t \t <groupId>jakarta.platform</groupId> \
    \n \t \t <artifactId>jakarta.jakartaee-web-api</artifactId> \
    \n \t \t <version>10.0.0</version> \
    \n \t \t <scope>provided</scope> \
    \n </dependency> \ 
    `;

}