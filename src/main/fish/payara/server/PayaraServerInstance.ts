'use strict';

import * as vscode from "vscode";

export class PayaraServerInstance extends vscode.TreeItem  {
    
    constructor(private name: string, private path: string, private domainName: string) {
        super(name);
    }

    public getName(): string {
        return this.name;
    }

    public setName(name: string) {
        this.name = name;
    }

    public getPath(): string {
        return this.path;
    }

    public getDomainName(): string {
        return this.domainName;
    }

}