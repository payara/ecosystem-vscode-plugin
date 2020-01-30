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

import { JDKVersion } from "./JDKVersion";

export class JvmOption {

    public option: string;

    public vendor: string | undefined;

    public minVersion: JDKVersion | undefined;

    public maxVersion: JDKVersion | undefined;

    static PATTERN: string = "^\\[(.*)\\|(.*)\\](.*)";

    public constructor(option: string) {
        let matcher: RegExpMatchArray | null = option.match(JvmOption.PATTERN);
        if (matcher !== null && matcher.length === 4) {
            // [Azul-1.8.0|1.8.0u120]-Xbootclasspath
            let vendorMatcher: RegExpMatchArray | null = matcher[1].charAt(0).match(/[a-z]/i);
            if (matcher[1].indexOf('-') !== -1 && vendorMatcher !== null && vendorMatcher.length > 0) {
                let parts: string[] = matcher[1].split("-");
                this.vendor = parts[0];
                this.minVersion = JDKVersion.toValue(parts[1], undefined);
            } else {
                this.vendor = undefined;
                this.minVersion = JDKVersion.toValue(matcher[1], undefined);
            }
            this.maxVersion = JDKVersion.toValue(matcher[2], undefined);
            this.option = matcher[3];
        } else {
            this.option = option;
        }
    }

}