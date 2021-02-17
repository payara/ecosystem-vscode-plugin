
'use strict';

/*
 * Copyright (c) 2021 Payara Foundation and/or its affiliates and others.
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
export namespace DeployOption {

    export const DEFAULT = 'DEFAULT';
    export const AUTO_DEPLOY = 'AUTO_DEPLOY';
    export const HOT_RELOAD = 'HOT_RELOAD';
    export const DEFAULT_DESC = 'Only manual deployment';
    export const AUTO_DEPLOY_DESC = 'Auto deploy complete application';
    export const HOT_RELOAD_DESC = 'Incremental deploy modified source files';

    export const ALL_OPTIONS: Map<string, string> = new Map([
        [DEFAULT, DEFAULT_DESC],
        [AUTO_DEPLOY, AUTO_DEPLOY_DESC],
        [HOT_RELOAD, HOT_RELOAD_DESC]
    ]);


}
